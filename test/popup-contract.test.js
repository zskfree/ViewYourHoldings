import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const REQUIRED_IDS = [
  "viewList",
  "viewDetail",
  "openAddBtn",
  "refreshBtn",
  "mofishBtn",
  "totalToday",
  "totalHolding",
  "idxSh",
  "idxHs300",
  "idxCyb",
  "rows",
  "emptyState",
  "loadingState",
  "backBtn",
  "detailHeaderTitle",
  "detailCode",
  "summaryAvgCost",
  "summaryTotalShares",
  "summaryTotalCost",
  "addRecordBtn",
  "recordsList",
  "saveDetailBtn",
  "deleteDetailBtn",
  "deleteConfirmPopover",
  "cancelDeleteBtn",
  "confirmDeleteBtn",
];

test("popup keeps its required DOM and Apple-style interaction contracts", async () => {
  const html = await readFile(new URL("../popup.html", import.meta.url), "utf8");
  const viewSource = await readFile(
    new URL("../src/ui/popup-view.js", import.meta.url),
    "utf8",
  );

  REQUIRED_IDS.forEach((id) => {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  });

  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /--ease-out: cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
  assert.doesNotMatch(html, /transition:\s*all\b/);
  assert.match(
    html,
    /id="deleteConfirmPopover"[^>]*role="alertdialog"[^>]*aria-modal="true"/,
  );
  assert.match(viewSource, /class="remove-rec-btn"[^>]*aria-label=/);
  assert.match(html, /<th[^>]*tabindex="0"[^>]*aria-sort="none"/);
  assert.match(html, /id="mofishBtn"[^>]*aria-label="切换隐私模式"/);
  assert.deepEqual(html.match(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/g), [
    '<script type="module" src="src/main.js"></script>',
  ]);
});
