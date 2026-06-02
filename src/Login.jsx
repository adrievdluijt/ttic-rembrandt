// src/Login.jsx
// Login UI shown by AuthGate when the user isn't signed in.
// Styled to match the Rembrandt Editor design system (App.jsx).

import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Load DM Sans + Rethink Sans from Google Fonts — same as App.jsx.
  // When Login renders before App, the fonts wouldn't otherwise be loaded.
  useEffect(() => {
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
    return () => {
      try { document.head.removeChild(link) } catch (e) {}
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Magic link lands back on the same URL the user was trying to
        // reach (not just the origin), so /upgrade?plan=pro-monthly survives
        // the sign-in round trip. AuthGate handles the ?code=… exchange.
        emailRedirectTo: window.location.href
      }
    })

    setLoading(false)
    if (signInError) {
      setError(signInError.message)
    } else {
      setSent(true)
    }
  }

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    .rb-login-root {
      min-height: 100vh;
      background: #FAFAF6;
      color: #0A3D6E;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
    }
    .rb-login-container {
      width: 100%;
      max-width: 440px;
    }
    .rb-login-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
      text-align: center;
    }
    .rb-login-logo {
      width: 64px;
      height: 64px;
      object-fit: contain;
      margin-bottom: 16px;
    }
    .rb-login-wordmark {
      font-family: 'Rethink Sans', sans-serif;
      font-weight: 700;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: #0A3D6E;
      line-height: 1.1;
    }
    .rb-login-tagline {
      font-size: 13px;
      color: #5C6B7A;
      margin-top: 6px;
      letter-spacing: 0.005em;
    }
    .rb-login-card {
      background: #FFFFFF;
      border: 1px solid #E0DDD3;
      border-radius: 12px;
      padding: 32px 28px;
      position: relative;
      overflow: hidden;
    }
    .rb-login-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, #E5634A 0 33%, #2BA8DC 33% 66%, #6FAA94 66% 100%);
    }
    .rb-login-heading {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0 0 8px;
      color: #0A3D6E;
    }
    .rb-login-intro {
      font-size: 14px;
      color: #5C6B7A;
      line-height: 1.55;
      margin: 0 0 20px;
    }
    .rb-login-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #0A3D6E;
      margin-bottom: 6px;
    }
    .rb-login-input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #E0DDD3;
      border-radius: 8px;
      background: #FFFFFF;
      font-size: 15px;
      line-height: 1.5;
      color: #0A3D6E;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      margin-bottom: 16px;
    }
    .rb-login-input::placeholder { color: #A0ADB8; }
    .rb-login-input:focus {
      border-color: #0A3D6E;
      box-shadow: 0 0 0 3px rgba(10, 61, 110, 0.15);
    }
    .rb-login-submit {
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 8px;
      background: #0A3D6E;
      color: #FFFFFF;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.005em;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(10, 61, 110, 0.18);
      transition: background 0.15s ease, transform 0.05s ease;
      font-family: inherit;
    }
    .rb-login-submit:hover:not(:disabled) { background: #062847; }
    .rb-login-submit:active:not(:disabled) { transform: translateY(1px); }
    .rb-login-submit:focus-visible {
      outline: 2px solid #0A3D6E;
      outline-offset: 2px;
    }
    .rb-login-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .rb-login-error {
      margin-top: 14px;
      padding: 12px 14px;
      background: #FCEAE3;
      border: 1px solid #E5634A;
      border-radius: 6px;
      color: #B85A3D;
      font-size: 13px;
      line-height: 1.5;
    }
    .rb-login-sent-heading {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0 0 12px;
      color: #0A3D6E;
    }
    .rb-login-sent-body {
      font-size: 14px;
      color: #0A3D6E;
      line-height: 1.6;
      margin: 0 0 10px;
    }
    .rb-login-sent-body:last-child { margin-bottom: 0; }
    .rb-login-sent-body strong { font-weight: 600; }
    .rb-login-quote {
      margin-top: 28px;
      font-family: 'Rethink Sans', sans-serif;
      font-size: 14px;
      font-style: italic;
      font-weight: 500;
      color: #5C6B7A;
      text-align: center;
      line-height: 1.5;
      letter-spacing: -0.005em;
    }
    .rb-login-meta {
      margin-top: 14px;
      font-size: 12px;
      color: #A0ADB8;
      text-align: center;
      line-height: 1.5;
    }
    .rb-login-meta a {
      color: #5C6B7A;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .rb-login-meta a:hover { color: #0A3D6E; }
    .rb-login-meta a:focus-visible {
      outline: 2px solid #0A3D6E;
      outline-offset: 2px;
      border-radius: 2px;
    }
    @media (max-width: 480px) {
      .rb-login-card { padding: 28px 22px; }
      .rb-login-wordmark { font-size: 24px; }
      .rb-login-logo { width: 56px; height: 56px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .rb-login-submit, .rb-login-input {
        transition-duration: 0.01ms !important;
      }
    }
  `

  return (
    <div className="rb-login-root">
      <style>{css}</style>
      <div className="rb-login-container">
        <header className="rb-login-brand">
          <img src="/logo.png" alt="" className="rb-login-logo" aria-hidden="true" />
          <div className="rb-login-wordmark">Rembrandt Editor</div>
          <div className="rb-login-tagline">Trauma-informed content review</div>
        </header>

        <main id="main" className="rb-login-card" aria-label="Sign in">
          {sent ? (
            <>
              <h1 className="rb-login-sent-heading">Check your email</h1>
              <p className="rb-login-sent-body">
                We've sent a sign-in link to <strong>{email}</strong>.
              </p>
              <p className="rb-login-sent-body">
                Click the link in the email to sign in. The link expires in one hour.
              </p>
            </>
          ) : (
            <>
              <h1 className="rb-login-heading">Sign in</h1>
              <p className="rb-login-intro">
                Enter your email and we'll send you a one-click sign-in link. No password needed.
              </p>
              <form onSubmit={handleSubmit}>
                <label htmlFor="login-email" className="rb-login-label">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="rb-login-input"
                />
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="rb-login-submit"
                >
                  {loading ? 'Sending…' : 'Send sign-in link'}
                </button>
                {error && (
                  <div className="rb-login-error" role="alert">
                    {error}
                  </div>
                )}
              </form>
            </>
          )}
        </main>

        <footer>
          <p className="rb-login-quote">
            "We design for full capacity. Life rarely provides it."
          </p>

          <p className="rb-login-meta">
            <a href="https://traumainformedcontent.com" target="_blank" rel="noopener noreferrer">
              traumainformedcontent.com
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
