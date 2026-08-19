# surplus-filter

An Alpine.js multi-select component that fetches and selects AI models from the Surplus Intelligence API and finds the cheapest healthy offers for the selected models.

## What it does

- Loads the available models from `https://api.surplusintelligence.ai/v1/models` through the `api/proxy.js` Vercel Serverless Function (`/api/proxy?url=...`), using a localStorage cache (10-minute TTL) when fresh and otherwise fetching on load. The proxy restricts requests to the app's own origin (plus localhost for local development), only forwards the models list and `/api/markets/*` price endpoints, and adds Vercel Edge caching (`s-maxage=600`) to models responses. If the fetch fails for any reason (network error, proxy rejection, non-2xx response), the app gracefully falls back to the bundled `models.json` in the repo root so the UI keeps working; a footer notes how long ago the shown models were cached (or that the bundled local list is in use).
- Renders a searchable, multi-select dropdown where users can pick one or more models.
- Shows a loading state while the request is in flight and an empty state if no models are found or the request fails.
- Provides a **Search** button (enabled once one or more models are selected) that queries the market for each selected model and shows the cheapest healthy offer per model, sorted by price. Only one card is shown per model — its best (cheapest) offer — so the same model is never listed from multiple providers at once. Each result shows the model name and model id (with a copy-to-clipboard button), the total price, the input price (per 1M tokens), the output price (per 1M tokens), and the provider.
- Provides a **Clear** button (shown and enabled once one or more models are selected) that resets the selection.
- Provides a **Save** button (shown once one or more models are selected) that stores the current selection as a set in `localStorage`. Saved sets appear below the search box (above the provider filters), each listing its models with a **Load** button (which loads the set back into the multi-select) and a remove button. Sets persist across browser sessions and reloads.
- Shows provider filter checkboxes after a search; selecting one or more providers narrows the results to those providers and re-sorts the cards ascending by their active (selected-provider) price, so a card whose overall cheapest offer is from an unselected provider drops below a cheaper active one. Leaving all unchecked shows every result in the original price order.
- Supports keyboard interaction with the dropdown: pressing **Esc** closes it from anywhere, typing in the search box opens it even when closed, arrow keys move the highlight, and Enter selects the highlighted option (or the first when none is highlighted).
- Shows a loading state while searching, and an empty state ("No offers found.") when no healthy offers match the selected models.

## Files

- `index.html` — markup and Alpine.js directives for the multi-select UI, plus the PWA wiring (`manifest.json` link, `theme-color`, and `apple-touch-icon`).
- `code.js` — the `multiSelect` Alpine component (model fetching through the proxy with localStorage cache and local `models.json` fallback, filtering, selection state, and the price-search logic that queries `https://api.surplusintelligence.ai/api/markets/{id}` via the proxy).
- `api/proxy.js` — the Vercel Serverless Function that forwards the allowlisted Surplus Intelligence API requests (models list + `/api/markets/*` prices) with origin and target restrictions; run locally with `vercel dev` so `/api/proxy` is served alongside the static files.
- `models.json` — bundled fallback model list (same shape as the API response) used when the remote models fetch fails.
- `styles.css` — dark glassmorphism styling for the component.
- `manifest.json` — PWA web app manifest for installability (name, theme color, and the app icons).
- `icon.svg`, `icon-192.png`, `icon-512.png` — app icons referenced by `manifest.json` (the SVG plus 192×192 and 512×512 PNGs for installation).
- `icon-180.png` — 180×180 `apple-touch-icon` for iOS Safari home-screen bookmarks.

## Running locally

Open `index.html` in a browser (or serve the folder with any static file server). The model list is fetched from `https://api.surplusintelligence.ai/v1/models` through the `/api/proxy` function (run `vercel dev` locally to serve both the app and the function) and falls back to the bundled `models.json` when that fetch fails (e.g., offline or proxy unavailable); serving the folder over HTTP is recommended so the relative `models.json` fallback loads, since it won't via the `file://` protocol. Alpine.js is loaded from its CDN, so an internet connection is still required on first load.
