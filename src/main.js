import { createHoldingsRepository } from "./adapters/holdings-repository.js";
import { createTencentMarketData } from "./adapters/tencent-market-data.js";
import { createHoldingsApp } from "./app/holdings-app.js";
import { createPopupView } from "./ui/popup-view.js";

document.addEventListener("DOMContentLoaded", async () => {
  const view = createPopupView(document);
  const repository = createHoldingsRepository(chrome.storage.local);
  const marketData = createTencentMarketData();
  const app = createHoldingsApp({
    repository,
    marketData,
    onChange: view.render,
  });

  view.bind({
    refresh: () => app.refresh(),
    saveHolding: (holding) => app.saveHolding(holding),
    deleteHolding: (code) => app.deleteHolding(code),
    sortBy: (key) => app.sortBy(key),
    toggleMofishMode: () => app.toggleMofishMode(),
  });

  await app.initialize();
  window.addEventListener("unload", () => app.dispose());
});
