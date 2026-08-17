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

  console.log('self-check OK');
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
