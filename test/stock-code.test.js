import test from "node:test";
import assert from "node:assert/strict";

import { normalizeStockCode } from "../src/domain/stock-code.js";

test("stock codes retain the existing A-share, Hong Kong and US normalization", () => {
  assert.equal(normalizeStockCode("600519"), "sh600519");
  assert.equal(normalizeStockCode("00700"), "r_hk00700");
  assert.equal(normalizeStockCode("hk00700"), "r_hk00700");
  assert.equal(normalizeStockCode("AAPL"), "usAAPL");
  assert.equal(normalizeStockCode("us.aapl"), "usAAPL");
  assert.equal(normalizeStockCode("920001"), "bj920001");
});
