import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import UpgradeRedirect from './UpgradeRedirect.jsx'
import Welcome from './Welcome.jsx'
import './index.css'

// =============================================================================
// Path-based routing without a router library
//
// We have three routes:
//   /          — the editor itself (App)
//   /upgrade   — redirects authenticated users to the right Stripe Payment Link
//   /welcome   — landing page after successful Stripe checkout
//
// All three are wrapped in AuthGate, so unauthenticated users are sent to
// Login. After sign-in via magic link, Login redirects back to the URL the
// user was originally trying to reach (preserving ?plan= and any other
// query params). That makes /upgrade?plan=pro-monthly Just Work even for
// users who weren't signed in when they clicked Subscribe.
//
// If you add more routes later, this is the place. Anything that doesn't
// match falls through to App.
// =============================================================================
function Root() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'

  if (path === '/upgrade' || path === '/upgrade/') {
    return (
      <AuthGate>
        <UpgradeRedirect />
      </AuthGate>
    )
  }

  if (path === '/welcome' || path === '/welcome/') {
    return (
      <AuthGate>
        <Welcome />
      </AuthGate>
    )
  }

  return (
    <AuthGate>
      <App />
    </AuthGate>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
