# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- All Surplus Intelligence API traffic goes through the Vercel Serverless Function `api/proxy.js` (`/api/proxy?url=...`) with origin + target allowlists (see file header and README.md). On `localhost`/`127.0.0.1`/`file://` the app skips the proxy and calls the API directly (it sends `access-control-allow-origin: *`; see `USE_PROXY` in `code.js`), so any static server works locally.
- Run `node test/self-check.mjs` after touching `code.js`; it mirrors the retry, sort, provider-filter, and trusted-provider resolution logic without a browser.

## Trusted provider filter

The provider filter's **Trusted** button (next to **All** / **None**) selects only providers Surplus Intelligence curates as trusted. Trust resolution lives in `code.js` (`isTrustedProvider`, `trustedProviders`, `loadTrustedProviders`) and has two sources, in this order:

1. The `trusted` boolean on each offer returned by `GET /api/markets/{model}`. This is the live signal that drives the marketplace's own trusted badge and its All/Trusted toggle, so it wins. A provider counts as trusted only if every offer that reports a flag reports `true`.
2. `trusted-providers.json` at the repo root, loaded at startup via a relative fetch. It covers offers that report no flag and is the human-readable snapshot of the curated list. Matching is case-insensitive and ignores punctuation and spacing, against each entry's `id`, `name`, and `aliases`; add an alias when the `provider` string in market offers differs from the curated name (for example `Google` for `google-ai-studio`). If the file is missing or invalid, only the live flags are used and the console logs a warning.

To refresh the snapshot after a curation change:

```bash
curl -s https://api.surplusintelligence.ai/v1/providers \
  | jq '[.data[] | select(.trusted) | {id, name, host}]'
```

Replace the `providers` array in `trusted-providers.json` with that output (re-add the hand-maintained `aliases`) and bump `captured_at`. The two endpoints do not always agree: `/v1/providers` is the curated catalog (it also lists providers with no live offers, such as `typesafe`), while per-offer flags in `/api/markets/*` follow live routing, and `/api/marketplace` can lag behind both. When they disagree, the live offer flag is the one the badge reflects.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
