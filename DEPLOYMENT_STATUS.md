# Deployment Status

## Verified Locally

- `npm run build` succeeds.
- `npm start` serves the production React app and `/api/*` from one Express server.
- Docker image `stagewrite-ai:local` builds successfully.
- Docker container health check succeeds at `/api/health`.
- GitHub Pages static MVP loads successfully.
- Deployed click flow verified: draft generation, music cue suggestion, music generation mock, and play button activation.

## Public Deployment

Public deployment target selected: GitHub Pages static MVP.

Public URL:

https://sequenzen.github.io/ai-musical-workstation/

Status: deployed and browser-verified.

Backend-capable deployment providers are still not configured because no provider tokens are available:

- `VERCEL_TOKEN`: missing
- `NETLIFY_AUTH_TOKEN`: missing
- `FLY_API_TOKEN`: missing
- `RAILWAY_TOKEN`: missing
- `RENDER_API_KEY`: missing

## Ready Targets

The app is ready for these deployment paths:

1. GitHub Pages static MVP using the `gh-pages` branch
2. Render Blueprint using `render.yaml`
3. Railway using `railway.json`
4. Any Docker host using `Dockerfile`

## Production Commands

```bash
npm ci
npm run build
npm start
```

## Docker Commands

```bash
docker build -t stagewrite-ai .
docker run -p 8787:8787 stagewrite-ai
```
