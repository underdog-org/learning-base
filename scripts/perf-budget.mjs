#!/usr/bin/env node
// 效能預算閘門（ADR 0008）
//
// 「按需載入」不是一次性決策，而是每次新增元件都可能悄悄破壞的性質。
// 典型失效路徑：某元件為了共用一個小工具函式而 import 了 editor 的 barrel
// file，Rollup 於是把整個 editor 拉進共用 chunk —— 沒有錯誤訊息，只有主動
// 檢查產物時才會發現。本腳本把這件事從人工紀律換成機器保障。
//
// 紅線一律定義在 perf-budget.config.json，與本檔分離，好讓調高紅線在 diff
// 裡是獨立且顯眼的一行。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, resolve, extname } from "node:path";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(
  readFileSync(join(root, "perf-budget.config.json"), "utf8"),
);
const distDir = resolve(root, config.distDir);

/** 遞迴列出 dist 底下所有檔案的絕對路徑。 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(distDir);
} catch {
  fail(`找不到產物目錄 ${config.distDir}/，請先執行 astro build`);
}

const sizeOf = (path) => statSync(path).size;
const gzipOf = (path) => gzipSync(readFileSync(path)).length;

// 產物內的 URL（/_astro/foo.js）對應到 dist 內的實際路徑。
const byUrl = new Map(
  files.map((f) => ["/" + relative(distDir, f).split(/[\\/]/).join("/"), f]),
);

const htmlFiles = files.filter((f) => f.endsWith(".html"));
const jsFiles = files.filter((f) => f.endsWith(".js"));
const cssFiles = files.filter((f) => f.endsWith(".css"));

const ASSET_EXT = new Set([
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico",
  ".mp4", ".webm", ".mp3", ".wav",
]);
const assetFiles = files.filter((f) => ASSET_EXT.has(extname(f).toLowerCase()));

// ---------------------------------------------------------------- 逐頁分析

// 只計算「瀏覽器在載入當下就會抓」的 JS：<script src>、inline script、
// modulepreload。client:visible / client:idle 的元件走的是執行期 dynamic
// import，Astro 不會為它們發 modulepreload，因此自然不計入 —— 這正是我們
// 要保護的性質，而不是漏算。
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const LINK_TAG = /<link\b([^>]*)>/gi;
const attr = (attrs, name) =>
  attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];

const pages = [];
const referenceCount = new Map(); // JS 檔案 → 引用它的頁面數

for (const html of htmlFiles) {
  const source = readFileSync(html, "utf8");
  const page = {
    path: "/" + relative(distDir, html).split(/[\\/]/).join("/"),
    bytes: 0,
    scripts: [],
  };

  const add = (label, bytes, file) => {
    page.bytes += bytes;
    page.scripts.push({ label, bytes });
    if (file) referenceCount.set(file, (referenceCount.get(file) ?? 0) + 1);
  };

  for (const [, attrs, body] of source.matchAll(SCRIPT_TAG)) {
    // JSON-LD 之類的資料區塊不是可執行的 JS，跳過。
    const type = attr(attrs, "type");
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type))
      continue;

    const src = attr(attrs, "src");
    if (src) {
      const file = byUrl.get(src);
      if (file) add(src, sizeOf(file), file);
    } else if (body.trim()) {
      add("(inline)", Buffer.byteLength(body, "utf8"));
    }
  }

  for (const [, attrs] of source.matchAll(LINK_TAG)) {
    if (!/\bmodulepreload\b/i.test(attr(attrs, "rel") ?? "")) continue;
    const href = attr(attrs, "href");
    const file = href && byUrl.get(href);
    // modulepreload 與 <script src> 可能指向同一支檔案，別重複計算。
    if (file && !page.scripts.some((s) => s.label === href))
      add(href, sizeOf(file), file);
  }

  pages.push(page);
}

const worstPage = pages.reduce(
  (a, b) => (b.bytes > a.bytes ? b : a),
  { path: "—", bytes: 0, scripts: [] },
);

// 被兩個以上頁面引用者視為共用 chunk —— 亦即位在「所有讀者都要付錢」的路徑上。
const sharedJs = [...referenceCount].filter(([, n]) => n > 1).map(([f]) => f);
const sharedBytes = sum(sharedJs.map(sizeOf));

const largestChunk = jsFiles.reduce(
  (a, b) => (sizeOf(b) > (a ? sizeOf(a) : 0) ? b : a),
  null,
);

// ------------------------------------------------------------------ 檢查

const checks = [
  {
    key: "sharedJs",
    label: "共用 JS 總量",
    actual: sharedBytes,
    detail:
      sharedJs.length === 0
        ? "無共用 chunk"
        : `${sharedJs.length} 個 chunk：${sharedJs.map(rel).join(", ")}`,
  },
  {
    key: "singleChunk",
    label: "最大單一 chunk",
    actual: largestChunk ? sizeOf(largestChunk) : 0,
    detail: largestChunk ? rel(largestChunk) : `無 JS 產物（共 ${jsFiles.length} 支）`,
  },
  {
    key: "pageInitialJs",
    label: "單頁初始 JS（最大）",
    actual: worstPage.bytes,
    detail: `${worstPage.path}；共 ${pages.length} 頁`,
  },
  {
    key: "staticAssets",
    label: "字型與靜態資源",
    actual: sum(assetFiles.map(sizeOf)),
    detail: `${assetFiles.length} 個檔案`,
  },
  {
    key: "css",
    label: "CSS 總量",
    actual: sum(cssFiles.map(sizeOf)),
    detail: `${cssFiles.length} 支，gzip ${fmt(sum(cssFiles.map(gzipOf)))}`,
  },
];

// -------------------------------------------------------------------- 報告

const lines = [`\n效能預算閘門  ${config.distDir}/  —— ${htmlFiles.length} 頁\n`];
const failures = [];

for (const check of checks) {
  const budget = config.budgets[check.key];
  if (!budget) fail(`perf-budget.config.json 缺少 budgets.${check.key}`);

  const over = check.actual > budget.limit;
  if (over) failures.push({ ...check, limit: budget.limit });

  const pct = budget.limit > 0 ? Math.round((check.actual / budget.limit) * 100) : 0;
  lines.push(
    `  ${over ? "✗" : "✓"} ${pad(check.label, 24)}` +
      `${fmt(check.actual).padStart(9)} / ${fmt(budget.limit).padStart(9)}` +
      `  ${String(pct).padStart(3)}%   ${check.detail}`,
  );
}

console.log(lines.join("\n"));

if (failures.length === 0) {
  console.log("\n  全數通過。\n");
  process.exit(0);
}

console.error("\n效能預算超線：\n");
for (const f of failures) {
  console.error(
    `  ${f.label}：${fmt(f.actual)} 超過上限 ${fmt(f.limit)}` +
      `（+${fmt(f.actual - f.limit)}）`,
  );
  if (f.key === "pageInitialJs" && worstPage.scripts.length) {
    for (const s of worstPage.scripts.sort((a, b) => b.bytes - a.bytes))
      console.error(`      ${fmt(s.bytes).padStart(9)}  ${s.label}`);
  }
}
console.error(
  "\n預設反應是修正架構（改成 island + client:visible、拆掉 barrel import），" +
    "\n而非放寬 perf-budget.config.json。若確實需要調高紅線，理由必須寫進 commit message。\n",
);
process.exit(1);

// ------------------------------------------------------------------ 小工具

function sum(ns) {
  return ns.reduce((a, b) => a + b, 0);
}

function rel(path) {
  return relative(distDir, path).split(/[\\/]/).join("/");
}

/** 終端機等寬字型下，CJK 佔兩格 —— 直接 padEnd 會讓欄位參差。 */
function pad(text, width) {
  const shown = [...text].reduce(
    (n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1),
    0,
  );
  return text + " ".repeat(Math.max(0, width - shown));
}

function fmt(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function fail(message) {
  console.error(`\n效能預算閘門無法執行：${message}\n`);
  process.exit(1);
}
