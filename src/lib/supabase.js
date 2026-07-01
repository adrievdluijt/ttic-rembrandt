// src/lib/supabase.js
//
// Browser-side Supabase client for the React SPA.
// Includes two helpers for the rest of the app:
//   - useSession()  — React hook that returns the current session (or null)
//   - authFetch()   — drop-in replacement for fetch() that automatically
//                     adds the Authorization: Bearer <token> header

import { createClient } from '@supabase/supabase-js'
import { useState, useEffect } from 'react'

// In Vite, environment variables exposed to the browser must be prefixed
// with VITE_. They are read at build time and inlined into the bundle.
//
// flowType: 'pkce' is required here — AuthGate.jsx expects a ?code= param
// on the redirect URL and calls exchangeCodeForSession() to consume it.
// Without this explicit setting, the client flow type is not guaranteed
// to match, magic links return tokens in the URL hash instead of a code
// param, and the exchange in AuthGate never runs.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce'
    }
  }
)

// React hook for components that need the current session.
// Returns null while loading, then the session object (or null if signed out).
export function useSession() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  return session
}

// Drop-in replacement for fetch() that adds the access token if the user
// is signed in. Use this for every call to /api/review.
//
// Before:
//     const res = await fetch('/api/review', { method: 'POST', body: ... })
// After:
//     const res = await authFetch('/api/review', { method: 'POST', body: ... })
export async function authFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })
}
