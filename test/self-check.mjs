// Regression self-check for the retry/backoff and dynamic-sort logic that
// lives (inline, Alpine) in code.js. Keeps the two non-trivial algorithms
// runnable without a browser. Run: node test/self-check.mjs

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

  console.log('self-check OK');
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
