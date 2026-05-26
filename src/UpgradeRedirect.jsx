// src/UpgradeRedirect.jsx
//
// Bridges the Subscribe buttons on the Plus page (WordPress, on
// traumainformedcontent.com) and the Stripe Payment Links by:
//
//   1. Reading the ?plan= query parameter
//   2. Confirming the user is signed in (AuthGate wraps this component,
//      so unauthenticated users are sent to Login first — and Login is
//      configured to return them here after sign-in)
//   3. Appending client_reference_id (the user's Supabase ID) and
//      prefilled_email to the Stripe URL so the webhook can match
//      payment to the right account
//   4. Redirecting to Stripe
//
// The user typically sees this page for less than a second. The visible
// content is a quiet "Taking you to checkout…" message in case the
// redirect takes longer than expected (slow network, etc).
//
// When going from TEST to LIVE, only the URLs in STRIPE_PAYMENT_LINKS
// need to change. Everything else stays the same.

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

// =============================================================================
// STRIPE PAYMENT LINKS
//
// CURRENT MODE: TEST
//
// To switch to live: replace these four URLs with the live-mode Payment Link
// URLs. The keys (pro-monthly etc) must NOT change — they're what the
// Subscribe buttons on the Plus page link to.
//
// Test prices: Pro £10/£100, Team £15/£150
// Live prices: Pro £12.50/£125, Team £17.50/£175 (per seat for Team)
// =============================================================================
const STRIPE_PAYMENT_LINKS = {
  'pro-monthly':  'https://buy.stripe.com/00w4gA14K3YRgwZdLTcMM06',
  'pro-yearly':   'https://buy.stripe.com/bJeaEY6p47b3bcF0Z7cMM07',
  'team-monthly': 'https://buy.stripe.com/cNi5kEaFkgLDa8B8rzcMM04',
  'team-yearly':  'https://buy.stripe.com/4gM5kE7t852VbcF7nvcMM05',
}

const VALID_PLANS = Object.keys(STRIPE_PAYMENT_LINKS)

export default function UpgradeRedirect() {
  const [error, setError] = useState(null)

  useEffect(() => {
    async function redirect() {
      // ---------------------------------------------------------------------
      // Read the plan from the URL
      // ---------------------------------------------------------------------
      const params = new URLSearchParams(window.location.search)
      const plan = params.get('plan')

      if (!plan) {
        setError('No plan specified. Please return to the pricing page and pick a plan.')
        return
      }

      if (!VALID_PLANS.includes(plan)) {
        setError(`Unknown plan "${plan}". Please return to the pricing page and pick a valid option.`)
        return
      }

      // ---------------------------------------------------------------------
      // Confirm we have a session (AuthGate should already guarantee this,
      // but it's cheap to verify)
      // ---------------------------------------------------------------------
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setError('You need to be signed in to subscribe. Refresh this page to sign in.')
        return
      }

      // ---------------------------------------------------------------------
      // Construct the Stripe URL with client_reference_id and prefilled email
      // ---------------------------------------------------------------------
      const baseUrl = STRIPE_PAYMENT_LINKS[plan]
      const stripeUrl = new URL(baseUrl)
      stripeUrl.searchParams.set('client_reference_id', session.user.id)
      if (session.user.email) {
        stripeUrl.searchParams.set('prefilled_email', session.user.email)
      }

      // Replace the current history entry rather than push, so the back
      // button from Stripe doesn't return the user to this redirector
      window.location.replace(stripeUrl.toString())
    }

    redirect()
  }, [])

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    .rb-upgrade-root {
      min-height: 100vh;
      background: #FAFAF6;
      color: #5C6B7A;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      text-align: center;
    }
    .rb-upgrade-message {
      font-size: 14px;
      font-style: italic;
      letter-spacing: 0.01em;
      max-width: 420px;
      line-height: 1.55;
    }
    .rb-upgrade-error-heading {
      font-family: 'Rethink Sans', sans-serif;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: #0A3D6E;
      margin: 0 0 12px;
      font-style: normal;
    }
    .rb-upgrade-error-body {
      color: #0A3D6E;
      font-style: normal;
      font-size: 15px;
    }
    .rb-upgrade-link {
      display: inline-block;
      margin-top: 18px;
      color: #0A3D6E;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .rb-upgrade-link:hover { color: #062847; }
    .rb-upgrade-link:focus-visible {
      outline: 2px solid #0A3D6E;
      outline-offset: 2px;
      border-radius: 2px;
    }
  `

  return (
    <div className="rb-upgrade-root">
      <style>{css}</style>
      <div className="rb-upgrade-message">
        {error ? (
          <>
            <h1 className="rb-upgrade-error-heading">We hit a snag</h1>
            <p className="rb-upgrade-error-body">{error}</p>
            <a href="https://traumainformedcontent.com/rembrandt-editor-plus/" className="rb-upgrade-link">
              Back to pricing
            </a>
          </>
        ) : (
          'Taking you to checkout…'
        )}
      </div>
    </div>
  )
}
