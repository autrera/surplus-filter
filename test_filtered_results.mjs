// Test that exercises the REAL code.js `filteredResults` getter using the exact
// data shape produced by performSearch() (one entry per model/provider, sorted
// by price ascending). Demonstrates the user intent: "Show only one card per
// model with the best offer."
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, 'code.js'), 'utf8');

// Capture the Alpine component factory by mocking the globals code.js needs.
let capturedFactory = null;
let initCallback = null;
const sandbox = {
  document: { addEventListener: (_ev, cb) => { initCallback = cb; } },
  Alpine: { data: (name, factory) => { capturedFactory = factory; } },
  console,
  setTimeout,
  clearTimeout,
  AbortController,
  fetch: async () => { throw new Error('no network in test'); },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
// Fire the alpine:init callback so the component factory is registered.
if (initCallback) initCallback();

if (!capturedFactory) {
  console.error('FAIL: component factory was not captured from code.js');
  process.exit(1);
}

const component = capturedFactory();

// --- Realistic performSearch() output -------------------------------------
// Two models, GPT-4o offered by two providers (best offer per provider kept),
// Claude-3 by one provider. Sorted overall by price ascending.
component.results = [
  { name: 'GPT-4o',   price: 3.5, input_price: 2.5, output_price: 4.5, provider: 'ProviderB' },
  { name: 'GPT-4o',   price: 5.0, input_price: 4.0, output_price: 6.0, provider: 'ProviderA' },
  { name: 'Claude-3', price: 7.0, input_price: 6.0, output_price: 8.0, provider: 'ProviderC' },
];
component.providers = ['ProviderA', 'ProviderB', 'ProviderC'];
component.selectedProviders = [];

// Import shared assertion helpers.
function assert(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1); }
  console.log('PASS: ' + msg);
}

// 1. No provider filter: exactly one card per model, cheapest (best) kept.
const r1 = component.filteredResults;
assert(r1.length === 2, 'only one card per model when no providers selected (got ' + r1.length + ')');
assert(r1[0].name === 'GPT-4o' && r1[0].provider === 'ProviderB',
  'GPT-4o card shows the best (cheapest) offer from ProviderB, not ProviderA');
assert(r1[1].name === 'Claude-3', 'Claude-3 card present');
assert(!r1.some(r => r.name === 'GPT-4o' && r.provider === 'ProviderA'),
  'the more expensive GPT-4o/ProviderA duplicate card is removed');

// 2. Provider filter to a single (non-best) provider: still one card per model.
component.selectedProviders = ['ProviderA'];
const r2 = component.filteredResults;
assert(r2.length === 1, 'provider filter yields one card (got ' + r2.length + ')');
assert(r2[0].name === 'GPT-4o' && r2[0].provider === 'ProviderA',
  'within the selected provider, the single remaining GPT-4o offer is shown');

// 3. Provider filter to best provider: still one card per model, now includes Claude-3.
component.selectedProviders = ['ProviderB', 'ProviderC'];
const r3 = component.filteredResults;
assert(r3.length === 2, 'two providers selected -> two cards, one per model (got ' + r3.length + ')');
assert(r3[0].name === 'GPT-4o' && r3[0].provider === 'ProviderB', 'best GPT-4o offer retained');
assert(r3[1].name === 'Claude-3', 'Claude-3 retained when its provider is selected');

// 4. Empty results.
component.selectedProviders = [];
component.results = [];
assert(component.filteredResults.length === 0, 'empty results yield no cards');

console.log('\nALL TESTS PASSED');
