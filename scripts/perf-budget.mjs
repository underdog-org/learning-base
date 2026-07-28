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
import { join, relative, resolve, extname, dirname } from "node:path";

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

// gsap（ADR 0005 L3，階段九）與搜尋 bundle 同一個處理：第三方執行期不參與
// sharedJs / singleChunk。它 71 KB，本身就超過 singleChunk 的上限，計入的話
// 那條線會永遠指向它 —— 而它唯一該回答的問題是「我們自己的程式碼有沒有意外
// 合併」，不是「頁面上有沒有動畫函式庫」。改由 onDemand.gsapRuntime 涵蓋。
//
// 判定用檔名前綴，而前綴由 astro.config.mjs 的 manualChunks 明確指定。
// 不用「哪支最大」或雜湊檔名 —— 那種判定會在下次 build 悄悄失準，
// 而失準的方向是靜默通過（gsap 混進 singleChunk 只會讓那條線讀不出訊號，
// 不會變紅）。前綴對不上時 gsapRuntime 會讀成 0，那是看得見的失敗。
const GSAP_CHUNK = /(^|\/)gsap[.-][^/]*\.js$/;
const isGsapFile = (f) => GSAP_CHUNK.test(rel(f));
const gsapFiles = files.filter(isGsapFile);

const htmlFiles = files.filter((f) => f.endsWith(".html"));
const jsFiles = files.filter(
  (f) => f.endsWith(".js") && !isSearchFile(f) && !isGsapFile(f),
);

const ASSET_EXT = new Set([
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico",
  ".mp4", ".webm", ".mp3", ".wav",
]);
const assetFiles = files.filter((f) => ASSET_EXT.has(extname(f).toLowerCase()));

// ---------------------------------------------------------------- 逐頁分析

// 只計算「瀏覽器在載入當下就會抓」的 JS：<script src>、inline script、
// modulepreload，**以及這些檔案靜態 import 進來的所有 chunk**。延後載入的
// 元件走執行期 dynamic import，沒有任何 HTML 引用也不在任何被引用 chunk 的
// 靜態 import 圖上，因此自然不計入 —— 這正是我們要保護的性質，而不是漏算。
//
// 靜態 import 那半句是階段八補的，而它補的是一個貨真價實的漏算：
// Rollup 會把多個動態 import 點共用的 Vite preload helper 抽成獨立 chunk，
// 那支 chunk 只被 entry chunk 以 import 敘述引用，HTML 裡沒有它的名字。
// 只認 HTML 的話它就從「人人都付」消失 —— 而它是靜態 import，瀏覽器載入
// 頁面時必然抓它。實測後果比漏算更糟：階段八新增第二個動態 import 點時，
// helper 從 SiteSearch 的 chunk 內嵌變成獨立檔（1394 B），閘門於是把
// 「共用 JS」從 6.9 KB 報成 6.0 KB —— 初始 JS 實際增加約 500 B，報告卻說減少
// 900 B。這又是一次「綠燈的謊」，形狀與階段六補的量錯目錄完全相同。
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

/**
 * 一支 chunk 靜態 import 了哪些檔案。
 *
 * 只認靜態形式（`from"./x.js"` 與副作用式的 `import"./x.js"`）—— 動態
 * import 一律寫成 `import("./x.js")`，帶括號、不帶 from，因此不會被這裡
 * 匹配到。這個區別就是「人人都付」與「按需才付」的分界線，寫死在正則裡
 * 比寫在註解裡可靠。
 */
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*["']([^"']+)["']/g;
const depsCache = new Map();
function staticDeps(file) {
  let deps = depsCache.get(file);
  if (deps) return deps;

  deps = [];
  const dir = dirname(file);
  for (const [, spec] of readFileSync(file, "utf8").matchAll(STATIC_IMPORT)) {
    // 只跟得動相對路徑（同一份產物內）。裸模組名在瀏覽器沒有 import map
    // 也走不通，不會出現在產物裡。
    if (!spec.startsWith(".")) continue;
    const target = resolve(dir, spec);
    if (files.includes(target)) deps.push(target);
  }

  depsCache.set(file, deps);
  return deps;
}

/** 從一支 chunk 出發，靜態可達的全部檔案（含自己）。 */
function reachable(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...staticDeps(file));
  }
  return seen;
}

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

  // 同一支檔案可能被 <script src> 與 modulepreload 同時指到，也可能是兩支
  // entry chunk 的共同靜態依賴 —— 每頁只能算一次。
  const counted = new Set();

  /** 記一支 HTML 引用到的 JS，連同它靜態 import 進來的所有 chunk。 */
  const addJs = (label, file) => {
    for (const dep of reachable(file)) {
      if (counted.has(dep)) continue;
      counted.add(dep);
      add(dep === file ? label : `${rel(dep)}（靜態 import）`, sizeOf(dep), dep);
    }
  };

  for (const [, attrs, body] of source.matchAll(SCRIPT_TAG)) {
    // JSON-LD 之類的資料區塊不是可執行的 JS，跳過。
    const type = attr(attrs, "type");
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type))
      continue;

    const src = attr(attrs, "src");
    if (src) {
      const file = byUrl.get(src);
      if (file) addJs(src, file);
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
      addJs(href, file); // 重複的部分由 addJs 的 counted 擋掉
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

// 延後載入的自有元件（階段八）。
//
// 定義是「沒有任何頁面在初始載入時抓它」—— 亦即 HTML 沒有引用，**且**不在
// 任何被引用 chunk 的靜態 import 圖上（上方 reachable() 已把後者算進
// referenceCount）。那正是延後載入的可觀測特徵：載入器在執行期才 import()，
// Rollup 因此把元件切成獨立 chunk，沒有任何東西在載入當下指向它。
//
// 「靜態 import 圖」這一半不能省。只問「HTML 有沒有引用」的話，Vite 的
// preload helper 這種「被 entry chunk 靜態 import、但 HTML 裡沒有名字」的
// chunk 會落進這條底網，被歸類成按需 —— 它其實人人都付。分類錯的方向還特別
// 糟：它會讓「人人都付」的數字在實際變大時看起來變小。
//
// 但「看不到」與「不存在」在報告裡長得一樣，而這個站已經被這種形狀騙過一次
// （階段六補：閘門量錯目錄，回報 0 B 與全數通過）。因此這條是**底網**而非
// 清單：ADR 0008 要求每一項排除都要開一條屬於自己的紅線，但那條規則靠人記得，
// 忘記開的下場是那筆體積永遠不會失敗。有了底網，新元件不開專屬紅線也不會消失
// —— 它會自動落在這裡；而大型套件另開專屬紅線之後，再從這裡扣除。
const COVERED_BY_OWN_LINE = [
  isSearchFile, // → onDemand.searchRuntime / searchIndex
  isGsapFile, //   → onDemand.gsapRuntime（階段九）
  // 階段十的 CodeMirror 開了專屬紅線之後，判定同樣加在這裡。
  // 扣除的用意與 singleChunk 排除 pagefind 相同：一支 200KB 的第三方執行期
  // 會讓「我們自己的按需元件有多大」這個訊號完全讀不出來。
];
const deferredJs = files.filter(
  (f) =>
    f.endsWith(".js") &&
    !referenceCount.has(f) &&
    !COVERED_BY_OWN_LINE.some((covered) => covered(f)),
);

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
    // gsap 執行期（ADR 0005 L3）。體積由 gsap 版本決定，與我們寫了幾個
    // 控制面板無關 —— core 幾乎不可 tree-shake，實測只用 gsap.to() 與用滿
    // 是同一個數字。因此這條跟 searchRuntime 一樣，實際作用是回歸測試：
    // 它變動只有三種原因，升版、裝了 plugin、或者它不再是按需的。
    //
    // 讀成 0 不是「沒有成本」而是「沒找到」—— 若頁面上明明有 <ease-lab>
    // 卻讀到 0，代表 manualChunks 的具名前綴與這裡的判定對不上了。
    key: "gsapRuntime",
    label: "gsap 執行期",
    actual: sum(gsapFiles.map(sizeOf)),
    detail: gsapFiles.length
      ? `${gsapFiles.length} 支：${gsapFiles.map(rel).join(", ")}`
      : "未產生（尚無頁面使用 <ease-lab>）",
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
    // 延後載入的自有元件。詳見上方 deferredJs 的註解 —— 這條的作用是底網：
    // 讓「沒有任何 HTML 引用」的產物有一個必然會被評估的位置，而不是靠
    // 「記得為它開一條紅線」。撞線時第一個要問的不是「該調高嗎」，而是
    // 「它還是按需的嗎」：若某個元件不小心變成靜態 import，它會從這條
    // 消失並出現在 sharedJs，兩邊的數字會同時動。
    key: "deferredIslands",
    label: "延後載入的元件",
    actual: sum(deferredJs.map(sizeOf)),
    detail: deferredJs.length
      ? `${deferredJs.length} 支：${deferredJs.map(rel).join(", ")}`
      : "無（尚無延後載入的元件）",
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
    // 內嵌樣式：每一次頁面導覽都重付一次，且無法快取。階段七起
    // astro.config.mjs 設定 inlineStylesheets: "never"，這條因此不再是
    // 預算而是回歸測試 —— 上限為 0，任何內嵌都代表有東西繞過了設定。
    key: "pageInlineCss",
    label: "單頁內嵌 CSS（應為 0）",
    actual: worstInlineCss.inlineCss,
    detail: `${worstInlineCss.path}；全站 ${pages.length} 頁共內嵌 ${fmt(sum(pages.map((p) => p.inlineCss)))}`,
  },
];

// -------------------------------------------------------------------- 報告

// 紅線分兩類（ADR 0008）。分類的用途不是整理，而是讓「這筆成本誰付」在報告裡
// 一眼可見 —— 撞線時兩類的正確反應完全相反：「人人都付」撞線是架構退化，
// 「按需才付」撞線第一個要問的是「它還是按需的嗎」，多半只是套件變大。
const CLASSES = [
  { key: "everyonePays", label: "人人都付", note: "初始載入路徑，每位讀者無條件付費" },
  { key: "onDemand", label: "按需才付", note: "執行期 dynamic import，只有觸發該功能的讀者才付" },
];

// 分類與紅線兩邊必須完全對得起來。這個對照本身就是 ADR 0008 那條規則的
// 機器化：「沒有產物可以因為不屬於任何一條而消失在報告裡」—— 階段九／十
// 新增按需產物時，忘記開紅線或忘記歸類都會在這裡失敗，而不是靜靜地通過。
const budgetOf = new Map();
for (const cls of CLASSES) {
  const group = config.budgets[cls.key];
  if (!group) fail(`perf-budget.config.json 缺少 budgets.${cls.key}`);
  for (const [key, budget] of Object.entries(group)) {
    if (key.startsWith("_")) continue;
    budgetOf.set(key, { ...budget, class: cls.key });
  }
}
for (const check of checks) {
  if (!budgetOf.has(check.key))
    fail(
      `紅線缺漏：檢查 ${check.key} 在 perf-budget.config.json 找不到對應紅線。\n` +
        `  每一項產物都必須歸入 budgets.everyonePays 或 budgets.onDemand，` +
        `\n  沒有紅線的產物永遠不會失敗（ADR 0008）。`,
    );
}
for (const key of budgetOf.keys()) {
  if (!checks.some((c) => c.key === key))
    fail(
      `紅線 ${key} 沒有對應的檢查 —— 它永遠不會被評估。\n` +
        `  請補上檢查，或若該產物已不存在就刪掉這條紅線。`,
    );
}

const lines = [`\n效能預算閘門  ${config.distDir}/  —— ${htmlFiles.length} 頁`];
const failures = [];

for (const cls of CLASSES) {
  lines.push(`\n  ${cls.label}　${cls.note}`);

  for (const check of checks.filter((c) => budgetOf.get(c.key).class === cls.key)) {
    const budget = budgetOf.get(check.key);
    const over = check.actual > budget.limit;
    if (over) failures.push({ ...check, limit: budget.limit });

    const pct = budget.limit > 0 ? Math.round((check.actual / budget.limit) * 100) : 0;
    lines.push(
      `  ${over ? "✗" : "✓"} ${pad(check.label, 24)}` +
        `${fmt(check.actual).padStart(9)} / ${fmt(budget.limit).padStart(9)}` +
        `  ${String(pct).padStart(3)}%   ${check.detail}`,
    );
  }
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
      `      astro.config.mjs 已設定 inlineStylesheets: "never"，這條的期望值是 0。` +
        `\n      出現內嵌代表有東西繞過了那個設定（新元件的 is:inline、整合套件自行注入、` +
        `\n      或設定被改動）—— 那是退化而非成長，請找出來源，不要調高本條。`,
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
