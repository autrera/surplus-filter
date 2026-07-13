# surplus-filter

An Alpine.js multi-select component that fetches and selects AI models from the Surplus Intelligence API.

## What it does

- Fetches the available models from `https://api.surplusintelligence.ai/v1/models` on load.
- Renders a searchable, multi-select dropdown where users can pick one or more models.
- Shows a loading state while the request is in flight and an empty state if no models are found or the request fails.

## Files

- `index.html` — markup and Alpine.js directives for the multi-select UI.
- `code.js` — the `multiSelect` Alpine component (fetch logic, filtering, selection state).
- `styles.css` — dark glassmorphism styling for the component.

## Running locally

Open `index.html` in a browser (or serve the folder with any static file server). Alpine.js is loaded from its CDN, so an internet connection is required to fetch models.
