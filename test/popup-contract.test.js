import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
];

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

test("popup keeps its existing DOM and CSS with one module entry", async () => {
  const html = await readFile(new URL("../popup.html", import.meta.url), "utf8");

  REQUIRED_IDS.forEach((id) => {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  });

  const style = html.match(/<style>[\s\S]*?<\/style>/)?.[0];
  assert.equal(
    sha256(style),
    "195E1CFC77ADDC2EE0207C855D7B945B3EC02FB43766CD189E04156EDEB76982",
  );

  const scriptStart = html.indexOf("  <script");
  assert.equal(
    sha256(html.slice(0, scriptStart)),
    "4FE0CEC9FC844AA0B1670FC08EE48EEB520D93F1726310B146F350A3CDFB72ED",
  );
  assert.match(html, /id="mofishBtn"[^>]*aria-label="切换隐私模式"/);
  assert.deepEqual(html.match(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/g), [
    '<script type="module" src="src/main.js"></script>',
  ]);
});
