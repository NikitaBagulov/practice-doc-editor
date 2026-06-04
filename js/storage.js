const STORAGE_KEY = 'iszf_practice_data';

const Storage = {
  _debounceTimer: null,

  save(data) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      try {
        const existing = this._loadRaw() || {};
        Object.assign(existing, data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      } catch (e) {
        console.warn('Storage save failed:', e);
      }
    }, 300);
  },

  _loadRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  load() {
    return this._loadRaw() || {};
  },

  get(field) {
    const data = this.load();
    return data[field];
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
};
