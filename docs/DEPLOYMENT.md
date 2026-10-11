# Deployment

Standalone GitHub Pages site. Not published by the frontend task (the orchestrator owns publication).

1. `cd site && npm ci && npm run build` (runs `tsc --noEmit` then `vite build`; output `site/dist`, base `/sentinel-anomaly-lab/`).
2. Publish `site/dist` with `shared/deployment/deploy_site_pages.sh` once the repository slug is confirmed.
3. `site/src/config.ts` holds the S08 repository and methodology links; verify them at release.
4. Verify with curl on every file under `data/` and a real screenshot of the public URL.
