# ADR 0004：中文字型 —— 系統字型優先，分片子集化為後備

- 狀態：已接受
- 日期：2026-07-27

## 脈絡

中文網頁字型是本專案**最大的效能風險**，量級高於任何互動元件：

- 完整的思源黑體 / Noto Sans TC，**單一字重即 5–20MB**
- 作為對照，Monaco Editor 全量載入約 2–3MB

若隨手引入 `@fontsource/noto-sans-tc`，光首屏字型就會吃掉 island 架構省下的全部預算，使 [ADR 0003](0003-no-ui-framework.md) 的所有努力失去意義。

同時必須認清：**中文網頁排版的「醜」，八成來自 `line-height`、標點擠壓、中英混排空白，而非字型本身**（見 [ADR 0002](0002-style-system-tokens-cjk.md)）。先修排版規則的投報率遠高於換字型。

## 決策

**階段一（現在）：系統字型，零下載。**

```css
--font-cjk: "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif;
```

涵蓋 macOS / iOS（PingFang TC）、Windows（Microsoft JhengHei）、Linux / Android（Noto Sans CJK TC）。

**階段二（僅在排版規則已到位、且視覺確有需求時）：分片子集化。**

使用 `cn-font-split` 將字型切成數百個帶 `unicode-range` 的 woff2 分片，瀏覽器只下載頁面實際用到的字。這是中文網站的標準解法。

**明確排除：全量載入中文 webfont。**

## 理由

- Token 層已將字型抽象為 `--font-cjk`（ADR 0002），從階段一升級到階段二只需更換該變數與新增 `@font-face` 分片宣告，**不影響任何 component**。此抽象讓延後決策的成本趨近於零。
- 系統字型在各平台上的中文渲染品質已足夠好，真正的差距在排版規則。
- 先做排版、後做字型，可避免用昂貴的字型掩蓋廉價就能修好的問題。

## 後果

- 不同作業系統的中文字型外觀不一致，需接受此差異（設計上避免依賴精確的字寬與字高）。
- 階段二啟動時，需在 build pipeline 中加入字型切分步驟，並處理分片檔的部署與快取策略。
- 字重選擇受限於系統字型提供的真實字重（通常僅 Regular / Medium / Bold），符合 ADR 0002「不用合成假粗體」的規則。

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| `@fontsource/noto-sans-tc` 全量 | 5–20MB／字重，直接違反專案的核心效能約束 |
| Google Fonts CDN 載入中文 | 同樣的體積問題，且增加第三方網域依賴與隱私考量 |
| 僅在標題使用中文 webfont | 標題字元集不可預測，仍需完整字型或動態子集化，複雜度不低於分片方案 |
| 手動 `fontmin` 靜態子集 | 需預先知道全站用字，新增文章即失效，不適合持續更新的知識庫 |

## 相關

- [ADR 0002](0002-style-system-tokens-cjk.md)：`--font-cjk` token 的定義位置
- [ADR 0008](0008-performance-budget-gate.md)：字型體積應納入預算閘門的監控範圍
