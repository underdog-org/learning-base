# ADR 0003：不使用 React / Vue，互動元件採 Web Components + Astro Island

- 狀態：已接受
- 日期：2026-07-27

## 脈絡

專案需要多種互動元件：sidebar、TOC、tabs、程式碼編輯器、GSAP 參數控制面板、資料視覺化畫布。

直覺做法是引入一個 UI 框架與元件庫，但本專案的核心約束是：**互動元件不得侵蝕整站的 bundle size 與載入時間**。同時 [ADR 0002](0002-style-system-tokens-cjk.md) 已確立自有的 token 體系與 CJK 排版分層。

## 決策

**完全不使用 React、Vue 或任何 UI 元件庫。**

- 靜態結構與版面：Astro 元件（build 期渲染，零 client JS）
- 互動元件：**Web Components**（`customElements.define`），由執行期 `import()` 延後載入
- 樣式：ADR 0002 的 token 體系

Web Components 自帶狀態封裝、生命週期明確、零 runtime 依賴，且能直接消費全域 CSS custom properties（不使用 Shadow DOM 樣式隔離，讓 token 自然穿透）。

**延後載入不使用 Astro 的 `client:*` directive。** 那組 directive 只作用於 UI framework 元件（React / Vue / Svelte…），而本 ADR 的決策正是不引入任何 renderer —— 兩者不可能同時成立。實際做法是：頁面裡放一個小到可以忽略的載入器（判斷條件 + 一行 `import()`，實測 316 B），元件本體成為獨立 chunk，沒有任何 `<script src>` 或 `modulepreload` 指向它。搜尋拉起 Pagefind（[ADR 0007](0007-search-pagefind.md)）與 `<toc-highlight>` 都是這個形狀。

這個做法還多一項 directive 表達不出來的能力：**載入條件可以是任意判斷**。`<toc-highlight>` 的條件是「這個視窗看得到 TOC 嗎」（`.doc-toc` 在窄螢幕是 `display: none`），因此行動裝置一個位元組都不付 —— `client:idle` 只知道時間，不知道版面。

## 理由

**不用 UI Library**：任何一套（Radix UI、shadcn、Ark）都會帶進自己的 token 體系與預設排版，與 ADR 0002 的 CJK 分層直接衝突。而實際需要的元件（sidebar、TOC、tabs、slider）用原生 HTML + CSS 各約 30 行。

**不用 React**：唯一會迫使引入 React 的情境是採用 `@codesandbox/sandpack-react`。但 Sandpack 另有 framework-agnostic 的 `@codesandbox/sandpack-client`（見 [ADR 0005](0005-playground-tiers.md)），可完全避開。

**Slider / 控制面板**：`<input type="range">` + 少量原生 JS 即可，GSAP 本身也是 framework-agnostic。

## 後果

**接受的成本**

- Playground 需自行撰寫 editor ↔ bundler 的 glue code、檔案分頁、錯誤顯示、loading 狀態，估計 150–250 行。
- 沒有現成元件可用，每個互動元件都要自己寫。
- 無框架的響應式狀態管理，複雜元件需自行處理 DOM 更新。

**獲得的能力**

- 省下 react + react-dom 約 45KB gzip。
- Playground 是會反覆客製的元件（GSAP 需 timeline scrubber、TS 需型別提示、AI/ML 需視覺化畫布），套一層現成 React UI 反而每次都要繞過它。自建的邊際成本隨客製次數遞減。
- 元件之間零共用 runtime，island 切分乾淨，不會出現框架 runtime 被拉進共用 vendor chunk 的情況。

## 鐵則

> **所有 editor 與重量級互動元件一律不得進入初始載入路徑。**
> 元件本體只能由執行期 `import()` 取得，頁面裡留下的只能是載入器；
> 預設觸發條件是「元素進入視窗」，不改變版面、不承載內容的輕量增強元件
> 可用 idle 或其他更早的條件。

此鐵則由 [ADR 0008](0008-performance-budget-gate.md) 的自動化閘門保障，不依賴人工遵守 ——
閘門的判準與這句話是同一件事：**沒有任何頁面在初始載入時抓它**（HTML 沒有引用，
且不在任何被引用 chunk 的靜態 import 圖上）。

> **修訂紀錄（2026-07-28，第一次）**：原文寫死 `client:visible`。那是把手段寫成了目的
> —— 真正要禁的是進入初始載入路徑，而 `client:idle` 同樣走執行期 dynamic import、
> 同樣不計入單頁初始 JS，卻在原措辭下嚴格讀來是違規。
> `<toc-highlight>` 這類純增強元件正是被誤傷的案例。

> **修訂紀錄（2026-07-28，第二次）**：上面那次修訂只換了 directive 的名字，
> 沒有發現**整組 directive 在本專案裡都不存在** —— `client:*` 只作用於 UI framework
> 元件，而本 ADR 的決策就是不引入 renderer。也就是說鐵則從第一天起就在引用一個
> 取用不到的機制，而它「看起來完全合理」，因為 Astro 文件裡到處都是這組字。
> 這是階段八（第一個真的要兌現它的階段）實作時才發現的：三個階段的 ADR、README
> 與 roadmap 都照抄了同一組措辭。
>
> 教訓與階段六補的「綠燈的謊」同類 —— **一份沒有被執行過的規範，讀起來與可執行的
> 規範沒有差別。** 現在的措辭改用「不得進入初始載入路徑」這個可觀測的性質陳述，
> 而不是任何特定 API 的名字：閘門量得到它，因此它會被執行。

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| `@astrojs/react` + `sandpack-react` | 最快能出貨，成本僅限單一 island（~45KB gzip）。但 Playground 需長期客製，框架 UI 會持續成為阻礙 |
| Preact（取代 React） | 體積小得多，但仍引入框架 runtime，且 Sandpack 官方 UI 綁 React，換 Preact 需 alias 相容層 |
| Svelte / Solid | 編譯後 runtime 極小，但為單一元件類型引入完整框架與 build pipeline，效益不成比例 |
| Lit（Web Components 框架） | 提供響應式與模板便利，但引入 ~5KB runtime。先用原生，複雜度真正超標時再重新評估 |

## 相關

- [ADR 0005](0005-playground-tiers.md)：Playground 分層，決定哪些元件需要互動
- [ADR 0006](0006-editor-codemirror.md)：Editor 選型
