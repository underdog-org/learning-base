# ADR 0006：Editor 採用 CodeMirror 6，延後 Monaco

- 狀態：已接受
- 日期：2026-07-27

## 脈絡

[ADR 0005](0005-playground-tiers.md) 的 L2 需要一個可編輯的程式碼編輯器。由於採用 `@codesandbox/sandpack-client`（不含 UI 與 editor），editor 需自行選型。

主要候選為 CodeMirror 6 與 Monaco：

| | CodeMirror 6 | Monaco |
|---|---|---|
| 體積 | ~200KB | ~2–3MB + worker 設定 |
| 行動裝置 | 良好 | 差 |
| **中文 IME** | **支援正常** | 歷史上有已知問題 |
| TypeScript 型別服務 | 需外接 `@typescript/vfs` | 內建完整 language service |

## 決策

**採用 CodeMirror 6 作為唯一 editor。現階段不安裝 Monaco。**

- 核心套件：`codemirror` + `@codemirror/lang-javascript` / `-css` / `-html`（按主題按需加語言套件）
- Monaco 的引入條件：**僅在 TypeScript 型別教學的專屬路由**（如 `/typescript/playground`），且以動態 `import()` 載入

## 鐵則

> **同一頁面永遠不出現兩套 editor engine。**

## 理由

**為何是 CodeMirror**：中文 IME 支援正常這一點對本專案是硬需求 —— 知識庫的讀者會在編輯器中輸入中文註解。行動裝置友善對公開知識庫同樣重要。

**為何延後 Monaco**：Monaco 唯一無可取代的是完整的 TypeScript language service（真實型別檢查、hover、跨檔案 autocomplete）。但關鍵事實是：

> **型別服務的主要成本與編輯器選誰無關。** 完整型別檢查需載入 `typescript` 編譯器（約 7MB raw）加上相關 `.d.ts` 檔。CodeMirror 走 `@typescript/vfs` 路線同樣要付這筆錢。

因此 Monaco 的增量成本只有它自身的 2–3MB，而非 10MB。這意味著：當 TypeScript 專區真正需要型別提示時，直接用 Monaco 反而比在 CodeMirror 上拼裝 `@typescript/vfs` 更划算 —— 但那是一個獨立的、屆時再做的決策，不影響現在。

## 後果

- L2 Playground 初期沒有型別提示與自動完成，僅有語法高亮與括號匹配。
- TypeScript 主題的深度互動內容需等待 Monaco 階段。
- 屆時全站會有兩套 editor engine 存在於 codebase 中（但不同時出現於同一頁面），需在 [ADR 0008](0008-performance-budget-gate.md) 的閘門中特別驗證 chunk 分離是否正確。

## 效能說明

在延後載入的架構下（元件本體只由執行期 `import()` 取得，見 [ADR 0003](0003-no-ui-framework.md)），未使用 editor 的頁面成本為**真正的零**。實際風險只有兩個，皆為架構性而非選型性：

1. 同頁載入兩套 engine（由上述鐵則排除）
2. Rollup 將兩者拉進共用 vendor chunk —— 分屬不同 island 時不會發生，但需由閘門實測驗證

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| 一開始就裝 Monaco | 體積、行動裝置體驗、中文 IME 三項皆劣，且其優勢（型別服務）在初期用不到 |
| 兩者都裝，按主題切換 | 違反「同頁不出現兩套 engine」的初衷，且提早付出維護兩套整合的成本 |
| CodeMirror + `@typescript/vfs`（現在就做） | 仍需載入 7MB 的 TS 編譯器，成本與 Monaco 相當但實作複雜度更高 |
| 純 `<textarea>` + Shiki 覆蓋層 | 極輕，但選取、縮排、括號匹配等基本編輯體驗需自行實作，長期成本高於 CodeMirror |

## 相關

- [ADR 0005](0005-playground-tiers.md)：L2 的整體架構
- [ADR 0003](0003-no-ui-framework.md)：不採用 `sandpack-react` 的決定，是本 ADR 存在的前提
