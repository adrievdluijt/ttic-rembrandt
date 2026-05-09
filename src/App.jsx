import React, { useState, useEffect, useRef } from 'react';

// =============================================================================
// PALETTE — mapped to traumainformedcontent.com
// White-dominant editorial. Navy ink. Severity dots use the three accent
// ribbons from the logo: coral, sky blue, sage green.
// =============================================================================
const PALETTE = {
  bg:        '#FAFAF6',  // near-white, faint warmth
  surface:   '#FFFFFF',  // pure white for cards, inputs, chips
  ink:       '#0A3D6E',  // navy from logo
  muted:     '#5C6B7A',
  faint:     '#A0ADB8',
  rule:      '#E0DDD3',  // warm pale grey
  panel:     '#F0EBDD',  // warm cream — subtle accent fills only
  primary:   '#0A3D6E',
  primaryFg: '#FFFFFF',
  attention: '#E5634A',  // logo coral
  consider:  '#2BA8DC',  // logo sky blue
  note:      '#6FAA94',  // logo sage green
  works:     '#3D7A5F',
  harm:      '#B85A3D',
};

const JURISDICTIONS = {
  UK: {
    label: 'United Kingdom',
    short: 'UK',
    frameworks: 'FCA Consumer Duty · ISO 22458 · GDS content standards · WCAG 2.2 AA · Plain English',
  },
  EU: {
    label: 'European Union',
    short: 'EU',
    frameworks: 'European Accessibility Act · EN 301 549 · GDPR transparency · plain-language directives',
  },
  US: {
    label: 'United States',
    short: 'US',
    frameworks: 'Plain Writing Act · Section 508 · ADA · state accessibility statutes',
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
const ABOUT_DISMISS_KEY = 'rb_about_dismissed_v1';

const EXAMPLE = `Dear Occupier,

Our records show that you have failed to respond to our previous correspondence dated 15th March 2024 regarding outstanding council tax arrears of £847.32.

You are required to make payment in full within 14 days of the date of this letter. Failure to do so will result in enforcement action being taken against you, which may include the involvement of enforcement agents and additional costs being added to your account.

If you are experiencing financial difficulty, you should contact us immediately.

Yours faithfully,
Revenues Department`;

// =============================================================================
// COMPONENT
// =============================================================================
export default function App() {
  const [content, setContent] = useState('');
  const [context, setContext] = useState('');
  const [jurisdiction, setJurisdiction] = useState('UK');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [aboutDismissed, setAboutDismissed] = useState(false);
  const [reviewPhase, setReviewPhase] = useState(-1);

  const textareaRef = useRef(null);
  const resultsHeadingRef = useRef(null);

  // Phases shown during the wait. Durations are estimates; they don't have
  // to match the API call exactly. They sum to ~20s, which matches observed
  // total time. If the response arrives early, results render immediately
  // and the indicator unmounts. If it arrives late, the last phase remains
  // highlighted until the response lands.
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
    } catch (e) { /* localStorage unavailable, show notice */ }
  }, []);

  useEffect(() => {
    if (results && resultsHeadingRef.current) {
      resultsHeadingRef.current.focus();
      setAnnouncement(`Review complete. ${results.issues?.length || 0} issues identified.`);
    }
  }, [results]);

  // Tick the phase indicator forward while loading. Reset when loading ends.
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

  const analyse = async () => {
    if (!content.trim() || loading || overLimit) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setAnnouncement('Reviewing content. This usually takes 10 to 20 seconds.');

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, jurisdiction, context }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const data = await response.json();
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
      setResults(JSON.parse(cleaned));
    } catch (e) {
      console.error(e);
      setError(e.message || 'Something went wrong reading that. Try again, or shorten the passage and try once more.');
      setAnnouncement('Review failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadExample = () => {
    setContent(EXAMPLE);
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
      --muted: ${PALETTE.muted};
      --faint: ${PALETTE.faint};
      --rule: ${PALETTE.rule};
      --panel: ${PALETTE.panel};
      --primary: ${PALETTE.primary};
      --primary-fg: ${PALETTE.primaryFg};
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

    /* ---- Header (sticky, contains lens unit) ---- */
    .rb-header {
      border-bottom: 1px solid var(--rule);
      padding: 20px 32px 16px;
      background: rgba(250, 250, 246, 0.92);
      position: sticky; top: 0; z-index: 20;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .rb-header-row {
      max-width: 1280px; margin: 0 auto;
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 24px; flex-wrap: wrap;
    }
    .rb-title { font-size: 30px; font-weight: 600; line-height: 1; margin: 0; }
    .rb-subtitle { font-size: 14px; color: var(--muted); margin-top: 6px; }

    .rb-lens-unit {
      display: flex; flex-direction: column; gap: 6px; align-items: flex-end;
      max-width: 60%;
    }
    @media (max-width: 700px) {
      .rb-lens-unit { align-items: flex-start; max-width: 100%; }
    }
    .rb-jur-group {
      display: inline-flex; gap: 4px;
      background: var(--surface); padding: 4px;
      border-radius: 999px; border: 1px solid var(--rule);
    }
    .rb-jur-btn {
      padding: 7px 16px; border-radius: 999px; border: none;
      background: transparent; color: var(--muted);
      font-size: 13px; font-weight: 500; letter-spacing: 0.02em;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-jur-btn[aria-pressed="true"] { background: var(--ink); color: var(--surface); }
    .rb-jur-btn:hover:not([aria-pressed="true"]) { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-jur-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-lens-fws {
      font-size: 12px; color: var(--muted); font-style: italic;
      text-align: right; max-width: 460px; line-height: 1.45;
    }
    @media (max-width: 700px) { .rb-lens-fws { text-align: left; } }

    /* ---- Optional dismissible "About" notice ---- */
    .rb-about {
      max-width: 1280px; margin: 16px auto 0;
      padding: 12px 32px;
      display: flex; gap: 16px; align-items: flex-start;
    }
    .rb-about-body {
      flex: 1; font-size: 14px; color: var(--muted); line-height: 1.6;
    }
    .rb-about-body strong { color: var(--ink); font-weight: 600; }
    .rb-about-close {
      flex-shrink: 0;
      background: transparent; border: 1px solid var(--rule);
      color: var(--muted); padding: 4px 12px; border-radius: 999px;
      font-size: 12px;
    }
    .rb-about-close:hover { color: var(--ink); border-color: var(--ink); }

    /* ---- Main grid ---- */
    .rb-main {
      max-width: 1280px; margin: 0 auto;
      padding: 24px 32px 40px;
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px;
    }
    @media (max-width: 900px) {
      .rb-main { grid-template-columns: 1fr; gap: 24px; }
      .rb-header { padding: 16px 20px 14px; }
      .rb-about, .rb-main { padding-left: 20px; padding-right: 20px; }
    }

    .rb-section-title { font-size: 20px; font-weight: 600; margin: 0; letter-spacing: -0.005em; }

    /* ---- Context section ---- */
    .rb-context { margin-bottom: 14px; }
    .rb-context-label {
      display: block; font-size: 12px; color: var(--muted);
      margin-bottom: 6px; font-style: italic;
    }
    .rb-context-input {
      width: 100%; padding: 10px 14px;
      border: 1px solid var(--rule); border-radius: 8px;
      background: var(--surface);
      font-size: 14px; color: var(--ink); outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .rb-context-input::placeholder { color: var(--faint); }
    .rb-context-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(10, 61, 110, 0.15); }

    .rb-chips {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
    }
    .rb-chip {
      background: var(--surface); border: 1px solid var(--rule);
      color: var(--ink); padding: 6px 14px;
      border-radius: 999px; font-size: 12px; font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .rb-chip:hover:not([aria-pressed="true"]) {
      border-color: var(--primary);
      background: rgba(10, 61, 110, 0.04);
    }
    .rb-chip[aria-pressed="true"] {
      background: var(--ink); border-color: var(--ink); color: var(--surface);
    }
    .rb-chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    /* ---- Textarea ---- */
    .rb-textarea {
      width: 100%; min-height: 320px; padding: 18px 20px;
      border: 1px solid var(--rule); border-radius: 8px;
      background: var(--surface);
      font-size: 15px; line-height: 1.65; color: var(--ink);
      resize: vertical; outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .rb-textarea::placeholder { color: var(--faint); }
    .rb-textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(10, 61, 110, 0.15); }
    .rb-textarea[aria-invalid="true"] { border-color: ${PALETTE.attention}; }

    .rb-meta-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 8px; font-size: 12px; color: var(--muted);
    }
    .rb-meta-row .rb-over { color: ${PALETTE.attention}; font-weight: 500; }
    .rb-link-btn {
      background: none; border: none; padding: 0;
      color: var(--muted); font-size: 12px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .rb-link-btn:hover { color: var(--ink); }
    .rb-link-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }

    /* ---- Sticky Review action bar ---- */
    .rb-actions {
      position: sticky; bottom: 16px;
      margin-top: 16px; z-index: 5;
    }
    .rb-primary-btn {
      width: 100%;
      padding: 14px 20px; border: none; border-radius: 8px;
      background: var(--ink); color: var(--surface);
      font-size: 15px; font-weight: 500; letter-spacing: 0.005em;
      box-shadow: 0 6px 20px rgba(10, 61, 110, 0.18);
      transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease;
    }
    .rb-primary-btn:hover:not(:disabled) { background: #062847; }
    .rb-primary-btn:active:not(:disabled) { transform: translateY(1px); }
    .rb-primary-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    /* ---- Review states (empty, loading, error) ---- */
    .rb-empty, .rb-loading, .rb-error-card {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;
      padding: 36px 24px; min-height: 320px;
      display: flex; align-items: center; justify-content: center;
    }
    .rb-empty-inner, .rb-loading-inner { max-width: 380px; text-align: center; }
    .rb-empty-quote { font-size: 18px; font-style: italic; color: var(--ink); margin-bottom: 16px; line-height: 1.5; }
    .rb-empty-body { font-size: 14px; color: var(--muted); line-height: 1.6; }

    /* ---- Phased loading list ---- */
    .rb-phases {
      list-style: none; padding: 0; margin: 0;
      font-size: 13px; line-height: 1.8;
      text-align: left;
    }
    .rb-phase {
      display: flex; align-items: center; gap: 10px;
      transition: opacity 0.3s ease, color 0.3s ease, font-weight 0.3s ease;
    }
    .rb-phase-marker {
      width: 14px; display: inline-block; text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .rb-phase-done    { color: ${PALETTE.muted}; opacity: 1; }
    .rb-phase-current { color: ${PALETTE.ink};   opacity: 1; font-weight: 600; }
    .rb-phase-pending { color: ${PALETTE.faint}; opacity: 0.55; }

    .rb-error-card {
      background: #FCEAE3; border-color: ${PALETTE.attention};
      color: ${PALETTE.harm}; padding: 18px 22px;
      min-height: auto; font-size: 14px; line-height: 1.55;
      align-items: flex-start; justify-content: flex-start;
    }

    /* ---- Review results (sticky mini-nav + sections) ---- */
    .rb-results { display: flex; flex-direction: column; gap: 22px; }

    .rb-results-nav {
      position: sticky; top: 88px; z-index: 4;
      display: flex; flex-wrap: wrap; gap: 4px;
      padding: 8px 0;
      background: var(--bg);
      border-bottom: 1px solid var(--rule);
      margin-bottom: 4px;
      font-size: 13px;
    }
    @media (max-width: 900px) { .rb-results-nav { top: 110px; } }
    .rb-results-nav a {
      color: var(--muted); text-decoration: none;
      padding: 5px 12px; border-radius: 999px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-results-nav a:hover { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-results-nav a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-results-nav .rb-nav-count {
      display: inline-block; margin-left: 4px; opacity: 0.6;
      font-variant-numeric: tabular-nums;
    }

    .rb-anchor { scroll-margin-top: 140px; }

    .rb-verdict {
      padding: 20px 22px; border-radius: 4px 8px 8px 4px;
      border-left: 4px solid var(--rule);
      background: var(--surface);
    }
    .rb-verdict-detected {
      font-size: 13px; font-style: italic; color: var(--muted);
      margin-bottom: 10px;
    }
    .rb-verdict-detected strong { font-weight: 600; font-style: normal; color: var(--ink); }
    .rb-verdict-summary { font-size: 15px; line-height: 1.65; color: var(--ink); }
    .rb-verdict-meta {
      display: flex; gap: 20px; font-size: 12px; color: var(--muted);
      margin-top: 12px;
    }
    .rb-verdict-meta strong { font-weight: 600; color: var(--ink); }

    .rb-subhead { font-size: 16px; font-weight: 600; margin: 0 0 4px; color: var(--ink); }
    .rb-subhead-note { font-size: 12px; color: var(--muted); margin-bottom: 12px; font-style: italic; }

    /* ---- Issue cards ---- */
    .rb-issue {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;
      padding: 16px 18px;
    }
    .rb-issue-head {
      display: flex; justify-content: space-between; align-items: center;
      gap: 10px; margin-bottom: 10px; flex-wrap: wrap;
    }
    .rb-issue-sev {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    }
    .rb-issue-sev .rb-dot { width: 8px; height: 8px; border-radius: 50%; }
    .rb-issue-cat { font-size: 11px; color: var(--faint); font-style: italic; }
    .rb-issue-quote {
      padding: 10px 14px; border-radius: 6px;
      font-size: 14px; line-height: 1.5; font-style: italic;
      margin-bottom: 12px;
    }
    .rb-issue-problem { font-size: 14px; line-height: 1.6; margin-bottom: 12px; color: var(--ink); }
    .rb-issue-suggest {
      padding: 12px 14px; background: var(--panel);
      border-radius: 6px; border-left: 3px solid var(--primary);
      font-size: 14px; line-height: 1.55; color: var(--ink);
    }
    .rb-issue-suggest-label {
      font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--primary);
      margin-bottom: 4px;
    }

    /* ---- Flags ---- */
    .rb-flag {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 6px;
      padding: 12px 16px;
    }
    .rb-flag-fw { font-size: 12px; font-weight: 600; color: var(--primary); margin-bottom: 4px; }
    .rb-flag-text { font-size: 13px; line-height: 1.55; color: var(--ink); }

    /* ---- Rewrite ---- */
    .rb-rewrite-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .rb-copy-btn {
      background: transparent; border: 1px solid var(--primary); color: var(--primary);
      padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-copy-btn:hover { background: var(--primary); color: var(--primary-fg); }
    .rb-copy-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-rewrite-body {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;
      padding: 20px 22px;
      font-size: 15px; line-height: 1.7; white-space: pre-wrap;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    /* ---- Footer ---- */
    .rb-footer {
      padding: 24px 32px 36px; border-top: 1px solid var(--rule);
      margin-top: 32px; background: var(--panel);
    }
    .rb-footer-inner {
      max-width: 1280px; margin: 0 auto;
      font-size: 13px; color: var(--muted); line-height: 1.6;
    }
    @media (max-width: 900px) { .rb-footer { padding: 24px 20px 36px; } }

    /* ---- Animation ---- */
    .rb-fade { animation: rb-fade 0.4s ease; }
    @keyframes rb-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .rb-dots span { animation: rb-blink 1.4s infinite; opacity: 0.3; }
    .rb-dots span:nth-child(2) { animation-delay: 0.2s; }
    .rb-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes rb-blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
  `;

  return (
    <div className="rb-root">
      <style>{css}</style>

      <a href="#main" className="rb-skip">Skip to main content</a>

      <div role="status" aria-live="polite" aria-atomic="true" className="rb-sr-only">
        {announcement}
      </div>

      <header className="rb-header">
        <div className="rb-header-row">
          <div>
            <h1 className="rb-display rb-title">Rembrandt</h1>
            <div className="rb-subtitle">Trauma-informed content review</div>
          </div>
          <div className="rb-lens-unit">
            <div className="rb-jur-group" role="group" aria-label="Jurisdiction lens">
              {Object.entries(JURISDICTIONS).map(([key, { short, label }]) => (
                <button
                  key={key}
                  onClick={() => setJurisdiction(key)}
                  aria-pressed={jurisdiction === key}
                  aria-label={`${label} lens`}
                  className="rb-jur-btn"
                >
                  {short}
                </button>
              ))}
            </div>
            <div className="rb-lens-fws" aria-live="polite">
              {JURISDICTIONS[jurisdiction].frameworks}
            </div>
          </div>
        </div>
      </header>

      {!aboutDismissed && (
        <div className="rb-about" role="region" aria-label="About Rembrandt">
          <div className="rb-about-body">
            <strong>What this is.</strong> Rembrandt flags content that is likely to fail readers in living experience — people moving through grief, fear, pain, exhaustion or the ordinary cognitive compromise of a difficult day. <strong>What this isn't.</strong> A compliance audit, a legal adjudicator, or a substitute for testing with the people the content is for.
          </div>
          <button
            type="button"
            onClick={dismissAbout}
            aria-label="Dismiss this notice"
            className="rb-about-close"
          >
            Got it
          </button>
        </div>
      )}

      <main id="main" className="rb-main">
        <section aria-labelledby="input-heading">
          <h2 id="input-heading" className="rb-display rb-section-title" style={{ marginBottom: 12 }}>Content to review</h2>

          <div className="rb-context">
            <label htmlFor="context-input" className="rb-context-label">
              Your role with this content (optional)
            </label>
            <input
              id="context-input"
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. I'm editing what our policy team drafted"
              className="rb-context-input"
              aria-describedby="context-help"
            />
            <div className="rb-chips" role="group" aria-label="Common roles">
              {CONTEXT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(chip)}
                  aria-pressed={context === chip}
                  className="rb-chip"
                >
                  {chip}
                </button>
              ))}
            </div>
            <div id="context-help" className="rb-sr-only">
              Telling Rembrandt your role with this content shapes how the review is addressed. If you wrote it, the review is written to you. If you received it, the review is written about the sender.
            </div>
          </div>

          <label htmlFor="content-input" className="rb-sr-only">Paste the content you want reviewed</label>
          <textarea
            id="content-input"
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
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

          <div id="content-help" className="rb-sr-only">
            Paste up to {CHAR_LIMIT.toLocaleString()} characters of content. Choose the jurisdiction lens at the top of the page before reviewing. Rembrandt will detect what type of content it is.
          </div>

          <div className="rb-actions">
            <button
              onClick={analyse}
              disabled={!content.trim() || loading || overLimit}
              className="rb-primary-btn"
            >
              {loading ? (
                <>Reading carefully<span className="rb-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></>
              ) : (
                <>Review through {JURISDICTIONS[jurisdiction].short} lens</>
              )}
            </button>
          </div>
        </section>

        <section aria-labelledby="results-heading" aria-busy={loading}>
          <h2
            id="results-heading"
            ref={resultsHeadingRef}
            tabIndex={-1}
            className="rb-display rb-section-title"
            style={{ marginBottom: 12 }}
          >
            Review
          </h2>

          {!results && !loading && !error && (
            <div className="rb-empty">
              <div className="rb-empty-inner">
                <div className="rb-display rb-empty-quote">
                  "We design for full capacity. Life rarely provides it."
                </div>
                <div className="rb-empty-body">
                  Rembrandt reads for the person who is tired, frightened, grieving, in pain, or simply having a difficult day. That is most readers, most of the time.
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="rb-loading rb-fade">
              <div className="rb-loading-inner" style={{ maxWidth: 320 }}>
                <div
                  className="rb-display"
                  style={{ fontSize: 16, fontStyle: 'italic', marginBottom: 18 }}
                >
                  Reading carefully
                </div>
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
                    <button onClick={copyRewrite} className="rb-copy-btn">{copied ? 'Copied' : 'Copy'}</button>
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
          <p style={{ margin: 0 }}>
            Rembrandt reviews content through a trauma-informed lens. It is not a compliance tool, a legal adjudicator or a replacement for testing with the people the content is for. It flags plausible concerns. You decide what to do about them.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            v1 · Trauma-Informed Content Consulting
          </p>
        </div>
      </footer>
    </div>
  );
}
