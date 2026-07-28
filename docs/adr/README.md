# 架構決策記錄（ADR）

本目錄記錄 learning-base 文檔體系的架構決策。每份 ADR 描述一個決策、當時的脈絡、以及接受的後果。

## 專案定位

對外的書籍與知識庫，按主題分區（TypeScript、GSAP、AI/ML…），內容需要可互動的程式碼 Demo 與 Playground。

## 兩個驅動性痛點

1. **中文排版**：Starlight / VitePress / Docusaurus 的預設 typography 為拉丁文設計，渲染中文效果不佳，且主題層難以乾淨覆寫。
2. **互動元件**：需要嵌入可編輯、可執行的 Playground，但不能讓互動元件侵蝕整站的 bundle size 與載入時間。

## 決策索引

| 編號 | 標題 | 狀態 |
|---|---|---|
| [0001](0001-self-built-astro-docs.md) | 自建 Astro 文檔框架，不採用 Starlight / Docusaurus / VitePress | 已接受 |
| [0002](0002-style-system-tokens-cjk.md) | 樣式體系：CSS `@layer` + 中西雙軸 Token + `:lang()` 隔離 | 已接受 |
| [0003](0003-no-ui-framework.md) | 不使用 React / Vue，互動元件採 Web Components + Astro Island | 已接受 |
| [0004](0004-cjk-font-strategy.md) | 中文字型：系統字型優先，分片子集化為後備 | 已接受 |
| [0005](0005-playground-tiers.md) | Playground 分為 L1–L4 四級，不以單一方案通吃 | 已接受 |
| [0006](0006-editor-codemirror.md) | Editor 採用 CodeMirror 6，延後 Monaco | 已接受 |
| [0007](0007-search-pagefind.md) | 搜尋採用 Pagefind | 已接受 |
| [0008](0008-performance-budget-gate.md) | 建立效能預算閘門 | 已接受 |
| [0009](0009-cjk-latin-spacing.md) | 中英混排空白交由 CSS，暫緩自訂外掛 | 已接受 |

## 貫穿全域的鐵則

以下約束由多份 ADR 共同支撐，任何新增元件都必須遵守：

- **所有 editor 與重量級互動元件一律是 Astro island，禁用 `client:load`，永遠不進 global bundle。**
  預設 `client:visible`；不改變版面、不承載內容的輕量增強元件可用 `client:idle`。
- **同一頁面永遠不出現兩套 editor engine。**
- **樣式 token 必須區分中西兩軸，語言切換透過 `:lang()` 而非 class。**

## 修訂紀錄

| 日期 | 涉及 ADR | 內容 |
|---|---|---|
| 2026-07-28 | [0003](0003-no-ui-framework.md)、[0005](0005-playground-tiers.md)、[0008](0008-performance-budget-gate.md) | 第一條鐵則原寫死 `client:visible`，是把手段寫成目的 —— 真正要禁的是 `client:load`，`client:idle` 同樣不進初始載入路徑。已改為禁用式措辭 |
| 2026-07-28 | [0005](0005-playground-tiers.md) | 建置順序的判準由「L3 先於 L2」改為「依 island 複雜度遞增地驗證邊界」，並補上先行的最小 island。同時修正 `docs/roadmap/todo.md` 中編號與內文互相否定的矛盾 |
| 2026-07-28 | [0008](0008-performance-budget-gate.md) | 紅線分為「人人都付」與「按需才付」兩類。階段六為 Pagefind 做的特例升格為規則，避免 CodeMirror 進場時重新臨時決定 |
