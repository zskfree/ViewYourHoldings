const STORAGE_KEY = "app_data";

function defaultState() {
  return {
    version: 1,
    holdings: [],
    settings: {
      mofishMode: false,
      sortBy: null,
      sortOrder: "desc",
    },
  };
}

function migrate(state) {
  return state && state.version ? state : defaultState();
}

export function createHoldingsRepository(storageArea) {
  return {
    async loadState() {
      const stored = await storageArea.get(STORAGE_KEY);
      return migrate(stored[STORAGE_KEY]) || defaultState();
    },

    async saveState(state) {
      await storageArea.set({ [STORAGE_KEY]: state });
    },
  };
}
