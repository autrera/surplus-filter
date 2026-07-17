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
        cacheAgeMessage: null,

        get filteredResults() {
            let filtered = this.results;
            if (this.selectedProviders.length > 0) {
                filtered = filtered.filter(r => this.selectedProviders.includes(r.provider));
            }
            const finalResults = [];
            const seenModels = new Set();
            for (const r of filtered) {
                if (!seenModels.has(r.name)) {
                    seenModels.add(r.name);
                    finalResults.push(r);
                }
            }
            return finalResults;
        },

        async init() {
            try {
                const storedSelected = sessionStorage.getItem('surplus_selected_models');
                if (storedSelected) {
                    this.selected = JSON.parse(storedSelected);
                }
            } catch (e) {
                console.warn('Failed to load selected models from sessionStorage', e);
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            this.$watch('search', () => {
                if (this.highlightedIndex >= this.filteredOptions.length) {
                    this.highlightedIndex = -1;
                }
            });

            const cacheKey = 'surplus_models_cache';
            const cacheTimeKey = 'surplus_models_cache_time';
            const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

            let cachedData = null;
            let cacheTime = null;
            try {
                cachedData = localStorage.getItem(cacheKey);
                cacheTime = localStorage.getItem(cacheTimeKey);
            } catch (e) {
                console.warn('localStorage is unavailable; skipping cache read.', e);
            }
            const now = Date.now();

            if (cachedData && cacheTime && (now - parseInt(cacheTime, 10)) < CACHE_DURATION) {
                try {
                    const data = JSON.parse(cachedData);
                    if (!(data && data.data && Array.isArray(data.data))) {
                        throw new Error('Cached models data is missing or not an array.');
                    }
                    this.modelsData = data.data;
                    this.options = data.data
                        .map(model => model && model.name)
                        .filter(name => typeof name === 'string');
                    
                    const ageMinutes = Math.floor((now - parseInt(cacheTime, 10)) / 60000);
                    this.cacheAgeMessage = this.formatCacheAge(ageMinutes);
                    this.loading = false;
                    clearTimeout(timeout);
                    return;
                } catch (e) {
                    console.error("Failed to load cached models:", e);
                }
            }

            try {
                const res = await fetch('https://api.surplusintelligence.ai/v1/models', { signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                
                if (data && data.data && Array.isArray(data.data)) {
                    this.modelsData = data.data;
                    this.options = data.data
                        .map(model => model && model.name)
                        .filter(name => typeof name === 'string');
                    this.cacheAgeMessage = this.formatCacheAge(0);

                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(data));
                        localStorage.setItem(cacheTimeKey, now.toString());
                    } catch (e) {
                        console.warn('localStorage is unavailable; skipping cache write.', e);
                    }
                }
            } catch (err) {
                console.error("Error fetching models:", err);
                this.options = [];
            } finally {
                clearTimeout(timeout);
                this.loading = false;
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
            this.selected = this.selected.includes(option)
                ? this.selected.filter(i => i !== option)
                : [...this.selected, option];
            this.search = '';
            this.$refs.searchInput.focus();
        },

        toggleProvider(provider) {
            this.selectedProviders = this.selectedProviders.includes(provider)
                ? this.selectedProviders.filter(p => p !== provider)
                : [...this.selectedProviders, provider];
        },

        removeOption(option) {
            this.selected = this.selected.filter(i => i !== option);
        },

        clearSelected() {
            this.selected = [];
            try {
                sessionStorage.removeItem('surplus_selected_models');
            } catch (e) {}
        },

        focusInput() {
            this.open = true;
            this.$refs.searchInput.focus();
        },

        async performSearch() {
            if (this.isSearching) return;
            if (this.selected.length === 0) return;
            
            try {
                sessionStorage.setItem('surplus_selected_models', JSON.stringify(this.selected));
            } catch (e) {
                console.warn('Failed to save selected models to sessionStorage', e);
            }

            this.isSearching = true;
            this.searchComplete = false;
            this.results = [];
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                const searchPromises = this.selected.map(async (modelName) => {
                    const modelObj = this.modelsData.find(m => m.name === modelName);
                    if (!modelObj) return null;
                    
                    try {
                        const res = await fetch(`https://api.surplusintelligence.ai/api/markets/${modelObj.id}`, { signal: controller.signal });
                        if (!res.ok) return null;
                        const data = await res.json();
                        const healthyOffers = data.offers.filter(o => o.healthy === true);
                        if (healthyOffers.length === 0) return null;
                        
                        healthyOffers.sort((a, b) => a.price_per_1m - b.price_per_1m);
                        
                        return healthyOffers.map(bestOffer => ({
                            name: modelName,
                            id: modelObj.id,
                            price: bestOffer.price_per_1m,
                            input_price: bestOffer.effective_input_per_1m,
                            output_price: bestOffer.effective_output_per_1m,
                            provider: bestOffer.provider || bestOffer.seller || 'Unknown',
                        }));
                    } catch (e) {
                        return null;
                    }
                });
                
                let searchResults = await Promise.all(searchPromises);
                searchResults = searchResults.filter(r => r !== null).flat();
                
                // Keep only the best offer per model per provider
                const uniqueResults = [];
                const seen = new Set();
                for (const r of searchResults) {
                    const key = `${r.name}-${r.provider}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueResults.push(r);
                    }
                }
                searchResults = uniqueResults;
                
                searchResults.sort((a, b) => a.price - b.price);
                this.results = searchResults;
                
                const uniqueProviders = new Set(this.results.map(r => r.provider));
                this.providers = Array.from(uniqueProviders).sort();
                // Filter out selectedProviders that are no longer in the results
                this.selectedProviders = this.selectedProviders.filter(p => this.providers.includes(p));
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                clearTimeout(timeout);
                this.isSearching = false;
                this.searchComplete = true;
            }
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
        }
    }));
});
