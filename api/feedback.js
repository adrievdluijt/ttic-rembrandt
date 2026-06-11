// =============================================================================
// /api/feedback — Vercel serverless function
//
// Accepts feedback submissions from the in-app form and writes them to the
// Supabase 'feedback' table. Uses the SUPABASE_URL and SUPABASE_ANON_KEY
// environment variables, which are auto-synced from the Supabase-Vercel
// integration — no manual env var setup needed.
//
// Row Level Security on the table means the anon key can only INSERT,
// never SELECT/UPDATE/DELETE. Feedback can only be read via the Supabase
// dashboard.
//
// Security note (changed in this version):
//   - CORS is locked to an explicit allow-list of origins, not "*", so a
//     script on another domain cannot flood the feedback table from a
//     browser. (A determined server-to-server caller can still POST; the
//     RLS INSERT-only policy and the field validation below are the
//     backstop for that.)
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const MAX_MESSAGE_LENGTH = 5000;
const MAX_SNAPSHOT_LENGTH = 1000;

// Keep this list in sync with the allow-list in api/review.js.
const ALLOWED_ORIGINS = [
  'https://rembrandteditor.com',
  'https://www.rembrandteditor.com',
  'https://rembrandtapp.com',
  'https://www.rembrandtapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase environment variables not set');
    return res.status(500).json({ error: 'Server is not configured. Contact the site administrator.' });
  }

  const {
    category,
    severity,
    message,
    email,
    document_snapshot,
    document_type,
    jurisdiction,
    app_version,
    user_agent,
  } = req.body || {};

  // Validate required fields
  if (typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({ error: 'Category is required.' });
  }
  if (typeof severity !== 'string' || !severity.trim()) {
    return res.status(400).json({ error: 'Severity is required.' });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Please write something in the message.' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` });
  }

  // Truncate document snapshot defensively
  const safeSnapshot = typeof document_snapshot === 'string'
    ? document_snapshot.slice(0, MAX_SNAPSHOT_LENGTH)
    : null;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        category: category.trim(),
        severity: severity.trim(),
        message: message.trim(),
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        document_snapshot: safeSnapshot,
        document_type: typeof document_type === 'string' ? document_type : null,
        jurisdiction: typeof jurisdiction === 'string' ? jurisdiction : null,
        app_version: typeof app_version === 'string' ? app_version : null,
        user_agent: typeof user_agent === 'string' ? user_agent.slice(0, 500) : null,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Supabase error:', response.status, errBody);
      return res.status(502).json({ error: 'Could not save feedback. Please try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Feedback handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
