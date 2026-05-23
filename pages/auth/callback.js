// pages/auth/callback.js
// Handles the magic link return URL.
// Exchanges the code for a session, then redirects to the home page.

import { getSupabaseServerClient } from '../../lib/supabase-server'

export default function Callback() {
  // This page never renders — getServerSideProps redirects before it does.
  return null
}

export async function getServerSideProps({ req, res, query }) {
  const code = query.code

  if (!code) {
    return {
      redirect: { destination: '/login', permanent: false }
    }
  }

  const supabase = getSupabaseServerClient(req, res)
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return {
      redirect: { destination: '/login?error=invalid_link', permanent: false }
    }
  }

  return {
    redirect: { destination: '/', permanent: false }
  }
}
