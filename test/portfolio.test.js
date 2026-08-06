import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateHoldingMetrics,
  calculatePortfolioTotals,
  sortHoldings,
  summarizeHolding,
} from "../src/domain/portfolio.js";

test("legacy and multi-record holdings produce compatible summaries", () => {
  assert.deepEqual(
    summarizeHolding({ shares: 10, costPrice: 12.5, buyDate: "2026-01-01" }),
    {
      records: [{ date: "2026-01-01", price: 12.5, shares: 10 }],
      totalShares: 10,
      totalCost: 125,
      averageCost: 12.5,
    },
  );

  assert.deepEqual(
    summarizeHolding({
      shares: 999,
      costPrice: 999,
      records: [
        { date: "2026-01-01", price: 10, shares: 10 },
        { date: "2026-02-01", price: 20, shares: 5 },
      ],
    }),
    {
      records: [
        { date: "2026-01-01", price: 10, shares: 10 },
        { date: "2026-02-01", price: 20, shares: 5 },
      ],
      totalShares: 15,
      totalCost: 200,
      averageCost: 200 / 15,
    },
  );
});

test("holding sorting preserves numeric ordering and the existing name no-op", () => {
  const holdings = [
    { code: "sh1", shares: 1, costPrice: 10 },
    { code: "sh2", shares: 1, costPrice: 10 },
  ];
  const quotes = {
    sh1: { current: 11, prevClose: 10, changeAmount: 1, changePercent: 10 },
    sh2: { current: 13, prevClose: 10, changeAmount: 3, changePercent: 30 },
  };

  assert.deepEqual(
    sortHoldings(holdings, quotes, "current", "desc").map(({ code }) => code),
    ["sh2", "sh1"],
  );
  assert.deepEqual(
    sortHoldings(holdings, quotes, "name", "desc").map(({ code }) => code),
    ["sh1", "sh2"],
  );
});

test("portfolio totals preserve fixed CNY conversion rates", () => {
  const totals = calculatePortfolioTotals(
    [
      { code: "hk00700", shares: 10, costPrice: 10 },
      { code: "AAPL", shares: 2, costPrice: 100 },
    ],
    {
      r_hk00700: { current: 20, prevClose: 18, currency: "HKD" },
      usAAPL: { current: 110, prevClose: 105, currency: "USD" },
    },
  );

  assert.equal(totals.totalTodayProfit, 18.4 + 72);
  assert.equal(totals.totalHoldingProfit, 92 + 144);
});

test("holding metrics preserve current profit calculations", () => {
  assert.deepEqual(
    calculateHoldingMetrics(
      { shares: 10, costPrice: 8 },
      { current: 12, prevClose: 10, currency: "CNY" },
    ),
    {
      totalShares: 10,
      totalCost: 80,
      averageCost: 8,
      todayProfit: 20,
      holdingProfit: 40,
      holdingProfitRate: 50,
    },
  );
});
