import React, { useState, useEffect, useRef } from 'react';

// =============================================================================
// VERSION & CONFIG
// Edit these constants to update the version stamp.
// =============================================================================
const VERSION = 'v0.9.1';
const VERSION_DATE = '19 May 2026';

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

const JURISDICTIONS = {
  UK: {
    label: 'United Kingdom',
    short: 'UK',
    frameworks: [
      'FCA Consumer Duty',
      'Fundraising Regulator',
      'ASA CAP code',
      'ISO 22458',
      'GDS content standards',
      'WCAG 2.2 AA',
    ],
  },
  EU: {
    label: 'European Union',
    short: 'EU',
    frameworks: [
      'European Accessibility Act',
      'EN 301 549',
      'ISO 22458',
    ],
  },
  US: {
    label: 'United States',
    short: 'US',
    frameworks: [
      'Plain Writing Act',
      'Section 508',
      'ADA',
      'ISO 22458',
    ],
  },
};

const ROLE_CHIPS = [
  "I'm drafting this myself",
  "I'm editing what a colleague drafted",
  "I'm shipping content my team wrote",
  "I received this",
  "I'm reviewing third-party work",
];

const CHAR_LIMIT = 8000;
const PDF_MAX_BYTES = 2_500_000; // ~2.5 MB raw, ~3.3 MB base64 — sits under Vercel body limit
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
// FLESCH-KINCAID GRADE — deterministic readability calculation
//
// Why this exists: large language models cannot reliably compute
// Flesch-Kincaid grade. The number Sonnet returns on its own is closer to
// a vibe than a measurement, and the same passage can score differently
// from one run to the next. The formula is straightforward (words,
// sentences, syllables) and is calculated here so the displayed grade is
// stable and consistent across runs. The frontend sends this value to the
// backend with the request; the backend instructs the model to use it as
// the canonical reading age in both the readingAge field and any summary
// reference. For PDFs, the source text is not available here, so the
// model's own estimate stands as a fallback.
//
// Formula: 0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
// =============================================================================
const countSentences = (text) => {
  const sentences = text
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

const fleschKincaidGrade = (text) => {
  if (!text || text.trim().length === 0) return null;
  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = countSyllables(text);
  if (words === 0) return null;
  const grade =
    0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.max(1, Math.round(grade));
};

// =============================================================================
// READING-AGE CONTEXT
// =============================================================================
const getReadingAgeContext = (readingAge, contentType) => {
  const t = (contentType || '').toLowerCase();

  let target = null;
  let modeName = null;
  let targetText = null;

  if (t.includes('crisis') || t.includes('emergency')) {
    target = 7;
    modeName = 'crisis or emergency content';
    targetText = 'aim for grade 7 or below';
  } else if (t.includes('service content')) {
    target = 8;
    modeName = 'service content';
    targetText = 'GDS guidance is around grade 8';
  } else if (t.includes('fundraising') || t.includes('emotional appeal') || t.includes('appeal email') || t.includes('donor')) {
    target = 11;
    modeName = 'fundraising content';
    targetText = 'grade 9-11 is typical';
  } else if (t.includes('marketing') || t.includes('commercial') || t.includes('promotional')) {
    target = 10;
    modeName = 'marketing content';
    targetText = 'grade 8-10 is typical';
  } else if (t.includes('organisational') || t.includes('overview') ||
             t.includes('educational') || t.includes('blog') ||
             t.includes('article') || t.includes('explainer')) {
    target = 12;
    modeName = 'content for engaged adult audiences';
    targetText = 'grade 9-12 is typical';
  }

  if (!target) return null;
  return {
    target,
    modeName,
    targetText,
    exceedsTarget: readingAge > target,
    isLivingExperience: modeName === 'service content' || modeName === 'crisis or emergency content',
  };
};

// =============================================================================
// MARKDOWN BUILDER — used by the Copy review button
// =============================================================================
const buildReviewMarkdown = (results, jurisdiction) => {
  const lines = ['# Rembrandt Editor review', ''];

  if (results.overall) {
    if (results.overall.contentType) lines.push(`**Detected as:** ${results.overall.contentType}`);
    if (results.overall.readingAge) {
      const age = results.overall.readingAge;
      const ctx = getReadingAgeContext(age, results.overall.contentType);
      if (ctx && ctx.exceedsTarget) {
        lines.push(`**Reading age:** grade ${age} — for ${ctx.modeName}, ${ctx.targetText} (Flesch-Kincaid grade level)`);
      } else {
        lines.push(`**Reading age:** grade ${age} (Flesch-Kincaid grade level)`);
      }
    }
    if (results.overall.contextApplied) lines.push(`**Context applied:** ${results.overall.contextApplied}`);
    if (results.overall.contentType || results.overall.readingAge || results.overall.contextApplied) lines.push('');

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

const frameworksByJurisdiction = {
  UK: 'ISO 22458, WCAG 2.2 AA, GDS content standards, plus sector-specific frameworks where they apply (FCA Consumer Duty, Fundraising Regulator, ASA CAP code)',
  EU: 'European Accessibility Act, EN 301 549, ISO 22458',
  US: 'Plain Writing Act, Section 508, ADA, ISO 22458',
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

  const PHASES = [
    { label: 'Detecting content type and reader stage', ms: 2000 },
    { label: 'Mapping cognitive load and trust points', ms: 6000 },
    { label: `Checking against ${JURISDICTIONS[jurisdiction].short} frameworks`, ms: 5000 },
    { label: 'Drafting suggested rewrite', ms: 7000 },
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
      return;
    }
    setReviewPhase(0);
    let cumulative = 0;
    // Schedule timers for every phase EXCEPT the last one. The last phase
    // stays "current" until the API actually returns, instead of ticking
    // complete on a timer and leaving a confusing dead period where every
    // phase shows ✓ but nothing happens.
    const timers = PHASES.slice(0, -1).map((p, i) => {
      cumulative += p.ms;
      return setTimeout(() => setReviewPhase(i + 1), cumulative);
    });
    return () => timers.forEach(clearTimeout);
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
    setAnnouncement('Reviewing content. This usually takes 10 to 20 seconds.');

    // Snapshot notes at the moment the review is run, so subsequent edits
    // to the notes field don't desync from the displayed "Context applied".
    const notesSnapshot = notes.trim();

    // For text input, calculate Flesch-Kincaid grade deterministically and
    // send it to the backend. The model uses this exact integer in its
    // output so the verdict-meta line and the summary prose stay in sync,
    // and the number is consistent across runs. PDFs fall back to the
    // model's estimate because the source text isn't available here.
    const calculatedReadingAge = !pdfFile && content
      ? fleschKincaidGrade(content)
      : null;

    try {
      const body = pdfFile
        ? { pdfData: pdfFile.data, pdfFilename: pdfFile.name, jurisdiction, role, notes: notesSnapshot }
        : { content, jurisdiction, role, notes: notesSnapshot, calculatedReadingAge };

      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

      setResults(parsed);
      const issueCount = parsed.issues?.length || 0;
      const flagCount = parsed.jurisdictionFlags?.length || 0;
      setAnnouncement(
        `Review complete. ${issueCount} issue${issueCount === 1 ? '' : 's'} and ${flagCount} ${JURISDICTIONS[jurisdiction].short} flag${flagCount === 1 ? '' : 's'} found.`
      );
    } catch (e) {
      console.error(e);
      setError(e.message || 'Something went wrong. Please try again.');
      setAnnouncement('Review failed. Please try again.');
    } finally {
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
      const response = await fetch('/api/feedback', {
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

    /* ---- Header ---- */
    .rb-header {
      border-bottom: 1px solid var(--rule);
      background: rgba(250, 250, 246, 0.94);
      position: sticky; top: 0; z-index: 20;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
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
        position: absolute; top: 72px; right: 16px; left: 16px;
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
    .rb-fw-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; margin-right: 4px; }
    .rb-fw {
      font-size: 12px; color: var(--ink);
      padding: 4px 10px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--rule);
      white-space: nowrap;
    }
    .rb-fw[data-tone="coral"] { border-left: 3px solid var(--coral); }
    .rb-fw[data-tone="sky"]   { border-left: 3px solid var(--sky); }
    .rb-fw[data-tone="sage"]  { border-left: 3px solid var(--sage); }

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
      font-size: 12px; font-weight: 700;
      letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--ink); margin: 0 0 8px;
    }
    .rb-about-body { font-size: 16px; line-height: 1.5; color: var(--ink); margin: 0; }
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
      display: inline-block; padding: 1px 7px; background: var(--panel);
      border-radius: 999px; font-size: 10px; color: var(--ink);
      font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
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
    .rb-empty-cta {
      font-family: 'Rethink Sans', sans-serif;
      font-weight: 600; font-size: 17px; color: var(--ink);
      margin: 0 0 8px; line-height: 1.4;
    }
    .rb-empty-cta-sub { font-size: 13px; color: var(--muted); margin: 0 0 24px; }
    .rb-empty-divider {
      height: 1px; background: var(--rule);
      width: 60px; margin: 0 auto 24px;
    }
    .rb-empty-quote {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 16px; font-weight: 500; font-style: italic;
      color: var(--ink); margin: 0 0 12px;
      line-height: 1.45; letter-spacing: -0.005em;
    }
    .rb-empty-body { font-size: 13px; color: var(--muted); line-height: 1.6; margin: 0; }

    /* ---- Phased loading list ---- */
    .rb-loading-inner { max-width: 320px; }
    .rb-loading-title {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 15px; font-style: italic; margin-bottom: 18px;
      text-align: center; color: var(--ink);
    }
    .rb-phases { list-style: none; padding: 0; margin: 0; font-size: 13px; line-height: 1.8; text-align: left; }
    .rb-phase { display: flex; align-items: center; gap: 10px; transition: opacity 0.3s ease, color 0.3s ease, font-weight 0.3s ease; }
    .rb-phase-marker { width: 14px; display: inline-block; text-align: center; font-variant-numeric: tabular-nums; }
    .rb-phase-done    { color: var(--muted); opacity: 1; }
    .rb-phase-current { color: var(--ink);   opacity: 1; font-weight: 600; }
    .rb-phase-pending { color: var(--faint); opacity: 0.55; }

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

    .rb-results-nav {
      position: sticky; top: 122px; z-index: 4;
      display: flex; flex-wrap: wrap; gap: 4px;
      padding: 8px 0; background: var(--bg);
      border-bottom: 1px solid var(--rule);
      margin-bottom: 4px; font-size: 13px;
    }
    @media (max-width: 900px) { .rb-results-nav { top: 142px; } }
    .rb-results-nav a {
      color: var(--muted); text-decoration: none;
      padding: 5px 12px; border-radius: 999px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-results-nav a:hover { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-results-nav a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-results-nav .rb-nav-count { display: inline-block; margin-left: 4px; opacity: 0.6; font-variant-numeric: tabular-nums; }

    .rb-anchor { scroll-margin-top: 200px; }

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
      display: block; margin-bottom: 2px;
      font-size: 11px; letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .rb-verdict-summary { font-size: 16px; line-height: 1.65; color: var(--ink); }
    .rb-verdict-meta {
      display: flex; flex-direction: column; gap: 4px;
      font-size: 14px; color: var(--ink); margin-top: 14px;
    }
    .rb-verdict-meta strong { font-weight: 600; color: var(--ink); }
    .rb-verdict-meta-note {
      font-size: 12px; font-style: italic; color: var(--muted);
    }

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
    .rb-issue-sev { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
    .rb-issue-sev .rb-dot { width: 8px; height: 8px; border-radius: 50%; }
    .rb-issue-cat { font-size: 11px; color: var(--muted); font-style: italic; }
    .rb-issue-quote { padding: 12px 16px; border-radius: 6px; font-size: 14px; line-height: 1.55; font-style: italic; margin-bottom: 12px; }
    .rb-issue-problem { font-size: 14px; line-height: 1.65; margin-bottom: 12px; color: var(--ink); }
    .rb-issue-suggest { padding: 14px 16px; background: var(--panel); border-radius: 6px; border-left: 3px solid var(--ink); font-size: 14px; line-height: 1.6; color: var(--ink); }
    .rb-issue-suggest-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink); margin-bottom: 4px; }

    /* ---- Flags ---- */
    .rb-flag { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; padding: 14px 18px; }
    .rb-flag-fw { font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 4px; letter-spacing: 0.02em; }
    .rb-flag-text { font-size: 13px; line-height: 1.6; color: var(--ink); }

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
    .rb-footer-links-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink); margin-bottom: 4px; }
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

    /* ---- Zoom / magnification (WCAG 2.2 AA — 1.4.10 Reflow) ----
       Drop sticky positioning on the header and the results-nav when the
       viewport is short. At high browser zoom levels the effective CSS
       pixel height of the viewport drops, this media query fires, and
       the header reverts to natural document flow. Without this, the
       sticky header eats vertical space and content slides under it,
       which is exactly what the tester reported. */
    @media (max-height: 600px) {
      .rb-header { position: static; }
      .rb-results-nav { position: static; }
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

  // Pre-compute reading-age context for the verdict block so we can use it
  // in both the inline target line and the explanatory note below it.
  const readingAgeCtx = results?.overall?.readingAge
    ? getReadingAgeContext(results.overall.readingAge, results.overall.contentType)
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
              <li key={fw} className="rb-fw" data-tone={frameworkTone(i)}>{fw}</li>
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
                  Rembrandt Editor flags content that is likely to fail readers in <strong>living experience</strong> — people moving through grief, fear, pain, exhaustion or the ordinary cognitive compromise of a difficult day. It reviews against trauma-informed principles and the regulatory frameworks that apply where the content is published. Useful whether you are writing it, editing it, shipping it, or trying to understand one you have received.
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
              Built by <strong>Adrie van der Luijt</strong> — senior content designer with four decades in government digital services, compliance and trauma-informed practice. Past work includes the Metropolitan Police drink spiking guidance (now used by 81% of police forces in England and Wales), Cancer Research UK, Universal Credit and Cabinet Office pandemic emergency services. <a href={`${SITE}/about-adrie-van-der-luijt/`} target="_blank" rel="noopener noreferrer" className="rb-about-meta-link">Read more →</a>
            </div>
          </div>
        </section>
      )}

      <main id="main" className="rb-main">
        <section aria-labelledby="input-heading">
          <h2 id="input-heading" className="rb-display rb-section-title">Content to review</h2>

          <div className="rb-role">
            <span className="rb-field-label" id="role-label">
              Your role with this content (optional)
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
              Anything else we should know (optional)
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
                <p className="rb-empty-cta">Paste content and click Review to begin.</p>
                <p className="rb-empty-cta-sub">Or upload a PDF.</p>
                <p className="rb-empty-body">
                  Reviewing under {jurisdiction} frameworks — {frameworksByJurisdiction[jurisdiction]}. Change jurisdiction at the top of the page if you need a different one.
                </p>
                <div className="rb-empty-divider" aria-hidden="true" />
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
                <div className="rb-display rb-loading-title">Reading carefully</div>
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
                  <div className="rb-verdict-summary">{results.overall.summary}</div>
                  {results.overall.readingAge && (
                    <div className="rb-verdict-meta">
                      <div>
                        <strong>Reading age: grade {results.overall.readingAge}</strong>
                        {readingAgeCtx && readingAgeCtx.exceedsTarget && (
                          <> — for {readingAgeCtx.modeName}, {readingAgeCtx.targetText}</>
                        )}
                      </div>
                      <div className="rb-verdict-meta-note">
                        Flesch-Kincaid grade level{readingAgeCtx?.isLivingExperience && readingAgeCtx.exceedsTarget
                          ? '. Lower is better for content read in distress'
                          : ''}.
                      </div>
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
                          <div className="rb-issue-problem">{issue.observation || issue.problem}</div>
                          <div className="rb-issue-suggest">
                            <div className="rb-issue-suggest-label">Try instead</div>
                            {issue.suggestion}
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
