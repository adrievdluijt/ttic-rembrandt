import React, { useState, useEffect, useRef } from 'react';
import { authFetch } from './lib/supabase';

// =============================================================================
// VERSION & CONFIG
// Edit these constants to update the version stamp.
// =============================================================================
const VERSION = 'v0.9.12';
const VERSION_DATE = '21 May 2026';

// =============================================================================
// PALETTE — mapped to traumainformedcontent.com
// =============================================================================
const PALETTE = {
  bg:        '#FAFAF6',
  surface:   '#FFFFFF',
  ink:       '#0A3D6E',
  inkDeep:   '#062847',
  muted:     '#5C6B7A',
  faint:     '#A0ADB8',
  rule:      '#E0DDD3',
  panel:     '#F0EBDD',
  panelDeep: '#E8E0CC',
  primary:   '#0A3D6E',
  primaryFg: '#FFFFFF',
  attention: '#E5634A', // logo coral
  consider:  '#2BA8DC', // logo sky blue
  note:      '#6FAA94', // logo sage green
  works:     '#3D7A5F',
  harm:      '#B85A3D',
};

// Framework chips display the regulatory frameworks that apply under
// each jurisdiction. Each chip is a link to the framework's definitive
// source so users can verify what the tool is checking against — a
// signal that these are real references, not decorative metadata.
// ISO 22458 is paywalled at the ISO site itself; we link to the BSI
// overview page as the next-best authoritative source.
const JURISDICTIONS = {
  UK: {
    label: 'United Kingdom',
    short: 'UK',
    frameworks: [
      { name: 'FCA Consumer Duty',     url: 'https://www.fca.org.uk/firms/consumer-duty-information-firms' },
      { name: 'Fundraising Regulator', url: 'https://www.fundraisingregulator.org.uk/code' },
      { name: 'ASA CAP code',          url: 'https://www.asa.org.uk/codes-and-rulings/advertising-codes.html' },
      { name: 'ISO 22458',             url: 'https://www.bsigroup.com/en-GB/standards/bs-iso-22458/' },
      { name: 'GDS content standards', url: 'https://www.gov.uk/guidance/content-design/writing-for-gov-uk' },
      { name: 'WCAG 2.2 AA',           url: 'https://www.w3.org/TR/WCAG22/' },
    ],
  },
  EU: {
    label: 'European Union',
    short: 'EU',
    frameworks: [
      { name: 'European Accessibility Act', url: 'https://employment-social-affairs.ec.europa.eu/policies-and-activities/social-protection-social-inclusion/persons-disabilities/union-equality-strategy-rights-persons-disabilities-2021-2030/european-accessibility-act_en' },
      { name: 'EN 301 549',                 url: 'https://www.etsi.org/deliver/etsi_en/301500_301599/301549/' },
      { name: 'ISO 22458',                  url: 'https://www.bsigroup.com/en-GB/standards/bs-iso-22458/' },
    ],
  },
  US: {
    label: 'United States',
    short: 'US',
    frameworks: [
      { name: 'Plain Writing Act', url: 'https://www.plainlanguage.gov/law/' },
      { name: 'Section 508',       url: 'https://www.section508.gov/' },
      { name: 'ADA',               url: 'https://www.ada.gov/' },
      { name: 'ISO 22458',         url: 'https://www.bsigroup.com/en-GB/standards/bs-iso-22458/' },
    ],
  },
};

const ROLE_CHIPS = [
  "I'm drafting this myself",
  "I'm editing what a colleague drafted",
  "I'm publishing content my team wrote",
  "I received this",
  "I'm reviewing third-party work",
];

const CHAR_LIMIT = 8000;
const PDF_MAX_BYTES = 2_500_000; // ~2.5 MB raw, ~3.3 MB base64 — sits under Vercel body limit

// Client-side fetch timeout for the /api/review call. Long reviews
// against complex passages can genuinely take 60-120 seconds — Sonnet
// generates several thousand tokens of structured output against a
// substantial system prompt, and that takes real time. The 180-second
// ceiling is conservative without being so long it traps a user
// against a genuinely dead connection. The Vercel function maxDuration
// (set in api/review.js) is the matching server-side cap.
const REVIEW_FETCH_TIMEOUT_MS = 180_000;
const ABOUT_DISMISS_KEY = 'rb_about_dismissed_v3';

const SITE = 'https://traumainformedcontent.com';

const NAV_LINKS = [
  { label: 'What is trauma-informed content?', href: `${SITE}/what-is-trauma-informed-content/` },
  { label: 'Resources',                         href: `${SITE}/resources/` },
  { label: 'Pricing',                           href: `${SITE}/rembrandt-editor-plus/` },
  { label: 'Help',                              href: `${SITE}/help/` },
  { label: 'About',                             href: `${SITE}/about-us/` },
  { label: 'Contact',                           href: `${SITE}/contact-us/` },
];

const EXAMPLE = `Dear Occupier,

Our records show that you have failed to respond to our previous correspondence dated 15th March 2024 regarding outstanding council tax arrears of £847.32.

You are required to make payment in full within 14 days of the date of this letter. Failure to do so will result in enforcement action being taken against you, which may include the involvement of enforcement agents and additional costs being added to your account.

If you are experiencing financial difficulty, you should contact us immediately.

Yours faithfully,
Revenues Department`;

// =============================================================================
// FEEDBACK CONFIG
// =============================================================================
const FEEDBACK_CATEGORIES = [
  { value: 'bug',        label: 'Bug — something is broken' },
  { value: 'unexpected', label: 'Unexpected output — the review surprised me' },
  { value: 'feature',    label: 'Feature request — something missing' },
  { value: 'general',    label: 'General — anything else' },
];

const FEEDBACK_SEVERITIES = [
  { value: 'blocker',  label: 'Blocker' },
  { value: 'annoying', label: 'Annoying' },
  { value: 'minor',    label: 'Minor' },
];

const FEEDBACK_MESSAGE_MAX = 5000;

// =============================================================================
// READABILITY — deterministic Flesch-Kincaid and SMOG calculations
//
// Why this exists: large language models cannot reliably compute readability
// scores. The same passage can score differently from one run to the next.
// Both formulas are deterministic given words, sentences, syllables, and
// polysyllabic word counts, so they are calculated here and sent to the
// backend, which instructs the model to use the exact decimal values in
// the readingAge and smog fields of its output. For PDFs the source text
// is not available client-side, so the model estimates both itself.
//
// v0.9.3 changes:
//   - F-K is now reported to one decimal place. The integer rounding in
//     v0.9.2 produced apparent grade jumps (e.g. 13.49 → 13.51 displayed
//     as 13 → 14) when small edits moved the underlying continuous score
//     across a rounding boundary. The decimal makes proportional changes
//     visible and matches what magnification users like Marian Avery
//     reported needing to see.
//   - SMOG runs alongside F-K. SMOG counts polysyllabic words (3+
//     syllables) over 30 sentences and is the NHS / healthcare standard
//     for patient communications. F-K weights sentence length; SMOG
//     weights vocabulary density. The two together reveal which axis
//     drives the score, which is diagnostically useful — a high F-K with
//     a moderate SMOG means long sentences with simple words; the
//     reverse means short sentences with dense vocabulary.
//
// Tokenizer notes (carried forward from v0.9.2):
//   - countSentences protects common abbreviations (Mr, Mrs, Dr, etc.,
//     e.g., i.e., U.S., U.K. etc.) and decimal numbers (£847.32, 12.5%)
//     before splitting on sentence terminators. Without this protection,
//     "£847.32" would be counted as two sentence terminators, and "e.g."
//     would be counted as a sentence end mid-thought.
//   - countWords, countSyllables, and countPolysyllables work on the
//     original text — they don't see the placeholders.
//
// SMOG reliability:
//   - McLaughlin's original SMOG formula was designed for 30-sentence
//     samples. For shorter texts the formula still works mathematically
//     but the polysyllable count is multiplied by a larger factor, which
//     can produce inflated scores. We display the score regardless and
//     leave interpretation to the user; the calculation breakdown shows
//     them the sentence count.
//
// Formulae:
//   F-K  = 0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
//   SMOG = 1.0430 × √(polysyllables × (30 / sentences)) + 3.1291
// =============================================================================

// Zero-width space — used as a placeholder for periods that should NOT be
// treated as sentence terminators (abbreviations, decimal points, ellipses).
const PROTECT = '\u200B';

const ABBREVIATIONS = [
  'Mr', 'Mrs', 'Ms', 'Mx', 'Dr', 'Prof',
  'St', 'Jr', 'Sr', 'No',
  'vs', 'etc', 'cf', 'al',
  'Inc', 'Ltd', 'Co', 'Corp',
  'Rev', 'Hon', 'Capt', 'Lt', 'Sgt', 'Gen', 'Col',
];

const countSentences = (text) => {
  let working = text;

  // Protect decimal numbers (e.g. "847.32", "12.5%") from being split.
  working = working.replace(/(\d)\.(\d)/g, `$1${PROTECT}$2`);

  // Collapse ellipses to a single protected mark so "..." doesn't count
  // as three sentence ends.
  working = working.replace(/\.{2,}/g, PROTECT);

  // Protect dotted abbreviations like "e.g.", "i.e.", "U.S.", "U.K."
  // Pattern: single letter, dot, single letter, dot.
  working = working.replace(/\b([a-zA-Z])\.([a-zA-Z])\./g, `$1${PROTECT}$2${PROTECT}`);

  // Protect the listed word abbreviations followed by a period.
  ABBREVIATIONS.forEach((abbrev) => {
    const re = new RegExp(`\\b${abbrev}\\.`, 'g');
    working = working.replace(re, abbrev + PROTECT);
  });

  // Now split on actual sentence terminators.
  const sentences = working
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Math.max(sentences.length, 1);
};

const countWords = (text) => {
  const words = text.match(/\b[\w'-]+\b/g) || [];
  return words.length;
};

const countSyllablesInWord = (word) => {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  w = w.replace(/^y/, '');
  const matches = w.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
};

const countSyllables = (text) => {
  const words = text.match(/\b[\w'-]+\b/g) || [];
  return words.reduce((sum, word) => sum + countSyllablesInWord(word), 0);
};

const countPolysyllables = (text) => {
  const words = text.match(/\b[\w'-]+\b/g) || [];
  return words.reduce((sum, word) => sum + (countSyllablesInWord(word) >= 3 ? 1 : 0), 0);
};

// Round to one decimal place. Used for both F-K and SMOG.
const round1 = (n) => Math.round(n * 10) / 10;

const fleschKincaidGrade = (text) => {
  if (!text || text.trim().length === 0) return null;
  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = countSyllables(text);
  if (words === 0) return null;
  const grade =
    0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.max(1, round1(grade));
};

const smogGrade = (text) => {
  if (!text || text.trim().length === 0) return null;
  const sentences = countSentences(text);
  const polysyllables = countPolysyllables(text);
  if (sentences === 0) return null;
  const grade = 1.0430 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291;
  return Math.max(1, round1(grade));
};

// Combined calculator that returns both scores and the underlying counts.
// The counts are surfaced in the UI behind a "Show calculation" disclosure
// so the user can audit the maths themselves — this is the diagnostic
// transparency Marian Avery flagged as missing in v0.9.2.
const calculateReadability = (text) => {
  if (!text || text.trim().length === 0) return null;
  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = countSyllables(text);
  const polysyllables = countPolysyllables(text);
  if (words === 0 || sentences === 0) return null;

  const fk = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  const smog = 1.0430 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291;

  return {
    readingAge: Math.max(1, round1(fk)),
    smog: Math.max(1, round1(smog)),
    words,
    sentences,
    syllables,
    polysyllables,
    wordsPerSentence: round1(words / sentences),
    syllablesPerWord: Math.round((syllables / words) * 100) / 100,
  };
};

// =============================================================================
// READABILITY CONTEXT — audience-appropriate targets for both F-K and SMOG
//
// Per-metric target descriptors (fkTargetText, smogTargetText) are used
// by the structured two-row readability display. The combined targetText
// remains for the markdown export, where a single-line description reads
// more naturally than a two-row layout.
// =============================================================================
const getReadabilityContext = (readingAge, smog, contentType) => {
  const t = (contentType || '').toLowerCase();

  let fkTarget = null;
  let smogTarget = null;
  let fkTargetText = null;
  let smogTargetText = null;
  let modeName = null;
  let targetText = null;
  let isLivingExperience = false;

  if (t.includes('crisis') || t.includes('emergency')) {
    fkTarget = 7;
    smogTarget = 8;
    fkTargetText = '7 or below';
    smogTargetText = '8 or below';
    modeName = 'crisis or emergency content';
    targetText = 'aim for Flesch-Kincaid 7 or below and SMOG 8 or below';
    isLivingExperience = true;
  } else if (t.includes('service content')) {
    fkTarget = 8;
    smogTarget = 9;
    fkTargetText = 'around 8 — GDS standard';
    smogTargetText = '9 or below — NHS standard';
    modeName = 'service content';
    targetText = 'GDS aims for Flesch-Kincaid around 8, NHS SMOG ≤ 9';
    isLivingExperience = true;
  } else if (t.includes('fundraising') || t.includes('emotional appeal') || t.includes('appeal email') || t.includes('donor')) {
    fkTarget = 11;
    smogTarget = 11;
    fkTargetText = '9 to 11 typical';
    smogTargetText = '10 to 11 typical';
    modeName = 'fundraising content';
    targetText = 'Flesch-Kincaid 9-11 and SMOG 10-11 typical';
  } else if (t.includes('marketing') || t.includes('commercial') || t.includes('promotional')) {
    fkTarget = 10;
    smogTarget = 11;
    fkTargetText = '8 to 10 typical';
    smogTargetText = '9 to 11 typical';
    modeName = 'marketing content';
    targetText = 'Flesch-Kincaid 8-10 and SMOG 9-11 typical';
  } else if (t.includes('organisational') || t.includes('overview') ||
             t.includes('educational') || t.includes('blog') ||
             t.includes('article') || t.includes('explainer')) {
    fkTarget = 12;
    smogTarget = 12;
    fkTargetText = '9 to 12 typical';
    smogTargetText = '10 to 12 typical';
    modeName = 'content for engaged adult audiences';
    targetText = 'Flesch-Kincaid 9-12 and SMOG 10-12 typical';
  }

  if (!fkTarget) return null;

  const fkExceedsTarget = typeof readingAge === 'number' && readingAge > fkTarget;
  const smogExceedsTarget = typeof smog === 'number' && smog > smogTarget;

  return {
    fkTarget,
    smogTarget,
    fkTargetText,
    smogTargetText,
    fkExceedsTarget,
    smogExceedsTarget,
    modeName,
    targetText,
    exceedsTarget: fkExceedsTarget || smogExceedsTarget,
    isLivingExperience,
  };
};

// =============================================================================
// MARKDOWN BUILDER — used by the Copy review button
// =============================================================================
const buildReviewMarkdown = (results, jurisdiction) => {
  const lines = ['# Rembrandt Editor review', ''];

  if (results.overall) {
    if (results.overall.contentType) lines.push(`**Detected as:** ${results.overall.contentType}`);

    const fk = results.overall.readingAge;
    const sm = results.overall.smog;
    if (fk || sm) {
      const ctx = getReadabilityContext(fk, sm, results.overall.contentType);
      const parts = [];
      if (fk) parts.push(`Flesch-Kincaid ${fk}`);
      if (sm) parts.push(`SMOG ${sm}`);
      const line = `**Reading age:** ${parts.join(' · ')}`;
      if (ctx && ctx.exceedsTarget) {
        lines.push(`${line} — for ${ctx.modeName}, ${ctx.targetText}`);
      } else {
        lines.push(line);
      }
    }

    if (results.overall.contextApplied) lines.push(`**Context applied:** ${results.overall.contextApplied}`);
    if (results.overall.contentType || fk || sm || results.overall.contextApplied) lines.push('');

    if (results.overall.summary) {
      lines.push('## Summary', '', results.overall.summary, '');
    }
  }

  if (results.issues?.length > 0) {
    lines.push(`## Specific issues (${results.issues.length})`, '');
    results.issues.forEach((issue) => {
      const sev = issue.severity ? issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1) : '';
      const cat = issue.category ? issue.category.replace(/-/g, ' ') : '';
      lines.push(`### ${sev}${cat ? ' — ' + cat : ''}`, '');
      if (issue.excerpt) lines.push(`> "${issue.excerpt}"`, '');
      lines.push(issue.observation || issue.problem || '', '');
      if (issue.suggestion) lines.push(`**Try instead:** ${issue.suggestion}`, '');
    });
  }

  if (results.jurisdictionFlags?.length > 0) {
    lines.push(`## ${JURISDICTIONS[jurisdiction]?.short || ''} flags`, '');
    lines.push('*Plausible concerns under named frameworks. Not a compliance audit.*', '');
    results.jurisdictionFlags.forEach((flag) => {
      lines.push(`**${flag.framework}**`, '', flag.concern, '');
    });
  }

  if (results.rewrite) {
    lines.push('## Suggested rewrite', '', results.rewrite, '');
  }

  lines.push('---');
  lines.push(`Reviewed with Rembrandt Editor ${VERSION} · ${SITE.replace(/^https?:\/\//, '')}`);

  return lines.join('\n');
};

// =============================================================================
// PROSE FIELD — paragraph-aware renderer for model-emitted long-form text
//
// Why this exists: summary, observation, and suggestion strings can run
// long. Rendering them as a single block of prose buries the structure
// the model already put in the text. The model can emit \n\n where a
// paragraph break would genuinely aid scannability (e.g. in the summary,
// shifting from "what's working" to "what needs attention"); we split
// on those and render each chunk as its own <p>. Single-paragraph
// content renders as a plain <div> so layout doesn't shift around for
// the common case.
//
// We deliberately don't support markdown — bullets, bold, headings —
// because the model's outputs are constrained JSON and adding markdown
// rendering opens a much larger surface area than the problem warrants.
// Paragraph breaks are the smallest useful intervention.
// =============================================================================
const ProseField = ({ text, className }) => {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  const paras = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) {
    return <div className={className}>{trimmed}</div>;
  }
  return (
    <div className={className}>
      {paras.map((p, i) => (
        <p key={i} className="rb-prose-para">{p}</p>
      ))}
    </div>
  );
};

// =============================================================================
// COMPONENT
// =============================================================================
export default function App() {
  const [content, setContent] = useState('');
  const [pdfFile, setPdfFile] = useState(null); // { name, data, size } when set
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [jurisdiction, setJurisdiction] = useState('UK');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [aboutDismissed, setAboutDismissed] = useState(false);
  const [reviewPhase, setReviewPhase] = useState(-1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Feedback modal state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('');
  const [feedbackSeverity, setFeedbackSeverity] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);

  const textareaRef = useRef(null);
  const resultsHeadingRef = useRef(null);
  const pdfInputRef = useRef(null);
  const feedbackFirstFieldRef = useRef(null);
  const feedbackTriggerRef = useRef(null);

  // Phase timings (in ms) are scenography of what the server is doing.
  // We can't see the model's actual progress, so these are roughly
  // matched to typical review duration — slow enough that the last
  // phase doesn't tick "current" within 20 seconds of a call that
  // routinely takes 60-90+ seconds to complete. The elapsed counter
  // below is the user's real signal that the request is alive.
  const PHASES = [
    { label: 'Detecting content type and reader stage', ms: 4000 },
    { label: 'Mapping cognitive load and trust points', ms: 12000 },
    { label: `Checking against ${JURISDICTIONS[jurisdiction].short} frameworks`, ms: 10000 },
    { label: 'Drafting suggested rewrite', ms: 14000 },
  ];

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch (e) {} };
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(ABOUT_DISMISS_KEY) === '1') {
        setAboutDismissed(true);
      }
    } catch (e) { /* ignore */ }
  }, []);

  // ESC key closes feedback modal
  useEffect(() => {
    if (!feedbackOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeFeedback(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackOpen]);

  // Focus first feedback field when modal opens
  useEffect(() => {
    if (feedbackOpen && !feedbackSent) {
      setTimeout(() => feedbackFirstFieldRef.current?.focus(), 50);
    }
  }, [feedbackOpen, feedbackSent]);

  // Trap keyboard focus inside the feedback modal while it is open, so Tab
  // and Shift+Tab cycle through fields without escaping to the page behind.
  useEffect(() => {
    if (!feedbackOpen) return;
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const modal = document.querySelector('.rb-feedback-modal');
      if (!modal) return;
      const focusables = Array.from(modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [feedbackOpen]);

  useEffect(() => {
    if (!loading) {
      setReviewPhase(-1);
      setElapsedSeconds(0);
      return;
    }
    setReviewPhase(0);
    setElapsedSeconds(0);
    let cumulative = 0;
    // Schedule timers for every phase EXCEPT the last one. The last phase
    // stays "current" until the API actually returns, instead of ticking
    // complete on a timer and leaving a confusing dead period where every
    // phase shows ✓ but nothing happens.
    const timers = PHASES.slice(0, -1).map((p, i) => {
      cumulative += p.ms;
      return setTimeout(() => setReviewPhase(i + 1), cumulative);
    });
    // Real elapsed counter — gives the user a live signal that the
    // request is still in flight even when the phase list has stopped
    // moving. Ticks once per second from 0.
    const elapsedTimer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(elapsedTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, jurisdiction]);

  const dismissAbout = () => {
    setAboutDismissed(true);
    try { window.localStorage.setItem(ABOUT_DISMISS_KEY, '1'); } catch (e) {}
  };

  const charsLeft = CHAR_LIMIT - content.length;
  const overLimit = charsLeft < 0;

  // --- PDF handling ---
  const handlePdfUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported.');
      return;
    }
    if (file.size > PDF_MAX_BYTES) {
      setError(`PDF must be under ${(PDF_MAX_BYTES / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result;
        const base64 = typeof result === 'string' ? result.split(',')[1] : '';
        setPdfFile({ name: file.name, data: base64, size: file.size });
        setContent('');
        setResults(null);
        setError(null);
        setAnnouncement(`PDF loaded: ${file.name}`);
      } catch (err) {
        setError('Could not read the PDF file.');
      }
    };
    reader.onerror = () => setError('Could not read the PDF file.');
    reader.readAsDataURL(file);

    // reset input so the same file can be re-selected later
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const clearPdf = () => {
    setPdfFile(null);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const analyse = async () => {
    const hasInput = pdfFile || content.trim();
    if (!hasInput || loading || overLimit) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setAnnouncement('Reviewing content. This can take up to a minute or two for longer passages.');

    // Snapshot notes at the moment the review is run, so subsequent edits
    // to the notes field don't desync from the displayed "Context applied".
    const notesSnapshot = notes.trim();

    // For text input, calculate readability deterministically and send both
    // values to the backend. The model uses these exact decimals in its
    // output so the verdict-meta line and the summary prose stay in sync,
    // and the numbers are consistent across runs. The breakdown is also
    // stored locally and attached to the parsed results so the user can
    // audit the calculation via the "Show calculation" disclosure. PDFs
    // fall back to the model's estimates because the source text isn't
    // available client-side.
    const readability = !pdfFile && content ? calculateReadability(content) : null;
    const calculatedReadingAge = readability ? readability.readingAge : null;
    const calculatedSmog = readability ? readability.smog : null;

    // AbortController + timer give us a hard cap on how long the loading
    // state can sit. If the fetch hasn't resolved within
    // REVIEW_FETCH_TIMEOUT_MS, we abort, the catch block fires with an
    // AbortError, and the user sees a specific message instead of a
    // hanging spinner. We clear the timer in the finally block so it
    // doesn't fire late against an already-resolved fetch.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REVIEW_FETCH_TIMEOUT_MS);

    try {
      const body = pdfFile
        ? { pdfData: pdfFile.data, pdfFilename: pdfFile.name, jurisdiction, role, notes: notesSnapshot }
        : { content, jurisdiction, role, notes: notesSnapshot, calculatedReadingAge, calculatedSmog };

const response = await authFetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      // The server now parses the model's JSON output and returns the
      // structured object directly, with up to three attempts to handle
      // intermittent malformed JSON from the model. The client just
      // displays what arrives.
      const parsed = await response.json();

      // Ensure the snapshotted notes are displayed back to the reviewer as
      // confirmation of what was sent, even if the server didn't echo them.
      if (notesSnapshot && parsed.overall && !parsed.overall.contextApplied) {
        parsed.overall.contextApplied = notesSnapshot;
      }

      // Attach the deterministic breakdown so the UI can show it in the
      // "Show calculation" disclosure. PDFs don't get a breakdown because
      // the source text isn't tokenisable client-side.
      if (readability && parsed.overall) {
        parsed.overall.readabilityBreakdown = {
          words: readability.words,
          sentences: readability.sentences,
          syllables: readability.syllables,
          polysyllables: readability.polysyllables,
          wordsPerSentence: readability.wordsPerSentence,
          syllablesPerWord: readability.syllablesPerWord,
        };
      }

      setResults(parsed);
      const issueCount = parsed.issues?.length || 0;
      const flagCount = parsed.jurisdictionFlags?.length || 0;
      setAnnouncement(
        `Review complete. ${issueCount} issue${issueCount === 1 ? '' : 's'} and ${flagCount} ${JURISDICTIONS[jurisdiction].short} flag${flagCount === 1 ? '' : 's'} found.`
      );
    } catch (e) {
      console.error(e);
      // Differentiate the three failure shapes so the user gets actionable
      // feedback rather than a generic "something went wrong":
      //   - AbortError: our own timeout fired. Tell them so.
      //   - TypeError from fetch: usually a network or CORS problem
      //     before the request reached the server.
      //   - Anything else: surface the server's error message if we have
      //     one, otherwise fall back to a generic message.
      if (e.name === 'AbortError') {
        setError("The review didn't come back in time. Try again, or shorten the passage if it's long. If this keeps happening, please use Send feedback so we can investigate.");
      } else if (e instanceof TypeError) {
        setError("Couldn't reach the review service. Check your connection and try again.");
      } else {
        setError(e.message || 'Something went wrong. Please try again.');
      }
      setAnnouncement('Review failed. Please try again.');
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const loadExample = () => {
    setContent(EXAMPLE);
    setPdfFile(null);
    setResults(null);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const clear = () => {
    setContent('');
    setResults(null);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const toggleChip = (chip) => {
    setRole((current) => (current === chip ? '' : chip));
  };

  const copyRewrite = async () => {
    if (!results?.rewrite) return;
    try {
      await navigator.clipboard.writeText(results.rewrite);
      setCopied(true);
      setAnnouncement('Rewrite copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { console.error(e); }
  };

  const copyFullReview = async () => {
    if (!results) return;
    try {
      const md = buildReviewMarkdown(results, jurisdiction);
      await navigator.clipboard.writeText(md);
      setReviewCopied(true);
      setAnnouncement('Full review copied to clipboard as Markdown.');
      setTimeout(() => setReviewCopied(false), 2000);
    } catch (e) { console.error(e); }
  };

  // --- Feedback handling ---
  const openFeedback = () => {
    // Capture the element that opened the modal so we can return focus
    // to it when the modal closes.
    if (typeof document !== 'undefined') {
      feedbackTriggerRef.current = document.activeElement;
    }
    setFeedbackOpen(true);
    setMobileNavOpen(false);
  };

  const closeFeedback = () => {
    setFeedbackOpen(false);
    // Return focus to whichever element opened the modal.
    setTimeout(() => {
      if (feedbackTriggerRef.current && typeof feedbackTriggerRef.current.focus === 'function') {
        feedbackTriggerRef.current.focus();
      }
    }, 0);
    // Reset state after a short delay so the closing animation doesn't show empty fields
    setTimeout(() => {
      setFeedbackCategory('');
      setFeedbackSeverity('');
      setFeedbackMessage('');
      setFeedbackEmail('');
      setFeedbackError(null);
      setFeedbackSent(false);
    }, 200);
  };

  const sendAnother = () => {
    setFeedbackCategory('');
    setFeedbackSeverity('');
    setFeedbackMessage('');
    setFeedbackEmail('');
    setFeedbackError(null);
    setFeedbackSent(false);
  };

  const canSubmitFeedback =
    feedbackCategory && feedbackSeverity && feedbackMessage.trim() && !feedbackSubmitting;

  const submitFeedback = async () => {
    if (!canSubmitFeedback) return;

    setFeedbackSubmitting(true);
    setFeedbackError(null);

    // Build a document snapshot — first 500 chars of text or PDF filename
    let documentSnapshot = null;
    let documentType = 'none';
    if (content) {
      documentSnapshot = content.slice(0, 500);
      documentType = 'text';
    } else if (pdfFile) {
      documentSnapshot = pdfFile.name;
      documentType = 'pdf';
    }

    try {
const response = await authFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: feedbackCategory,
          severity: feedbackSeverity,
          message: feedbackMessage.trim(),
          email: feedbackEmail.trim() || null,
          document_snapshot: documentSnapshot,
          document_type: documentType,
          jurisdiction,
          app_version: VERSION,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Could not send feedback. Please try again.');
      }

      setFeedbackSent(true);
      setAnnouncement('Feedback sent. Thank you.');
    } catch (e) {
      console.error(e);
      setFeedbackError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const severityMeta = (sev) => {
    if (sev === 'attention') return { dot: PALETTE.attention, bg: '#FCEAE3', label: 'Attention' };
    if (sev === 'consider')  return { dot: PALETTE.consider,  bg: '#DDF0F9', label: 'Consider'  };
    return                          { dot: PALETTE.note,      bg: '#E6F0EA', label: 'Note'      };
  };

  const categoryLabel = (cat) => ({
    'cognitive-load':     'cognitive load',
    'emotional-register': 'emotional register',
    'trust-grounding':    'trust and grounding',
    'power-agency':       'power and agency',
  }[cat] || cat);

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; }
    button, select, textarea, input { font-family: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: 0.5; }
    a { color: inherit; }

    .rb-root {
      --bg: ${PALETTE.bg};
      --surface: ${PALETTE.surface};
      --ink: ${PALETTE.ink};
      --ink-deep: ${PALETTE.inkDeep};
      --muted: ${PALETTE.muted};
      --faint: ${PALETTE.faint};
      --rule: ${PALETTE.rule};
      --panel: ${PALETTE.panel};
      --panel-deep: ${PALETTE.panelDeep};
      --primary: ${PALETTE.primary};
      --primary-fg: ${PALETTE.primaryFg};
      --coral: ${PALETTE.attention};
      --sky: ${PALETTE.consider};
      --sage: ${PALETTE.note};
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
    }
    .rb-display { font-family: 'Rethink Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 600; letter-spacing: -0.015em; }

    .rb-skip {
      position: absolute; top: -40px; left: 16px;
      background: var(--ink); color: var(--bg);
      padding: 8px 14px; border-radius: 4px; z-index: 100;
      font-size: 14px; font-weight: 500;
    }
    .rb-skip:focus { top: 8px; outline: 2px solid var(--primary); outline-offset: 2px; }

    .rb-sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }

    /* ---- Header ----
       Not sticky. Sticky headers are an accessibility regression for users
       at high browser magnification (350-500% is common among magnification
       users, well beyond WCAG's 200% test) because the header occupies a
       growing fraction of the viewport and obscures content. position:
       relative is here to act as the positioning context for the mobile
       nav dropdown, which uses top: 100% to sit flush below the header at
       any height. */
    .rb-header {
      border-bottom: 1px solid var(--rule);
      background: var(--bg);
      position: relative; z-index: 20;
    }
    .rb-header-inner { max-width: 1280px; margin: 0 auto; padding: 16px 32px 12px; }
    .rb-header-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .rb-brand { display: flex; align-items: center; gap: 14px; text-decoration: none; color: var(--ink); }
    .rb-brand:focus-visible { outline: 2px solid var(--primary); outline-offset: 4px; border-radius: 4px; }
    .rb-logo { width: 44px; height: 44px; object-fit: contain; flex-shrink: 0; }
    .rb-brand-text { display: flex; flex-direction: column; line-height: 1.1; }
    .rb-wordmark { font-family: 'Rethink Sans', sans-serif; font-weight: 700; font-size: 26px; letter-spacing: -0.02em; color: var(--ink); }
    .rb-tagline { font-size: 13px; color: var(--muted); margin-top: 4px; letter-spacing: 0.005em; }

    .rb-nav { display: flex; align-items: center; gap: 4px; font-size: 14px; }
    .rb-nav a, .rb-nav .rb-nav-feedback-btn {
      color: var(--muted); text-decoration: none;
      padding: 8px 14px; border-radius: 999px;
      transition: background 0.15s ease, color 0.15s ease;
      background: transparent; border: none; font-family: inherit; font-size: inherit;
    }
    .rb-nav a:hover, .rb-nav .rb-nav-feedback-btn:hover { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-nav a:focus-visible, .rb-nav .rb-nav-feedback-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-nav-feedback-btn {
      color: var(--ink) !important; font-weight: 600;
      border: 1px solid var(--ink) !important; border-radius: 999px;
      margin-left: 6px;
    }
    .rb-nav-feedback-btn:hover { background: var(--ink) !important; color: var(--surface) !important; }
    .rb-nav-toggle {
      display: none;
      background: transparent; border: 1px solid var(--rule);
      color: var(--ink); padding: 8px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 500;
    }
    .rb-nav-toggle:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    @media (max-width: 940px) {
      .rb-nav { display: none; }
      .rb-nav-toggle { display: inline-block; }
      .rb-nav.rb-nav-open {
        display: flex; flex-direction: column; align-items: stretch;
        position: absolute; top: 100%; right: 16px; left: 16px;
        background: var(--surface); border: 1px solid var(--rule);
        padding: 8px; border-radius: 12px;
        box-shadow: 0 16px 40px rgba(10,61,110,0.12); gap: 0;
      }
      .rb-nav.rb-nav-open a, .rb-nav.rb-nav-open .rb-nav-feedback-btn { padding: 12px 16px; border-radius: 6px; text-align: left; }
      .rb-nav-feedback-btn { margin-left: 0 !important; margin-top: 4px; text-align: center !important; }
    }

    /* ---- Jurisdiction row ---- */
    .rb-lens-row {
      max-width: 1280px; margin: 0 auto;
      padding: 6px 32px 12px;
      display: flex; flex-wrap: wrap; gap: 12px 22px; align-items: center;
    }
    .rb-jur-group {
      display: inline-flex; gap: 4px; background: var(--surface); padding: 4px;
      border-radius: 999px; border: 1px solid var(--rule);
    }
    .rb-jur-btn {
      padding: 7px 18px; border-radius: 999px; border: none;
      background: transparent; color: var(--muted);
      font-size: 13px; font-weight: 600; letter-spacing: 0.04em;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-jur-btn[aria-pressed="true"] { background: var(--ink); color: var(--surface); }
    .rb-jur-btn:hover:not([aria-pressed="true"]) { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-jur-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    .rb-fw-list { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0; align-items: center; }
    .rb-fw-label { font-size: 11px; color: var(--muted); letter-spacing: 0.04em; font-weight: 600; margin-right: 4px; }
    .rb-fw {
      font-size: 12px;
      border-radius: 999px;
      background: var(--surface); border: 1px solid var(--rule);
      white-space: nowrap;
      padding: 0;
      overflow: hidden;
    }
    .rb-fw[data-tone="coral"] { border-left: 3px solid var(--coral); }
    .rb-fw[data-tone="sky"]   { border-left: 3px solid var(--sky); }
    .rb-fw[data-tone="sage"]  { border-left: 3px solid var(--sage); }
    .rb-fw-link {
      display: block;
      padding: 4px 10px;
      color: var(--ink);
      text-decoration: none;
      transition: background-color 0.12s ease;
    }
    .rb-fw-link:hover { background: var(--panel); text-decoration: underline; }
    .rb-fw-link:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
      background: var(--panel);
    }

    @media (max-width: 700px) {
      .rb-header-inner { padding: 14px 20px 10px; }
      .rb-lens-row { padding: 4px 20px 12px; }
      .rb-wordmark { font-size: 22px; }
      .rb-tagline { font-size: 12px; }
      .rb-logo { width: 38px; height: 38px; }
    }

    /* ---- About / intro section ---- */
    .rb-about { max-width: 1280px; margin: 18px auto 0; padding: 0 32px; }
    .rb-about-inner {
      background: var(--panel); border-radius: 12px;
      padding: 20px 24px; position: relative; overflow: hidden;
    }
    .rb-about-inner::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, var(--coral) 0 33%, var(--sky) 33% 66%, var(--sage) 66% 100%);
    }
    .rb-about-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 22px; }
    @media (max-width: 760px) { .rb-about-grid { grid-template-columns: 1fr; gap: 14px; } }
    .rb-about-block h2 {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 15px; font-weight: 600;
      letter-spacing: -0.005em;
      color: var(--ink); margin: 0 0 8px;
    }
    .rb-about-body { font-size: 16px; line-height: 1.5; color: var(--ink); margin: 0; }
    .rb-about-body + .rb-about-body { margin-top: 10px; }
    .rb-about-body strong { font-weight: 600; }
    .rb-about-meta {
      margin-top: 14px; padding-top: 12px;
      border-top: 1px solid var(--panel-deep);
      font-size: 13px; color: var(--muted); line-height: 1.55;
    }
    .rb-about-meta strong { color: var(--ink); font-weight: 600; }
    .rb-about-meta-link {
      color: var(--ink); text-decoration: underline; text-underline-offset: 3px;
      font-weight: 600; white-space: nowrap;
    }
    .rb-about-close {
      position: absolute; top: 12px; right: 12px;
      background: transparent; border: 1px solid var(--panel-deep);
      color: var(--muted); padding: 4px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 500;
    }
    .rb-about-close:hover { color: var(--ink); border-color: var(--ink); background: rgba(10,61,110,0.04); }
    .rb-about-close:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-about-show {
      display: inline-block; margin: 8px 0 0;
      background: transparent; border: none; padding: 0;
      color: var(--muted); font-size: 13px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .rb-about-show:hover { color: var(--ink); }
    .rb-about-show:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }

    .rb-help-link {
      display: inline-block; margin: 14px 0 0;
      color: var(--muted); font-size: 13px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .rb-help-link:hover { color: var(--ink); }
    .rb-help-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }

    /* ---- Main grid ---- */
    .rb-main {
      max-width: 1280px; margin: 0 auto;
      padding: 22px 32px 40px;
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px;
    }
    @media (max-width: 900px) {
      .rb-main { grid-template-columns: 1fr; gap: 24px; padding: 20px 20px 32px; }
      .rb-about { padding: 0 20px; }
      .rb-about-inner { padding: 18px 18px; }
    }

    .rb-section-title { font-family: 'Rethink Sans', sans-serif; font-size: 22px; font-weight: 600; margin: 0 0 14px; letter-spacing: -0.01em; }

    /* ---- Role and notes inputs ---- */
    .rb-role { margin-bottom: 14px; }
    .rb-notes { margin-bottom: 14px; }
    .rb-field-label {
      display: block; font-size: 12px; color: var(--muted);
      margin-bottom: 6px; font-style: italic;
    }

    /* ---- Progressive disclosure for role + notes ----
       Hidden by default. Click summary to reveal the role chips and notes
       field. State preserved when collapsed — values still send on
       Review. Pattern mirrors the readability "Show calculation"
       disclosure for visual consistency. */
    .rb-context-details {
      margin-bottom: 14px;
    }
    .rb-context-details summary {
      cursor: pointer;
      font-size: 13px;
      color: var(--muted);
      padding: 6px 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      list-style: none;
      user-select: none;
    }
    .rb-context-details summary::-webkit-details-marker { display: none; }
    .rb-context-details summary::before {
      content: '▸';
      transition: transform 0.15s ease;
      font-size: 11px;
      color: var(--faint);
    }
    .rb-context-details[open] summary::before { transform: rotate(90deg); }
    .rb-context-details summary:hover { color: var(--ink); }
    .rb-context-details summary:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
      border-radius: 2px;
    }
    .rb-context-details[open] > .rb-role {
      margin-top: 10px;
    }
    .rb-notes-input {
      width: 100%; padding: 10px 14px;
      border: 1px solid var(--rule); border-radius: 8px;
      background: var(--surface);
      font-size: 14px; line-height: 1.5; color: var(--ink); outline: none;
      font-family: inherit;
      resize: vertical;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .rb-notes-input::placeholder { color: var(--faint); }
    .rb-notes-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(10, 61, 110, 0.15); }

    .rb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .rb-chip {
      background: var(--surface); border: 1px solid var(--rule);
      color: var(--ink); padding: 6px 14px;
      border-radius: 999px; font-size: 12px; font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .rb-chip:hover:not([aria-pressed="true"]) { border-color: var(--primary); background: rgba(10, 61, 110, 0.04); }
    .rb-chip[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--surface); }
    .rb-chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    /* ---- Textarea ---- */
    .rb-textarea {
      width: 100%; min-height: 220px; padding: 18px 20px;
      border: 1px solid var(--rule); border-radius: 8px;
      background: var(--surface);
      font-size: 15px; line-height: 1.65; color: var(--ink);
      resize: vertical; outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .rb-textarea::placeholder { color: var(--faint); }
    .rb-textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(10, 61, 110, 0.15); }
    .rb-textarea[aria-invalid="true"] { border-color: var(--coral); }

    /* ---- PDF card ---- */
    .rb-pdf-card {
      width: 100%; min-height: 220px;
      border: 1px solid var(--rule); border-radius: 8px;
      background: var(--surface);
      padding: 24px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; text-align: center;
    }
    .rb-pdf-icon {
      width: 56px; height: 56px;
      background: var(--panel); border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; color: var(--ink);
      border-left: 3px solid var(--coral);
    }
    .rb-pdf-name { font-family: 'Rethink Sans', sans-serif; font-weight: 600; font-size: 16px; color: var(--ink); word-break: break-all; max-width: 100%; }
    .rb-pdf-meta { font-size: 12px; color: var(--muted); }
    .rb-pdf-meta-tag { display: inline-block; padding: 2px 8px; background: var(--panel); border-radius: 999px; font-size: 11px; color: var(--ink); margin-left: 6px; font-weight: 600; letter-spacing: 0.04em; }
    .rb-pdf-remove {
      background: transparent; border: 1px solid var(--rule); color: var(--muted);
      padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 500;
      transition: color 0.15s ease, border-color 0.15s ease;
    }
    .rb-pdf-remove:hover { color: var(--ink); border-color: var(--ink); }
    .rb-pdf-remove:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    .rb-meta-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 8px; font-size: 12px; color: var(--muted);
      flex-wrap: wrap; gap: 8px;
    }
    .rb-meta-row .rb-over { color: var(--coral); font-weight: 500; }
    .rb-link-btn {
      background: none; border: none; padding: 0;
      color: var(--muted); font-size: 12px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .rb-link-btn:hover { color: var(--ink); }
    .rb-link-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }

    .rb-pdf-toggle {
      margin-top: 10px; font-size: 13px; color: var(--muted);
      display: flex; gap: 6px; align-items: baseline;
    }
    .rb-pdf-toggle .rb-link-btn { font-size: 13px; }
    .rb-pdf-toggle-tag {
      display: inline-block; padding: 1px 8px; background: var(--panel);
      border-radius: 999px; font-size: 11px; color: var(--ink);
      font-weight: 600; letter-spacing: 0;
      margin-left: 4px;
    }

    /* ---- Review action ---- */
    .rb-actions { margin-top: 14px; }
    .rb-primary-btn {
      width: 100%;
      padding: 16px 20px; border: none; border-radius: 8px;
      background: var(--ink); color: var(--surface);
      font-size: 15px; font-weight: 600; letter-spacing: 0.005em;
      box-shadow: 0 6px 20px rgba(10, 61, 110, 0.18);
      transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease;
    }
    .rb-primary-btn:hover:not(:disabled) { background: var(--ink-deep); }
    .rb-primary-btn:active:not(:disabled) { transform: translateY(1px); }
    .rb-primary-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    /* ---- Review states ---- */
    .rb-empty, .rb-loading, .rb-error-card {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 12px;
      padding: 36px 28px; min-height: 320px;
      display: flex; align-items: center; justify-content: center;
      position: relative; overflow: hidden;
    }
    .rb-empty {
      background:
        radial-gradient(circle at 90% -10%, rgba(43,168,220,0.08), transparent 50%),
        radial-gradient(circle at -10% 110%, rgba(229,99,74,0.07), transparent 50%),
        var(--surface);
    }
    .rb-empty-inner { max-width: 420px; text-align: center; }
    .rb-empty-divider {
      height: 1px; background: var(--rule);
      width: 60px; margin: 0 auto 24px;
    }
    .rb-empty-quote {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 16px; font-weight: 500; font-style: italic;
      color: var(--ink); margin: 8px 0 14px;
      line-height: 1.45; letter-spacing: -0.005em;
    }
    .rb-empty-body { font-size: 13px; color: var(--muted); line-height: 1.6; margin: 0 0 14px; }
    .rb-empty-body:last-child { margin-bottom: 0; }

    /* ---- Phased loading list ---- */
    .rb-loading-inner { max-width: 360px; }
    .rb-loading-title {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 15px; font-style: italic; margin-bottom: 18px;
      text-align: center; color: var(--ink); line-height: 1.4;
    }
    .rb-phases { list-style: none; padding: 0; margin: 0; font-size: 13px; line-height: 1.8; text-align: left; }
    .rb-phase { display: flex; align-items: center; gap: 10px; transition: opacity 0.3s ease, color 0.3s ease, font-weight 0.3s ease; }
    .rb-phase-marker { width: 14px; display: inline-block; text-align: center; font-variant-numeric: tabular-nums; }
    .rb-phase-done    { color: var(--muted); opacity: 1; }
    .rb-phase-current { color: var(--ink);   opacity: 1; font-weight: 600; }
    .rb-phase-pending { color: var(--faint); opacity: 0.55; }

    /* ---- Elapsed-seconds counter ----
       Sits below the phase list. Real signal that the request is alive
       even when the phase list has stopped moving. aria-live="off" on
       the element because announcing every second to screen readers
       would be intolerable. Tabular numerals so the digits don't jitter. */
    .rb-loading-elapsed {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--rule);
      font-size: 12px;
      color: var(--faint);
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .rb-error-card {
      background: #FCEAE3; border-color: var(--coral);
      color: ${PALETTE.harm}; padding: 18px 22px;
      min-height: auto; font-size: 14px; line-height: 1.55;
      align-items: flex-start; justify-content: flex-start;
    }

    /* ---- Review results ---- */
    .rb-results { display: flex; flex-direction: column; gap: 22px; }
    .rb-results-actions {
      display: flex; justify-content: flex-end; align-items: center;
      gap: 8px; margin-top: -6px; margin-bottom: -6px;
    }
    .rb-results-copy {
      background: var(--ink); border: 1px solid var(--ink); color: var(--surface);
      padding: 7px 16px; border-radius: 999px; font-size: 12px; font-weight: 600;
      letter-spacing: 0.02em;
      transition: background 0.15s ease;
    }
    .rb-results-copy:hover { background: var(--ink-deep); }
    .rb-results-copy:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    /* ---- Results-section nav ----
       Sits in normal document flow. Was previously sticky with a hardcoded
       offset — removed for the same accessibility reasons as the page
       header (see comment on .rb-header). Users at high magnification can
       scroll up to use it. */
    .rb-results-nav {
      display: flex; flex-wrap: wrap; gap: 4px;
      padding: 8px 0; background: var(--bg);
      border-bottom: 1px solid var(--rule);
      margin-bottom: 4px; font-size: 13px;
    }
    .rb-results-nav a {
      color: var(--muted); text-decoration: none;
      padding: 5px 12px; border-radius: 999px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-results-nav a:hover { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-results-nav a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-results-nav .rb-nav-count { display: inline-block; margin-left: 4px; opacity: 0.6; font-variant-numeric: tabular-nums; }

    /* Small breathing room above anchor targets; no sticky header to dodge. */
    .rb-anchor { scroll-margin-top: 1rem; }

    .rb-verdict {
      padding: 22px 24px; border-radius: 4px 12px 12px 4px;
      border-left: 4px solid var(--ink);
      background: var(--surface);
      box-shadow: 0 1px 0 var(--rule);
    }
    .rb-verdict-detected { font-size: 13px; font-style: italic; color: var(--muted); margin-bottom: 12px; }
    .rb-verdict-detected strong { font-weight: 600; font-style: normal; color: var(--ink); }
    .rb-verdict-context {
      font-size: 13px; color: var(--ink);
      margin-bottom: 14px; padding: 10px 14px;
      background: var(--panel); border-radius: 6px;
      border-left: 3px solid var(--ink);
      line-height: 1.5;
    }
    .rb-verdict-context strong {
      font-weight: 600; color: var(--ink);
      display: block; margin-bottom: 4px;
      font-size: 13px; letter-spacing: 0;
    }
    .rb-verdict-summary { font-size: 16px; line-height: 1.65; color: var(--ink); }
    .rb-verdict-meta {
      display: flex; flex-direction: column; gap: 8px;
      font-size: 14px; color: var(--ink); margin-top: 16px;
    }
    .rb-verdict-meta strong { font-weight: 600; color: var(--ink); }
    .rb-verdict-meta-note {
      font-size: 12px; font-style: italic; color: var(--muted);
      margin-top: 2px;
    }

    /* ---- Structured reading-age display ----
       Replaces the inline "F-K X · SMOG Y" string with a two-row layout
       (one row per metric, three columns: name, score, target). Easier
       to scan, full names instead of acronyms, target context per metric.
       Lucie Johnson's feedback flagged the inline format as hard to scan
       and the acronyms as opaque even to working content designers. */
    .rb-readability-heading {
      font-size: 13px; font-weight: 600; color: var(--ink);
      margin-bottom: 2px;
    }
    .rb-readability-rows {
      display: grid;
      grid-template-columns: max-content auto 1fr;
      column-gap: 16px;
      row-gap: 4px;
      padding: 10px 14px;
      background: var(--panel);
      border-radius: 6px;
    }
    .rb-readability-row {
      display: contents;
    }
    .rb-readability-name {
      font-size: 14px;
      color: var(--ink);
      font-weight: 500;
    }
    .rb-readability-score {
      font-size: 14px;
      color: var(--ink);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .rb-readability-score-over {
      color: var(--coral);
    }
    .rb-readability-target {
      font-size: 13px;
      color: var(--muted);
      font-style: italic;
    }
    @media (max-width: 520px) {
      .rb-readability-rows {
        grid-template-columns: max-content 1fr;
        row-gap: 2px;
      }
      .rb-readability-target {
        grid-column: 1 / -1;
        padding-bottom: 6px;
      }
      .rb-readability-row:last-child .rb-readability-target {
        padding-bottom: 0;
      }
    }

    /* ---- Readability "Show calculation" disclosure ----
       Sits beneath the meta line. Lets the user audit the deterministic
       maths behind the F-K and SMOG figures — the diagnostic transparency
       Marian Avery flagged as missing when small edits produced
       counterintuitive grade movements. Not shown for PDF input. */
    .rb-readability-details {
      margin-top: 8px; font-size: 12px; color: var(--muted);
    }
    .rb-readability-details summary {
      cursor: pointer; list-style: none;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 0; color: var(--muted);
    }
    .rb-readability-details summary::-webkit-details-marker { display: none; }
    .rb-readability-details summary::before {
      content: '▸'; transition: transform 0.15s ease;
      font-size: 10px;
    }
    .rb-readability-details[open] summary::before { transform: rotate(90deg); }
    .rb-readability-details summary:hover { color: var(--ink); }
    .rb-readability-details summary:focus-visible {
      outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px;
    }
    .rb-readability-breakdown {
      margin-top: 6px; padding: 8px 14px;
      background: var(--panel); border-radius: 6px;
      font-size: 12px; color: var(--ink);
      line-height: 1.7;
    }
    .rb-readability-breakdown div { margin: 0; }

    .rb-subhead { font-family: 'Rethink Sans', sans-serif; font-size: 17px; font-weight: 600; margin: 0 0 4px; color: var(--ink); }
    .rb-subhead-note { font-size: 12px; color: var(--muted); margin-bottom: 12px; font-style: italic; }

    /* ---- Issue cards ---- */
    .rb-issue {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 10px;
      padding: 18px 20px; transition: border-color 0.15s ease;
    }
    .rb-issue:hover { border-color: var(--panel-deep); }
    .rb-issue-head {
      display: flex; justify-content: space-between; align-items: center;
      gap: 10px; margin-bottom: 10px; flex-wrap: wrap;
    }
    .rb-issue-sev { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; letter-spacing: 0; }
    .rb-issue-sev .rb-dot { width: 8px; height: 8px; border-radius: 50%; }
    .rb-issue-cat { font-size: 11px; color: var(--muted); font-style: italic; }
    .rb-issue-quote { padding: 12px 16px; border-radius: 6px; font-size: 14px; line-height: 1.55; font-style: italic; margin-bottom: 12px; }
    .rb-issue-problem { font-size: 14px; line-height: 1.65; margin-bottom: 12px; color: var(--ink); }
    .rb-issue-suggest { padding: 14px 16px; background: var(--panel); border-radius: 6px; border-left: 3px solid var(--ink); font-size: 14px; line-height: 1.6; color: var(--ink); }
    .rb-issue-suggest-body { font-size: 14px; line-height: 1.6; color: var(--ink); }
    .rb-issue-suggest-label { font-size: 12px; font-weight: 600; letter-spacing: 0; color: var(--ink); margin-bottom: 4px; }

    /* ---- Paragraph spacing inside prose fields ----
       ProseField splits model-emitted text on \n\n and renders each
       chunk as a <p>. The default browser margin would be too large for
       inline use; this gives consistent visual paragraph spacing inside
       summary, observation and suggestion blocks without overdoing it. */
    .rb-prose-para { margin: 0 0 12px; }
    .rb-prose-para:last-child { margin-bottom: 0; }

    /* ---- Flags ---- */
    .rb-flag { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; padding: 14px 18px; }
    .rb-flag-fw { font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 6px; letter-spacing: 0; }
    .rb-flag-text { font-size: 14px; line-height: 1.65; color: var(--ink); }

    /* ---- Rewrite ---- */
    .rb-rewrite-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .rb-copy-btn {
      background: transparent; border: 1px solid var(--ink); color: var(--ink);
      padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-copy-btn:hover { background: var(--ink); color: var(--surface); }
    .rb-copy-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-rewrite-body {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 10px;
      padding: 22px 24px; font-size: 15px; line-height: 1.7; white-space: pre-wrap;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    /* ---- Footer ---- */
    .rb-footer {
      padding: 36px 32px 44px; border-top: 1px solid var(--rule);
      margin-top: 36px; background: var(--panel); position: relative;
    }
    .rb-footer::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, var(--coral) 0 33%, var(--sky) 33% 66%, var(--sage) 66% 100%);
    }
    .rb-footer-inner {
      max-width: 1280px; margin: 0 auto;
      display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 28px;
    }
    @media (max-width: 760px) { .rb-footer-inner { grid-template-columns: 1fr; } .rb-footer { padding: 28px 20px 36px; } }
    .rb-footer-disclaimer { font-size: 13px; color: var(--muted); line-height: 1.65; }
    .rb-footer-disclaimer p { margin: 0 0 10px; }
    .rb-footer-disclaimer strong { color: var(--ink); font-weight: 600; }
    .rb-footer-links { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
    .rb-footer-links a { color: var(--muted); text-decoration: none; padding: 4px 0; }
    .rb-footer-links a:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
    .rb-footer-links a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }
    .rb-footer-links-label { font-size: 13px; font-weight: 600; letter-spacing: 0; color: var(--ink); margin-bottom: 4px; }
    .rb-footer-feedback-btn {
      background: transparent; border: none; padding: 0;
      font: inherit; color: inherit;
      text-decoration: underline; text-underline-offset: 3px;
      cursor: pointer;
    }
    .rb-footer-feedback-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }
    .rb-footer-meta {
      grid-column: 1 / -1;
      padding-top: 20px; margin-top: 12px;
      border-top: 1px solid var(--panel-deep);
      display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;
      font-size: 12px; color: var(--muted); line-height: 1.6;
    }
    .rb-version {
      font-family: 'Rethink Sans', sans-serif;
      font-weight: 600; color: var(--ink);
      font-variant-numeric: tabular-nums;
    }

    /* ---- Feedback modal ---- */
    .rb-feedback-overlay {
      position: fixed; inset: 0;
      background: rgba(6, 40, 71, 0.5);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; z-index: 100;
      animation: rb-fade 0.2s ease;
    }
    .rb-feedback-modal {
      background: var(--surface); border-radius: 12px;
      padding: 28px 28px 24px;
      width: 100%; max-width: 520px; max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(10, 61, 110, 0.25);
      position: relative;
    }
    .rb-feedback-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 18px;
    }
    .rb-feedback-title {
      font-size: 22px; margin: 0; color: var(--ink);
    }
    .rb-feedback-intro {
      font-size: 13px; color: var(--muted); margin: -8px 0 18px;
      line-height: 1.5;
    }
    .rb-feedback-close {
      background: transparent; border: none;
      font-size: 28px; line-height: 1;
      color: var(--muted); padding: 0 8px;
    }
    .rb-feedback-close:hover { color: var(--ink); }
    .rb-feedback-close:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 4px; }
    .rb-feedback-field { margin-bottom: 16px; }
    .rb-feedback-field label {
      display: block; font-size: 13px; font-weight: 500;
      color: var(--ink); margin-bottom: 6px;
    }
    .rb-feedback-field label .rb-feedback-optional {
      font-weight: 400; color: var(--muted); font-style: italic;
    }
    .rb-feedback-field select,
    .rb-feedback-field input,
    .rb-feedback-field textarea {
      width: 100%; padding: 10px 14px;
      border: 1px solid var(--rule); border-radius: 8px;
      background: var(--surface);
      font-size: 14px; line-height: 1.5; color: var(--ink);
      outline: none; font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .rb-feedback-field textarea {
      min-height: 100px; resize: vertical;
    }
    .rb-feedback-field select:focus,
    .rb-feedback-field input:focus,
    .rb-feedback-field textarea:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(10, 61, 110, 0.15);
    }
    .rb-feedback-char-count {
      font-size: 11px; color: var(--muted); text-align: right;
      margin-top: 4px;
    }
    .rb-feedback-char-count.rb-over { color: var(--coral); }
    .rb-feedback-severity-group {
      display: flex; gap: 8px; flex-wrap: wrap;
    }
    .rb-feedback-severity-btn {
      flex: 1; min-width: 90px;
      padding: 10px 12px;
      border: 1px solid var(--rule);
      background: var(--surface); color: var(--ink);
      border-radius: 8px;
      font-size: 13px; font-weight: 500;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .rb-feedback-severity-btn:hover:not([aria-pressed="true"]) {
      border-color: var(--ink); background: rgba(10, 61, 110, 0.04);
    }
    .rb-feedback-severity-btn[aria-pressed="true"][data-severity="blocker"] {
      background: var(--coral); border-color: var(--coral); color: white;
    }
    .rb-feedback-severity-btn[aria-pressed="true"][data-severity="annoying"] {
      background: var(--sky); border-color: var(--sky); color: white;
    }
    .rb-feedback-severity-btn[aria-pressed="true"][data-severity="minor"] {
      background: var(--sage); border-color: var(--sage); color: white;
    }
    .rb-feedback-severity-btn:focus-visible {
      outline: 2px solid var(--primary); outline-offset: 2px;
    }
    .rb-feedback-context {
      background: var(--panel); border-radius: 8px;
      padding: 10px 14px; margin-bottom: 18px;
      font-size: 13px;
    }
    .rb-feedback-context summary {
      cursor: pointer; font-weight: 500; color: var(--ink);
      list-style: none;
      display: flex; align-items: center; gap: 6px;
    }
    .rb-feedback-context summary::-webkit-details-marker { display: none; }
    .rb-feedback-context summary::before {
      content: '▸'; transition: transform 0.15s ease;
      font-size: 11px; color: var(--muted);
    }
    .rb-feedback-context[open] summary::before { transform: rotate(90deg); }
    .rb-feedback-context summary:hover { color: var(--primary); }
    .rb-feedback-context ul {
      margin: 10px 0 0; padding-left: 20px;
      color: var(--muted);
    }
    .rb-feedback-context li {
      margin-bottom: 4px; font-size: 12px; word-wrap: break-word;
    }
    .rb-feedback-error {
      padding: 12px 16px; background: #FCEAE3;
      border: 1px solid var(--coral); border-radius: 8px;
      color: ${PALETTE.harm}; font-size: 13px; line-height: 1.55;
      margin-bottom: 14px;
    }
    .rb-feedback-actions {
      display: flex; gap: 10px; justify-content: flex-end;
      margin-top: 18px;
    }
    .rb-feedback-cancel {
      background: transparent; border: 1px solid var(--rule);
      color: var(--muted);
      padding: 10px 18px; border-radius: 8px;
      font-size: 14px; font-weight: 500;
      transition: border-color 0.15s ease, color 0.15s ease;
    }
    .rb-feedback-cancel:hover { border-color: var(--ink); color: var(--ink); }
    .rb-feedback-cancel:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-feedback-submit {
      background: var(--ink); color: var(--surface); border: none;
      padding: 10px 22px; border-radius: 8px;
      font-size: 14px; font-weight: 600;
      transition: background 0.15s ease;
    }
    .rb-feedback-submit:hover:not(:disabled) { background: var(--ink-deep); }
    .rb-feedback-submit:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-feedback-success { text-align: center; padding: 12px 0 6px; }
    .rb-feedback-success-title {
      font-family: 'Rethink Sans', sans-serif;
      font-weight: 600; font-size: 18px; color: var(--ink);
      margin: 0 0 8px;
    }
    .rb-feedback-success-body {
      font-size: 14px; color: var(--muted);
      margin: 0 0 22px; line-height: 1.5;
    }
    .rb-feedback-success-actions {
      display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
    }
    @media (max-width: 600px) {
      .rb-feedback-modal { padding: 22px 20px 20px; max-height: 95vh; }
      .rb-feedback-actions { flex-direction: column-reverse; }
      .rb-feedback-cancel, .rb-feedback-submit { width: 100%; }
    }

    /* ---- Animation ---- */
    .rb-fade { animation: rb-fade 0.4s ease; }
    @keyframes rb-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .rb-dots span { animation: rb-blink 1.4s infinite; opacity: 0.3; }
    .rb-dots span:nth-child(2) { animation-delay: 0.2s; }
    .rb-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes rb-blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
    .rb-phase-active {
      display: inline-block;
      animation: rb-phase-pulse 1.4s ease-in-out infinite;
    }
    @keyframes rb-phase-pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50%      { opacity: 1;   transform: scale(1.15); }
    }

    /* ---- Reduced motion ----
       Honour the user's prefers-reduced-motion setting. Animations are
       turned off, transitions are reduced to a near-zero duration so
       interactions still feel responsive but nothing moves. */
    @media (prefers-reduced-motion: reduce) {
      .rb-fade,
      .rb-dots span,
      .rb-phase-active,
      .rb-feedback-overlay {
        animation: none !important;
      }
      *, *::before, *::after {
        transition-duration: 0.01ms !important;
        transition-delay: 0ms !important;
      }
    }
  `;

  const frameworkTone = (idx) => ['coral', 'sky', 'sage', 'coral', 'sky'][idx % 5];

  // Pre-compute readability context for the verdict block so we can use it
  // in both the inline target line and the explanatory note below it.
  const readabilityCtx = results?.overall && (results.overall.readingAge || results.overall.smog)
    ? getReadabilityContext(results.overall.readingAge, results.overall.smog, results.overall.contentType)
    : null;

  // Document type label for the feedback context disclosure
  const feedbackDocLabel = content ? 'text input' : pdfFile ? `PDF (${pdfFile.name})` : 'none';

  return (
    <div className="rb-root">
      <style>{css}</style>

      <a href="#main" className="rb-skip">Skip to main content</a>

      <div role="status" aria-live="polite" aria-atomic="true" className="rb-sr-only">
        {announcement}
      </div>

      <header className="rb-header">
        <div className="rb-header-inner">
          <div className="rb-header-row">
            <a href="/" className="rb-brand" aria-label="Rembrandt Editor — home">
              <img src="/logo.png" alt="" className="rb-logo" aria-hidden="true" />
              <span className="rb-brand-text">
                <span className="rb-wordmark">Rembrandt Editor</span>
                <span className="rb-tagline">Trauma-informed content review</span>
              </span>
            </a>

            <button
              type="button" className="rb-nav-toggle"
              aria-expanded={mobileNavOpen} aria-controls="rb-nav"
              onClick={() => setMobileNavOpen(o => !o)}
            >
              {mobileNavOpen ? 'Close' : 'Menu'}
            </button>

            <nav id="rb-nav" className={`rb-nav${mobileNavOpen ? ' rb-nav-open' : ''}`} aria-label="Main">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              ))}
              <button type="button" onClick={openFeedback} className="rb-nav-feedback-btn">
                Send feedback
              </button>
            </nav>
          </div>
        </div>

        <div className="rb-lens-row">
          <div className="rb-jur-group" role="group" aria-label="Jurisdiction">
            {Object.entries(JURISDICTIONS).map(([key, { short, label }]) => (
              <button
                key={key} onClick={() => setJurisdiction(key)}
                aria-pressed={jurisdiction === key} aria-label={label}
                className="rb-jur-btn"
              >
                {short}
              </button>
            ))}
          </div>
          <ul className="rb-fw-list" aria-label="Frameworks applied" aria-live="polite">
            <li className="rb-fw-label">Frameworks</li>
            {JURISDICTIONS[jurisdiction].frameworks.map((fw, i) => (
              <li key={fw.name} className="rb-fw" data-tone={frameworkTone(i)}>
                <a href={fw.url} target="_blank" rel="noopener noreferrer" className="rb-fw-link">
                  {fw.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </header>

      {!aboutDismissed && (
        <section className="rb-about" aria-label="About Rembrandt Editor">
          <div className="rb-about-inner">
            <button type="button" onClick={dismissAbout} aria-label="Dismiss this notice" className="rb-about-close">
              Got it
            </button>

            <div className="rb-about-grid">
              <div className="rb-about-block">
                <h2>What this is</h2>
                <p className="rb-about-body">
                  Rembrandt Editor checks content for readers in <strong>living experience</strong>. That means people moving through grief, fear, pain or exhaustion, or simply having a difficult day. It reviews against trauma-informed principles and the regulatory frameworks that apply where you publish.
                </p>
                <p className="rb-about-body">
                  Useful whether you are writing the content, editing it, publishing it or trying to understand one you have received.
                </p>
              </div>
              <div className="rb-about-block">
                <h2>What this isn't</h2>
                <p className="rb-about-body">
                  A compliance audit, a legal adjudicator or a substitute for testing with the people the content is for. It surfaces plausible concerns. You decide what to do about them.
                </p>
              </div>
            </div>

            <div className="rb-about-meta">
              Built by <strong>Adrie van der Luijt</strong>, a senior content designer with four decades in government, compliance and trauma-informed practice. <a href={`${SITE}/about-adrie-van-der-luijt/`} target="_blank" rel="noopener noreferrer" className="rb-about-meta-link">Read more →</a>
            </div>
          </div>
        </section>
      )}

      <main id="main" className="rb-main">
        <section aria-labelledby="input-heading">
          <h2 id="input-heading" className="rb-display rb-section-title">Content to review</h2>

          <details className="rb-context-details">
            <summary>
              {(role || notes) ? 'Context (set) — edit' : 'Add context (optional)'}
            </summary>

            <div className="rb-role">
              <span className="rb-field-label" id="role-label">
                Your role with this content
              </span>
              <div className="rb-chips" role="group" aria-labelledby="role-label">
                {ROLE_CHIPS.map((chip) => (
                  <button
                    key={chip} type="button" onClick={() => toggleChip(chip)}
                    aria-pressed={role === chip} className="rb-chip"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="rb-notes">
              <label htmlFor="notes-input" className="rb-field-label">
                Anything else we should know
              </label>
              <textarea
                id="notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="rb-notes-input"
                placeholder="e.g. 'audience has limited English' or 'I can't change the legal disclaimer at the bottom'"
                aria-describedby="notes-help"
              />
              <div id="notes-help" className="rb-sr-only">
                Anything you tell Rembrandt Editor here will be factored into the review and shown back to you alongside the result so you can verify it was understood.
              </div>
            </div>
          </details>

          {pdfFile ? (
            <div className="rb-pdf-card" role="region" aria-label="PDF loaded">
              <div className="rb-pdf-icon" aria-hidden="true">📄</div>
              <div>
                <div className="rb-pdf-name">{pdfFile.name}</div>
                <div className="rb-pdf-meta">
                  {formatFileSize(pdfFile.size)}
                  <span className="rb-pdf-meta-tag">PDF</span>
                </div>
              </div>
              <button type="button" onClick={clearPdf} className="rb-pdf-remove">
                Remove and use text instead
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="content-input" className="rb-sr-only">Paste the content you want reviewed</label>
              <textarea
                id="content-input" ref={textareaRef}
                value={content} onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the letter, email, web page, notice, error message or policy passage you want reviewed..."
                className="rb-textarea"
                aria-describedby="content-help char-count"
                aria-invalid={overLimit}
                maxLength={CHAR_LIMIT + 500}
              />

              <div className="rb-meta-row">
                <div id="char-count" aria-live="polite">
                  {overLimit ? (
                    <span className="rb-over">{(-charsLeft).toLocaleString()} characters over limit</span>
                  ) : (
                    <span>{content.length.toLocaleString()} of {CHAR_LIMIT.toLocaleString()} characters</span>
                  )}
                </div>
                <div>
                  {content ? (
                    <button onClick={clear} className="rb-link-btn">Clear</button>
                  ) : (
                    <button onClick={loadExample} className="rb-link-btn">Try an example</button>
                  )}
                </div>
              </div>

              <div className="rb-pdf-toggle">
                <span>or</span>
                <button
                  type="button" className="rb-link-btn"
                  onClick={() => pdfInputRef.current?.click()}
                >
                  upload a PDF
                </button>
                <span className="rb-pdf-toggle-tag">Beta</span>
                <input
                  ref={pdfInputRef} type="file" accept="application/pdf"
                  onChange={handlePdfUpload}
                  style={{ display: 'none' }}
                  aria-label="Upload PDF"
                />
              </div>
            </>
          )}

          <div id="content-help" className="rb-sr-only">
            Paste up to {CHAR_LIMIT.toLocaleString()} characters of content, or upload a PDF up to {(PDF_MAX_BYTES / 1024 / 1024).toFixed(1)} megabytes.
          </div>

          <div className="rb-actions">
            <button
              onClick={analyse}
              disabled={(!content.trim() && !pdfFile) || loading || overLimit}
              className="rb-primary-btn"
            >
              {loading ? (
                <>Reading carefully<span className="rb-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></>
              ) : (
                <>Review using {JURISDICTIONS[jurisdiction].short} frameworks</>
              )}
            </button>
          </div>

          {aboutDismissed && (
            <button type="button" onClick={() => setAboutDismissed(false)} className="rb-about-show">
              About Rembrandt Editor
            </button>
          )}
        </section>

        <section aria-labelledby="results-heading" aria-busy={loading}>
          <h2
            id="results-heading" ref={resultsHeadingRef} tabIndex={-1}
            className="rb-display rb-section-title"
          >
            Review
          </h2>

          {!results && !loading && !error && (
            <div className="rb-empty">
              <div className="rb-empty-inner">
                <p className="rb-empty-quote">
                  "We design for full capacity. Life rarely provides it."
                </p>
                <p className="rb-empty-body">
                  Rembrandt Editor reads for the person who is tired, frightened, grieving, in pain or simply having a difficult day. That is most readers, most of the time.
                </p>
                <div className="rb-empty-divider" aria-hidden="true" />
                <p className="rb-empty-body">
                  <a href={`${SITE}/rembrandt-editor-plus/`} target="_blank" rel="noopener noreferrer"><i>Team plans →</i></a>
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="rb-loading rb-fade">
              <div className="rb-loading-inner">
                <div className="rb-display rb-loading-title">
                  {elapsedSeconds < 30
                    ? 'Reading carefully'
                    : 'Still reading — longer passages can take a minute or two'}
                </div>
                <ul className="rb-phases" aria-label="Review progress">
                  {PHASES.map((p, i) => {
                    const done = i < reviewPhase;
                    const current = i === reviewPhase;
                    const cls = done ? 'rb-phase rb-phase-done' : current ? 'rb-phase rb-phase-current' : 'rb-phase rb-phase-pending';
                    return (
                      <li key={i} className={cls}>
                        <span className="rb-phase-marker" aria-hidden="true">
                          {done ? '✓' : current ? <span className="rb-phase-active">●</span> : '·'}
                        </span>
                        {p.label}
                      </li>
                    );
                  })}
                </ul>
                <div className="rb-loading-elapsed" aria-live="off">
                  {elapsedSeconds < 60
                    ? `${elapsedSeconds}s elapsed`
                    : `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, '0')}s elapsed`}
                </div>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="rb-error-card rb-fade" role="alert">{error}</div>
          )}

          {results && !loading && (
            <div className="rb-results rb-fade">
              <div className="rb-results-actions">
                <button onClick={copyFullReview} className="rb-results-copy">
                  {reviewCopied ? 'Copied' : 'Copy full review'}
                </button>
              </div>

              <nav className="rb-results-nav" aria-label="Jump to section">
                <a href="#review-summary">Summary</a>
                {results.issues?.length > 0 && (
                  <a href="#review-issues">
                    Issues<span className="rb-nav-count">({results.issues.length})</span>
                  </a>
                )}
                {results.jurisdictionFlags?.length > 0 && (
                  <a href="#review-flags">
                    {JURISDICTIONS[jurisdiction].short} flags<span className="rb-nav-count">({results.jurisdictionFlags.length})</span>
                  </a>
                )}
                {results.rewrite && <a href="#review-rewrite">Rewrite</a>}
              </nav>

              {results.overall && (
                <div id="review-summary" className="rb-verdict rb-anchor">
                  {results.overall.contentType && (
                    <div className="rb-verdict-detected">
                      Detected as: <strong>{results.overall.contentType}</strong>
                    </div>
                  )}
                  {results.overall.contextApplied && (
                    <div className="rb-verdict-context">
                      <strong>Context applied</strong>
                      {results.overall.contextApplied}
                    </div>
                  )}
                  <ProseField text={results.overall.summary} className="rb-verdict-summary" />
                  {(results.overall.readingAge || results.overall.smog) && (
                    <div className="rb-verdict-meta">
                      <div className="rb-readability-heading">Reading age</div>

                      <div className="rb-readability-rows" role="table" aria-label="Readability scores">
                        {results.overall.readingAge && (
                          <div className="rb-readability-row" role="row">
                            <span className="rb-readability-name" role="cell">Flesch-Kincaid</span>
                            <span
                              className={`rb-readability-score${readabilityCtx?.fkExceedsTarget ? ' rb-readability-score-over' : ''}`}
                              role="cell"
                            >
                              {results.overall.readingAge}
                            </span>
                            <span className="rb-readability-target" role="cell">
                              {readabilityCtx?.fkTargetText ? `Target: ${readabilityCtx.fkTargetText}` : ''}
                            </span>
                          </div>
                        )}
                        {results.overall.smog && (
                          <div className="rb-readability-row" role="row">
                            <span className="rb-readability-name" role="cell">SMOG</span>
                            <span
                              className={`rb-readability-score${readabilityCtx?.smogExceedsTarget ? ' rb-readability-score-over' : ''}`}
                              role="cell"
                            >
                              {results.overall.smog}
                            </span>
                            <span className="rb-readability-target" role="cell">
                              {readabilityCtx?.smogTargetText ? `Target: ${readabilityCtx.smogTargetText}` : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="rb-verdict-meta-note">
                        Flesch-Kincaid (F-K) measures sentence load. SMOG measures vocabulary density and is the NHS healthcare standard.
                        {readabilityCtx?.isLivingExperience && readabilityCtx.exceedsTarget &&
                          ' Lower is better for content read in distress.'}
                      </div>

                      {results.overall.readabilityBreakdown && (
                        <details className="rb-readability-details">
                          <summary>Show calculation</summary>
                          <div className="rb-readability-breakdown">
                            <div>{results.overall.readabilityBreakdown.words.toLocaleString()} words · {results.overall.readabilityBreakdown.sentences.toLocaleString()} sentences</div>
                            <div>{results.overall.readabilityBreakdown.wordsPerSentence} words per sentence (average)</div>
                            <div>{results.overall.readabilityBreakdown.syllablesPerWord} syllables per word (average)</div>
                            <div>{results.overall.readabilityBreakdown.polysyllables.toLocaleString()} polysyllabic words (3+ syllables)</div>
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}

              {results.issues?.length > 0 && (
                <div id="review-issues" className="rb-anchor">
                  <h3 className="rb-display rb-subhead">
                    Specific issues ({results.issues.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {results.issues.map((issue, i) => {
                      const s = severityMeta(issue.severity);
                      return (
                        <article key={i} className="rb-issue" aria-labelledby={`issue-${i}-label`}>
                          <div className="rb-issue-head">
                            <span className="rb-issue-sev" id={`issue-${i}-label`}>
                              <span className="rb-dot" style={{ background: s.dot }} aria-hidden="true" />
                              <span style={{ color: s.dot }}>{s.label}</span>
                            </span>
                            <span className="rb-issue-cat">{categoryLabel(issue.category)}</span>
                          </div>
                          <blockquote className="rb-issue-quote" style={{ background: s.bg }}>
                            "{issue.excerpt}"
                          </blockquote>
                          <ProseField
                            text={issue.observation || issue.problem}
                            className="rb-issue-problem"
                          />
                          <div className="rb-issue-suggest">
                            <div className="rb-issue-suggest-label">Try instead</div>
                            <ProseField text={issue.suggestion} className="rb-issue-suggest-body" />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {results.jurisdictionFlags?.length > 0 && (
                <div id="review-flags" className="rb-anchor">
                  <h3 className="rb-display rb-subhead">{JURISDICTIONS[jurisdiction].short} flags</h3>
                  <div className="rb-subhead-note">
                    Plausible concerns under named frameworks. Not a compliance audit.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {results.jurisdictionFlags.map((flag, i) => (
                      <div key={i} className="rb-flag">
                        <div className="rb-flag-fw">{flag.framework}</div>
                        <div className="rb-flag-text">{flag.concern}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.rewrite && (
                <div id="review-rewrite" className="rb-anchor">
                  <div className="rb-rewrite-head">
                    <h3 className="rb-display rb-subhead" style={{ marginBottom: 0 }}>Suggested rewrite</h3>
                    <button onClick={copyRewrite} className="rb-copy-btn">{copied ? 'Copied' : 'Copy rewrite'}</button>
                  </div>
                  <div className="rb-rewrite-body">{results.rewrite}</div>
                </div>
              )}
            </div>
          )}

          <a
            href={`${SITE}/help/`}
            target="_blank"
            rel="noopener noreferrer"
            className="rb-help-link"
          >
            Help with Rembrandt Editor
          </a>
        </section>
      </main>

      <footer className="rb-footer">
        <div className="rb-footer-inner">
          <div className="rb-footer-disclaimer">
            <p>
              <strong>Rembrandt Editor</strong> reviews content through a trauma-informed lens. It is not a compliance tool, a legal adjudicator or a replacement for testing with the people the content is for. It flags plausible concerns. You decide what to do about them.
            </p>
            <p>
              Built and maintained by <a href="https://traumainformedcontent.com" target="_blank" rel="noopener noreferrer">Trauma-Informed Content Consulting</a>. <button type="button" onClick={openFeedback} className="rb-footer-feedback-btn">Send feedback</button>.
            </p>
          </div>

          <div className="rb-footer-links">
            <div className="rb-footer-links-label">More from us</div>
            <a href={`${SITE}/`} target="_blank" rel="noopener noreferrer">traumainformedcontent.com</a>
            <a href={`${SITE}/what-is-trauma-informed-content/`} target="_blank" rel="noopener noreferrer">What is trauma-informed content?</a>
            <a href={`${SITE}/resources/`} target="_blank" rel="noopener noreferrer">Resources</a>
            <a href={`${SITE}/help/`} target="_blank" rel="noopener noreferrer">Help</a>
            <a href={`${SITE}/accessibility/`} target="_blank" rel="noopener noreferrer">Accessibility statement</a>
                        <a href={`${SITE}/privacy-policy/`} target="_blank" rel="noopener noreferrer">Privacy policy</a>
                        <a href={`${SITE}/terms/`} target="_blank" rel="noopener noreferrer">Terms of service</a>
            <a href={`${SITE}/about-us/`} target="_blank" rel="noopener noreferrer">About</a>
            <a href={`${SITE}/rembrandt-editor-plus/`} target="_blank" rel="noopener noreferrer">Pricing</a>
            <a href={`${SITE}/contact-us/`} target="_blank" rel="noopener noreferrer">Contact</a>
          </div>

          <div className="rb-footer-meta">
            <div>
              © {new Date().getFullYear()} <a href="https://traumainformedcontent.com" target="_blank" rel="noopener noreferrer">Trauma-Informed Content Consulting</a>, a trading name of <a href="https://www.banksidecommunications.com/" target="_blank" rel="noopener noreferrer">Bankside Communications Limited</a>. All rights reserved.
            </div>
            <div className="rb-version" aria-label={`Version ${VERSION}, released ${VERSION_DATE}`}>
              {VERSION} · {VERSION_DATE}
            </div>
          </div>
        </div>
      </footer>

      {feedbackOpen && (
        <div className="rb-feedback-overlay" onClick={closeFeedback}>
          <div
            className="rb-feedback-modal"
            role="dialog"
            aria-labelledby="feedback-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rb-feedback-header">
              <h2 id="feedback-title" className="rb-display rb-feedback-title">
                {feedbackSent ? 'Feedback sent' : 'Send feedback'}
              </h2>
              <button
                type="button" onClick={closeFeedback}
                aria-label="Close feedback form" className="rb-feedback-close"
              >×</button>
            </div>

            {feedbackSent ? (
              <div className="rb-feedback-success">
                <p className="rb-feedback-success-title">Thanks — that's logged.</p>
                <p className="rb-feedback-success-body">
                  You can close this, or send another bit of feedback if you have more.
                </p>
                <div className="rb-feedback-success-actions">
                  <button type="button" onClick={sendAnother} className="rb-feedback-cancel">
                    Send another
                  </button>
                  <button type="button" onClick={closeFeedback} className="rb-feedback-submit">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="rb-feedback-intro">
                  Tell us what's working, what isn't or what's missing. This goes straight to the team — no public form, no autoresponder.
                </p>

                <div className="rb-feedback-field">
                  <label htmlFor="feedback-category">What kind of feedback is this?</label>
                  <select
                    id="feedback-category"
                    ref={feedbackFirstFieldRef}
                    value={feedbackCategory}
                    onChange={(e) => setFeedbackCategory(e.target.value)}
                  >
                    <option value="">Choose one...</option>
                    {FEEDBACK_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="rb-feedback-field">
                  <span className="rb-feedback-label" id="feedback-severity-label" style={{display: 'block', fontSize: 13, fontWeight: 500, color: PALETTE.ink, marginBottom: 6}}>
                    How serious is it?
                  </span>
                  <div className="rb-feedback-severity-group" role="group" aria-labelledby="feedback-severity-label">
                    {FEEDBACK_SEVERITIES.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setFeedbackSeverity(s.value)}
                        aria-pressed={feedbackSeverity === s.value}
                        data-severity={s.value}
                        className="rb-feedback-severity-btn"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rb-feedback-field">
                  <label htmlFor="feedback-message">What happened, or what would you like?</label>
                  <textarea
                    id="feedback-message"
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder="Be as specific as you can. If it's about a particular review, what content were you looking at and what was off?"
                    maxLength={FEEDBACK_MESSAGE_MAX + 100}
                  />
                  <div className={`rb-feedback-char-count${feedbackMessage.length > FEEDBACK_MESSAGE_MAX ? ' rb-over' : ''}`}>
                    {feedbackMessage.length > FEEDBACK_MESSAGE_MAX
                      ? `${feedbackMessage.length - FEEDBACK_MESSAGE_MAX} characters over limit`
                      : `${feedbackMessage.length} / ${FEEDBACK_MESSAGE_MAX}`}
                  </div>
                </div>

                <div className="rb-feedback-field">
                  <label htmlFor="feedback-email">
                    Your email <span className="rb-feedback-optional">(optional — only if you'd like a reply)</span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={feedbackEmail}
                    onChange={(e) => setFeedbackEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                <details className="rb-feedback-context">
                  <summary>What gets sent with this</summary>
                  <ul>
                    <li>Document being reviewed: {feedbackDocLabel}</li>
                    <li>Jurisdiction selected: {jurisdiction}</li>
                    <li>App version: {VERSION}</li>
                    <li>Your browser (for debugging)</li>
                  </ul>
                </details>

                {feedbackError && (
                  <div className="rb-feedback-error" role="alert">{feedbackError}</div>
                )}

                <div className="rb-feedback-actions">
                  <button type="button" onClick={closeFeedback} className="rb-feedback-cancel">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitFeedback}
                    disabled={!canSubmitFeedback || feedbackMessage.length > FEEDBACK_MESSAGE_MAX}
                    className="rb-feedback-submit"
                  >
                    {feedbackSubmitting ? 'Sending...' : 'Send feedback'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
