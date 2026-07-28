# ADR 0007：搜尋採用 Pagefind

- 狀態：已確認
- 日期：2026-07-27

## 脈絡

[ADR 0001](0001-self-built-astro-docs.md) 選擇自建 Astro 文檔站，因此需自行補上搜尋功能。

本專案的搜尋有一個特殊需求：**內容以中文為主**。中文沒有空格分詞，多數為拉丁文設計的全文搜尋方案在中文上的召回率極差。

## 決策

採用 **Pagefind**。

- Build 期掃描產出的靜態 HTML，生成分片索引
- 執行期按需載入索引分片，不需後端服務
- **原生支援中日韓分詞**
- UI 層：先自建（消費 Pagefind 的 JS API），不使用 `@pagefind/default-ui`

## 理由

- CJK 分詞是決定性因素。Pagefind 對此有第一級支援，而 Lunr / FlexSearch 等方案需額外掛分詞器且效果不穩。
- 靜態索引與本專案的部署形態（純靜態站）天然契合，無需維護搜尋服務或申請外部服務額度。
- 索引分片化，搜尋成本與站點規模解耦，符合專案的按需載入原則。
- UI 自建而非用 `@pagefind/default-ui`：後者帶有自己的樣式，與 [ADR 0002](0002-style-system-tokens-cjk.md) 的 token 體系衝突，且搜尋框是使用者高頻接觸的元件，值得自己控制。

## 後果

- 索引在 build 期生成，內容更新需重新 build 才會反映在搜尋結果中（對靜態知識庫可接受）。
- 需在 build pipeline 中加入 Pagefind 步驟（在 `astro build` 之後對 `dist/` 執行）。
- 搜尋 UI（輸入框、結果列表、鍵盤導航、快捷鍵）需自行實作，約一個 Web Component 的工作量。
- 搜尋元件同樣受 island 規則約束，應以 `client:idle` 或使用者觸發時載入，不進 global bundle。

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| Algolia DocSearch | 免費方案需申請與審核、依賴外部服務、CJK 分詞需額外設定，且索引更新受爬蟲排程限制 |
| Lunr.js / FlexSearch | 需自行處理 CJK 分詞，索引為單一大檔（隨內容增長線性膨脹），與按需載入原則衝突 |
| Orama | CJK 支援需額外 tokenizer 套件，生態成熟度低於 Pagefind |
| 不做搜尋，僅靠導航 | 知識庫的核心價值就是能被檢索，不可接受 |

## 相關

- [ADR 0001](0001-self-built-astro-docs.md)：自建所需補齊的基礎設施之一
