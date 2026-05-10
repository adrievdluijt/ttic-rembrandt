import React, { useState, useEffect, useRef } from 'react';

// =============================================================================
// VERSION & CONFIG
// Edit these constants to update the version stamp and feedback channel.
// =============================================================================
const VERSION = 'v0.9';
const VERSION_DATE = '9 May 2026';
const FEEDBACK_URL = 'mailto:adrie@traumainformedcontent.com?subject=Rembrandt%20Editor%20feedback';

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
      'ISO 22458',
      'GDS content standards',
      'WCAG 2.2 AA',
      'Plain English',
    ],
  },
  EU: {
    label: 'European Union',
    short: 'EU',
    frameworks: [
      'European Accessibility Act',
      'EN 301 549',
      'GDPR transparency',
      'Plain-language directives',
    ],
  },
  US: {
    label: 'United States',
    short: 'US',
    frameworks: [
      'Plain Writing Act',
      'Section 508',
      'ADA',
      'State accessibility statutes',
    ],
  },
};

const CONTEXT_CHIPS = [
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
  { label: 'About',                             href: `${SITE}/about/` },
];

const EXAMPLE = `Dear Occupier,

Our records show that you have failed to respond to our previous correspondence dated 15th March 2024 regarding outstanding council tax arrears of £847.32.

You are required to make payment in full within 14 days of the date of this letter. Failure to do so will result in enforcement action being taken against you, which may include the involvement of enforcement agents and additional costs being added to your account.

If you are experiencing financial difficulty, you should contact us immediately.

Yours faithfully,
Revenues Department`;

// =============================================================================
// MARKDOWN BUILDER — used by the Copy review button
// =============================================================================
const buildReviewMarkdown = (results, jurisdiction) => {
  const lines = ['# Rembrandt Editor review', ''];

  if (results.overall) {
    if (results.overall.contentType) lines.push(`**Detected as:** ${results.overall.contentType}`);
    if (results.overall.readingAge)  lines.push(`**Reading age:** ${results.overall.readingAge}`);
    if (results.overall.contentType || results.overall.readingAge) lines.push('');

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
  UK: 'ISO 22458, WCAG 2.2 AA, GDS content standards, plus FCA Consumer Duty for financial services',
  EU: 'European Accessibility Act, EN 301 549, ISO 22458',
  US: 'Plain Writing Act, Section 508, ADA, ISO 22458',
}

// =============================================================================
// COMPONENT
// =============================================================================
export default function App() {
  const [content, setContent] = useState('');
  const [pdfFile, setPdfFile] = useState(null); // { name, data, size } when set
  const [context, setContext] = useState('');
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

  const textareaRef = useRef(null);
  const resultsHeadingRef = useRef(null);
  const pdfInputRef = useRef(null);

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

  useEffect(() => {
    if (results && resultsHeadingRef.current) {
      resultsHeadingRef.current.focus();
      setAnnouncement(`Review complete. ${results.issues?.length || 0} issues identified.`);
    }
  }, [results]);

  useEffect(() => {
    if (!loading) {
      setReviewPhase(-1);
      return;
    }
    setReviewPhase(0);
    let cumulative = 0;
    const timers = PHASES.map((p, i) => {
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

    try {
      const body = pdfFile
        ? { pdfData: pdfFile.data, pdfFilename: pdfFile.name, jurisdiction, context }
        : { content, jurisdiction, context };

      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const data = await response.json();

      if (data.stop_reason === 'max_tokens') {
        throw new Error('The review came back longer than expected and was cut off. Try a shorter passage, or break the content into sections and review them one at a time.');
      }

      const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace > 0 || lastBrace < cleaned.length - 1) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }

      try {
        setResults(JSON.parse(cleaned));
      } catch (parseErr) {
        throw new Error("The review couldn't be processed this time. Try again, or shorten the passage and try once more.");
      }
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
    setContext((current) => (current === chip ? '' : chip));
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
    .rb-nav a {
      color: var(--muted); text-decoration: none;
      padding: 8px 14px; border-radius: 999px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-nav a:hover { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-nav a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-nav-feedback {
      color: var(--ink) !important; font-weight: 600;
      border: 1px solid var(--ink); border-radius: 999px;
      margin-left: 6px;
    }
    .rb-nav-feedback:hover { background: var(--ink) !important; color: var(--surface) !important; }
    .rb-nav-toggle {
      display: none;
      background: transparent; border: 1px solid var(--rule);
      color: var(--ink); padding: 8px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 500;
    }
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
      .rb-nav.rb-nav-open a { padding: 12px 16px; border-radius: 6px; }
      .rb-nav-feedback { margin-left: 0 !important; margin-top: 4px; text-align: center; }
    }

    /* ---- Lens row ---- */
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
    .rb-fw-label { font-size: 11px; color: var(--faint); text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; margin-right: 4px; }
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

    /* ---- About / intro section (more compact) ---- */
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
    .rb-about-show {
      display: inline-block; margin: 8px 0 0;
      background: transparent; border: none; padding: 0;
      color: var(--muted); font-size: 13px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .rb-about-show:hover { color: var(--ink); }

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

    /* ---- Context section ---- */
    .rb-context { margin-bottom: 14px; }
    .rb-context-label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-style: italic; }
    .rb-context-input {
      width: 100%; padding: 10px 14px;
      border: 1px solid var(--rule); border-radius: 8px;
      background: var(--surface); font-size: 14px; color: var(--ink); outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .rb-context-input::placeholder { color: var(--faint); }
    .rb-context-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(10, 61, 110, 0.15); }

    .rb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
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

    /* ---- PDF card (replaces textarea when a PDF is loaded) ---- */
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
    .rb-verdict-summary { font-size: 16px; line-height: 1.65; color: var(--ink); }
    .rb-verdict-meta { display: flex; gap: 20px; font-size: 13px; color: var(--muted); margin-top: 14px; }
    .rb-verdict-meta strong { font-weight: 600; color: var(--ink); }

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
    .rb-issue-cat { font-size: 11px; color: var(--faint); font-style: italic; }
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
    .rb-footer-links-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink); margin-bottom: 4px; }
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

    /* ---- Animation ---- */
    .rb-fade { animation: rb-fade 0.4s ease; }
    @keyframes rb-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .rb-dots span { animation: rb-blink 1.4s infinite; opacity: 0.3; }
    .rb-dots span:nth-child(2) { animation-delay: 0.2s; }
    .rb-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes rb-blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
  `;

  const frameworkTone = (idx) => ['coral', 'sky', 'sage', 'coral', 'sky'][idx % 5];

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
              <a href={FEEDBACK_URL} className="rb-nav-feedback">Send feedback</a>
            </nav>
          </div>
        </div>

        <div className="rb-lens-row">
          <div className="rb-jur-group" role="group" aria-label="Jurisdiction lens">
            {Object.entries(JURISDICTIONS).map(([key, { short, label }]) => (
              <button
                key={key} onClick={() => setJurisdiction(key)}
                aria-pressed={jurisdiction === key} aria-label={`${label} lens`}
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
                  Rembrandt Editor flags content that is likely to fail readers in <strong>living experience</strong> — people moving through grief, fear, pain, exhaustion, or the ordinary cognitive compromise of a difficult day. It reviews against trauma-informed principles and the regulatory frameworks that apply where you publish.
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
              Built by <strong>Adrie van der Luijt</strong> — senior content designer with four decades in government digital services and trauma-informed practice. Past work includes the Metropolitan Police drink spiking guidance (now used by 81% of poice forces in England and Wales), Cancer Research UK, Universal Credit and Cabinet Office pandemic emergency services. <a href={`${SITE}/about/`} target="_blank" rel="noopener noreferrer" className="rb-about-meta-link">Read more →</a>
            </div>
          </div>
        </section>
      )}

      <main id="main" className="rb-main">
        <section aria-labelledby="input-heading">
          <h2 id="input-heading" className="rb-display rb-section-title">Content to review</h2>

          <div className="rb-context">
            <label htmlFor="context-input" className="rb-context-label">
              Your role with this content (optional)
            </label>
            <input
              id="context-input" type="text" value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. I'm editing what our policy team drafted"
              className="rb-context-input" aria-describedby="context-help"
            />
            <div className="rb-chips" role="group" aria-label="Common roles">
              {CONTEXT_CHIPS.map((chip) => (
                <button
                  key={chip} type="button" onClick={() => toggleChip(chip)}
                  aria-pressed={context === chip} className="rb-chip"
                >
                  {chip}
                </button>
              ))}
            </div>
            <div id="context-help" className="rb-sr-only">
              Telling Rembrandt Editor your role with this content shapes how the review is addressed.
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
                <>Review through {JURISDICTIONS[jurisdiction].short} lens</>
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
                <p className="rb-empty-cta-sub">
                  Or upload a PDF.</p>
                <p className="rb-empty-body">Reviewing under ${jurisdiction} frameworks — ${frameworksByJurisdiction[jurisdiction]}. Change jurisdiction at the top of the page if you need a different one.
                </p>
                <div className="rb-empty-divider" aria-hidden="true" />
                <p className="rb-empty-quote">
                  "We design for full capacity. Life rarely provides it."
                </p>
                <p className="rb-empty-body">
                  Rembrandt Editor reads for the person who is tired, frightened, grieving, in pain or simply having a difficult day. That is most readers, most of the time.
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
                          {done ? '✓' : current ? '·' : '·'}
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
                  <div className="rb-verdict-summary">{results.overall.summary}</div>
                  {results.overall.readingAge && (
                    <div className="rb-verdict-meta">
                      <div>Reading age: <strong>{results.overall.readingAge}</strong></div>
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
        </section>
      </main>

      <footer className="rb-footer">
        <div className="rb-footer-inner">
          <div className="rb-footer-disclaimer">
            <p>
              <strong>Rembrandt Editor</strong> reviews content through a trauma-informed lens. It is not a compliance tool, a legal adjudicator, or a replacement for testing with the people the content is for. It flags plausible concerns. You decide what to do about them.
            </p>
            <p>
              Built and maintained by <a href="https://traumainformedcontent.com" alt="Trauma-Informed Content Consulting advises government bodies and regulated organisations on content that works for people on a bad day" target="_blank">Trauma-Informed Content Consulting</a>. <a href={FEEDBACK_URL}>Send feedback</a>.
            </p>
          </div>

          <div className="rb-footer-links">
            <div className="rb-footer-links-label">More from us</div>
            <a href={`${SITE}/`} target="_blank" rel="noopener noreferrer">traumainformedcontent.com</a>
            <a href={`${SITE}/what-is-trauma-informed-content/`} target="_blank" rel="noopener noreferrer">What is trauma-informed content?</a>
            <a href={`${SITE}/resources/`} target="_blank" rel="noopener noreferrer">Resources</a>
            <a href={`${SITE}/about/`} target="_blank" rel="noopener noreferrer">About</a>
            <a href={`${SITE}/contact/`} target="_blank" rel="noopener noreferrer">Contact</a>
          </div>

          <div className="rb-footer-meta">
            <div>
              © {new Date().getFullYear()} <a href="https://traumainformedcontent.com" alt="Trauma-Informed Content Consulting advises government bodies and regulated organisations on content that works for people on a bad day" target="_blank">Trauma-Informed Content Consulting</a>, a trading name of <a href="https://www.banksidecommunications.com/" target="_blank" alt="Bankside Communications">Bankside Communications Limited</a>. All rights reserved.
            </div>
            <div className="rb-version" aria-label={`Version ${VERSION}, released ${VERSION_DATE}`}>
              {VERSION} · {VERSION_DATE}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
