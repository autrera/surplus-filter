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

        async init() {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                const res = await fetch('https://api.surplusintelligence.ai/v1/models', { signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                
                if (data && data.data && Array.isArray(data.data)) {
                    this.modelsData = data.data;
                    this.options = data.data
                        .map(model => model && model.name)
                        .filter(name => typeof name === 'string');
                }
            } catch (err) {
                console.error("Error fetching models:", err);
                this.options = [];
            } finally {
                clearTimeout(timeout);
                this.loading = false;
            }
        },

        get filteredOptions() {
            if (this.search === '') {
                return this.options;
            }
            return this.options.filter(option => 
                option.toLowerCase().includes(this.search.toLowerCase())
            );
        },

        toggleOption(option) {
            this.selected = this.selected.includes(option)
                ? this.selected.filter(i => i !== option)
                : [...this.selected, option];
            this.search = '';
            this.$refs.searchInput.focus();
        },

        removeOption(option) {
            this.selected = this.selected.filter(i => i !== option);
        },

        focusInput() {
            this.open = true;
            this.$refs.searchInput.focus();
        },

        async performSearch() {
            if (this.isSearching) return;
            if (this.selected.length === 0) return;
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
                        const bestOffer = healthyOffers[0];
                        
                        return {
                            name: modelName,
                            price: bestOffer.price_per_1m,
                            provider: bestOffer.provider || bestOffer.seller || 'Unknown',
                        };
                    } catch (e) {
                        return null;
                    }
                });
                
                let searchResults = await Promise.all(searchPromises);
                searchResults = searchResults.filter(r => r !== null);
                searchResults.sort((a, b) => a.price - b.price);
                this.results = searchResults;
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
                const first = this.filteredOptions[0];
                if (first) this.toggleOption(first);
                this.open = false;
            } else {
                this.performSearch();
            }
        }
    }));
});
