# Rembrandt

Trauma-informed content review tool. A single-page React app that calls the Anthropic API server-side via a Vercel serverless function.

## Project structure

```
.
├── api/
│   └── review.js        Vercel serverless function. Holds the system prompt
│                        and the Anthropic API key. Edit the prompt here.
├── src/
│   ├── App.jsx          The React component — UI, palette, copy.
│   ├── main.jsx         React entry point.
│   └── index.css        Minimal global resets.
├── index.html           HTML entry point.
├── package.json
├── vite.config.js
└── README.md
```

## Local development

```
npm install
npm run dev
```

Local dev runs the React app on `http://localhost:5173`. The `/api/review` endpoint will not work locally without `vercel dev` (which proxies to the serverless function). For most prompt and UI iteration, deploy to Vercel and edit there.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, click **Add New** → **Project** → **Import** the GitHub repo.
3. Vercel will auto-detect Vite. Leave the default build command (`npm run build`) and output directory (`dist`).
4. Before clicking Deploy, go to **Environment Variables** and add:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: your key from console.anthropic.com
   - **Environments**: Production, Preview, Development (tick all three)
5. Click Deploy.

After deploy, test it on the temporary `*.vercel.app` URL before pointing rembrandtapp.com at it.

## Custom domain

In the Vercel project, go to **Settings** → **Domains** → **Add**. Type `rembrandtapp.com`. Vercel will give you DNS records to set at your registrar. Apply them, wait for propagation (minutes to hours), and SSL is automatic.

If rembrandtapp.com is currently pointed at Lovable, disconnect the custom domain in Lovable's project settings first, or override the DNS records at your registrar. The records need to point at Vercel, not Lovable.

## Editing the prompt

The system prompt — where Rembrandt's IP lives — is in `api/review.js`. Edit it there, commit, push to GitHub. Vercel will redeploy automatically.

The prompt is server-side on purpose: it doesn't bloat the client bundle, and it can't be inspected or copied by viewing the page source.

## Editing the palette and typography

Both are in `src/App.jsx`:
- Palette: the `PALETTE` constant at the top of the file (15 hex values).
- Fonts: the Google Fonts URL inside the `useEffect` at the top of the component, plus the `font-family` declarations in the CSS block.

## Cost

Each review costs roughly £0.01 to £0.05 via the Anthropic API depending on input length, using Claude Sonnet 4.6. Budget accordingly. The character limit (`MAX_INPUT_LENGTH` in `api/review.js`, currently 8,500) caps individual review cost.

## What this is and isn't

Rembrandt is a content review tool, not a compliance auditor, legal adjudicator, or substitute for testing with the people the content is for. The honest framing on the page itself is the framing the tool should be discussed in.
