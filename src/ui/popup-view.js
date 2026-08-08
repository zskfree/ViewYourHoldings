import { summarizeHolding } from "../domain/portfolio.js";

export function createPopupView(
  documentRef,
  {
    alertFn = globalThis.alert,
    formatTimeFn = (timestamp) =>
      new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(timestamp)),
  } = {},
) {
  let currentEditingHolding = null;
  let activeViewName = "list";
  let activeViewTransition = null;
  let pendingDeleteConfirmation = null;
  const renderedValues = new Map();
  const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
  const numericSortKeys = new Set([
    "current",
    "changePercent",
    "todayProfit",
    "holdingProfit",
  ]);

  function element(id) {
    return documentRef.getElementById(id);
  }

  function shouldReduceMotion() {
    return Boolean(
      documentRef.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
        .matches,
    );
  }

  function cancelViewTransition() {
    if (!activeViewTransition) {
      return;
    }

    activeViewTransition.animations.forEach((animation) => {
      try {
        animation.commitStyles?.();
      } catch {
        // commitStyles is optional and can fail for detached test elements.
      }
      animation.cancel?.();
    });
    activeViewTransition.cleanup();
    activeViewTransition = null;
  }

  function showView(viewName, { animate = true } = {}) {
    const viewList = element("viewList");
    const viewDetail = element("viewDetail");
    const targetView = viewName === "detail" ? viewDetail : viewList;
    const sourceView = viewName === "detail" ? viewList : viewDetail;

    if (
      viewName === activeViewName &&
      targetView.classList.contains("active") &&
      !sourceView.classList.contains("active")
    ) {
      return;
    }

    cancelViewTransition();
    activeViewName = viewName;

    const setFinalState = () => {
      viewList.classList.toggle("active", viewName === "list");
      viewDetail.classList.toggle("active", viewName === "detail");
      viewList.classList.remove("view-leaving");
      viewDetail.classList.remove("view-leaving");
      sourceView.style?.removeProperty?.("opacity");
      sourceView.style?.removeProperty?.("transform");
      targetView.style?.removeProperty?.("opacity");
      targetView.style?.removeProperty?.("transform");
    };

    if (
      !animate ||
      shouldReduceMotion() ||
      typeof sourceView.animate !== "function" ||
      typeof targetView.animate !== "function"
    ) {
      setFinalState();
      return;
    }

    const direction = viewName === "detail" ? 1 : -1;
    targetView.classList.add("active");
    sourceView.classList.add("view-leaving");
    const outgoing = sourceView.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: `translateX(${-8 * direction}px)` },
      ],
      { duration: 220, easing: EASE_OUT, fill: "forwards" },
    );
    const incoming = targetView.animate(
      [
        { opacity: 0, transform: `translateX(${12 * direction}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 220, easing: EASE_OUT, fill: "forwards" },
    );
    const transition = {
      animations: [outgoing, incoming],
      cleanup: setFinalState,
    };
    activeViewTransition = transition;
    Promise.allSettled([outgoing.finished, incoming.finished]).then(() => {
      if (activeViewTransition !== transition) {
        return;
      }
      setFinalState();
      activeViewTransition = null;
    });
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

  function animateElement(target, keyframes, options) {
    if (
      shouldReduceMotion() ||
      !target ||
      typeof target.animate !== "function"
    ) {
      return null;
    }
    return target.animate(keyframes, { easing: EASE_OUT, ...options });
  }

  function updateRenderedValue(target, key, text, tone = null) {
    const previous = renderedValues.get(key);
    target.textContent = text;
    if (text !== "--" && text !== "") {
      target.title = text;
    }
    renderedValues.set(key, text);

    if (previous == null || previous === text || text === "--") {
      return;
    }

    const flashColor =
      tone === "up"
        ? "var(--up-flash)"
        : tone === "down"
          ? "var(--down-flash)"
          : "var(--bg-hover)";
    animateElement(
      target,
      [
        { backgroundColor: flashColor },
        { backgroundColor: "transparent" },
      ],
      { duration: 160 },
    );
  }

  function readFormRecords() {
    const rows = documentRef.querySelectorAll("#recordsList .record-row");
    const records = [];

    rows.forEach((row) => {
      const rawDate = row.querySelector(".rec-date").value || "";
      const date = rawDate.trim().replace(/-/g, "/");
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

  function addRecordRow(
    date = "",
    price = "",
    shares = "",
    { animate = false, focus = false } = {},
  ) {
    const container = element("recordsList");
    const row = documentRef.createElement("div");
    row.className = "record-row";
    const formattedDate = String(date || "").trim().replace(/-/g, "/");
    row.innerHTML = `
    <input type="text" class="rec-date" placeholder="YYYY/MM/DD" value="${formattedDate}" autocomplete="off" />
    <input type="number" step="0.01" class="rec-price" placeholder="买入单价" value="${price != null ? price : ""}" />
    <input type="number" step="1" min="1" class="rec-shares" placeholder="买入股数" value="${shares != null ? shares : ""}" />
    <button type="button" class="remove-rec-btn" title="删除此笔记录" aria-label="删除此笔买入记录">×</button>
  `;

    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", recalculateSummary);
    });
    row.querySelector(".remove-rec-btn").addEventListener("click", async () => {
      const animation = animateElement(
        row,
        [
          { opacity: 1, transform: "translateX(0) scale(1)" },
          { opacity: 0, transform: "translateX(6px) scale(0.98)" },
        ],
        { duration: 180, fill: "forwards" },
      );
      if (animation) {
        await animation.finished.catch(() => {});
      }
      row.remove();
      recalculateSummary();
    });

    container.appendChild(row);
    if (animate) {
      animateElement(
        row,
        [
          { opacity: 0, transform: "translateY(4px) scale(0.98)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 180 },
      );
    }
    if (focus) {
      row.querySelector(".rec-date").focus?.({ preventScroll: true });
      row.scrollIntoView?.({
        block: "nearest",
        behavior: shouldReduceMotion() ? "auto" : "smooth",
      });
    }
    recalculateSummary();
  }

  function openDetailView(holding, { animate = true } = {}) {
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
    showView("detail", { animate });
  }

  function renderIndices(indices) {
    const values = [
      ["idxSh", indices.sh],
      ["idxCyb", indices.cyb],
      ["idxHs300", indices.hs300],
    ];

    values.forEach(([id, index]) => {
      const target = element(id);
      const tone = index ? (index.changePercent >= 0 ? "up" : "down") : null;
      updateRenderedValue(
        target,
        `index:${id}`,
        index ? index.current.toFixed(2) : "--",
        tone,
      );
      target.className = `idx-val ${tone || ""}`;
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
      <td data-field="current"></td>
      <td data-field="changePercent" class="${changeClass}"></td>
      <td data-field="todayProfit" class="${isHeld && todayProfit != null ? `${todayClass} num-blur` : "empty"}"></td>
      <td data-field="holdingProfit" class="${isHeld && profit != null ? `${profitClass} num-blur` : "empty"}">
        <span data-field="holdingProfitValue"></span>
        ${profitRate != null ? `<span class="stock-sub ${profitClass}">${profitRate >= 0 ? "+" : ""}${profitRate.toFixed(2)}%</span>` : ""}
      </td>
    `;
      row.dataset.code = holding.code;
      const stockNameCell = row.querySelector(".stock-name-cell");
      stockNameCell.textContent = displayName;
      const baseTitle = `点击进入编辑 · 代码：${holding.code}`;
      stockNameCell.title = bossMode
        ? `项目编号：${holding.code}`
        : `${baseTitle} · 持仓：${formatNumber(metrics.totalShares, 0)} 股 · 均价：${formatNumber(metrics.averageCost)}`;
      const currentText = quote ? quote.current.toFixed(2) : "--";
      const changeText = quote
        ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`
        : "--";
      updateRenderedValue(
        row.querySelector('[data-field="current"]'),
        `${holding.code}:current`,
        currentText,
      );
      updateRenderedValue(
        row.querySelector('[data-field="changePercent"]'),
        `${holding.code}:changePercent`,
        changeText,
        changeClass,
      );
      updateRenderedValue(
        row.querySelector('[data-field="todayProfit"]'),
        `${holding.code}:todayProfit`,
        todayText,
        todayClass,
      );
      updateRenderedValue(
        row.querySelector('[data-field="holdingProfitValue"]'),
        `${holding.code}:holdingProfit`,
        profitText,
        profitClass,
      );
      if (!bossMode) {
        row.classList.add("interactive-row");
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute(
          "aria-label",
          `编辑持仓 ${displayName}，代码 ${holding.code}`,
        );
        row.addEventListener("click", () => openDetailView(holding));
        row.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          openDetailView(holding, { animate: false });
        });
      }
      tableBody.appendChild(row);
    });
  }

  function renderTotals(totals) {
    const today = element("totalToday");
    const todayTone = totals.totalTodayProfit >= 0 ? "up" : "down";
    updateRenderedValue(
      today,
      "total:today",
      `${totals.totalTodayProfit >= 0 ? "+" : ""}${totals.totalTodayProfit.toFixed(2)}`,
      todayTone,
    );
    today.className = `value num-blur ${todayTone}`;

    const holding = element("totalHolding");
    const holdingTone = totals.totalHoldingProfit >= 0 ? "up" : "down";
    updateRenderedValue(
      holding,
      "total:holding",
      `${totals.totalHoldingProfit >= 0 ? "+" : ""}${totals.totalHoldingProfit.toFixed(2)}`,
      holdingTone,
    );
    holding.className = `value num-blur ${holdingTone}`;
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
      header.setAttribute(
        "aria-sort",
        hasDirection
          ? snapshot.state.settings.sortOrder === "asc"
            ? "ascending"
            : "descending"
          : "none",
      );
    });

    renderIndices(snapshot.indices);
    renderRows(snapshot);
    renderTotals(snapshot.totals);
  }

  function positionDeletePopover(popover, trigger) {
    if (
      typeof popover.getBoundingClientRect !== "function" ||
      typeof trigger.getBoundingClientRect !== "function" ||
      typeof popover.style?.setProperty !== "function"
    ) {
      return;
    }

    const popoverRect = popover.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const originX = Math.max(
      16,
      Math.min(
        popoverRect.width - 16,
        triggerRect.left + triggerRect.width / 2 - popoverRect.left,
      ),
    );
    const originY = Math.max(
      0,
      Math.min(popoverRect.height, triggerRect.top - popoverRect.top),
    );
    popover.style.setProperty("--origin-x", `${originX}px`);
    popover.style.setProperty("--origin-y", `${originY}px`);
  }

  function closeDeleteConfirmation(confirmed) {
    if (!pendingDeleteConfirmation) {
      return;
    }

    const pending = pendingDeleteConfirmation;
    pendingDeleteConfirmation = null;
    const animation = animateElement(
      pending.popover,
      [
        { opacity: 1, transform: "translateY(0) scale(1)" },
        { opacity: 0, transform: "translateY(4px) scale(0.96)" },
      ],
      { duration: 140, fill: "forwards" },
    );
    Promise.resolve(animation?.finished)
      .catch(() => {})
      .then(() => {
        pending.popover.hidden = true;
        pending.trigger.focus?.({ preventScroll: true });
        pending.resolve(confirmed);
      });
  }

  function requestDeleteConfirmation() {
    const popover = element("deleteConfirmPopover");
    const trigger = element("deleteDetailBtn");
    if (!popover || !trigger) {
      return Promise.resolve(false);
    }

    if (pendingDeleteConfirmation) {
      closeDeleteConfirmation(false);
    }

    popover.hidden = false;
    const holdingName =
      currentEditingHolding?.name || currentEditingHolding?.code || "这项持仓";
    const copy = element("deleteConfirmCopy");
    if (copy) {
      copy.textContent = `“${holdingName}”的买入记录将从本机移除，此操作无法撤销。`;
    }
    positionDeletePopover(popover, trigger);
    animateElement(
      popover,
      [
        { opacity: 0, transform: "translateY(4px) scale(0.96)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 180 },
    );
    setTimeout(() => {
      element("confirmDeleteBtn")?.focus?.({ preventScroll: true });
    }, 10);

    return new Promise((resolve) => {
      setTimeout(() => {
        pendingDeleteConfirmation = { popover, trigger, resolve };
      }, 0);
    });
  }

  function bind(actions) {
    async function returnToList({ animate = true } = {}) {
      showView("list", { animate });
      await actions.refresh();
    }

    async function saveDetail({ animateReturn = true } = {}) {
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
      await returnToList({ animate: animateReturn });
    }

    element("openAddBtn").addEventListener("click", () => openDetailView(null));
    element("mofishBtn").addEventListener("click", actions.toggleMofishMode);
    element("refreshBtn").addEventListener("click", actions.refresh);
    documentRef.querySelectorAll("th[data-key]").forEach((header) => {
      header.addEventListener("click", () => actions.sortBy(header.dataset.key));
      header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        actions.sortBy(header.dataset.key);
      });
    });
    element("backBtn").addEventListener("click", returnToList);
    element("addRecordBtn").addEventListener("click", () =>
      addRecordRow("", "", "", { animate: true, focus: true }),
    );
    element("saveDetailBtn").addEventListener("click", saveDetail);
    element("deleteDetailBtn").addEventListener("click", async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (currentEditingHolding && (await requestDeleteConfirmation())) {
        await actions.deleteHolding(currentEditingHolding.code);
        await returnToList();
      }
    });
    element("cancelDeleteBtn")?.addEventListener("click", () =>
      closeDeleteConfirmation(false),
    );
    element("confirmDeleteBtn")?.addEventListener("click", () =>
      closeDeleteConfirmation(true),
    );
    documentRef.addEventListener?.("pointerdown", (event) => {
      if (!pendingDeleteConfirmation) {
        return;
      }
      const { popover, trigger } = pendingDeleteConfirmation;
      if (
        popover.contains?.(event.target) ||
        trigger.contains?.(event.target) ||
        event.target === trigger
      ) {
        return;
      }
      closeDeleteConfirmation(false);
    });
    documentRef.addEventListener("keydown", async (event) => {
      if (event.key === "Escape" && pendingDeleteConfirmation) {
        event.preventDefault();
        closeDeleteConfirmation(false);
        return;
      }
      if (
        event.repeat ||
        !element("viewDetail").classList.contains("active") ||
        event.target?.tagName === "BUTTON"
      ) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        await saveDetail({ animateReturn: false });
      } else if (event.key === "Escape") {
        event.preventDefault();
        await returnToList({ animate: false });
      }
    });
  }

  return { bind, render };
}
