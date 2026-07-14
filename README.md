# surplus-filter

An Alpine.js multi-select component that fetches and selects AI models from the Surplus Intelligence API and finds the cheapest healthy offers for the selected models.

## What it does

- Fetches the available models from `https://api.surplusintelligence.ai/v1/models` on load.
- Renders a searchable, multi-select dropdown where users can pick one or more models.
- Shows a loading state while the request is in flight and an empty state if no models are found or the request fails.
- Provides a **Search** button (enabled once one or more models are selected) that queries the market for each selected model and shows the cheapest healthy offer per model, sorted by price. Only one card is shown per model — its best (cheapest) offer — so the same model is never listed from multiple providers at once. Each result shows the model name, the total price, the input price (per 1M tokens), the output price (per 1M tokens), and the provider.
- Shows provider filter checkboxes after a search; selecting one or more providers narrows the results to those providers, while leaving all unchecked shows every result.
- Supports keyboard navigation in the dropdown: arrow keys move the highlight, and Enter selects the highlighted option (or the first when none is highlighted).
- Shows a loading state while searching, and an empty state ("No offers found.") when no healthy offers match the selected models.

## Files

- `index.html` — markup and Alpine.js directives for the multi-select UI.
- `code.js` — the `multiSelect` Alpine component (model fetching, filtering, selection state, and the price-search logic that queries `https://api.surplusintelligence.ai/api/markets/{id}`).
- `styles.css` — dark glassmorphism styling for the component.

## Running locally

Open `index.html` in a browser (or serve the folder with any static file server). Alpine.js is loaded from its CDN, so an internet connection is required to fetch models.
