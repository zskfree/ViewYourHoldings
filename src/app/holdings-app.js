import { normalizeStockCode } from "../domain/stock-code.js";
import {
  calculateHoldingMetrics,
  calculatePortfolioTotals,
  sortHoldings,
  summarizeHolding,
} from "../domain/portfolio.js";

const REFRESH_INTERVAL_MS = 60_000;

export function createHoldingsApp({
  repository,
  marketData,
  onChange = () => {},
  nowFn = Date.now,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
}) {
  let state = null;
  let quotes = {};
  let indices = { sh: null, cyb: null, hs300: null };
  let isLoading = false;
  let hasRefreshed = false;
  let refreshStatus = "idle";
  let lastUpdatedAt = null;
  let refreshTimer = null;

  function getSnapshot() {
    const holdings = state
      ? sortHoldings(
          state.holdings,
          quotes,
          state.settings.sortBy,
          state.settings.sortOrder,
        )
      : [];
    const rows = holdings.map((holding) => {
      const quote = getQuote(holding);
      return {
        holding,
        quote,
        metrics: calculateHoldingMetrics(holding, quote),
      };
    });
    const totals = state
      ? calculatePortfolioTotals(state.holdings, quotes)
      : { totalTodayProfit: 0, totalHoldingProfit: 0 };

    return {
      state,
      holdings,
      rows,
      totals,
      quotes,
      indices,
      isLoading,
      hasRefreshed,
      refreshStatus,
      lastUpdatedAt,
    };
  }

  function publish() {
    onChange(getSnapshot());
  }

  async function updateHoldingMetadata() {
    let changed = false;

    state.holdings.forEach((holding) => {
      const quote = quotes[holding.code];
      if (!quote) {
        return;
      }

      if (
        quote.name &&
        holding.name !== quote.name &&
        quote.name !== holding.code
      ) {
        holding.name = quote.name;
        changed = true;
      }

      if (quote.currency && holding.currency !== quote.currency) {
        holding.currency = quote.currency;
        changed = true;
      }
    });

    if (changed) {
      await repository.saveState(state);
    }
  }

  function getQuote(holding) {
    return (
      quotes[holding.code] || quotes[normalizeStockCode(holding.code)] || null
    );
  }

  async function correctUnresolvedCodes() {
    let changed = false;

    for (const holding of state.holdings) {
      if (getQuote(holding) || !holding.code) {
        continue;
      }

      const searchResult =
        (await marketData.searchStock(holding.code)) ||
        (await marketData.searchStock(holding.name));

      if (!searchResult?.code) {
        continue;
      }

      const oldCode = holding.code;
      holding.code = searchResult.code;

      if (searchResult.name && (!holding.name || holding.name === oldCode)) {
        holding.name = searchResult.name;
      }

      changed = true;
    }

    if (changed) {
      await repository.saveState(state);
      quotes = await marketData.getQuotes(
        state.holdings.map((holding) => holding.code),
      );
    }
  }

  async function refresh() {
    if (!state || isLoading) {
      return getSnapshot();
    }

    isLoading = true;
    refreshStatus = "loading";
    publish();

    try {
      const codes = state.holdings.map((holding) =>
        normalizeStockCode(holding.code),
      );
      const [quoteResult, indexResult] = await Promise.allSettled([
        marketData.getQuotes(codes),
        marketData.getIndices(),
      ]);
      let quotesSucceeded = quoteResult.status === "fulfilled";
      const indicesSucceeded = indexResult.status === "fulfilled";

      if (quotesSucceeded) {
        quotes = quoteResult.value || {};

        if (Object.keys(quotes).length > 0) {
          await updateHoldingMetadata();
        }

        try {
          await correctUnresolvedCodes();
        } catch {
          quotesSucceeded = false;
        }
      }

      if (indicesSucceeded) {
        indices = indexResult.value || { sh: null, cyb: null, hs300: null };
      }

      if (quotesSucceeded || indicesSucceeded) {
        hasRefreshed = true;
        lastUpdatedAt = nowFn();
        refreshStatus =
          quotesSucceeded && indicesSucceeded ? "success" : "partial";
      } else {
        refreshStatus = "failed";
      }
    } finally {
      isLoading = false;
      publish();
    }

    return getSnapshot();
  }

  async function initialize() {
    state = await repository.loadState();
    publish();
    await refresh();
    refreshTimer = setIntervalFn(refresh, REFRESH_INTERVAL_MS);
    return getSnapshot();
  }

  function applyRecords(holding, records) {
    const summary = summarizeHolding({ records });
    holding.records = records;
    holding.shares = summary.totalShares;
    holding.costPrice =
      summary.totalShares > 0 ? summary.averageCost : null;
  }

  async function saveHolding({ existingCode = null, codeRaw = "", records = [] }) {
    if (!state) {
      return getSnapshot();
    }

    if (existingCode) {
      const holding = state.holdings.find((item) => item.code === existingCode);
      if (holding) {
        applyRecords(holding, records);
      }
    } else {
      let code = normalizeStockCode(codeRaw);
      let name = codeRaw;

      if (
        /[\u4e00-\u9fa5]/.test(codeRaw) ||
        !/^(sh|sz|bj|r_hk|us)/.test(code)
      ) {
        const searchResult = await marketData.searchStock(codeRaw);
        if (searchResult?.code) {
          code = searchResult.code;
          name = searchResult.name || codeRaw;
        }
      }

      const existing = state.holdings.find((holding) => holding.code === code);
      if (existing) {
        applyRecords(existing, records);
      } else {
        const holding = {
          code,
          name: name || code,
          shares: 0,
          costPrice: null,
          buyDate: records.length ? records[0].date : "",
          notes: "",
          records,
          currency: "CNY",
          createdAt: nowFn(),
        };
        applyRecords(holding, records);
        state.holdings.push(holding);
      }
    }

    await repository.saveState(state);
    publish();
    return getSnapshot();
  }

  async function deleteHolding(code) {
    if (!state) {
      return getSnapshot();
    }

    state.holdings = state.holdings.filter((holding) => holding.code !== code);
    await repository.saveState(state);
    publish();
    return getSnapshot();
  }

  async function sortBy(key) {
    if (!state) {
      return getSnapshot();
    }

    const { sortBy: currentKey, sortOrder } = state.settings;
    state.settings.sortOrder =
      currentKey === key && sortOrder === "desc" ? "asc" : "desc";
    state.settings.sortBy = key;
    await repository.saveState(state);
    publish();
    return getSnapshot();
  }

  async function toggleMofishMode() {
    if (!state) {
      return getSnapshot();
    }

    state.settings.mofishMode = !state.settings.mofishMode;
    await repository.saveState(state);
    publish();
    return getSnapshot();
  }

  function dispose() {
    if (refreshTimer != null) {
      clearIntervalFn(refreshTimer);
      refreshTimer = null;
    }
  }

  return {
    initialize,
    refresh,
    saveHolding,
    deleteHolding,
    sortBy,
    toggleMofishMode,
    dispose,
    getSnapshot,
  };
}
