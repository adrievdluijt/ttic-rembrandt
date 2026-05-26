// src/Welcome.jsx
//
// Landing page after a successful Stripe checkout. Stripe redirects here
// via the "After payment" URL configured on each Payment Link.
//
// At this point the user has paid but the Stripe webhook may or may not
// have fired yet — Stripe's docs say webhooks usually arrive within a few
// seconds but can take longer under load. So we poll the user's profile
// briefly to confirm their tier has flipped before showing the success
// state. If polling times out at 15 seconds, we show a softer message
// telling them the upgrade is processing.
//
// The component is wrapped in AuthGate, so if the user somehow lands here
// without a session, they'll be sent to login first.

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const POLL_INTERVAL_MS = 1000
const POLL_MAX_ATTEMPTS = 15

export default function Welcome() {
  const [state, setState] = useState('polling') // 'polling' | 'confirmed' | 'pending' | 'error'
  const [tier, setTier] = useState(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    // Load DM Sans + Rethink Sans
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)

    async function pollTier() {
      if (cancelled) return

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        if (!cancelled) setState('error')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('tier')
        .eq('id', session.user.id)
        .single()

      if (cancelled) return

      if (!error && data && (data.tier === 'professional' || data.tier === 'team')) {
        setTier(data.tier)
        setState('confirmed')
        return
      }

      attempts += 1
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setState('pending')
        return
      }

      setTimeout(pollTier, POLL_INTERVAL_MS)
    }

    pollTier()

    return () => {
      cancelled = true
      try { document.head.removeChild(link) } catch (e) { /* ignore */ }
    }
  }, [])

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    .rb-welcome-root {
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
    .rb-welcome-container {
      width: 100%;
      max-width: 480px;
      text-align: center;
    }
    .rb-welcome-card {
      background: #FFFFFF;
      border: 1px solid #E0DDD3;
      border-radius: 12px;
      padding: 36px 32px;
      position: relative;
      overflow: hidden;
      text-align: left;
    }
    .rb-welcome-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, #E5634A 0 33%, #2BA8DC 33% 66%, #6FAA94 66% 100%);
    }
    .rb-welcome-heading {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0 0 14px;
      color: #0A3D6E;
    }
    .rb-welcome-body {
      font-size: 15px;
      color: #0A3D6E;
      line-height: 1.6;
      margin: 0 0 14px;
    }
    .rb-welcome-body:last-of-type { margin-bottom: 24px; }
    .rb-welcome-button {
      display: inline-block;
      padding: 13px 24px;
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
      text-decoration: none;
    }
    .rb-welcome-button:hover { background: #062847; }
    .rb-welcome-button:active { transform: translateY(1px); }
    .rb-welcome-button:focus-visible {
      outline: 2px solid #0A3D6E;
      outline-offset: 2px;
    }
    .rb-welcome-polling {
      font-style: italic;
      color: #5C6B7A;
      font-size: 14px;
      text-align: center;
      padding: 20px 0;
    }
    .rb-welcome-quote {
      margin-top: 28px;
      font-family: 'Rethink Sans', sans-serif;
      font-size: 14px;
      font-style: italic;
      font-weight: 500;
      color: #5C6B7A;
      line-height: 1.5;
      letter-spacing: -0.005em;
    }
  `

  return (
    <div className="rb-welcome-root">
      <style>{css}</style>
      <div className="rb-welcome-container">
        <div className="rb-welcome-card">
          {state === 'polling' && (
            <>
              <h1 className="rb-welcome-heading">Thank you</h1>
              <p className="rb-welcome-body">
                Your payment came through. We're confirming the subscription on our side now — this usually takes a few seconds.
              </p>
              <div className="rb-welcome-polling">Confirming…</div>
            </>
          )}

          {state === 'confirmed' && (
            <>
              <h1 className="rb-welcome-heading">
                Welcome to Rembrandt Editor {tier === 'team' ? 'Team' : 'Professional'}
              </h1>
              <p className="rb-welcome-body">
                Your subscription is active. The drafting context controls and {tier === 'team' ? 'team features' : 'all Professional features'} are now available.
              </p>
              <p className="rb-welcome-body">
                You can manage your subscription, invoices and payment details at any time from your account.
              </p>
              <a href="/" className="rb-welcome-button">
                Open the editor
              </a>
            </>
          )}

          {state === 'pending' && (
            <>
              <h1 className="rb-welcome-heading">Your payment came through</h1>
              <p className="rb-welcome-body">
                Stripe has confirmed your payment. We're still waiting for our side to catch up — this happens occasionally and usually resolves within a minute or two.
              </p>
              <p className="rb-welcome-body">
                You can head into the editor now. If you don't see Professional features when you arrive, refresh the page and they should appear.
              </p>
              <a href="/" className="rb-welcome-button">
                Open the editor
              </a>
            </>
          )}

          {state === 'error' && (
            <>
              <h1 className="rb-welcome-heading">Something's not right</h1>
              <p className="rb-welcome-body">
                Your payment may have gone through but we can't confirm your account here. Please contact support and we'll sort this out for you straight away.
              </p>
              <a href="mailto:hello@traumainformedcontent.com" className="rb-welcome-button">
                Email support
              </a>
            </>
          )}
        </div>

        <p className="rb-welcome-quote">
          "We design for full capacity. Life rarely provides it."
        </p>
      </div>
    </div>
  )
}
