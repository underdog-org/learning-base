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

// ------------------------------------------------------- 盲區前置檢查
//
// 以下所有檢查都以 distDir（Cloudflare adapter 的 client 產物）為基準，
// worker 那半邊完全不在視野內。目前所有路由都預渲染、serverDir 為空，
// 因此沒有漏掉任何東西 —— 但這是「現在剛好成立」而非「設計上成立」：
// 哪天出現 on-demand 路由，閘門不會變紅，只會繼續回報 client 的數字並
// 通過。這正是階段六補那個 bug 的形狀（失敗看起來跟成功一模一樣），
// 所以這裡寧可過度反應：serverDir 一出現 JS 就直接失敗，逼人回來處理，
// 而不是讓一筆沒人量的體積悄悄上線。
const serverDir = config.serverDir ? resolve(root, config.serverDir) : null;
if (serverDir) {
  let serverFiles = [];
  try {
    serverFiles = walk(serverDir);
  } catch {
    // 目錄不存在 = adapter 沒產出 worker，沒有盲區可言。
  }
  const serverJs = serverFiles.filter((f) => /\.(js|mjs|cjs)$/.test(f));
  if (serverJs.length > 0) {
    fail(
      `${config.serverDir}/ 出現 ${serverJs.length} 支 JS，代表已有 on-demand 路由。\n` +
        `  ${serverJs.map((f) => relative(serverDir, f)).slice(0, 5).join("\n  ")}` +
        (serverJs.length > 5 ? `\n  …等 ${serverJs.length} 支` : "") +
        `\n\n  閘門的每一條檢查都以 ${config.distDir}/ 為基準，worker 的 JS 不在視野內：` +
        `\n  它不會被計入任何一條紅線，而閘門仍會回報「全數通過」—— 那是綠燈的謊。` +
        `\n\n  修法是讓本腳本明確認知兩個目錄（client 走現有的「由頁面反推」路徑，` +
        `\n  server 另外量並開一條屬於它的紅線），而不是把 distDir 改回 dist ——` +
        `\n  後者會重現「頁面裡的 /_astro/… 對不上 /client/_astro/…」的 key 問題，` +
        `\n  結果是所有由頁面反推的檢查一起讀成 0。`,
    );
  }
}

const sizeOf = (path) => statSync(path).size;
const gzipOf = (path) => gzipSync(readFileSync(path)).length;

// 產物內的 URL（/_astro/foo.js）對應到 dist 內的實際路徑。
const byUrl = new Map(
  files.map((f) => ["/" + relative(distDir, f).split(/[\\/]/).join("/"), f]),
);

// 搜尋 bundle（ADR 0007）自成一類，理由見下方 searchRuntime / searchIndex
// 兩條檢查。它不參與 sharedJs / singleChunk —— 那兩條問的是「我們自己的
// 程式碼有沒有意外合併」，把一支 45KB 的第三方執行期算進去，只會讓
// 「最大單一 chunk」永遠指向它，那條檢查就再也回答不了原本的問題。
const SEARCH_DIR = "pagefind/";
const isSearchFile = (f) => rel(f).startsWith(SEARCH_DIR);
const searchFiles = files.filter(isSearchFile);

const htmlFiles = files.filter((f) => f.endsWith(".html"));
const jsFiles = files.filter((f) => f.endsWith(".js") && !isSearchFile(f));

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
//
// CSS 走的是另一套語意，理由見下方 cssCacheable / pageInlineCss 兩條檢查。
// 這裡只負責把兩種來源分開收集：外部檔（<link rel=stylesheet>）與內嵌
// （<style>）。Astro 的 inlineStylesheets: "auto" 會把小於 4KB 的 scoped CSS
// 內嵌進每一份 HTML，因此只數 .css 檔會漏掉一大半 —— 而且漏掉的方向是錯的，
// 詳見那兩條檢查上方的註解。
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const STYLE_TAG = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
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
    inlineCss: 0,
    cssFiles: [],
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

  for (const [, body] of source.matchAll(STYLE_TAG)) {
    page.inlineCss += Buffer.byteLength(body, "utf8");
  }

  for (const [, attrs] of source.matchAll(LINK_TAG)) {
    const relAttr = attr(attrs, "rel") ?? "";
    const href = attr(attrs, "href");
    const file = href ? byUrl.get(href) : null;
    if (!file) continue;

    if (/\bmodulepreload\b/i.test(relAttr)) {
      // modulepreload 與 <script src> 可能指向同一支檔案，別重複計算。
      if (!page.scripts.some((s) => s.label === href)) add(href, sizeOf(file), file);
    } else if (/\bstylesheet\b/i.test(relAttr)) {
      if (!page.cssFiles.includes(file)) page.cssFiles.push(file);
    }
  }

  pages.push(page);
}

const emptyPage = { path: "—", bytes: 0, scripts: [], inlineCss: 0, cssFiles: [] };
const worstPage = pages.reduce((a, b) => (b.bytes > a.bytes ? b : a), emptyPage);

// 被兩個以上頁面引用者視為共用 chunk —— 亦即位在「所有讀者都要付錢」的路徑上。
const sharedJs = [...referenceCount].filter(([, n]) => n > 1).map(([f]) => f);
const sharedBytes = sum(sharedJs.map(sizeOf));

// 搜尋 bundle 內部再分兩類，因為兩者的成長曲線完全不同：執行期是一次性的
// 固定成本，索引則隨內容線性成長。合成一個數字的話，155KB 的固定成本會把
// 索引的變化整個蓋掉 —— 而索引正是唯一需要長期盯著的那個。
const searchRuntime = searchFiles.filter((f) =>
  /\.(js|pagefind)$/.test(f),
);
const searchIndexFiles = searchFiles.filter((f) => !searchRuntime.includes(f));

const largestChunk = jsFiles.reduce(
  (a, b) => (sizeOf(b) > (a ? sizeOf(a) : 0) ? b : a),
  null,
);

// -------------------------------------------------------------------- CSS
//
// 只認 HTML 實際引用到的外部樣式表 —— 沒有任何頁面引用的 .css 不花任何人的錢，
// 也順帶自動排除 prune-search-bundle 已刪但可能殘留的東西。
const externalCss = [...new Set(pages.flatMap((p) => p.cssFiles))];
const pageExtCss = (p) => sum(p.cssFiles.map(sizeOf));
const worst = (key) =>
  pages.reduce((a, b) => (key(b) > key(a) ? b : a), pages[0] ?? emptyPage);
const worstInlineCss = worst((p) => p.inlineCss);
const worstFirstLoadCss = worst((p) => p.inlineCss + pageExtCss(p));

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
    // 執行期：pagefind.js + worker + wasm。體積固定，只有升版才會變動。
    // 這條的實際作用是回歸測試 —— Pagefind CLI 會無條件產出三套預設 UI
    // （ADR 0007 明確不採用），由 scripts/prune-search-bundle.mjs 刪除。
    // 哪天刪除清單失準或腳本沒跑到，這裡會立刻多出 200KB 以上。
    key: "searchRuntime",
    label: "搜尋執行期",
    actual: sum(searchRuntime.map(sizeOf)),
    detail: searchRuntime.length
      ? `${searchRuntime.length} 個檔案：${searchRuntime.map(rel).map((p) => p.slice(SEARCH_DIR.length)).join(", ")}`
      : "未產生（尚未執行 pagefind）",
  },
  {
    // 索引：分片與結果內容。這是全站唯一會隨內容線性成長的產物 ——
    // 其餘所有數字都由程式碼決定，只有這條由「寫了幾篇文章」決定。
    // 因此它的紅線語意與別條不同：撞線不代表架構退化，而是該檢討
    // 索引範圍（哪些頁面真的需要被搜尋）或分片策略。
    key: "searchIndex",
    label: "搜尋索引",
    actual: sum(searchIndexFiles.map(sizeOf)),
    detail: searchIndexFiles.length
      ? `${searchIndexFiles.length} 個分片`
      : "未產生（尚未執行 pagefind）",
  },
  {
    key: "staticAssets",
    label: "字型與靜態資源",
    actual: sum(assetFiles.map(sizeOf)),
    detail: `${assetFiles.length} 個檔案`,
  },
  {
    // 外部樣式表：跨頁快取，一次站內瀏覽最多付一次。文檔站的主場景是站內
    // 導覽（讀者會連看好幾篇），因此這筆是攤提成本 —— 紅線可以相對寬鬆。
    // 用「全部外部檔的總和」而非單頁的量，是因為讀者逛完整站終究會抓齊，
    // 這個數字就是那個上界。注意與 sharedJs 的定義不同（那條是「被兩頁以上
    // 引用」），因為外部 CSS 就算只有一頁引用也一樣只抓一次。
    key: "cssCacheable",
    label: "外部 CSS（可快取）",
    actual: sum(externalCss.map(sizeOf)),
    detail: `${externalCss.length} 支，gzip ${fmt(sum(externalCss.map(gzipOf)))}`,
  },
  {
    // 內嵌樣式：每一次頁面導覽都重付一次，且無法快取。在站內導覽為主的
    // 側寫下，這才是會被瀏覽頁數乘上去的那一項，紅線刻意設緊。
    //
    // 撞線的正確反應是把 astro.config.mjs 的 inlineStylesheets 改為 "never"，
    // 讓這些 bytes 移進上面那條可快取的桶子，而不是調高這裡。
    // Astro 預設的 "auto"（<4KB 即內嵌）優化的是「只看一頁就走」的落地頁，
    // 那與文檔站的側寫相反。
    key: "pageInlineCss",
    label: "單頁內嵌 CSS（最大）",
    actual: worstInlineCss.inlineCss,
    detail: `${worstInlineCss.path}；全站 ${pages.length} 頁共內嵌 ${fmt(sum(pages.map((p) => p.inlineCss)))}`,
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

// 不設閘的診斷。首次到訪的 CSS 成本（內嵌 + 該頁引用的外部檔）對 LCP 有意義，
// 但不適合當紅線：它把兩種成長曲線完全不同的成本加在一起，撞線時無法指出該修
// 哪一邊 —— 而那正是原本「CSS 總量」那條的毛病。放在這裡只是為了讓內嵌與外部
// 之間的搬移不會再從報告裡消失（上一次搬移被誤報成 4.6KB 的退化，實際是減少
// 6.7KB）。
console.log(
  `\n  診斷（不設閘）  最貴單頁首次載入 CSS ` +
    `${fmt(worstFirstLoadCss.inlineCss + pageExtCss(worstFirstLoadCss))}` +
    `（內嵌 ${fmt(worstFirstLoadCss.inlineCss)} + 外部 ${fmt(pageExtCss(worstFirstLoadCss))}）` +
    `  ${worstFirstLoadCss.path}`,
);

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
  if (f.key === "pageInlineCss") {
    console.error(
      `      內嵌樣式每次頁面導覽都重付。先考慮 astro.config.mjs 的` +
        ` inlineStylesheets: "never"，\n      把這些 bytes 移進「外部 CSS（可快取）」，而非調高本條。`,
    );
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
