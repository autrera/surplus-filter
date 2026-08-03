/**
 * Restricted Vercel Serverless Function proxy for surplus-filter.
 *
 * Forwards a small, strictly allowlisted set of Surplus Intelligence API requests
 * on behalf of the browser app, which would otherwise be blocked by CORS.
 *
 * Security model:
 *  - Origin allowlist: requests with no Origin header (same-origin fetches from the
 *    app itself, or non-browser clients) and requests whose Origin matches the
 *    allowlist are served. All other browser origins are rejected with 403.
 *  - Target allowlist: only the models list URL(s) and `/api/markets/*` price
 *    endpoints are forwarded; anything else is rejected with 400.
 *  - Models list responses carry Vercel Edge cache headers (10-minute s-maxage,
 *    stale-while-revalidate) so the CDN caches the models list server-side.
 */

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/humble-surplus-filter\.vercel\.app$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];

const ALLOWED_TARGET_PATTERNS = [
  // Models list endpoint(s).
  /^https:\/\/api\.surplusintelligence\.ai\/v1\/models$/,
  /^https:\/\/api\.surplusintelligence\.ai\/api\/models$/,
  // Price endpoints under the markets base URL.
  /^https:\/\/api\.surplusintelligence\.ai\/api\/markets\//,
];

const MODELS_CACHE_CONTROL = 's-maxage=600, stale-while-revalidate=300';
const PRICES_CACHE_CONTROL = 'no-store';
const REQUEST_TIMEOUT_MS = 10000;

// Exact models endpoints (anchored, matching the normalized URL) so that only
// the models list is classified as edge-cacheable and priced/generic markets
// requests are never mislabelled as models responses.
const MODELS_TARGET_PATTERN =
  /^https:\/\/api\.surplusintelligence\.ai\/(?:v1|api)\/models$/;

function originAllowed(req) {
  const origin = req.headers.origin;
  // Same-origin fetches from the app itself and non-browser clients carry no
  // Origin header; they are allowed. Cross-origin browser requests must match
  // the allowlist (the app origin or local development origins).
  if (!origin) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

// Normalizes (dot segments, default ports, etc.) so validation matches exactly
// what fetch() will request; unparseable URLs are rejected with `null`.
function normalizeTarget(targetUrl) {
  if (typeof targetUrl !== 'string' || targetUrl.length === 0) return null;
  try {
    return new URL(targetUrl).href;
  } catch (err) {
    return null;
  }
}

function targetAllowed(normalized) {
  return ALLOWED_TARGET_PATTERNS.some((re) => re.test(normalized));
}

module.exports = async (req, res) => {
  // The app only issues GET requests through the proxy.
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Origin restriction.
  if (!originAllowed(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  // Target URL restriction. Normalize once and reuse the result for both the
  // allowlist check and the cache-branch classification so they never disagree.
  const targetUrl = normalizeTarget(req.query.url);
  if (!targetUrl || !targetAllowed(targetUrl)) {
    res.status(400).send('Bad Request');
    return;
  }

  const isModelsRequest = MODELS_TARGET_PATTERN.test(targetUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, { signal: controller.signal });
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json'
    );
    res.setHeader('Cache-Control', isModelsRequest ? MODELS_CACHE_CONTROL : PRICES_CACHE_CONTROL);
    // Key the edge cache by request origin so the origin restriction applies on
    // cache hits too, not only when the function runs.
    if (isModelsRequest) res.setHeader('Vary', 'Origin');

    res.send(body);
  } catch (err) {
    // Any upstream failure surfaces as a gateway error; the client falls back to
    // its bundled local models.json when the models request fails.
    res.status(502).send('Bad Gateway');
  } finally {
    clearTimeout(timeout);
  }
};
