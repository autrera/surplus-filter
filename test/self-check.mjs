// Regression self-check for the retry/backoff and dynamic-sort logic that
// lives (inline, Alpine) in code.js. Keeps the two non-trivial algorithms
// runnable without a browser. Run: node test/self-check.mjs

import { readFileSync } from 'node:fs';

// Mirrors _fetchWithRetry semantics: totalAttempts = backoff.length + 1, with
// exponential-ish backoff between attempts. Returns attempt count taken on
// success; throws after all attempts fail.
async function fetchWithRetry(failCount, backoff = [500, 1000, 1500]) {
  const totalAttempts = backoff.length + 1;
  let attempts = 0;
  let lastErr;
  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 0)); // backoff skipped in test
    attempts++;
    try {
      if (attempt < failCount) throw new Error('transient');
      return attempts;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Mirrors _sortResults: loaded(priced, ascending) -> loading -> unavailable.
function sortResults(cards) {
  const rank = s => (s === 'loaded' ? 0 : s === 'loading' ? 1 : 2);
  return cards.slice().sort((a, b) => {
    const ra = rank(a.status), rb = rank(b.status);
    if (ra !== rb) return ra - rb;
    const pa = a.status === 'loaded' && a.offers.length ? a.offers[0].price : Infinity;
    const pb = b.status === 'loaded' && b.offers.length ? b.offers[0].price : Infinity;
    return pa - pb;
  });
}

// Mirrors bestOffer: lowest offer among selected providers (offers pre-sorted ascending).
function bestOffer(result, selectedProviders) {
  if (!result || result.status !== 'loaded' || !result.offers || !result.offers.length) return null;
  let offers = result.offers;
  if (selectedProviders.length > 0) {
    offers = offers.filter(o => selectedProviders.includes(o.provider));
  }
  return offers[0] || null;
}

// Mirrors normalizeProviderKey: case-insensitive, punctuation and spacing ignored.
function normalizeProviderKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Mirrors loadTrustedProviders: flatten { providers: [{ id, name, aliases }] } into keys.
function trustedKeysFromFile(file) {
  const entries = Array.isArray(file) ? file : (file && Array.isArray(file.providers) ? file.providers : []);
  const keys = [];
  for (const entry of entries) {
    const values = typeof entry === 'string'
      ? [entry]
      : [entry.id, entry.name, ...(Array.isArray(entry.aliases) ? entry.aliases : [])];
    for (const value of values) {
      const key = normalizeProviderKey(value);
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

// Mirrors isTrustedProvider: a live offer flag wins, the JSON file is the fallback.
function isTrustedProvider(provider, providerTrust, trustedKeys) {
  const live = providerTrust[provider];
  if (typeof live === 'boolean') return live;
  return trustedKeys.includes(normalizeProviderKey(provider));
}

// Mirrors the trustedProviders getter plus selectTrustedProviders.
function trustedProviders(providers, providerTrust, trustedKeys) {
  return providers.filter(p => isTrustedProvider(p, providerTrust, trustedKeys));
}

// Mirrors the filteredResults getter: filter to loaded cards offering a selected
// provider, then re-sort ascending by the active (filtered) best-offer price.
function filteredResults(cards, selectedProviders) {
  let filtered = cards;
  if (selectedProviders.length > 0) {
    filtered = filtered.filter(r => {
      if (r.status !== 'loaded') return false;
      return r.offers.some(o => selectedProviders.includes(o.provider));
    });
    filtered.sort((a, b) => (bestOffer(a, selectedProviders)?.price ?? Infinity) - (bestOffer(b, selectedProviders)?.price ?? Infinity));
  }
  return filtered;
}

async function main() {
  // 1. Retry succeeds on the last allowed attempt (failCount = totalAttempts - 1).
  const got = await fetchWithRetry(3); // backoff.length=3 => totalAttempts=4
  if (got !== 4) throw new Error(`retry: expected 4 attempts, got ${got}`);

  // 2. Retry gives up after all attempts fail.
  let threw = false;
  try { await fetchWithRetry(99); } catch { threw = true; }
  if (!threw) throw new Error('retry: expected throw after exhausting attempts');

  // 3. Sort: loaded ascending by price, then loading, then unavailable.
  const cards = [
    { status: 'unavailable', offers: [] },
    { status: 'loaded', offers: [{ price: 500 }] },
    { status: 'loading', offers: [] },
    { status: 'loaded', offers: [{ price: 100 }] },
  ];
  const sorted = sortResults(cards).map(c => c.offers[0]?.price ?? c.status);
  const expected = [100, 500, 'loading', 'unavailable'];
  if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
    throw new Error(`sort: expected ${JSON.stringify(expected)}, got ${JSON.stringify(sorted)}`);
  }

  // 4. Provider-filtered results re-sort by active (selected-provider) price, not
  // the overall cheapest offer. A's overall cheapest (100) is provider P1; with only
  // P2 selected its active price is 900, so B (500) must now rank first.
  const providerCards = [
    { _key: 'a', status: 'loaded', offers: [{ price: 100, provider: 'P1' }, { price: 900, provider: 'P2' }] },
    { _key: 'b', status: 'loaded', offers: [{ price: 500, provider: 'P2' }] },
    { _key: 'c', status: 'loading', offers: [] },
    { _key: 'd', status: 'loaded', offers: [{ price: 50, provider: 'P3' }] },
  ];
  const active = filteredResults(providerCards, ['P2']).map(c => c._key);
  if (JSON.stringify(active) !== JSON.stringify(['b', 'a'])) {
    throw new Error(`filtered sort: expected ["b","a"], got ${JSON.stringify(active)}`);
  }

  // 5. No provider selected: order passes through unchanged (base sort governs).
  const unfiltered = filteredResults(providerCards, []).map(c => c._key);
  if (JSON.stringify(unfiltered) !== JSON.stringify(['a', 'b', 'c', 'd'])) {
    throw new Error(`unfiltered passthrough: expected ["a","b","c","d"], got ${JSON.stringify(unfiltered)}`);
  }

  // 6. Trusted resolution: the bundled JSON file is a valid fallback source.
  const trustedFile = JSON.parse(readFileSync(new URL('../trusted-providers.json', import.meta.url), 'utf8'));
  if (!Array.isArray(trustedFile.providers) || trustedFile.providers.length === 0) {
    throw new Error('trusted-providers.json: expected a non-empty providers array');
  }
  for (const entry of trustedFile.providers) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      throw new Error(`trusted-providers.json: invalid entry ${JSON.stringify(entry)}`);
    }
    if (entry.aliases !== undefined && !Array.isArray(entry.aliases)) {
      throw new Error(`trusted-providers.json: aliases must be an array on ${entry.id}`);
    }
  }
  const fileKeys = trustedKeysFromFile(trustedFile);
  if (!fileKeys.includes('zai') || !fileKeys.includes('engy') || !fileKeys.includes('google')) {
    throw new Error(`trusted keys: expected zai, engy (alias), google (alias), got ${JSON.stringify(fileKeys)}`);
  }

  // 7. A live offer flag wins over the file, in both directions.
  const trust = { OpenRouter: true, Snowflake: false };
  const providers = ['OpenRouter', 'Snowflake', 'Engy', 'Uncensored AI'];
  // "Engy" only matches through the file alias; "Uncensored AI" matches by name.
  const selected = trustedProviders(providers, trust, fileKeys);
  if (JSON.stringify(selected) !== JSON.stringify(['OpenRouter', 'Engy', 'Uncensored AI'])) {
    throw new Error(`trusted providers: expected ["OpenRouter","Engy","Uncensored AI"], got ${JSON.stringify(selected)}`);
  }

  // 8. No live flags at all: the file alone drives the selection, and unknown
  // providers stay untrusted.
  const fileOnly = trustedProviders(['Z.ai', 'InferHub', 'OpenAI'], {}, fileKeys);
  if (JSON.stringify(fileOnly) !== JSON.stringify(['Z.ai', 'OpenAI'])) {
    throw new Error(`file-only trusted providers: expected ["Z.ai","OpenAI"], got ${JSON.stringify(fileOnly)}`);
  }

  console.log('self-check OK');
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
