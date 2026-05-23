// src/Login.jsx
// Login UI shown by AuthGate when the user isn't signed in.

import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Magic link lands back on the same origin. AuthGate handles the
        // ?code=… exchange on mount.
        emailRedirectTo: window.location.origin
      }
    })

    setLoading(false)
    if (signInError) {
      setError(signInError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: '4rem auto',
        padding: '2rem',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1a1a1a'
      }}
    >
      {sent ? (
        <>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
            Check your email
          </h1>
          <p style={{ lineHeight: 1.5 }}>
            We've sent a sign-in link to <strong>{email}</strong>.
          </p>
          <p style={{ lineHeight: 1.5, marginTop: '1rem' }}>
            Click the link in the email to sign in to Rembrandt. The link
            expires in one hour.
          </p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Sign in to Rembrandt
          </h1>
          <p style={{ lineHeight: 1.5, marginBottom: '1.5rem', color: '#555' }}>
            Enter your email and we'll send you a one-click sign-in link. No
            password needed.
          </p>
          <form onSubmit={handleSubmit}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500
              }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                border: '1px solid #ccc',
                borderRadius: 4,
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: loading ? '#666' : '#1a1a1a',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 500
              }}
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
            {error && (
              <p
                style={{
                  color: '#c00',
                  marginTop: '1rem',
                  fontSize: '0.875rem'
                }}
              >
                {error}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  )
}
