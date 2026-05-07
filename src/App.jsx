import React, { useState, useEffect, useRef } from 'react';

// =============================================================================
// PALETTE — mapped to traumainformedcontent.com
// =============================================================================
const PALETTE = {
  bg:        '#F5F9F1',
  surface:   '#FFFFFF',
  ink:       '#0A3D6E',
  muted:     '#5C6B7A',
  faint:     '#A0ADB8',
  rule:      '#D8E2DA', 
  panel:     '#EBF2E8',
  primary:   '#0A3D6E',
  primaryFg: '#FFFFFF',
  attention: '#F18A65',
  consider:  '#249ADA',
  note:      '#7DC6AA',
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

const CHAR_LIMIT = 8000;

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
  const [jurisdiction, setJurisdiction] = useState('UK');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const textareaRef = useRef(null);
  const resultsHeadingRef = useRef(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch (e) {} };
  }, []);

  useEffect(() => {
    if (results && resultsHeadingRef.current) {
      resultsHeadingRef.current.focus();
      setAnnouncement(`Review complete. Verdict: ${verdictLabel(results.overall?.verdict)}. ${results.issues?.length || 0} issues identified.`);
    }
  }, [results]);

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
        body: JSON.stringify({ content, jurisdiction }),
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
      setError('Something went wrong reading that. Try again, or shorten the passage and try once more.');
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
    if (sev === 'attention') return { dot: PALETTE.attention, bg: '#FCE7DF', label: 'Attention' };
    if (sev === 'consider')  return { dot: PALETTE.consider,  bg: '#DEEEF9', label: 'Consider'  };
    return                          { dot: PALETTE.note,      bg: '#E5F2EB', label: 'Note'      };
  };

const verdictMeta = () => ({
  color: PALETTE.ink,
  bg: PALETTE.surface,
  border: PALETTE.rule,
});

const verdictLabel = () => '';

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

    .rb-header {
      border-bottom: 1px solid var(--rule);
      padding: 24px 32px;
      background: var(--bg);
      position: sticky; top: 0; z-index: 10;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .rb-header-row {
      max-width: 1280px; margin: 0 auto;
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 24px; flex-wrap: wrap;
    }
    .rb-title { font-size: 32px; font-weight: 600; line-height: 1; margin: 0; }
    .rb-subtitle { font-size: 14px; color: var(--muted); margin-top: 6px; }

    .rb-jur-group {
      display: inline-flex; gap: 4px;
      background: var(--panel); padding: 4px;
      border-radius: 999px;
    }
    .rb-jur-btn {
      padding: 8px 18px; border-radius: 999px; border: none;
      background: transparent; color: var(--muted);
      font-size: 13px; font-weight: 500; letter-spacing: 0.02em;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-jur-btn[aria-pressed="true"] { background: var(--ink); color: var(--bg); }
    .rb-jur-btn:hover:not([aria-pressed="true"]) { background: rgba(10, 61, 110, 0.06); color: var(--ink); }
    .rb-jur-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    .rb-frame-strip {
      border-bottom: 1px solid var(--rule);
      padding: 12px 32px; background: var(--panel);
    }
    .rb-frame-inner {
      max-width: 1280px; margin: 0 auto;
      font-size: 14px; color: var(--muted); font-style: italic;
    }

    .rb-honest-strip {
      max-width: 1280px; margin: 0 auto; padding: 18px 32px 4px;
      font-size: 15px; color: var(--muted); line-height: 1.6;
    }
    .rb-honest-strip strong { color: var(--ink); font-weight: 600; }

    .rb-main {
      max-width: 1280px; margin: 0 auto;
      padding: 24px 32px 32px;
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px;
    }
    @media (max-width: 900px) {
      .rb-main { grid-template-columns: 1fr; }
      .rb-header { padding: 20px 20px; }
      .rb-frame-strip, .rb-honest-strip, .rb-main { padding-left: 20px; padding-right: 20px; }
    }

    .rb-section-title { font-size: 20px; font-weight: 600; margin: 0; letter-spacing: -0.005em; }

    .rb-textarea {
      width: 100%; min-height: 360px; padding: 18px 20px;
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

    .rb-primary-btn {
      width: 100%; margin-top: 18px;
      padding: 14px 20px; border: none; border-radius: 8px;
      background: var(--ink); color: var(--bg);
      font-size: 15px; font-weight: 500; letter-spacing: 0.005em;
      transition: background 0.15s ease;
    }
    .rb-primary-btn:hover:not(:disabled) { background: #062847; }
    .rb-primary-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    .rb-empty, .rb-loading, .rb-error-card {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;
      padding: 36px 24px; min-height: 320px;
      display: flex; align-items: center; justify-content: center;
    }
    .rb-empty-inner, .rb-loading-inner { max-width: 380px; text-align: center; }
    .rb-empty-quote { font-size: 18px; font-style: italic; color: var(--ink); margin-bottom: 16px; line-height: 1.5; }
    .rb-empty-body { font-size: 14px; color: var(--muted); line-height: 1.6; }

    .rb-error-card {
      background: #FCE7DF; border-color: ${PALETTE.attention};
      color: ${PALETTE.harm}; padding: 18px 22px;
      min-height: auto; font-size: 14px; line-height: 1.55;
      align-items: flex-start; justify-content: flex-start;
    }

    .rb-results { display: flex; flex-direction: column; gap: 20px; }

    .rb-verdict {
      padding: 20px 22px; border-radius: 4px 8px 8px 4px; border-left: 4px solid;
    }
    .rb-verdict-detected {
      font-size: 13px; font-style: italic;
      margin-bottom: 10px; opacity: 0.85;
    }
    .rb-verdict-detected strong { font-weight: 600; font-style: normal; }
    .rb-verdict-row {
      display: flex; justify-content: space-between; align-items: baseline;
      gap: 16px; flex-wrap: wrap; margin-bottom: 10px;
    }
    .rb-verdict-label { font-size: 22px; font-weight: 600; }
    .rb-verdict-meta { display: flex; gap: 20px; font-size: 12px; }
    .rb-verdict-meta strong { font-weight: 600; }
    .rb-verdict-summary { font-size: 14px; line-height: 1.6; }

    .rb-subhead { font-size: 16px; font-weight: 600; margin: 0 0 4px; color: var(--ink); }
    .rb-subhead-note { font-size: 12px; color: var(--muted); margin-bottom: 12px; font-style: italic; }

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
    .rb-issue-problem { font-size: 14px; line-height: 1.6; margin-bottom: 12px; }
    .rb-issue-suggest {
      padding: 12px 14px; background: var(--panel);
      border-radius: 6px; border-left: 3px solid var(--primary);
      font-size: 14px; line-height: 1.55;
    }
    .rb-issue-suggest-label {
      font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--primary);
      margin-bottom: 4px;
    }

    .rb-flag {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 6px;
      padding: 12px 16px;
    }
    .rb-flag-fw { font-size: 12px; font-weight: 600; color: var(--primary); margin-bottom: 4px; }
    .rb-flag-text { font-size: 13px; line-height: 1.55; }

    .rb-rewrite-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .rb-copy-btn {
      background: transparent; border: 1px solid var(--primary); color: var(--primary);
      padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rb-copy-btn:hover { background: var(--primary); color: var(--primary-fg); }
    .rb-copy-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .rb-rewrite-body {
      background: var(--bg); border: 1px solid var(--rule); border-radius: 8px;
      padding: 20px 22px;
      font-size: 15px; line-height: 1.7; white-space: pre-wrap;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .rb-footer {
      padding: 24px 32px 36px; border-top: 1px solid var(--rule);
      margin-top: 32px; background: var(--panel);
    }
    .rb-footer-inner {
      max-width: 1280px; margin: 0 auto;
      font-size: 13px; color: var(--muted); line-height: 1.6;
    }
    @media (max-width: 900px) { .rb-footer { padding: 24px 20px 36px; } }

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
        </div>
      </header>

      <div className="rb-frame-strip">
        <div className="rb-frame-inner" aria-live="polite">
          Lens: {JURISDICTIONS[jurisdiction].frameworks}
        </div>
      </div>

      <div className="rb-honest-strip">
        <strong>What this is.</strong> Rembrandt flags content that is likely to fail readers in living experience — people moving through grief, fear, pain, exhaustion or the ordinary cognitive compromise of a difficult day. <strong>What this isn't.</strong> A compliance audit, a legal adjudicator, or a substitute for testing with the people the content is for.
      </div>

      <main id="main" className="rb-main">
        <section aria-labelledby="input-heading">
          <h2 id="input-heading" className="rb-display rb-section-title" style={{ marginBottom: 12 }}>Content to review</h2>

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
              <div className="rb-loading-inner">
                <div className="rb-display" style={{ fontSize: 18, fontStyle: 'italic', marginBottom: 10 }}>Reading carefully</div>
                <div style={{ fontSize: 12, color: PALETTE.muted }}>This usually takes 10 to 20 seconds.</div>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="rb-error-card rb-fade" role="alert">{error}</div>
          )}

          {results && !loading && (
            <div className="rb-results rb-fade">
              {results.overall && (
                <div className="rb-verdict" style={{ background: PALETTE.surface, borderLeftColor: PALETTE.rule, color: PALETTE.ink }}>
                  {results.overall.contentType && (
                    <div className="rb-verdict-detected" style={{ color: PALETTE.muted }}>
                      Detected as: <strong style={{ color: PALETTE.ink }}>{results.overall.contentType}</strong>
                    </div>
                  )}
                  <div className="rb-verdict-summary" style={{ color: PALETTE.ink, fontSize: 15, lineHeight: 1.65 }}>{results.overall.summary}</div>
                  {results.overall.readingAge && (
                    <div className="rb-verdict-meta" style={{ color: PALETTE.muted, marginTop: 12, fontSize: 12 }}>
                      <div>Reading age: <strong>{results.overall.readingAge}</strong></div>
                    </div>
                  )}
                </div>
              )}

              {results.issues?.length > 0 && (
                <div>
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
                <div>
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
                <div>
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
