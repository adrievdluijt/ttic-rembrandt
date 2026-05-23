// lib/supabase-browser.js
// Used in pages and components that run in the browser

import { createBrowserClient } from '@supabase/ssr'

export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
