// src/AuthGate.jsx
//
// Wraps the app. Shows <Login /> if the user isn't signed in, otherwise
// renders children. Also handles the magic-link callback: when the user
// arrives back at the app with a ?code=… in the URL, exchange it for a
// session and clean the URL.

import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './Login'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      // If we've just come back from a magic link, exchange the code for a
      // session and remove ?code= from the URL so the link isn't reusable.
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        )
        if (!error) {
          url.searchParams.delete('code')
          window.history.replaceState({}, '', url.toString())
        }
      }

      // Whether or not we came from a magic link, check current session.
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setLoading(false)
    }

    init()

    // Keep the session state in sync if the user signs out in another tab.
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#FAFAF6',
          color: '#5C6B7A',
          fontFamily:
            "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontStyle: 'italic',
          letterSpacing: '0.01em'
        }}
      >
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return children
}
