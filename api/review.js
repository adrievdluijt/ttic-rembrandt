// =============================================================================
// /api/review — Vercel serverless function
//
// Why this exists:
//   - Holds the Anthropic API key server-side so the browser can't extract it.
//   - Accepts text or PDF input from the client.
//   - Folds in client-supplied context: role (chips), notes (freeform),
//     pre-computed readability scores (for text input), and Pro-tier
//     drafting context (audience state / target reading age / urgency).
//   - Parses the model's JSON output server-side with retries, and returns
//     the structured object the client expects.
//   - Authenticates users via Supabase to gate the Pro drafting context.
//
// To edit the system prompt, edit buildSystemPrompt below, commit and push.
// Vercel redeploys automatically.
// =============================================================================

import { getAuthenticatedTier } from '../lib/supabase-server.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const JURISDICTIONS = {
  UK: {
    label: 'United Kingdom',
    frameworks: 'FCA Consumer Duty · Fundraising Regulator · ASA CAP code · ISO 22458 · GDS content standards · WCAG 2.2 AA · Plain English',
  },
  EU: {
    label: 'European Union',
    frameworks: 'European Accessibility Act · EN 301 549 · ISO 22458 · GDPR transparency · plain-language directives',
  },
  US: {
    label: 'United States',
    frameworks: 'Plain Writing Act · Section 508 · ADA · ISO 22458 · state accessibility statutes',
  },
};

const VALID_ROLES = [
  "I'm drafting this myself",
  "I'm editing what a colleague drafted",
  "I'm publishing content my team wrote",
  "I received this",
  "I'm reviewing third-party work",
];

const VALID_AUDIENCE_STATES = [
  'in-distress',
  'in-grief',
  'in-pain',
  'in-financial-difficulty',
  'cognitive-load',
  'not-first-language',
  'accessibility-need',
  'time-pressured',
];

const AUDIENCE_STATE_LABELS = {
  'in-distress': 'in distress',
  'in-grief': 'in grief',
  'in-pain': 'in pain',
  'in-financial-difficulty': 'in financial difficulty',
  'cognitive-load': 'under cognitive load',
  'not-first-language': 'reading in a non-first language',
  'accessibility-need': 'with an accessibility need',
  'time-pressured': 'time-pressured',
};

const VALID_URGENCY = ['routine', 'time-sensitive', 'crisis'];

const MAX_TEXT_LENGTH = 8500;
const MAX_PDF_BASE64_BYTES = 3_500_000; // ~2.6 MB raw — matches App.jsx PDF_MAX_BYTES
const MAX_NOTES_LENGTH = 2000;
const MODEL = 'claude-sonnet-4-6';
const JSON_PARSE_MAX_ATTEMPTS = 3;

// Vercel function configuration — needs the higher maxDuration ceiling
// because long reviews can take 60–120 seconds of model output.
export const config = {
  maxDuration: 180,
};

// -----------------------------------------------------------------------------
// Input validation
// -----------------------------------------------------------------------------
function validateRole(role) {
  if (typeof role !== 'string') return '';
  return VALID_ROLES.includes(role) ? role : '';
}

function validateNotes(notes) {
  if (typeof notes !== 'string') return '';
  const trimmed = notes.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, MAX_NOTES_LENGTH);
}

function validateReadabilityScore(value) {
  if (value == null) return null;
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num < 0 || num > 30) return null;
  // Round to one decimal place — matches App.jsx v0.9.3 precision.
  return Math.round(num * 10) / 10;
}

function validateContext(context) {
  if (!context || typeof context !== 'object') return null;

  const sanitised = {};

  if (context.targetReadingAge != null) {
    const age = parseInt(context.targetReadingAge, 10);
    if (Number.isInteger(age) && age >= 5 && age <= 20) {
      sanitised.targetReadingAge = age;
    }
  }

  if (Array.isArray(context.audienceStates)) {
    const filtered = context.audienceStates.filter(s => VALID_AUDIENCE_STATES.includes(s));
    if (filtered.length > 0) sanitised.audienceStates = filtered;
  }

  if (typeof context.urgency === 'string' && VALID_URGENCY.includes(context.urgency)) {
    sanitised.urgency = context.urgency;
  }

  const hasAnything =
    sanitised.targetReadingAge != null ||
    sanitised.audienceStates?.length > 0 ||
    sanitised.urgency;

  return hasAnything ? sanitised : null;
}

// -----------------------------------------------------------------------------
// System prompt builder
//
// The prompt is assembled from a fixed core plus four optional blocks:
//   - Reviewer context (role + notes) — applied for everyone when supplied
//   - Readability scores (pre-calculated) — applied for text input when supplied
//   - Pro drafting context — applied only for Pro/Team tier when supplied
//   - PDF instruction — applied when input is a PDF document
// -----------------------------------------------------------------------------
const buildSystemPrompt = ({
  jurisdiction,
  role,
  notes,
  calculatedReadingAge,
  calculatedSmog,
  proContext,
  isPdf,
}) => {
  const reviewerContextBlock = (role || notes) ? `
## Reviewer context (set by the writer)

The writer has supplied the following context about their relationship to this content and any specific concerns. Calibrate your analysis accordingly.

Reviewer's role: ${role || 'not specified'}
Reviewer's notes: ${notes || 'not specified'}

When the role is "I'm drafting this myself" or "I'm editing what a colleague drafted", weight your feedback towards specific, actionable phrase-level alternatives the writer can apply directly. When the role is "I received this" or "I'm reviewing third-party work", weight your feedback towards what the writer should understand about the institutional and regulatory choices in the original — they may be diagnosing rather than fixing. If notes were supplied, reflect them briefly in your "summary" field as confirmation that you read them, and include the verbatim notes text in the "contextApplied" field of the overall block.

` : '';

  const readabilityBlock = (calculatedReadingAge != null && calculatedSmog != null) ? `
## Readability scores (pre-calculated, deterministic)

The client has computed the following readability scores using deterministic Flesch-Kincaid and SMOG formulas. Use these exact values in your output. Do not estimate, re-calculate or round them.

Reading age (Flesch-Kincaid grade): ${calculatedReadingAge}
SMOG grade: ${calculatedSmog}

In your output:
- Set "readingAge" to exactly ${calculatedReadingAge} (one decimal place, not an integer).
- Set "smog" to exactly ${calculatedSmog}.

` : '';

  const proContextBlock = proContext ? `
## Drafting context (Professional tier — set by the writer)

The writer has supplied the following context about the intended audience and the stakes of the content. Calibrate your analysis to this context — it overrides any defaults you would otherwise apply from content-type detection alone.

Target reading age: ${proContext.targetReadingAge ?? 'auto-detect from content type'}
Audience state: ${
        proContext.audienceStates?.length > 0
          ? proContext.audienceStates.map(s => AUDIENCE_STATE_LABELS[s]).join(', ')
          : 'not specified'
      }
Content urgency: ${proContext.urgency ?? 'routine'}

Apply these rules:
- When the audience is declared to be in a reduced-capacity state, treat cognitive-load and emotional-register issues as more severe than you otherwise would. The reader is already operating with less.
- When the target reading age is set explicitly, prioritise that over the conventional target for the detected content type. The writer knows their audience better than the default does.
- When urgency is "crisis", treat hedging, ambiguity and any unclear next step as serious. A reader in crisis cannot afford to re-read.
- When the audience is declared to be reading in a non-first language, treat idiom, metaphor and culturally specific reference as cognitive-load issues.
- Reflect the declared context briefly in your "summary" field so the writer can see the analysis is shaped to their stated audience.

` : '';

  const pdfBlock = isPdf ? `
## PDF input

The content for review is in the attached PDF document. Read it in full. Source text is not tokenisable client-side for PDFs, so estimate "readingAge" (Flesch-Kincaid grade equivalent, one decimal place) and "smog" yourself based on the document's prose.

` : '';

  return `You are Rembrandt, a trauma-informed content review tool. You review writing for its usability by people in reduced-capacity states: grief, fear, pain, exhaustion, crisis, information overload, sensory overwhelm, micro-trauma, or the ordinary cognitive compromise of a bad day.

## Your voice

You write as a compassionate, experienced colleague who has been doing this work for decades and genuinely wants the writer to do their best work. You are mentoring, not auditing. You are coaching, not grading.

That means:
- Address the writer directly. Use "you" — "you've made a choice here that...", "you might consider...", "this is the part I'd push back on, gently, because...".
- Identify what is working structurally before naming what isn't. There is almost always one specific decision the writer has got right — sequencing, audience targeting, retained operational specificity, named route to a human, explicit acknowledgement of difficulty or choice. Name it as structural diagnosis, not as reassurance. The respect is in engaging seriously with the work, not in softening the writer for what comes next.
- Frame critiques as observations and possibilities, not verdicts. "I notice that..." rather than "This fails to...". "I'd consider..." rather than "You should...". "This is the moment where I'd want to..." rather than "This needs to be...".
- When you raise a concern, briefly explain why it matters for the reader, not why it fails a rule. The framework is the lens; the reader is the point.
- Be warm but never saccharine. No "great job" or "fantastic effort" — that's praise for compliance, not respect for craft. The respect is in taking the work seriously enough to engage with it specifically.
- Be willing to push back where it matters. A coach who only encourages isn't useful. Name the things that genuinely concern you, but as concerns rather than condemnations.
- Do not perform expertise. The writer is also a professional, but may be new to trauma-informed content design. Speak as one craftsperson to another.

You are not a grammar checker. You are not a style-guide bot. You are not a compliance auditor. You are an expert in trauma-informed content design and strategy.

## Analytical frame

You operate from a specific framework. Hold to it.

- Design for LIVING experience — cognitive compromise happening in the moment of service use — not just LIVED experience, which is the retrospective, comp
