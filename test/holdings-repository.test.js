import test from "node:test";
import assert from "node:assert/strict";

import { createHoldingsRepository } from "../src/adapters/holdings-repository.js";

function createMemoryStorage(initial = {}) {
  const values = structuredClone(initial);

  return {
    async get(key) {
      return { [key]: values[key] };
    },
    async set(update) {
      Object.assign(values, structuredClone(update));
    },
  };
}

test("repository preserves app_data version 1 and remembers boss-key mode", async () => {
  const storage = createMemoryStorage();
  const repository = createHoldingsRepository(storage);

  assert.deepEqual(await repository.loadState(), {
    version: 1,
    holdings: [],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });

  const state = {
    version: 1,
    holdings: [{ code: "sh600519", shares: 1, costPrice: 10 }],
    settings: { mofishMode: true, sortBy: "current", sortOrder: "asc" },
  };
  await repository.saveState(state);

  assert.deepEqual(await repository.loadState(), state);
});
