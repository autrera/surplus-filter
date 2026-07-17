# surplus-filter

An Alpine.js multi-select component that fetches and selects AI models from the Surplus Intelligence API and finds the cheapest healthy offers for the selected models.

## What it does

- Loads the available models from `https://api.surplusintelligence.ai/v1/models`, using a localStorage cache (10-minute TTL) when fresh and otherwise fetching on load. A footer notes how long ago the shown models were cached.
- Renders a searchable, multi-select dropdown where users can pick one or more models.
- Shows a loading state while the request is in flight and an empty state if no models are found or the request fails.
- Provides a **Search** button (enabled once one or more models are selected) that queries the market for each selected model and shows the cheapest healthy offer per model, sorted by price. Only one card is shown per model — its best (cheapest) offer — so the same model is never listed from multiple providers at once. Each result shows the model name and model id (with a copy-to-clipboard button), the total price, the input price (per 1M tokens), the output price (per 1M tokens), and the provider.
- Provides a **Clear** button (shown and enabled once one or more models are selected) that resets the selection.
- Persists the selected models in `sessionStorage` on search, so reloading the page within the same browser session restores the selection.
- Shows provider filter checkboxes after a search; selecting one or more providers narrows the results to those providers, while leaving all unchecked shows every result.
- Supports keyboard interaction with the dropdown: pressing **Esc** closes it from anywhere, typing in the search box opens it even when closed, arrow keys move the highlight, and Enter selects the highlighted option (or the first when none is highlighted).
- Shows a loading state while searching, and an empty state ("No offers found.") when no healthy offers match the selected models.

## Files

- `index.html` — markup and Alpine.js directives for the multi-select UI, plus the PWA wiring (`manifest.json` link, `theme-color`, and `apple-touch-icon`).
- `code.js` — the `multiSelect` Alpine component (model fetching, filtering, selection state, and the price-search logic that queries `https://api.surplusintelligence.ai/api/markets/{id}`).
- `styles.css` — dark glassmorphism styling for the component.
- `manifest.json` — PWA web app manifest for installability (name, theme color, and the app icons).
- `icon.svg`, `icon-192.png`, `icon-512.png` — app icons referenced by `manifest.json` (the SVG plus 192×192 and 512×512 PNGs for installation).
- `icon-180.png` — 180×180 `apple-touch-icon` for iOS Safari home-screen bookmarks.

## Running locally

Open `index.html` in a browser (or serve the folder with any static file server). Alpine.js is loaded from its CDN, so an internet connection is required on first load (and whenever the models cache is stale) to fetch models.
