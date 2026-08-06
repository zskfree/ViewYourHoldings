import test from "node:test";
import assert from "node:assert/strict";

import { createPopupView } from "../src/ui/popup-view.js";

function createElement(value = "") {
  const listeners = new Map();
  const classes = new Set(["active"]);
  const children = [];
  const namedChildren = new Map();

  return {
    value,
    style: {},
    dataset: {},
    textContent: "",
    className: "",
    innerHTML: "",
    title: "",
    attributes: {},
    children,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    async trigger(type, event = {}) {
      return listeners.get(type)?.(event);
    },
    appendChild(child) {
      children.push(child);
    },
    querySelector(selector) {
      if (!namedChildren.has(selector)) {
        namedChildren.set(selector, createElement());
      }
      return namedChildren.get(selector);
    },
  };
}

function createRenderDocument() {
  const elements = new Map();
  [
    "refreshBtn",
    "mofishBtn",
    "loadingState",
    "emptyState",
    "rows",
    "totalToday",
    "totalHolding",
    "idxSh",
    "idxCyb",
    "idxHs300",
  ].forEach((id) => elements.set(id, createElement()));
  const headers = [createElement(), createElement()];
  headers[0].dataset.key = "current";
  headers[1].dataset.key = "todayProfit";

  const copyNodes = [createElement()];
  copyNodes[0].dataset.normalText = "极简盯盘";
  copyNodes[0].dataset.bossText = "项目数据概览";
  const body = createElement();

  return {
    elements,
    headers,
    copyNodes,
    documentRef: {
      body,
      title: "极简盯盘-持仓盈亏",
      getElementById: (id) => elements.get(id),
      querySelectorAll: (selector) => {
        if (selector === "th[data-key]") return headers;
        if (selector === "[data-normal-text][data-boss-text]") {
          return copyNodes;
        }
        return [];
      },
      createElement: () => createElement(),
    },
  };
}

test("popup view binds safe empty-save, refresh, back and privacy actions", async () => {
  const elements = new Map();
  [
    "viewList",
    "viewDetail",
    "openAddBtn",
    "mofishBtn",
    "refreshBtn",
    "backBtn",
    "addRecordBtn",
    "saveDetailBtn",
    "deleteDetailBtn",
    "detailCode",
  ].forEach((id) => elements.set(id, createElement()));

  const alerts = [];
  let refreshes = 0;
  let privacyToggles = 0;
  const view = createPopupView(
    {
      getElementById: (id) => elements.get(id),
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    {
      alertFn: (message) => alerts.push(message),
      confirmFn: () => false,
    },
  );
  view.bind({
    refresh: () => {
      refreshes += 1;
    },
    toggleMofishMode: () => {
      privacyToggles += 1;
    },
    sortBy: () => {},
    saveHolding: () => {
      throw new Error("empty form must not save");
    },
    deleteHolding: () => {},
  });

  await elements.get("saveDetailBtn").trigger("click");
  await elements.get("refreshBtn").trigger("click");
  await elements.get("backBtn").trigger("click");
  await elements.get("mofishBtn").trigger("click");

  assert.deepEqual(alerts, ["请输入股票名称或代码"]);
  assert.equal(refreshes, 2);
  assert.equal(privacyToggles, 1);
});

test("popup view renders loading, success, partial and failed refresh status", () => {
  const { documentRef, elements } = createRenderDocument();
  const view = createPopupView(documentRef, {
    formatTimeFn: () => "10:32",
  });
  const baseSnapshot = {
    state: {
      holdings: [],
      settings: { mofishMode: false, sortBy: null, sortOrder: "desc" },
    },
    rows: [],
    totals: { totalTodayProfit: 0, totalHoldingProfit: 0 },
    quotes: {},
    indices: { sh: null, cyb: null, hs300: null },
    hasRefreshed: true,
    lastUpdatedAt: 1_000,
  };

  const expected = [
    ["loading", "正在更新行情..."],
    ["success", "更新于 10:32"],
    ["partial", "部分行情更新失败 · 10:32"],
    ["failed", "更新失败 · 已保留上次行情"],
  ];

  expected.forEach(([refreshStatus, message]) => {
    view.render({
      ...baseSnapshot,
      refreshStatus,
      isLoading: refreshStatus === "loading",
    });
    assert.equal(elements.get("loadingState").textContent, message);
    assert.equal(elements.get("loadingState").style.display, "block");
  });
});

test("popup view marks the active numeric sort direction", () => {
  const { documentRef, headers } = createRenderDocument();
  const view = createPopupView(documentRef);
  const snapshot = {
    state: {
      holdings: [],
      settings: { mofishMode: false, sortBy: "current", sortOrder: "desc" },
    },
    rows: [],
    totals: { totalTodayProfit: 0, totalHoldingProfit: 0 },
    quotes: {},
    indices: { sh: null, cyb: null, hs300: null },
    hasRefreshed: true,
    refreshStatus: "success",
    lastUpdatedAt: 1_000,
    isLoading: false,
  };

  view.render(snapshot);
  assert.equal(headers[0].classList.contains("sort-active"), true);
  assert.equal(headers[0].classList.contains("sort-desc"), true);
  assert.equal(headers[0].classList.contains("sort-asc"), false);
  assert.equal(headers[1].classList.contains("sort-desc"), false);

  view.render({
    ...snapshot,
    state: {
      ...snapshot.state,
      settings: { ...snapshot.state.settings, sortOrder: "asc" },
    },
  });
  assert.equal(headers[0].classList.contains("sort-asc"), true);
  assert.equal(headers[0].classList.contains("sort-desc"), false);
});

test("holding hover details hide sensitive values in mofish mode", () => {
  function renderTitle(mofishMode) {
    const { documentRef, elements } = createRenderDocument();
    const view = createPopupView(documentRef);
    view.render({
      state: {
        holdings: [],
        settings: { mofishMode, sortBy: null, sortOrder: "desc" },
      },
      rows: [
        {
          holding: { code: "sh600519", name: "贵州茅台" },
          quote: { current: 1500, changePercent: 1 },
          metrics: {
            totalShares: 10,
            averageCost: 12.5,
            todayProfit: 20,
            holdingProfit: 30,
            holdingProfitRate: 25,
          },
        },
      ],
      totals: { totalTodayProfit: 20, totalHoldingProfit: 30 },
      quotes: {},
      indices: { sh: null, cyb: null, hs300: null },
      hasRefreshed: true,
      refreshStatus: "success",
      lastUpdatedAt: 1_000,
      isLoading: false,
    });

    const row = elements.get("rows").children[0];
    return row.querySelector(".stock-name-cell").title;
  }

  const normalTitle = renderTitle(false);
  assert.match(normalTitle, /代码：sh600519/);
  assert.match(normalTitle, /持仓：10 股/);
  assert.match(normalTitle, /均价：12\.50/);

  const privateTitle = renderTitle(true);
  assert.match(privateTitle, /项目编号：sh600519/);
  assert.doesNotMatch(privateTitle, /持仓|均价|12\.50/);
});

test("boss key disguises the list while keeping market values readable", () => {
  const { documentRef, elements, copyNodes } = createRenderDocument();
  const view = createPopupView(documentRef, { formatTimeFn: () => "10:32" });

  view.render({
    state: {
      holdings: [],
      settings: { mofishMode: true, sortBy: null, sortOrder: "desc" },
    },
    rows: [
      {
        holding: { code: "sh600519", name: "贵州茅台" },
        quote: { current: 1500, changePercent: 1 },
        metrics: {
          totalShares: 10,
          averageCost: 12.5,
          todayProfit: 20,
          holdingProfit: 30,
          holdingProfitRate: 25,
        },
      },
    ],
    totals: { totalTodayProfit: 20, totalHoldingProfit: 30 },
    indices: { sh: null, cyb: null, hs300: null },
    hasRefreshed: true,
    refreshStatus: "success",
    lastUpdatedAt: 1_000,
    isLoading: false,
  });

  const stockName = elements
    .get("rows")
    .children[0].querySelector(".stock-name-cell");
  assert.equal(documentRef.title, "项目数据概览");
  assert.equal(documentRef.body.classList.contains("mofish"), true);
  assert.equal(copyNodes[0].textContent, "项目数据概览");
  assert.equal(elements.get("mofishBtn").title, "退出老板键");
  assert.equal(elements.get("mofishBtn").attributes["aria-pressed"], "true");
  assert.equal(elements.get("loadingState").textContent, "同步于 10:32");
  assert.equal(stockName.textContent, "sh600519");
  assert.equal(elements.get("totalToday").textContent, "+20.00");
});

test("Enter saves and Escape returns from the holding detail view", async () => {
  const elements = new Map();
  [
    "viewList",
    "viewDetail",
    "openAddBtn",
    "mofishBtn",
    "refreshBtn",
    "backBtn",
    "addRecordBtn",
    "saveDetailBtn",
    "deleteDetailBtn",
    "detailCode",
  ].forEach((id) => elements.set(id, createElement()));
  elements.get("detailCode").value = "600519";
  elements.get("viewDetail").classList.add("active");
  const documentListeners = new Map();
  const documentRef = {
    getElementById: (id) => elements.get(id),
    querySelectorAll: () => [],
    addEventListener: (type, listener) => documentListeners.set(type, listener),
  };
  let saves = 0;
  let refreshes = 0;
  const view = createPopupView(documentRef);
  view.bind({
    refresh: () => {
      refreshes += 1;
    },
    toggleMofishMode: () => {},
    sortBy: () => {},
    saveHolding: () => {
      saves += 1;
    },
    deleteHolding: () => {},
  });

  let prevented = 0;
  await documentListeners.get("keydown")?.({
    key: "Enter",
    repeat: true,
    preventDefault: () => {
      prevented += 1;
    },
  });
  assert.equal(saves, 0);

  await documentListeners.get("keydown")?.({
    key: "Enter",
    repeat: false,
    preventDefault: () => {
      prevented += 1;
    },
  });
  assert.equal(saves, 1);
  assert.equal(refreshes, 1);

  elements.get("viewDetail").classList.add("active");
  await documentListeners.get("keydown")?.({
    key: "Escape",
    repeat: false,
    preventDefault: () => {
      prevented += 1;
    },
  });
  assert.equal(refreshes, 2);
  assert.equal(elements.get("viewDetail").classList.contains("active"), false);
  assert.equal(prevented, 2);
});
