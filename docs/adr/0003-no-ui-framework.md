# ADR 0003：不使用 React / Vue，互動元件採 Web Components + Astro Island

- 狀態：已接受
- 日期：2026-07-27

## 脈絡

專案需要多種互動元件：sidebar、TOC、tabs、程式碼編輯器、GSAP 參數控制面板、資料視覺化畫布。

直覺做法是引入一個 UI 框架與元件庫，但本專案的核心約束是：**互動元件不得侵蝕整站的 bundle size 與載入時間**。同時 [ADR 0002](0002-style-system-tokens-cjk.md) 已確立自有的 token 體系與 CJK 排版分層。

## 決策

**完全不使用 React、Vue 或任何 UI 元件庫。**

- 靜態結構與版面：Astro 元件（build 期渲染，零 client JS）
- 互動元件：**Web Components**（`customElements.define`）+ Astro island（`client:visible`）
- 樣式：ADR 0002 的 token 體系

Web Components 的心智模型與 Astro island 完全一致 —— 自帶狀態封裝、生命週期明確、零 runtime 依賴，且能直接消費全域 CSS custom properties（不使用 Shadow DOM 樣式隔離，讓 token 自然穿透）。

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

> **所有 editor 與重量級互動元件一律是 Astro island，禁用 `client:load`，永遠不進 global bundle。**
> 預設 `client:visible`；不改變版面、不承載內容的輕量增強元件可用 `client:idle`。

此鐵則由 [ADR 0008](0008-performance-budget-gate.md) 的自動化閘門保障，不依賴人工遵守。

> **修訂紀錄（2026-07-28）**：原文寫死 `client:visible`。那是把手段寫成了目的 ——
> 真正要禁的是 `client:load`（它會進初始載入路徑），而 `client:idle` 同樣走執行期
> dynamic import、同樣不計入單頁初始 JS，卻在原措辭下嚴格讀來是違規。
> `<toc-highlight>` 這類純增強元件正是被誤傷的案例。

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
