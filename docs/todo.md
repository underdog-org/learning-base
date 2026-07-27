# 建置順序與任務

依賴順序：**Styles（Token + Variant） → DocLayout → Rehype → 效能閘門 → 互動元件**

決策依據見 [docs/adr](adr/)。本文件只描述「做什麼、依什麼順序」，「為什麼」一律回查 ADR。

---

## 現況

- Minimal Astro project（`astro@^7.1.4`，pnpm workspace）
- 尚未安裝任何額外依賴

---

## 階段一：樣式地基

> ADR [0002](adr/0002-style-system-tokens-cjk.md)、[0004](adr/0004-cjk-font-strategy.md)

**目標**：建立 token 體系與 CJK 排版規則。此階段不需要任何新依賴。

- [ ] 建立 `src/styles/` 結構
  - [ ] `reset.css` —— 最小化 reset
  - [ ] `tokens.css` —— primitive + semantic token
  - [ ] `base.css` —— 元素預設樣式
- [ ] 宣告 `@layer reset, tokens, base, components, utilities;`
- [ ] **Primitive token 雙軸**
  - [ ] 字型：`--font-latin` / `--font-cjk`（系統字型，零下載）
  - [ ] 行高：`--leading-latin: 1.6` / `--leading-cjk: 1.8`
  - [ ] 行寬：`--measure-latin: 65ch` / `--measure-cjk: 40em`
  - [ ] 間距 scale、字級 scale、圓角、陰影
  - [ ] 色彩：參考 Radix Colors 的 12 階 + light/dark 配對
- [ ] **Semantic token** 由 primitive 組合（`--font-body`、`--leading-body`、`--measure-body`…）
- [ ] **`:lang()` 隔離層** —— `:root:lang(zh), [lang^="zh"]` 覆寫語意 token
- [ ] CJK 排版規則
  - [ ] `text-spacing-trim: space-first`（標點擠壓，視覺改善最大）
  - [ ] `text-autospace: normal`（中英混排）
  - [ ] 確認目標瀏覽器支援度並準備 fallback
  - [ ] 段距 ≥ 行距 × 1.5
  - [ ] 只使用真實字重（400 / 700），禁用合成假粗體
- [ ] 建立 `/style-guide` 測試頁：中文長文、中英混排、全形標點、清單、引言、表格

**驗收**：`/style-guide` 的中文排版目測優於 Starlight 預設。

---

## 階段二：DocLayout 與內容結構

> ADR [0001](adr/0001-self-built-astro-docs.md)

**目標**：能渲染純文字文章，驗證階段一的排版在真實內容上成立。

- [ ] 安裝 `@astrojs/mdx`，設定 `astro.config.mjs`
- [ ] Content Collections
  - [ ] `src/content.config.ts` —— docs collection schema（title、description、order、topic、draft…）
  - [ ] 目錄結構 `src/content/docs/{topic}/…`
  - [ ] 建立三個主題骨架：`typescript/`、`gsap/`、`ai-ml/`
- [ ] 動態路由 `src/pages/docs/[...slug].astro`
- [ ] **Layout 元件拆分**（參考 Fumadocs 的組合模型與 Starlight 的原始碼結構）
  - [ ] `DocLayout.astro` —— 三欄骨架
  - [ ] `Sidebar.astro` —— 由 collection 自動生成，按 topic 分區
  - [ ] `TableOfContents.astro`
  - [ ] `Header.astro`
  - [ ] `PrevNext.astro`
- [ ] 每個 topic 的 accent color（透過 token 覆寫，不新增 component）
- [ ] 寫 2–3 篇真實中文文章驗證

**驗收**：純文字文章頁的 client JS 為 0；三個主題導航正常。

---

## 階段三：Rehype / Remark

> ADR [0002](adr/0002-style-system-tokens-cjk.md)

**注意**：Astro 已內建 GFM、smartypants、標題 ID 自動生成（github-slugger）—— 不需 `rehype-slug`。

- [ ] 安裝 `rehype-autolink-headings`，設定標題錨點
- [ ] 評估中英混排空白方案
  - [ ] 優先走 CSS `text-autospace`（階段一已做）
  - [ ] 若支援度不足，改為自訂 remark plugin（build 期插入細空格，跳過 code / 連結節點）
- [ ] Shiki 設定（`markdown.shikiConfig`）：主題與 token 色彩對齊階段一
- [ ] 視需要：閱讀時間、外部連結標記

**驗收**：錨點連結可用；中英混排間距正確且不影響程式碼區塊。

---

## 階段四：效能預算閘門 ⚠️

> ADR [0008](adr/0008-performance-budget-gate.md)

**必須在任何互動元件之前完成。** 此時產物最乾淨，是設定基準線的最佳時機。

- [ ] 寫 build 後檢查腳本（Node，約十幾行），驗證 `dist/`
  - [ ] Global / 共用 chunk 的 JS 總量上限（核心防線）
  - [ ] 單一 chunk 體積上限
  - [ ] 每頁初始載入 JS 總量（純文章頁應趨近 0）
  - [ ] 字型與靜態資源總量
- [ ] 接到 `package.json` 的 build script，超線即失敗
- [ ] 以當前產物設定基準紅線並記錄
- [ ] 寫入使用原則：**紅線調高必須在 commit message 說明理由**

**驗收**：故意 import 一個大套件會導致 build 失敗。

---

## 階段五：L1 程式碼區塊

> ADR [0005](adr/0005-playground-tiers.md)

- [ ] 安裝 `astro-expressive-code`
- [ ] 設定主題，色彩對齊階段一 token
- [ ] 驗證功能：diff 標記、行高亮、檔名框、複製鈕
- [ ] 確認 client JS 增量僅為複製鈕（極小）
- [ ] 通過階段四閘門

**驗收**：全站 80% 以上的程式碼區塊由此層涵蓋。

---

## 階段六：搜尋 🔶 待決定

> ADR [0007](adr/0007-search-pagefind.md) —— **狀態：待決定，方案未定案前不動工**

- [ ] 定案 ADR 0007
- [ ] 若採用 Pagefind：
  - [ ] 安裝 `pagefind`，加入 `astro build` 之後的 pipeline
  - [ ] 驗證中文分詞召回率（先做這步再寫 UI）
  - [ ] 自建搜尋 UI（Web Component），**不使用 `@pagefind/default-ui`**
  - [ ] `client:idle` 或使用者觸發時載入
  - [ ] 通過階段四閘門

---

## 階段七：L3 控制變數面板（GSAP 主力）

> ADR [0005](adr/0005-playground-tiers.md)、[0003](adr/0003-no-ui-framework.md)

**刻意排在 L2 之前** —— 技術上簡單得多、對 GSAP 教學價值更高，且能先驗證 island 邊界設計是否成立。

- [ ] 安裝 `gsap`
- [ ] 建立第一個 Web Component（`customElements.define`，不使用 Shadow DOM 樣式隔離，讓 token 穿透）
  - [ ] `<control-panel>` —— `<input type="range">` 群組，即改即看
  - [ ] `<timeline-scrubber>` —— GSAP timeline 進度控制
  - [ ] ease 曲線視覺化
- [ ] 包成 Astro island，`client:visible`
- [ ] 在 MDX 中直接使用，寫一篇 GSAP 文章驗證
- [ ] 通過階段四閘門

**驗收**：未使用該元件的頁面 JS 增量為 0；同頁多個實例互不干擾。

---

## 階段八：L2 可執行 Playground

> ADR [0005](adr/0005-playground-tiers.md)、[0006](adr/0006-editor-codemirror.md)

- [ ] 安裝 `@codesandbox/sandpack-client`
- [ ] 安裝 `codemirror` + 語言套件（`@codemirror/lang-javascript` 等，按需）
- [ ] 撰寫 glue code（核心約 80–100 行，含 UI 約 150–250 行）
  - [ ] `loadSandpackClient(iframe, content, options)` 掛載
  - [ ] CodeMirror `onChange` → `client.updateSandbox({ files })` 熱更新（含 debounce）
  - [ ] 多檔案分頁
  - [ ] 錯誤顯示與 loading 狀態
  - [ ] reset 到初始程式碼
- [ ] 包成 Astro island，`client:visible`
- [ ] **驗證中文 IME 輸入正常**（選 CodeMirror 的關鍵理由）
- [ ] 驗證行動裝置可用性
- [ ] 通過階段四閘門

**驗收**：一篇文章放 5 個 Playground，只有滾動到的才載入。

---

## 階段九：L4 視覺化（AI/ML）

> ADR [0005](adr/0005-playground-tiers.md)

- [ ] 建立視覺化 Web Component（Canvas / SVG，複用 GSAP）
  - [ ] 梯度下降動畫
  - [ ] attention heatmap
  - [ ] latent space 散點圖
- [ ] 若確有執行需求，再評估 Pyodide（另開 ADR）

---

## 後續（無明確順序）

- [ ] 中文字型分片子集化 —— `cn-font-split`，僅在排版規則到位且視覺確有需求時啟動（ADR [0004](adr/0004-cjk-font-strategy.md)）
- [ ] Monaco —— 僅限 TypeScript 型別教學路由，動態 `import()`，需驗證 chunk 分離（ADR [0006](adr/0006-editor-codemirror.md)）
- [ ] OG image 自動生成
- [ ] RSS / sitemap
- [ ] 深色模式（token 已預留，需補切換 UI）
- [ ] `class-variance-authority` —— 若 variant 複雜度上升再評估（build 期執行，client 零成本）

---

## 三條鐵則

任何新增元件都必須遵守，由階段四的閘門保障：

1. **所有 editor 與重量級互動元件一律是 Astro island + `client:visible`，永遠不進 global bundle。**
2. **同一頁面永遠不出現兩套 editor engine。**
3. **樣式 token 必須區分中西兩軸，語言切換透過 `:lang()` 而非 class。**

## 明確排除

- React / Vue / 任何 UI 元件庫（ADR [0003](adr/0003-no-ui-framework.md)）
- Tailwind 或任何樣式框架（ADR [0002](adr/0002-style-system-tokens-cjk.md)）
- 全量載入中文 webfont（ADR [0004](adr/0004-cjk-font-strategy.md)）
- WebContainers —— 需 COOP/COEP header，影響全站（ADR [0005](adr/0005-playground-tiers.md)）
