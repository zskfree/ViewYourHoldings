import test from "node:test";
import assert from "node:assert/strict";

import { createHoldingsApp } from "../src/app/holdings-app.js";

function createMemoryRepository(initialState) {
  let state = structuredClone(initialState);

  return {
    async loadState() {
      return structuredClone(state);
    },
    async saveState(nextState) {
      state = structuredClone(nextState);
    },
  };
}

test("commands are safe before stored state finishes loading", async () => {
  const app = createHoldingsApp({
    repository: createMemoryRepository({
      version: 1,
      holdings: [],
      settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
    }),
    marketData: {
      async getQuotes() {
        return {};
      },
      async getIndices() {
        return { sh: null, cyb: null, hs300: null };
      },
      async searchStock() {
        return null;
      },
    },
  });

  assert.equal((await app.refresh()).state, null);
  assert.equal((await app.sortBy("current")).state, null);
  assert.equal((await app.toggleMofishMode()).state, null);
  assert.equal((await app.deleteHolding("sh600519")).state, null);
  assert.equal((await app.saveHolding({ codeRaw: "600519" })).state, null);
});

test("legacy noncanonical codes keep the existing metadata writeback behavior", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [
      {
        code: "hk00700",
        name: "hk00700",
        currency: "CNY",
        shares: 1,
        costPrice: 10,
      },
    ],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const app = createHoldingsApp({
    repository,
    marketData: {
      async getQuotes() {
        return {
          r_hk00700: {
            name: "Tencent",
            current: 20,
            prevClose: 19,
            changeAmount: 1,
            changePercent: 5,
            currency: "HKD",
          },
        };
      },
      async getIndices() {
        return { sh: null, cyb: null, hs300: null };
      },
      async searchStock() {
        return null;
      },
    },
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });

  await app.initialize();

  assert.equal(app.getSnapshot().state.holdings[0].name, "hk00700");
  assert.equal(app.getSnapshot().state.holdings[0].currency, "CNY");
});

test("initialization loads holdings and publishes a refreshed market snapshot", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [{ code: "sh600519", name: "sh600519", shares: 1, costPrice: 10 }],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const quote = {
    name: "Kweichow Moutai",
    current: 12,
    prevClose: 11,
    changeAmount: 1,
    changePercent: 9.09,
    currency: "CNY",
  };
  const marketData = {
    async getQuotes() {
      return { sh600519: quote };
    },
    async getIndices() {
      return { sh: quote, cyb: null, hs300: null };
    },
    async searchStock() {
      return null;
    },
  };
  const snapshots = [];
  const app = createHoldingsApp({
    repository,
    marketData,
    onChange: (snapshot) => snapshots.push(snapshot),
    nowFn: () => 1_000,
    setIntervalFn: () => 7,
    clearIntervalFn: () => {},
  });

  await app.initialize();

  const snapshot = app.getSnapshot();
  assert.equal(snapshot.state.holdings[0].name, "Kweichow Moutai");
  assert.deepEqual(snapshot.quotes, { sh600519: quote });
  assert.equal(snapshot.indices.sh.current, 12);
  assert.equal(snapshot.isLoading, false);
  assert.equal(snapshot.hasRefreshed, true);
  assert.equal(snapshot.refreshStatus, "success");
  assert.equal(snapshot.lastUpdatedAt, 1_000);
  assert.ok(
    snapshots.some(
      (published) => published.isLoading && published.hasRefreshed === false,
    ),
  );
  assert.ok(snapshots.length >= 2);
});

test("refresh ignores overlap and always clears its loading state", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  let mode = "ready";
  let releaseQuoteRequest;
  let quoteRequests = 0;
  const app = createHoldingsApp({
    repository,
    marketData: {
      async getQuotes() {
        quoteRequests += 1;
        if (mode === "pending") {
          return new Promise((resolve) => {
            releaseQuoteRequest = resolve;
          });
        }
        return {};
      },
      async getIndices() {
        return { sh: null, cyb: null, hs300: null };
      },
      async searchStock() {
        return null;
      },
    },
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await app.initialize();

  mode = "pending";
  const activeRefresh = app.refresh();
  await Promise.resolve();
  const overlappingSnapshot = await app.refresh();
  assert.equal(overlappingSnapshot.isLoading, true);
  assert.equal(quoteRequests, 2);
  releaseQuoteRequest({});
  await activeRefresh;
  assert.equal(app.getSnapshot().isLoading, false);

});

test("a failed refresh keeps the last market snapshot", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [{ code: "sh600519", name: "Moutai", shares: 1, costPrice: 10 }],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const quote = {
    name: "Moutai",
    current: 12,
    prevClose: 11,
    changeAmount: 1,
    changePercent: 9.09,
    currency: "CNY",
  };
  let shouldFail = false;
  const app = createHoldingsApp({
    repository,
    marketData: {
      async getQuotes() {
        if (shouldFail) throw new Error("quotes offline");
        return { sh600519: quote };
      },
      async getIndices() {
        if (shouldFail) throw new Error("indices offline");
        return { sh: quote, cyb: null, hs300: null };
      },
      async searchStock() {
        return null;
      },
    },
    nowFn: () => 1_000,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await app.initialize();

  shouldFail = true;
  await app.refresh();

  const snapshot = app.getSnapshot();
  assert.deepEqual(snapshot.quotes, { sh600519: quote });
  assert.equal(snapshot.indices.sh.current, 12);
  assert.equal(snapshot.refreshStatus, "failed");
  assert.equal(snapshot.lastUpdatedAt, 1_000);
  assert.equal(snapshot.isLoading, false);
});

test("a partial refresh updates successful data and keeps failed data", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [{ code: "sh600519", name: "Moutai", shares: 1, costPrice: 10 }],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const oldQuote = {
    name: "Moutai",
    current: 12,
    prevClose: 11,
    changeAmount: 1,
    changePercent: 9.09,
    currency: "CNY",
  };
  const newIndex = { ...oldQuote, current: 13 };
  let quoteFailure = false;
  let clock = 0;
  const app = createHoldingsApp({
    repository,
    marketData: {
      async getQuotes() {
        if (quoteFailure) throw new Error("quotes offline");
        return { sh600519: oldQuote };
      },
      async getIndices() {
        return { sh: quoteFailure ? newIndex : oldQuote, cyb: null, hs300: null };
      },
      async searchStock() {
        return null;
      },
    },
    nowFn: () => {
      clock += 1_000;
      return clock;
    },
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await app.initialize();

  quoteFailure = true;
  await app.refresh();

  const snapshot = app.getSnapshot();
  assert.deepEqual(snapshot.quotes, { sh600519: oldQuote });
  assert.equal(snapshot.indices.sh.current, 13);
  assert.equal(snapshot.refreshStatus, "partial");
  assert.equal(snapshot.lastUpdatedAt, 2_000);
});

test("an initial market failure stays empty and recovers on the next refresh", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [{ code: "sh600519", name: "Moutai", shares: 1, costPrice: 10 }],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const quote = {
    name: "Moutai",
    current: 12,
    prevClose: 11,
    changeAmount: 1,
    changePercent: 9.09,
    currency: "CNY",
  };
  let online = false;
  const app = createHoldingsApp({
    repository,
    marketData: {
      async getQuotes() {
        if (!online) throw new Error("quotes offline");
        return { sh600519: quote };
      },
      async getIndices() {
        if (!online) throw new Error("indices offline");
        return { sh: quote, cyb: null, hs300: null };
      },
      async searchStock() {
        return null;
      },
    },
    nowFn: () => 3_000,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });

  await app.initialize();
  assert.deepEqual(app.getSnapshot().quotes, {});
  assert.equal(app.getSnapshot().refreshStatus, "failed");
  assert.equal(app.getSnapshot().lastUpdatedAt, null);
  assert.equal(app.getSnapshot().hasRefreshed, false);

  online = true;
  await app.refresh();
  assert.equal(app.getSnapshot().refreshStatus, "success");
  assert.equal(app.getSnapshot().lastUpdatedAt, 3_000);
  assert.equal(app.getSnapshot().hasRefreshed, true);
});

test("sorting and privacy settings retain their existing toggle semantics", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const marketData = {
    async getQuotes() {
      return {};
    },
    async getIndices() {
      return { sh: null, cyb: null, hs300: null };
    },
    async searchStock() {
      return null;
    },
  };
  const app = createHoldingsApp({
    repository,
    marketData,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await app.initialize();

  await app.sortBy("current");
  assert.deepEqual(app.getSnapshot().state.settings, {
    mofishMode: false,
    sortBy: "current",
    sortOrder: "desc",
  });

  await app.sortBy("current");
  await app.toggleMofishMode();
  assert.deepEqual(app.getSnapshot().state.settings, {
    mofishMode: true,
    sortBy: "current",
    sortOrder: "asc",
  });
});

test("existing holdings can be edited and deleted through the app interface", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [{ code: "sh600519", name: "Moutai", shares: 1, costPrice: 10 }],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const marketData = {
    async getQuotes() {
      return {};
    },
    async getIndices() {
      return { sh: null, cyb: null, hs300: null };
    },
    async searchStock() {
      return null;
    },
  };
  const app = createHoldingsApp({
    repository,
    marketData,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await app.initialize();

  await app.saveHolding({
    existingCode: "sh600519",
    records: [{ date: "2026-01-01", price: 20, shares: 3 }],
  });
  assert.equal(app.getSnapshot().state.holdings[0].shares, 3);
  assert.equal(app.getSnapshot().state.holdings[0].costPrice, 20);

  await app.deleteHolding("sh600519");
  assert.deepEqual(app.getSnapshot().state.holdings, []);
});

test("saving a new holding resolves its name and persists normalized records", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const marketData = {
    async getQuotes() {
      return {};
    },
    async getIndices() {
      return { sh: null, cyb: null, hs300: null };
    },
    async searchStock() {
      return { code: "sh600519", name: "贵州茅台" };
    },
  };
  const app = createHoldingsApp({
    repository,
    marketData,
    nowFn: () => 123,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  await app.initialize();

  await app.saveHolding({
    codeRaw: "贵州茅台",
    records: [
      { date: "2026-01-01", price: 10, shares: 10 },
      { date: "2026-02-01", price: 20, shares: 5 },
    ],
  });

  assert.deepEqual(app.getSnapshot().state.holdings, [
    {
      code: "sh600519",
      name: "贵州茅台",
      shares: 15,
      costPrice: 200 / 15,
      buyDate: "2026-01-01",
      notes: "",
      records: [
        { date: "2026-01-01", price: 10, shares: 10 },
        { date: "2026-02-01", price: 20, shares: 5 },
      ],
      currency: "CNY",
      createdAt: 123,
    },
  ]);
});

test("refresh corrects unresolved stock codes and fetches their quotes again", async () => {
  const repository = createMemoryRepository({
    version: 1,
    holdings: [{ code: "wrong", name: "Moutai", shares: 1, costPrice: 10 }],
    settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
  });
  const quote = {
    name: "Moutai",
    current: 12,
    prevClose: 11,
    changeAmount: 1,
    changePercent: 9.09,
    currency: "CNY",
  };
  let quoteRequests = 0;
  const app = createHoldingsApp({
    repository,
    marketData: {
      async getQuotes() {
        quoteRequests += 1;
        return quoteRequests === 1 ? {} : { sh600519: quote };
      },
      async getIndices() {
        return { sh: null, cyb: null, hs300: null };
      },
      async searchStock() {
        return { code: "sh600519", name: "Moutai" };
      },
    },
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });

  await app.initialize();

  assert.equal(app.getSnapshot().state.holdings[0].code, "sh600519");
  assert.deepEqual(app.getSnapshot().quotes, { sh600519: quote });
  assert.equal(quoteRequests, 2);
});
