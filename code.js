const MODELS_CACHE_KEY = 'surplus_models_cache';
const MODELS_CACHE_TIME_KEY = 'surplus_models_cache_time';
const MODELS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const MODELS_API_URL = 'https://api.surplusintelligence.ai/v1/models';
const MODELS_LOCAL_FALLBACK = 'models.json';
const PROXY_ENDPOINT = '/api/proxy'; // Vercel Serverless Function that forwards the Surplus API requests (CORS workaround)

function proxyUrl(targetUrl) {
    return `${PROXY_ENDPOINT}?url=${encodeURIComponent(targetUrl)}`;
}

const FALLBACK_CACHE_MESSAGE = 'Showing bundled local model list (remote fetch unavailable)';

document.addEventListener('alpine:init', () => {
    Alpine.data('multiSelect', () => ({
        options: [],
        selected: [],
        modelsData: [],
        results: [],
        searchComplete: false,
        isSearching: false,
        search: '',
        open: false,
        loading: true,
        highlightedIndex: -1,
        providers: [],
        selectedProviders: [],
        savedSets: [],
        cacheAgeMessage: null,

        get filteredResults() {
            let filtered = this.results;
            if (this.selectedProviders.length > 0) {
                // A card matches only if it has loaded and offers at least one selected provider.
                filtered = filtered.filter(r => {
                    if (r.status !== 'loaded') return false;
                    return r.offers.some(o => this.selectedProviders.includes(o.provider));
                });
            }
            return filtered;
        },

        bestOffer(result) {
            if (!result || result.status !== 'loaded' || !result.offers || !result.offers.length) return null;
            let offers = result.offers;
            if (this.selectedProviders.length > 0) {
                offers = offers.filter(o => this.selectedProviders.includes(o.provider));
            }
            return offers[0] || null;
        },

        async init() {
            try {
                const storedSets = localStorage.getItem('surplus_saved_sets');
                if (storedSets) {
                    const parsed = JSON.parse(storedSets);
                    if (Array.isArray(parsed)) {
                        const validSets = parsed.filter(s => 
                            Array.isArray(s) && s.every(m => typeof m === 'string' || (m && typeof m === 'object' && typeof m.id === 'string'))
                        );
                        this.savedSets = validSets;
                    }
                }
            } catch (e) {
                console.warn('Failed to load saved sets from localStorage', e);
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            this.$watch('search', () => {
                if (this.highlightedIndex >= this.filteredOptions.length) {
                    this.highlightedIndex = -1;
                }
            });

            let cachedData = null;
            let cacheTime = null;
            try {
                cachedData = localStorage.getItem(MODELS_CACHE_KEY);
                cacheTime = localStorage.getItem(MODELS_CACHE_TIME_KEY);
            } catch (e) {
                console.warn('localStorage is unavailable; skipping cache read.', e);
            }
            const now = Date.now();

            if (cachedData && cacheTime && (now - parseInt(cacheTime, 10)) < MODELS_CACHE_DURATION) {
                try {
                    const data = JSON.parse(cachedData);
                    if (!(data && data.data && Array.isArray(data.data))) {
                        throw new Error('Cached models data is missing or not an array.');
                    }
                    this.applyModelsData(data, null);
                    const ageMinutes = Math.floor((now - parseInt(cacheTime, 10)) / 60000);
                    this.cacheAgeMessage = this.formatCacheAge(ageMinutes);
                    this.loading = false;
                    clearTimeout(timeout);
                    return;
                } catch (e) {
                    console.error("Failed to load cached models:", e);
                }
            }

            // Try the remote API through the proxy. If it fails for any reason (network error,
            // proxy rejection, non-2xx response, malformed payload), gracefully fall back
            // to the bundled local models.json so the UI keeps working.
            try {
                const res = await fetch(proxyUrl(MODELS_API_URL), { signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                this.applyModelsData(data, now);
            } catch (err) {
                console.error("Error fetching models from remote API; falling back to local models.json:", err);
                await this.loadLocalModelsFallback();
            } finally {
                clearTimeout(timeout);
                this.loading = false;
            }
        },

        applyModelsData(data, cacheWriteTime) {
            if (!(data && data.data && Array.isArray(data.data))) {
                throw new Error('Models data is missing or not an array.');
            }
            this.modelsData = data.data;
            this.options = data.data
                .map(model => model && model.name)
                .filter(name => typeof name === 'string');
            this.cacheAgeMessage = this.formatCacheAge(0);

            // Update any legacy string selections to objects if modelsData is now available
            if (this.selected.length > 0) {
                this.selected = this.selected.map(item => {
                    if (typeof item === 'string') {
                        const found = this.modelsData.find(m => m.name === item || m.id === item);
                        if (found) {
                            return { id: found.id, name: found.name };
                        }
                    }
                    return item;
                });
            }

            this.migrateSavedSets();

            if (cacheWriteTime !== null && cacheWriteTime !== undefined) {
                try {
                    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(data));
                    localStorage.setItem(MODELS_CACHE_TIME_KEY, String(cacheWriteTime));
                } catch (e) {
                    console.warn('localStorage is unavailable; skipping cache write.', e);
                }
            }
        },

        migrateSavedSets() {
            if (!this.savedSets || this.savedSets.length === 0) return;
            let updated = false;
            this.savedSets = this.savedSets.map(set => {
                return set.map(item => {
                    if (typeof item === 'string') {
                        const found = this.modelsData.find(m => m.name === item || m.id === item);
                        if (found) {
                            updated = true;
                            return { id: found.id, name: found.name };
                        }
                    }
                    return item;
                });
            });
            if (updated) {
                this.persistSets();
            }
        },

        getModelName(item) {
            if (!item) return '';
            if (typeof item === 'object') return item.name || item.id || '';
            return item;
        },

        getModelKey(item) {
            if (!item) return '';
            if (typeof item === 'object') return item.id || item.name || '';
            return item;
        },

        isSelected(option) {
            return this.selected.some(item => {
                if (typeof item === 'object' && item !== null) {
                    return item.name === option || item.id === option;
                }
                return item === option;
            });
        },

        async loadLocalModelsFallback() {
            try {
                const res = await fetch(MODELS_LOCAL_FALLBACK);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                // Do not cache the fallback data so a stale local list never hides a
                // recovery of the live remote API. Mark the source in the footer instead.
                this.applyModelsData(data, null);
                this.cacheAgeMessage = FALLBACK_CACHE_MESSAGE;
            } catch (e) {
                console.error("Error fetching local models.json:", e);
                this.options = [];
            }
        },

        formatCacheAge(ageMinutes) {
            if (ageMinutes <= 0) {
                return 'Showing data cached from Less than 1 minute ago';
            }
            return `Showing data cached from ${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago`;
        },

        get filteredOptions() {
            let opts = this.options;
            if (this.search !== '') {
                opts = this.options.filter(option => 
                    option.toLowerCase().includes(this.search.toLowerCase())
                );
            }
            return opts;
        },

        highlightNext() {
            if (!this.open) {
                this.open = true;
                return;
            }
            if (this.highlightedIndex < this.filteredOptions.length - 1) {
                this.highlightedIndex++;
            }
        },

        highlightPrev() {
            if (this.highlightedIndex > 0) {
                this.highlightedIndex--;
            }
        },

        toggleOption(option) {
            if (this.isSelected(option)) {
                this.removeOption(option);
            } else {
                const modelObj = this.modelsData.find(m => m.name === option || m.id === option);
                if (modelObj) {
                    this.selected = [...this.selected, { id: modelObj.id, name: modelObj.name }];
                } else {
                    this.selected = [...this.selected, { id: option, name: option }];
                }
            }
            this.search = '';
            if (this.$refs && this.$refs.searchInput) {
                this.$refs.searchInput.focus();
            }
        },

        toggleProvider(provider) {
            this.selectedProviders = this.selectedProviders.includes(provider)
                ? this.selectedProviders.filter(p => p !== provider)
                : [...this.selectedProviders, provider];
        },

        removeOption(option) {
            const targetName = this.getModelName(option);
            const targetId = typeof option === 'object' && option !== null ? option.id : null;
            this.selected = this.selected.filter(s => {
                if (targetId && typeof s === 'object' && s !== null && s.id) {
                    return s.id !== targetId;
                }
                return this.getModelName(s) !== targetName;
            });
        },

        clearSelected() {
            this.selected = [];
        },

        focusInput() {
            this.open = true;
            this.$refs.searchInput.focus();
        },

        async performSearch() {
            if (this.isSearching) return;
            if (this.selected.length === 0) return;

            // If models request is still loading and some selected models lack an explicit ID,
            // wait briefly for loading to finish so we can resolve the model ID from modelsData.
            if (this.loading) {
                const hasMissingId = this.selected.some(item => typeof item === 'string' || !(item && typeof item === 'object' && item.id));
                if (hasMissingId) {
                    let waitCount = 0;
                    while (this.loading && waitCount < 50) {
                        await new Promise(r => setTimeout(r, 100));
                        waitCount++;
                    }
                }
            }

            this.isSearching = true;
            this.searchComplete = false;
            this.results = [];
            this.providers = [];
            this.selectedProviders = [];

            // Resolve each selected item to a stable model id/name.
            const cards = this.selected.map(item => {
                let modelId = typeof item === 'object' && item !== null ? item.id : null;
                let modelName = typeof item === 'object' && item !== null ? (item.name || item.id) : item;

                if (!modelId && this.modelsData.length > 0) {
                    const modelObj = this.modelsData.find(m => m.name === modelName || m.id === modelName);
                    if (modelObj) {
                        modelId = modelObj.id;
                        modelName = modelObj.name;
                    }
                }
                if (!modelId) {
                    modelId = modelName;
                }
                return { _key: modelId, name: modelName, id: modelId, status: 'loading', offers: [] };
            });

            // Show every selected model immediately as a loading card.
            this.results = cards;

            // Fetch each model independently so cards resolve progressively.
            await Promise.all(cards.map(card => this._fetchCard(card)));

            this.isSearching = false;
            this.searchComplete = true;
        },

        _sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // Fetch a market URL with per-attempt timeout and up to 3 retries with
        // progressive backoff (500ms, 1000ms, 1500ms). A hanging request aborts
        // after the per-attempt timeout so it never blocks the rest of the UI.
        async _fetchWithRetry(targetUrl) {
            const backoff = [500, 1000, 1500];
            const totalAttempts = backoff.length + 1; // initial try + 3 retries
            let lastErr;
            for (let attempt = 0; attempt < totalAttempts; attempt++) {
                if (attempt > 0) await this._sleep(backoff[attempt - 1]);
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);
                    try {
                        const res = await fetch(proxyUrl(targetUrl), { signal: controller.signal });
                        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                        return await res.json();
                    } finally {
                        clearTimeout(timeout);
                    }
                } catch (e) {
                    lastErr = e;
                }
            }
            throw lastErr;
        },

        // Fetch price data for one card, then update its state and re-sort by price.
        async _fetchCard(card) {
            let parsed = null;
            try {
                parsed = await this._fetchWithRetry(`https://api.surplusintelligence.ai/api/markets/${card.id}`);
            } catch (err) {
                console.warn('Failed to fetch prices for', card.name, err);
            }

            if (parsed && Array.isArray(parsed.offers)) {
                const healthyOffers = parsed.offers.filter(o => o.available === true && o.healthy === true);
                if (healthyOffers.length > 0) {
                    healthyOffers.sort((a, b) => a.price_per_1m - b.price_per_1m);
                    const offers = healthyOffers.map(o => ({
                        price: o.price_per_1m,
                        input_price: o.effective_input_per_1m,
                        output_price: o.effective_output_per_1m,
                        provider: o.provider || o.seller || 'Unknown',
                    }));
                    this._updateCard(card, 'loaded', offers);
                    return;
                }
            }
            this._updateCard(card, 'unavailable', []);
        },

        // Apply a card's resolved state, re-sort by price, and refresh provider filters.
        _updateCard(card, status, offers) {
            const idx = this.results.findIndex(c => c._key === card._key);
            if (idx === -1) return;
            this.results.splice(idx, 1, { ...this.results[idx], status, offers });
            this.results = this.results.slice(); // force Alpine reactivity reflow
            this._sortResults();
            this._updateProviders();
        },

        // Loaded (priced) cards first ascending by price, then loading, then unavailable.
        _sortResults() {
            const rank = s => (s === 'loaded' ? 0 : s === 'loading' ? 1 : 2);
            this.results.sort((a, b) => {
                const ra = rank(a.status);
                const rb = rank(b.status);
                if (ra !== rb) return ra - rb;
                const pa = a.status === 'loaded' && a.offers.length ? a.offers[0].price : Infinity;
                const pb = b.status === 'loaded' && b.offers.length ? b.offers[0].price : Infinity;
                return pa - pb;
            });
        },

        // Rebuild provider filter tags from offers that have resolved so far.
        _updateProviders() {
            const unique = new Set();
            for (const c of this.results) {
                if (c.status === 'loaded') {
                    for (const o of c.offers) unique.add(o.provider);
                }
            }
            const next = Array.from(unique).sort();
            this.providers = next;
            this.selectedProviders = this.selectedProviders.filter(p => next.includes(p));
        },

        handleEnter() {
            if (this.open) {
                if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredOptions.length) {
                    this.toggleOption(this.filteredOptions[this.highlightedIndex]);
                } else {
                    const first = this.filteredOptions[0];
                    if (first) this.toggleOption(first);
                }
                this.open = false;
            } else {
                this.performSearch();
            }
        },

        formatPrice(price) {
            if (price === undefined || price === null) return 'N/A';
            return '$' + (price / 1000000).toFixed(4);
        },

        async copyToClipboard(text, event) {
            const btn = event && event.currentTarget;
            if (!text) return;
            let success = false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    success = true;
                }
            } catch (err) {
                console.error("Failed to copy via clipboard API:", err);
            }
            if (!success) {
                success = this.fallbackCopy(text);
            }
            if (success) this.showCopyFeedback(btn);
        },

        fallbackCopy(text) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(textarea);
                return ok;
            } catch (err) {
                console.error("Fallback copy failed:", err);
                return false;
            }
        },

        showCopyFeedback(btn) {
            if (!btn) return;
            const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            if (btn._copyTimer) clearTimeout(btn._copyTimer);
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            btn._copyTimer = setTimeout(() => { btn._copyTimer = null; btn.innerHTML = COPY_ICON; }, 1500);
        },

        saveCurrentSet() {
            if (this.selected.length === 0) return;
            const setToSave = this.selected.map(item => {
                if (typeof item === 'object' && item !== null && item.id && item.name) {
                    return { id: item.id, name: item.name };
                }
                const name = this.getModelName(item);
                const modelObj = this.modelsData.find(m => m.name === name || m.id === name);
                if (modelObj) {
                    return { id: modelObj.id, name: modelObj.name };
                }
                return { id: name, name: name };
            });

            const isDuplicate = this.savedSets.some(set => {
                if (set.length !== setToSave.length) return false;
                return setToSave.every(item => 
                    set.some(s => {
                        const sId = typeof s === 'object' && s !== null ? s.id : s;
                        const sName = typeof s === 'object' && s !== null ? s.name : s;
                        return sId === item.id || sName === item.name;
                    })
                );
            });

            if (!isDuplicate) {
                this.savedSets.push(setToSave);
                this.persistSets();
            }
        },

        removeSet(index) {
            this.savedSets.splice(index, 1);
            this.persistSets();
        },

        loadSet(set) {
            this.selected = set.map(item => {
                if (typeof item === 'object' && item !== null && item.id) {
                    return { id: item.id, name: item.name || item.id };
                }
                if (typeof item === 'string') {
                    if (this.modelsData.length > 0) {
                        const found = this.modelsData.find(m => m.name === item || m.id === item);
                        if (found) {
                            return { id: found.id, name: found.name };
                        }
                    }
                    return { id: item, name: item };
                }
                return item;
            });
        },

        persistSets() {
            try {
                localStorage.setItem('surplus_saved_sets', JSON.stringify(this.savedSets));
            } catch (e) {
                console.warn('Failed to save sets to localStorage', e);
            }
        }
    }));
});
