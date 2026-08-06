import test from "node:test";
import assert from "node:assert/strict";

import { createTencentMarketData } from "../src/adapters/tencent-market-data.js";

test("market data returns normalized quotes from Tencent responses", async () => {
  const fields = Array(33).fill("");
  fields[1] = "Tencent";
  fields[3] = "320.40";
  fields[4] = "318.00";
  fields[31] = "2.40";
  fields[32] = "0.75";
  const payload = `v_r_hk00700=\"${fields.join("~")}\";`;
  let requestedUrl = "";

  const marketData = createTencentMarketData({
    async fetchFn(url) {
      requestedUrl = url;
      return {
        async arrayBuffer() {
          return new TextEncoder().encode(payload).buffer;
        },
      };
    },
  });

  assert.deepEqual(await marketData.getQuotes(["hk00700"]), {
    r_hk00700: {
      name: "Tencent",
      current: 320.4,
      prevClose: 318,
      changeAmount: 2.4,
      changePercent: 0.75,
      currency: "HKD",
    },
  });
  assert.match(requestedUrl, /q=r_hk00700$/);
});

test("quote requests expose Tencent network failures to the app", async () => {
  const errors = [];
  const marketData = createTencentMarketData({
    async fetchFn() {
      throw new Error("offline");
    },
    logger: {
      error(...args) {
        errors.push(args);
      },
    },
  });

  await assert.rejects(marketData.getQuotes(["sh600519"]), /offline/);
  assert.equal(await marketData.searchStock("茅台"), null);
  assert.equal(errors.length, 2);
});

test("market data preserves Tencent stock search results", async () => {
  const marketData = createTencentMarketData({
    async fetchFn(url) {
      assert.match(url, /smartbox\.gtimg\.cn/);
      return {
        async text() {
          return 'v_hint="hk~00700~Tencent~"';
        },
      };
    },
  });

  assert.deepEqual(await marketData.searchStock("Tencent"), {
    code: "r_hk00700",
    name: "Tencent",
  });
});

test("market data maps the existing three index quotes", async () => {
  function line(code, current) {
    const fields = Array(33).fill("");
    fields[1] = code;
    fields[3] = String(current);
    fields[4] = String(current - 1);
    fields[31] = "1";
    fields[32] = "0.1";
    return `v_${code}=\"${fields.join("~")}\";`;
  }

  const payload = [
    line("sh000001", 3000),
    line("sz399006", 2000),
    line("sz399300", 4000),
  ].join("");
  const marketData = createTencentMarketData({
    async fetchFn() {
      return {
        async arrayBuffer() {
          return new TextEncoder().encode(payload).buffer;
        },
      };
    },
  });

  const indices = await marketData.getIndices();
  assert.equal(indices.sh.current, 3000);
  assert.equal(indices.cyb.current, 2000);
  assert.equal(indices.hs300.current, 4000);
});

test("index requests expose Tencent network failures to the app", async () => {
  const marketData = createTencentMarketData({
    async fetchFn() {
      throw new Error("indices offline");
    },
    logger: { error() {} },
  });

  await assert.rejects(marketData.getIndices(), /indices offline/);
});
