import { normalizeStockCode } from "./stock-code.js";

const HKD_TO_CNY = 0.92;
const USD_TO_CNY = 7.2;

function legacyRecords(holding) {
  if (holding.shares && holding.costPrice != null) {
    return [
      {
        date: holding.buyDate || "",
        price: Number(holding.costPrice),
        shares: Number(holding.shares),
      },
    ];
  }

  return [];
}

export function summarizeHolding(holding) {
  const records =
    Array.isArray(holding.records) && holding.records.length > 0
      ? holding.records
      : legacyRecords(holding);

  let totalShares = 0;
  let totalCost = 0;

  records.forEach((record) => {
    const shares = Number(record.shares) || 0;
    const price = Number(record.price) || 0;

    if (shares > 0) {
      totalShares += shares;
      totalCost += shares * price;
    }
  });

  const shares = totalShares > 0 ? totalShares : Number(holding.shares) || 0;
  const averageCost =
    totalShares > 0
      ? totalCost / totalShares
      : holding.costPrice != null
        ? Number(holding.costPrice)
        : null;

  return {
    records,
    totalShares: shares,
    totalCost,
    averageCost,
  };
}

export function calculateHoldingMetrics(holding, quote) {
  const summary = summarizeHolding(holding);
  let holdingProfit = null;
  let holdingProfitRate = null;

  if (quote && summary.averageCost != null && summary.totalShares > 0) {
    holdingProfit =
      summary.totalShares * (quote.current - summary.averageCost);

    if (summary.averageCost > 0) {
      holdingProfitRate =
        ((quote.current - summary.averageCost) / summary.averageCost) * 100;
    }
  }

  return {
    totalShares: summary.totalShares,
    totalCost: summary.totalCost,
    averageCost: summary.averageCost,
    todayProfit: quote
      ? summary.totalShares * (quote.current - quote.prevClose)
      : 0,
    holdingProfit,
    holdingProfitRate,
  };
}

function toCny(amount, currency) {
  if (currency === "HKD") {
    return amount * HKD_TO_CNY;
  }

  if (currency === "USD") {
    return amount * USD_TO_CNY;
  }

  return amount;
}

export function calculatePortfolioTotals(holdings, quotes) {
  let totalTodayProfit = 0;
  let totalHoldingProfit = 0;

  holdings.forEach((holding) => {
    const quote = quotes[holding.code] || quotes[normalizeStockCode(holding.code)];
    if (!quote) {
      return;
    }

    const metrics = calculateHoldingMetrics(holding, quote);
    totalTodayProfit += toCny(metrics.todayProfit, quote.currency);

    if (metrics.holdingProfit != null) {
      totalHoldingProfit += toCny(metrics.holdingProfit, quote.currency);
    }
  });

  return { totalTodayProfit, totalHoldingProfit };
}

function sortableValue(holding, quote, key) {
  if (!quote) {
    return Number.NEGATIVE_INFINITY;
  }

  if (key === "todayProfit") {
    return calculateHoldingMetrics(holding, quote).todayProfit;
  }

  if (key === "holdingProfit") {
    const value = calculateHoldingMetrics(holding, quote).holdingProfit;
    return value == null ? Number.NEGATIVE_INFINITY : value;
  }

  if (key === "changeAmount") {
    return quote.changeAmount;
  }

  if (key === "changePercent") {
    return quote.changePercent;
  }

  if (key === "current") {
    return quote.current;
  }

  return 0;
}

export function sortHoldings(holdings, quotes, sortBy, sortOrder) {
  if (!sortBy) {
    return holdings;
  }

  const rows = [...holdings];
  rows.sort((left, right) => {
    const leftQuote =
      quotes[left.code] || quotes[normalizeStockCode(left.code)] || null;
    const rightQuote =
      quotes[right.code] || quotes[normalizeStockCode(right.code)] || null;
    const leftValue = sortableValue(left, leftQuote, sortBy);
    const rightValue = sortableValue(right, rightQuote, sortBy);

    return sortOrder === "desc"
      ? rightValue - leftValue
      : leftValue - rightValue;
  });

  return rows;
}
