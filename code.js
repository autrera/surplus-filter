document.addEventListener('alpine:init', () => {
    Alpine.data('multiSelect', () => ({
        options: [],
        selected: [],
        search: '',
        open: false,
        loading: true,

        async init() {
            try {
                const res = await fetch('https://api.surplusintelligence.ai/v1/models');
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                
                if (data && data.data && Array.isArray(data.data)) {
                    this.options = data.data.map(model => model.name);
                }
            } catch (err) {
                console.error("Error fetching models:", err);
                this.options = [];
            } finally {
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
            if (this.selected.includes(option)) {
                this.selected = this.selected.filter(i => i !== option);
            } else {
                this.selected.push(option);
            }
            this.search = '';
            this.$refs.searchInput.focus();
        },

        removeOption(option) {
            this.selected = this.selected.filter(i => i !== option);
        },

        focusInput() {
            this.open = true;
            this.$refs.searchInput.focus();
        }
    }));
});
