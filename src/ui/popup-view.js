import { summarizeHolding } from "../domain/portfolio.js";

export function createPopupView(
  documentRef,
  {
    alertFn = globalThis.alert,
    confirmFn = globalThis.confirm,
    formatTimeFn = (timestamp) =>
      new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(timestamp)),
  } = {},
) {
  let currentEditingHolding = null;
  const numericSortKeys = new Set([
    "current",
    "changePercent",
    "todayProfit",
    "holdingProfit",
  ]);

  function element(id) {
    return documentRef.getElementById(id);
  }

  function showView(viewName) {
    const viewList = element("viewList");
    const viewDetail = element("viewDetail");

    if (viewName === "detail") {
      viewList.classList.remove("active");
      viewDetail.classList.add("active");
    } else {
      viewDetail.classList.remove("active");
      viewList.classList.add("active");
    }
  }

  function formatNumber(value, defaultDecimals = 2, maxDecimals = 4) {
    if (value == null || Number.isNaN(Number(value))) {
      return "--";
    }

    const fixed = Number(value).toFixed(maxDecimals);
    const parsed = Number.parseFloat(fixed);
    const formatted = parsed.toString();
    const decimals = (formatted.split(".")[1] || "").length;
    return decimals <= defaultDecimals
      ? parsed.toFixed(defaultDecimals)
      : formatted;
  }

  function readFormRecords() {
    const rows = documentRef.querySelectorAll("#recordsList .record-row");
    const records = [];

    rows.forEach((row) => {
      const date = row.querySelector(".rec-date").value;
      const price = row.querySelector(".rec-price").value;
      const shares = row.querySelector(".rec-shares").value;

      if (price !== "" || shares !== "") {
        records.push({
          date: date || "",
          price: price !== "" ? Number(price) : 0,
          shares: shares !== "" ? Number(shares) : 0,
        });
      }
    });

    return records;
  }

  function recalculateSummary() {
    const summary = summarizeHolding({ records: readFormRecords() });
    element("summaryTotalShares").textContent =
      summary.totalShares > 0 ? summary.totalShares : "0";
    element("summaryAvgCost").textContent =
      summary.averageCost > 0 ? formatNumber(summary.averageCost) : "--";
    element("summaryTotalCost").textContent =
      summary.totalCost > 0 ? formatNumber(summary.totalCost) : "--";
  }

  function addRecordRow(date = "", price = "", shares = "") {
    const container = element("recordsList");
    const row = documentRef.createElement("div");
    row.className = "record-row";
    row.innerHTML = `
    <input type="date" class="rec-date" value="${date}" />
    <input type="number" step="0.01" class="rec-price" placeholder="买入单价" value="${price != null ? price : ""}" />
    <input type="number" step="1" min="1" class="rec-shares" placeholder="买入股数" value="${shares != null ? shares : ""}" />
    <span class="remove-rec-btn" title="删除此笔记录">×</span>
  `;

    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", recalculateSummary);
    });
    row.querySelector(".remove-rec-btn").addEventListener("click", () => {
      row.remove();
      recalculateSummary();
    });

    container.appendChild(row);
    recalculateSummary();
  }

  function openDetailView(holding) {
    currentEditingHolding = holding;
    const headerTitle = element("detailHeaderTitle");
    const codeInput = element("detailCode");
    const deleteButton = element("deleteDetailBtn");
    element("recordsList").innerHTML = "";

    if (holding) {
      headerTitle.textContent = `编辑持仓 - ${holding.name || holding.code}`;
      codeInput.value =
        holding.name && holding.name !== holding.code
          ? `${holding.name} (${holding.code})`
          : holding.code;
      codeInput.readOnly = true;
      deleteButton.style.display = "inline-block";

      const records = summarizeHolding(holding).records;
      (records.length > 0
        ? records
        : [{ date: "", price: "", shares: "" }]
      ).forEach((record) =>
        addRecordRow(record.date, record.price, record.shares),
      );
    } else {
      headerTitle.textContent = "新增股票持仓";
      codeInput.value = "";
      codeInput.readOnly = false;
      deleteButton.style.display = "none";
      addRecordRow("", "", "");
    }

    recalculateSummary();
    showView("detail");
  }

  function renderIndices(indices) {
    const values = [
      ["idxSh", indices.sh],
      ["idxCyb", indices.cyb],
      ["idxHs300", indices.hs300],
    ];

    values.forEach(([id, index]) => {
      const target = element(id);
      target.textContent = index ? index.current.toFixed(2) : "--";
      target.className = `idx-val ${index && index.changePercent >= 0 ? "up" : "down"}`;
    });
  }

  function renderRows(snapshot) {
    const tableBody = element("rows");
    tableBody.innerHTML = "";
    element("emptyState").style.display =
      snapshot.rows.length === 0 ? "block" : "none";

    snapshot.rows.forEach(({ holding, quote, metrics }) => {
      const row = documentRef.createElement("tr");
      const isHeld = metrics.totalShares > 0;
      const todayProfit = quote && isHeld ? metrics.todayProfit : null;
      const profit = quote && isHeld ? metrics.holdingProfit : null;
      const profitRate = quote && isHeld ? metrics.holdingProfitRate : null;
      const changeClass = quote
        ? quote.changePercent >= 0
          ? "up"
          : "down"
        : "";
      const todayClass =
        todayProfit != null && isHeld
          ? todayProfit >= 0
            ? "up"
            : "down"
          : "";
      const profitClass =
        profit != null && isHeld ? (profit >= 0 ? "up" : "down") : "";
      const bossMode = snapshot.state.settings.mofishMode;
      const displayName = bossMode
        ? holding.code
        : holding.name && holding.name !== holding.code
          ? holding.name
          : quote?.name || holding.code;
      const todayText =
        quote && isHeld && todayProfit != null
          ? `${todayProfit >= 0 ? "+" : ""}${todayProfit.toFixed(2)}`
          : "--";
      const profitText =
        quote && isHeld && profit != null
          ? `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}`
          : "--";

      row.innerHTML = `
      <td class="stock-name-cell" title="点击进入二级编辑界面">
        ${displayName}
      </td>
      <td>${quote ? quote.current.toFixed(2) : "--"}</td>
      <td class="${changeClass}">${quote ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "--"}</td>
      <td class="${isHeld && todayProfit != null ? `${todayClass} num-blur` : "empty"}">${todayText}</td>
      <td class="${isHeld && profit != null ? `${profitClass} num-blur` : "empty"}">
        ${profitText}
        ${profitRate != null ? `<span class="stock-sub ${profitClass}">${profitRate >= 0 ? "+" : ""}${profitRate.toFixed(2)}%</span>` : ""}
      </td>
    `;
      const stockNameCell = row.querySelector(".stock-name-cell");
      stockNameCell.textContent = displayName;
      const baseTitle = `点击进入编辑 · 代码：${holding.code}`;
      stockNameCell.title = bossMode
        ? `项目编号：${holding.code}`
        : `${baseTitle} · 持仓：${formatNumber(metrics.totalShares, 0)} 股 · 均价：${formatNumber(metrics.averageCost)}`;
      if (!bossMode) {
        stockNameCell.addEventListener("click", () => openDetailView(holding));
      }
      tableBody.appendChild(row);
    });
  }

  function renderTotals(totals) {
    const today = element("totalToday");
    today.textContent = `${totals.totalTodayProfit >= 0 ? "+" : ""}${totals.totalTodayProfit.toFixed(2)}`;
    today.className = `value num-blur ${totals.totalTodayProfit >= 0 ? "up" : "down"}`;

    const holding = element("totalHolding");
    holding.textContent = `${totals.totalHoldingProfit >= 0 ? "+" : ""}${totals.totalHoldingProfit.toFixed(2)}`;
    holding.className = `value num-blur ${totals.totalHoldingProfit >= 0 ? "up" : "down"}`;
  }

  function render(snapshot) {
    if (!snapshot.state) {
      return;
    }

    const bossMode = snapshot.state.settings.mofishMode;
    documentRef.body.classList.toggle("mofish", bossMode);
    documentRef.title = bossMode ? "项目数据概览" : "极简盯盘-持仓盈亏";
    documentRef
      .querySelectorAll("[data-normal-text][data-boss-text]")
      .forEach((node) => {
        node.textContent = bossMode
          ? node.dataset.bossText
          : node.dataset.normalText;
      });
    const bossKeyButton = element("mofishBtn");
    bossKeyButton.title = bossMode ? "退出老板键" : "启用老板键";
    bossKeyButton.classList.toggle("active", bossMode);
    bossKeyButton.setAttribute("aria-pressed", String(bossMode));
    element("refreshBtn").classList.toggle("spinning", snapshot.isLoading);
    const statusLine = element("loadingState");
    const updatedTime =
      snapshot.lastUpdatedAt == null
        ? ""
        : formatTimeFn(snapshot.lastUpdatedAt);
    const statusMessages = bossMode
      ? {
          loading: "正在同步数据...",
          success: `同步于 ${updatedTime}`,
          partial: `部分数据同步失败 · ${updatedTime}`,
          failed: "同步失败 · 已保留上次数据",
        }
      : {
          loading: "正在更新行情...",
          success: `更新于 ${updatedTime}`,
          partial: `部分行情更新失败 · ${updatedTime}`,
          failed: "更新失败 · 已保留上次行情",
        };
    statusLine.textContent = statusMessages[snapshot.refreshStatus] || "";
    statusLine.style.display = snapshot.refreshStatus === "idle" ? "none" : "block";

    if (!snapshot.hasRefreshed) {
      return;
    }

    documentRef.querySelectorAll("th[data-key]").forEach((header) => {
      const isActive = header.dataset.key === snapshot.state.settings.sortBy;
      const hasDirection = isActive && numericSortKeys.has(header.dataset.key);
      header.classList.toggle("sort-active", isActive);
      header.classList.toggle(
        "sort-asc",
        hasDirection && snapshot.state.settings.sortOrder === "asc",
      );
      header.classList.toggle(
        "sort-desc",
        hasDirection && snapshot.state.settings.sortOrder === "desc",
      );
    });

    renderIndices(snapshot.indices);
    renderRows(snapshot);
    renderTotals(snapshot.totals);
  }

  function bind(actions) {
    async function returnToList() {
      showView("list");
      await actions.refresh();
    }

    async function saveDetail() {
      const codeRaw = element("detailCode").value.trim();
      if (!currentEditingHolding && !codeRaw) {
        alertFn("请输入股票名称或代码");
        return;
      }

      await actions.saveHolding({
        existingCode: currentEditingHolding?.code || null,
        codeRaw,
        records: readFormRecords(),
      });
      await returnToList();
    }

    element("openAddBtn").addEventListener("click", () => openDetailView(null));
    element("mofishBtn").addEventListener("click", actions.toggleMofishMode);
    element("refreshBtn").addEventListener("click", actions.refresh);
    documentRef.querySelectorAll("th[data-key]").forEach((header) => {
      header.addEventListener("click", () => actions.sortBy(header.dataset.key));
    });
    element("backBtn").addEventListener("click", returnToList);
    element("addRecordBtn").addEventListener("click", () => addRecordRow());
    element("saveDetailBtn").addEventListener("click", saveDetail);
    element("deleteDetailBtn").addEventListener("click", async () => {
      if (
        currentEditingHolding &&
        confirmFn(
          `确定要删除 ${currentEditingHolding.name || currentEditingHolding.code} 的持仓记录吗？`,
        )
      ) {
        await actions.deleteHolding(currentEditingHolding.code);
        await returnToList();
      }
    });
    documentRef.addEventListener("keydown", async (event) => {
      if (
        event.repeat ||
        !element("viewDetail").classList.contains("active") ||
        event.target?.tagName === "BUTTON"
      ) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        await saveDetail();
      } else if (event.key === "Escape") {
        event.preventDefault();
        await returnToList();
      }
    });
  }

  return { bind, render };
}
