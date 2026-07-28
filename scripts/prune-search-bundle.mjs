#!/usr/bin/env node
// 移除 Pagefind 產物中我們不使用的預設 UI（ADR 0007）
//
// ADR 0007 決定自建搜尋 UI，不使用 @pagefind/default-ui。但 Pagefind CLI
// 沒有「只產索引、不產 UI」的選項 —— 它一律把三套預設 UI 與 highlight
// 腳本寫進 bundle 目錄，共約 234KB JS + 63KB CSS。
//
// 這些檔案沒有任何頁面引用，瀏覽器永遠不會抓，因此不影響讀者。但它們會被
// 一起部署，也會被效能閘門看見（閘門掃的是實際產物而非引用關係，這正是它
// 該有的語意）。與其為了容納一堆死檔而放寬紅線，不如刪掉不用的東西。
//
// 保留清單就是「自建 UI 真正需要的最小集合」，任何一個檔案要留下來都必須
// 說得出理由 —— 這份清單本身即是那份理由。

import { readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const bundleDir = resolve(
  import.meta.dirname,
  "..",
  process.argv[2] ?? "dist/pagefind",
);

// 保留：搜尋執行期真正會用到的東西。
//   pagefind.js         —— JS API 進入點，自建 UI 動態 import 的就是它
//   pagefind-worker.js  —— pagefind.js 自己會拉起的 worker
//   wasm.*.pagefind     —— 分詞與查詢引擎
//   *.pf_meta           —— 語言 meta
//   pagefind-entry.json —— 索引進入點清單
//   index/ fragment/    —— 索引分片與結果內容
const KEEP = [
  /^pagefind\.js$/,
  /^pagefind-worker\.js$/,
  /^wasm\..+\.pagefind$/,
  /\.pf_meta$/,
  /^pagefind-entry\.json$/,
];

// 刪除：三套預設 UI（ADR 0007 明確不採用），以及 highlight 腳本 ——
// 後者是「搜尋結果頁面上高亮關鍵字」的選配功能，尚未決定要不要做。
// 哪天要做，把它從這裡拿掉即可，屆時 44KB 的代價會是一個明確的決定。
const PRUNE = [
  /^pagefind-ui\./,
  /^pagefind-modular-ui\./,
  /^pagefind-component-ui\./,
  /^pagefind-highlight\.js$/,
];

let entries;
try {
  entries = readdirSync(bundleDir, { withFileTypes: true });
} catch {
  console.error(
    `\n找不到 ${bundleDir}/ —— 請先執行 pagefind --site dist\n`,
  );
  process.exit(1);
}

let removed = 0;
let bytes = 0;
const unexpected = [];

for (const entry of entries) {
  if (entry.isDirectory()) continue; // index/ 與 fragment/ 一律保留

  if (KEEP.some((re) => re.test(entry.name))) continue;

  const full = join(bundleDir, entry.name);

  if (PRUNE.some((re) => re.test(entry.name))) {
    bytes += statSync(full).size;
    rmSync(full);
    removed += 1;
    continue;
  }

  // 既不在保留清單也不在刪除清單 —— 可能是 Pagefind 升級後新增的檔案。
  // 靜默保留（保守），但要出聲，否則清單會隨版本悄悄失準。
  unexpected.push(entry.name);
}

console.log(
  `\n搜尋 bundle 精簡：移除 ${removed} 個未使用的預設 UI 檔案` +
    `（${(bytes / 1024).toFixed(1)} KB）`,
);

if (unexpected.length) {
  console.warn(
    `  ⚠ 出現未知檔案，已保留但請確認是否需要：${unexpected.join(", ")}\n` +
      `    （Pagefind 升級後可能新增產物，請更新 scripts/prune-search-bundle.mjs 的清單）`,
  );
}
