# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- All Surplus Intelligence API traffic goes through the Vercel Serverless Function `api/proxy.js` (`/api/proxy?url=...`) with origin + target allowlists (see file header and README.md). Run locally with `vercel dev` so `/api/proxy` is served alongside the static app.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
