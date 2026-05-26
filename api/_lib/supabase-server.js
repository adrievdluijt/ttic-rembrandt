// =============================================================================
// /lib/supabase-server.js — server-side Supabase client and auth helpers
//
// This file is for use inside Vercel serverless functions (/api/*) only.
// It uses the SERVICE ROLE key, which bypasses Row-Level Security. Never
// import this file from anywhere that ships to the browser.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client = null;
function getServiceClient() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Supabase env vars not set: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  if (!_client) {
    _client = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

// -----------------------------------------------------------------------------
// getSupabaseAdmin
//
// Direct access to the service-role Supabase client for server-to-server
// writes (Stripe webhooks, scheduled jobs, anything that writes on behalf
// of the system rather than the user). This client BYPASSES Row-Level
// Security — never expose this to user input.
//
// Only call from inside /api/* serverless functions.
// -----------------------------------------------------------------------------
export function getSupabaseAdmin() {
  return getServiceClient();
}
// -----------------------------------------------------------------------------
// getAuthenticatedTier
//
// Reads the Authorization: Bearer <token> header from a Vercel API request,
// validates it against Supabase, looks up the user's tier from the profiles
// table, and returns { tier, userId }.
//
// Anonymous, expired, or malformed tokens all resolve to tier: 'free'.
// Never throws — failures are logged and degraded to free-tier behaviour.
// -----------------------------------------------------------------------------
export async function getAuthenticatedTier(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { tier: 'free', userId: null };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return { tier: 'free', userId: null };

  try {
    const supabase = getServiceClient();

    // Verify the token and resolve to a Supabase user
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return { tier: 'free', userId: null };
    }

    const userId = userData.user.id;

    // Look up the tier on the profile row
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      // Authenticated but no profile row — should not happen given the
      // handle_new_user trigger, but degrade safely if it does.
      return { tier: 'free', userId };
    }

    return { tier: profile.tier, userId };
  } catch (err) {
    console.error('getAuthenticatedTier failed:', err);
    return { tier: 'free', userId: null };
  }
}
