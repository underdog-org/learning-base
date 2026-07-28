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

- **所有 editor 與重量級互動元件一律不得進入初始載入路徑。**
  元件本體只能由執行期 `import()` 取得，頁面裡留下的只能是載入器；預設觸發條件是
  「元素進入視窗」，不改變版面、不承載內容的輕量增強元件可用 idle 或其他更早的條件。
  （不使用 Astro 的 `client:*` directive —— 它只作用於 UI framework 元件，
  而本專案不引入 renderer，見 [ADR 0003](0003-no-ui-framework.md)。）
- **同一頁面永遠不出現兩套 editor engine。**
- **樣式 token 必須區分中西兩軸，語言切換透過 `:lang()` 而非 class。**

## 修訂紀錄

| 日期 | 涉及 ADR | 內容 |
|---|---|---|
| 2026-07-28 | [0003](0003-no-ui-framework.md)、[0005](0005-playground-tiers.md)、[0008](0008-performance-budget-gate.md) | 第一條鐵則原寫死 `client:visible`，是把手段寫成目的 —— 真正要禁的是 `client:load`，`client:idle` 同樣不進初始載入路徑。已改為禁用式措辭 |
| 2026-07-28 | [0005](0005-playground-tiers.md) | 建置順序的判準由「L3 先於 L2」改為「依 island 複雜度遞增地驗證邊界」，並補上先行的最小 island。同時修正 `docs/roadmap/todo.md` 中編號與內文互相否定的矛盾 |
| 2026-07-28 | [0008](0008-performance-budget-gate.md) | 紅線分為「人人都付」與「按需才付」兩類。階段六為 Pagefind 做的特例升格為規則，避免 CodeMirror 進場時重新臨時決定 |
| 2026-07-28 | [0003](0003-no-ui-framework.md)、[0005](0005-playground-tiers.md)、[0006](0006-editor-codemirror.md)、[0007](0007-search-pagefind.md)、[0008](0008-performance-budget-gate.md) | **鐵則整組改寫。** 上一次修訂只換了 directive 的名字，沒發現 `client:*` 在本專案根本不可用（它只作用於 UI framework 元件，而 0003 的決策就是不引入 renderer）—— 規範從第一天起就在引用取用不到的機制，且五份文件照抄同一組措辭。改為陳述可觀測的性質：「不得進入初始載入路徑」，與閘門的判準是同一件事。階段八實作時發現 |
| 2026-07-28 | [0008](0008-performance-budget-gate.md) | 補「底網」規則（`deferredIslands`）與靜態 import 圖的漏算。原本「每項排除都要記得開一條紅線」靠人記得，而忘記開的下場是那筆體積永遠不會失敗 |
