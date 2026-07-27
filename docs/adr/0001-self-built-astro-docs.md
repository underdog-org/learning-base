# ADR 0001：自建 Astro 文檔框架，不採用 Starlight / Docusaurus / VitePress

- 狀態：已接受
- 日期：2026-07-27

## 脈絡

專案需要一套對外的書籍與知識庫，按主題分區（TypeScript、GSAP、AI/ML…）。現有的文檔框架看似能直接解決問題，但實際評估後發現兩個核心需求都會撞上它們的邊界：

1. **中文排版**：三套框架的預設 typography 皆為拉丁文設計。要修正需覆寫主題層 CSS，但它們各自有 cascade 層級與 CSS 變數體系，覆寫會演變成 `!important` 戰爭，且每次 minor 升版都可能失效。
2. **互動 Playground**：需要在文章中嵌入可編輯、可執行的程式碼區塊，並且要能精細控制載入時機。框架的 island / 元件支援有其限制，客製化空間受限。

兩個需求都不是「先用著再說」的邊緣需求，而是專案的核心價值。

## 決策

**自建 Astro 文檔站**，使用 Astro 原生的 Content Collections + 自訂 layout，不採用任何文檔框架。

- 單一 site，不拆成多站。主題作為 content collection 的第一層路徑：`src/content/docs/{topic}/…`
- 每個主題擁有自己的 sidebar 與 accent color，共用同一套 token 與 layout。
- 內容格式為 MDX，使互動元件可直接寫入文章。

## 理由

- 排版層 100% 由自己掌握，CJK 調整是自己的 30 行 CSS，而非與他人主題對抗。
- MDX + Astro island 讓「一篇文章混入多個 demo，讀者只載入滾動到的那幾個」成為預設行為。
- 需要自建的輪子有限且成本可估：搜尋（Pagefind）、側邊欄（collection schema 自動生成）、TOC（rehype 外掛），合計約一天工作量。
- 框架真正的賣點（版本管理、i18n、大型團隊協作）對個人知識庫不適用。

## 後果

**接受的成本**

- 需自行實作 sidebar、TOC、搜尋整合、上下篇導航、OG image 等基礎設施。
- 沒有現成主題可用，視覺設計需自己負責。
- 升級 Astro 大版本時，自訂 layout 需自行驗證。

**獲得的能力**

- 排版與載入策略完全可控。
- 新增互動元件不需繞過框架的抽象層。
- 依賴數量最小化，長期維護面小。

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| Starlight + 自訂 CSS | 短期最快，但兩個核心需求都會持續撞它的邊界；CSS 覆寫在每次升版需重修 |
| Docusaurus | React 綁定，與 [ADR 0003](0003-no-ui-framework.md) 的零框架方向衝突 |
| VitePress | 主題客製化空間比 Starlight 更小 |
| 依主題拆成三個站 | 跨主題連結會斷（GSAP 的 TS 型別、AI 的視覺化），搜尋索引要建三次 |

## 相關

- [ADR 0002](0002-style-system-tokens-cjk.md)：自建後的樣式體系設計
- [ADR 0007](0007-search-pagefind.md)：自建需補的搜尋方案
