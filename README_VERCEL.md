# Deploying Markdown Converter to Vercel

## Prerequisites
- Vercel account (https://vercel.com)
- Vercel CLI (optional, for local deploy)
- Git repository (GitHub/GitLab/Bitbucket or import via CLI)

## What's included
- `api/convert.js` - Serverless conversion endpoint
- `api/health.js` - Health endpoint
- `lib/conversion.js` - Conversion helpers (HTML/PDF/DOCX)
- `vercel.json` - Routing + function settings
- `public/` - Static site

## One‑click Deploy
If this repo is on GitHub:
1. Go to Vercel → New Project → Import Git Repository
2. Select the repo
3. Root directory: project root (where `vercel.json` lives)
4. Framework Preset: "Other"
5. Build Command: none (handled by Vercel for static)
6. Output Directory: `public` (routes handle API)
7. Deploy

## CLI Deploy
```powershell
npm i -g vercel
vercel login
vercel
# verify preview works
vercel --prod
```

## Environment Variables (optional)
- None required for basic usage.
- You may add `MAX_FILE_SIZE`, etc., but the serverless function is stateless.

## Routing
- POST `/api/convert` (multipart/form-data)
- GET `/api/health`
- Static: `/` → `public/index.html`

## Client changes
- Client now posts to `/api/convert`.
- Progress is simulated because SSE is not used in serverless.

## Troubleshooting
- PDF fails: Ensure `@sparticuz/chromium` + `puppeteer-core` are installed.
- Function timeout: Increase `maxDuration` in `vercel.json` or reduce input size.
- Memory errors: Increase `memory` in `vercel.json`.

## Next steps
- Add rate limiting (Vercel Edge or middleware) if needed
- Add file size checks client-side (already included)
- Add unit tests for conversion functions
