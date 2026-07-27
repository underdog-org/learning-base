# 建置順序與任務

依賴順序：**Styles（Token + Variant） → DocLayout → Rehype → 效能閘門 → 互動元件**

決策依據見 [docs/adr](adr/)。本文件只描述「做什麼、依什麼順序」，「為什麼」一律回查 ADR。

---

## 現況

**階段一至四完成並通過人工驗證。** 效能閘門已在零 JS 的乾淨產物上設好基準線，
之後每次 `pnpm build` 都會擋。下一步建議先做 `<toc-highlight>` scroll spy ——
它約 30 行、代價已知極小，是驗證閘門的最佳首發案例，比拿 GSAP 這種重量級的當首發安全得多。

- `astro@^7.1.4` + `@astrojs/mdx@^7.0.4`（pnpm workspace）
- 效能閘門：`scripts/perf-budget.mjs` + `perf-budget.config.json`，接在 `build` 之後
- Markdown 管線：`remark-cjk-friendly`、`rehype-autolink-headings`、兩個自訂 rehype 外掛
- 12 頁靜態產物，**client JS = 0**，CSS 約 14KB
- 樣式：`index / reset / tokens / base / prose / code / doc-layout / topics`
- 資料層：`utils/nav.ts`、`utils/toc.ts`、`utils/topics.ts`（皆為 build 期純函式）
- 驗收頁：`/style-guide`（手寫 HTML，排版）、`/style-guide/markdown`（MDX，管線）
- 四個主題：`typescript`（含二層巢狀）、`gsap`、`ai-ml`、`claude`

---

## 階段一：樣式地基 ✅

> ADR [0002](adr/0002-style-system-tokens-cjk.md)、[0004](adr/0004-cjk-font-strategy.md)

**目標**：建立 token 體系與 CJK 排版規則。此階段不需要任何新依賴。

- [x] 建立 `src/styles/` 結構
  - [x] `index.css` —— 進入點，宣告 layer 順序
  - [x] `reset.css` —— 最小化 reset
  - [x] `tokens.css` —— primitive + semantic token + 語言隔離
  - [x] `base.css` —— 元素預設樣式 + CJK 專屬規則
  - [x] `prose.css` —— 長文節奏（components layer，計畫外新增，Phase 2 需要）
- [x] 宣告 `@layer reset, tokens, base, components, utilities;`
- [x] **Primitive token 雙軸**
  - [x] 字型：`--font-latin` / `--font-cjk` / `--font-mono`（系統字型，零下載）
  - [x] 行高：`--leading-latin: 1.6` / `--leading-cjk: 1.8`（+ heading 軸）
  - [x] 行寬：`--measure-latin: 65ch` / `--measure-cjk: 40em`
  - [x] 字級：`--text-body-latin: 1rem` / `--text-body-cjk: 1.0625rem`（計畫外新增的軸）
  - [x] 字距：`--tracking-latin: 0` / `--tracking-cjk: 0.02em`（計畫外新增的軸）
  - [x] 段距：`--paragraph-gap-latin` / `--paragraph-gap-cjk`
  - [x] 間距 scale、字級 scale、圓角、陰影
  - [x] 色彩：Radix Colors 12 階，以 `light-dark()` 實作深淺共用
- [x] **Semantic token** 由 primitive 組合（`--font-body`、`--leading-body`、`--measure-body`…）
- [x] **`:lang()` 隔離層** —— `:root:lang(zh), [lang^="zh"]` 覆寫語意 token（另含 `ja`）
- [x] CJK 排版規則
  - [x] `text-spacing-trim: space-first`（標點擠壓，視覺改善最大）
  - [x] `text-autospace: normal`（中英混排）
  - [x] 程式碼區塊反向關閉上述兩者（`space-all` / `no-autospace`）
  - [x] 兩者皆為漸進增強，不支援時靜默忽略，無需 fallback
        （階段三調查後結論不變，但理由改為「支援度已足夠」—— `text-autospace` 80.7% 已 Baseline，
        `text-spacing-trim` 僅 Chromium 但無合理修補路徑。見 ADR [0009](adr/0009-cjk-latin-spacing.md)）
  - [x] `line-break: strict`（禁則處理）、`hanging-punctuation: allow-end`
  - [x] 段距 ≥ 行間空隙 × 1.5
  - [x] 只使用真實字重（400 / 700），`font-synthesis-weight: none` 強制執行
  - [x] 中文 `<em>` 改用著重號（`text-emphasis`）取代合成斜體
- [x] 建立 `/style-guide` 測試頁：語言對照、中文長文、中英混排、全形標點、清單、引言、表格、色階、scale

**驗收**：
- [x] `pnpm build` 通過
- [x] 產物 **client JS = 0**（`find dist -name "*.js" | wc -l` → 0）
- [x] CSS 11.2KB 未壓縮傳輸；`@layer` 順序在 minify 後保留
- [x] 中文排版目測優於 Starlight 預設
- [x] Desktop / Mobile（Pixel 7、iPhone XR、iPad Air）／縮放 125%、150%／深淺模式

---

## 階段二：DocLayout 與內容結構 ✅

> ADR [0001](adr/0001-self-built-astro-docs.md)

**目標**：能渲染純文字文章，驗證階段一的排版在真實內容上成立。

- [x] 安裝 `@astrojs/mdx`，設定 `astro.config.mjs`（含 Shiki 雙主題）
- [x] Content Collections
  - [x] `src/content.config.ts` —— schema（title、description、order、sidebarLabel、lang、draft）
  - [x] 自訂 `generateId`：去副檔名 + `index` 代表其目錄，id 第一段即 topic
  - [x] 目錄結構 `src/content/docs/{topic}/…`
  - [x] 四個主題：`typescript/`、`gsap/`、`ai-ml/`、`claude/`
- [x] **URL 決策**：帶 topic 前綴 `/docs/{topic}/{slug}`，頁面只渲染單一主題
- [x] 動態路由 `src/pages/docs/[...slug].astro`
- [x] **純函式資料層**（build 期，可獨立測試，component 不參與計算）
  - [x] `utils/nav.ts` —— `buildNavTree` 支援任意巢狀深度、`flattenNav`、`findSiblings`
  - [x] `utils/toc.ts` —— `nestHeadings` 扁平轉巢狀、容忍層級跳躍
  - [x] `utils/topics.ts` —— 主題註冊表
- [x] **Layout 元件拆分**（按資料來源，非視覺區塊）
  - [x] `DocLayout.astro` —— 純骨架，完全不碰資料，可被首頁複用
  - [x] `SiteHeader.astro` —— 全站主題導航 + popover 開關
  - [x] `DocSidebar.astro` —— 資料 → 視覺
  - [x] `SidebarTree.astro` —— `Astro.self` 遞迴，純渲染
  - [x] `DocToc.astro`
  - [x] `PrevNext.astro`
- [x] **版面留白 token**（`tokens.css` 2b 區塊，含三條比例規則）
  - [x] 規則一：欄間距 ≥ 欄內距 × 2 —— 留白本身就是分隔線，全版面無直向邊框
  - [x] 規則二：內文↔TOC 間距 > sidebar↔內文
  - [x] 規則三：sidebar / TOC 錨定視窗邊緣，多餘寬度全給間距，內文由 `--main-max` 封頂置中
  - [x] 全部以 `clamp()` 流動，不在斷點跳動
- [x] **斷點由 measure 反推**（64rem / 80rem），推導過程記於 `tokens.css`
- [x] 三個 grid 陷阱：`minmax(0, 1fr)`、`align-self: start`、full-bleed named lines
- [x] 窄螢幕 sidebar 用 **Popover API**，零 JS
- [x] TOC 中文標題 `-webkit-line-clamp: 2`
- [x] 每個 topic 的 accent color（`styles/topics.css` 覆寫 12 個值，零 component 改動）
- [x] 寫 9 篇真實中文文章驗證（含二層巢狀群組）

**驗收**：
- [x] `pnpm build` 通過，11 頁
- [x] **client JS = 0**
- [x] CSS 12.7KB（未壓縮傳輸），`@layer` 順序保留
- [x] 巢狀群組、`aria-current`、popover、`data-topic` 皆正確輸出

**回測修正**（第一輪人工測試後）：
- [x] 深色模式程式碼區塊白底 —— Shiki `defaultColor: false` + `src/styles/code.css` 用 `light-dark()`
- [x] 窄螢幕「目錄」按鈕直向斷行 —— `.nav-toggle` / `.brand` 加 `flex-shrink: 0`
- [x] 大螢幕 sidebar 未貼邊 —— 移除 `max-inline-size: 90rem`，改由間距軌道吸收（規則三）
- [x] 程式碼區塊雙層背景 —— `background-color` 誤套到 `span`；自訂屬性會繼承，
      Shiki 的 `--shiki-*-bg` 只宣告在 `<pre>` 但 span 照樣拿得到，於是每個 token 各塗一層。
      背景改為單一來源 `--color-bg-subtle`，不用 Shiki 主題底色
- [x] 三欄視覺與留白
- [x] 三個斷點（<64rem / 64–80rem / ≥80rem）與抽屜行為
- [x] 深淺模式程式碼區塊渲染

---

## 階段三：Rehype / Remark ✅

> ADR [0002](adr/0002-style-system-tokens-cjk.md)、[0009](adr/0009-cjk-latin-spacing.md)

**目標**：補齊 Markdown 管線的產出，讓內容層不需要為結構或無障礙負責。

- [x] 安裝 `rehype-autolink-headings`，設定標題錨點
  - [x] `behavior: "append"` —— prepend 會讓中文標題的左緣參差（方塊字左緣本是直線）
  - [x] 錨點的無障礙名稱用 `aria-labelledby` 指向標題自身的 id，不需計算標題文字
  - [x] **順序陷阱**：Astro 內建的 `rehypeHeadingIds` 預設跑在使用者外掛「之後」，
        autolink 只處理已有 id 的標題 —— 不明確前置就會靜默失效（build 通過、錨點不存在）。
        從 `@astrojs/markdown-remark` import 並排在最前面
  - [x] 平時 `opacity: 0`，hover／`:focus-visible` 才現形；`@media (hover: none)` 常駐淡色
- [x] `src/plugins/rehype-table-wrapper.mjs` —— 表格自動包上 `.table-wrapper`
  - [x] 捲動容器不能是 `<table>` 自己：overflow 建立 BFC 會讓自動欄寬演算法失準
  - [x] `tabindex="0"` + `role="region"` + `aria-label`（WCAG 2.1.1，可捲動區域須能鍵盤操作；
        只給 tabindex 會產生無名稱的焦點站，比不給更糟）
- [x] `src/plugins/rehype-external-links.mjs` —— 站外連結標記
  - [x] 外掛只加 `data-external`，視覺與無障礙文字全交給 CSS
  - [x] `content: "↗" / "（站外連結）"` —— CSS 替代文字語法，螢幕閱讀器讀到的是語意而非符號；
        前面併一行純 `content: "↗"`，不支援替代文字語法的瀏覽器仍看得到標記
  - [x] **不加 `target="_blank"`**：WCAG 3.2.5，開新分頁破壞返回鍵；且靜態站所有裝置拿到
        同一份 HTML，按裝置分歧只能靠 client JS，違反鐵則。沒有 `_blank` 也就不需要 `rel="noopener"`
- [x] 捲動進度條（`SiteHeader` + `doc-layout.css`）—— **純 CSS 零 JS**
  - [x] `animation-timeline: scroll(root block)`，動畫跑在合成器執行緒
  - [x] 用 `scroll()` 而非 `view-timeline(<article>)`：後者需在共同祖先加 `timeline-scope`
        才能被 DOM 順序在前的 header 引用，且短文章會落進邊界情況。文檔頁誤差僅 header 與 PrevNext
  - [x] `scaleX` 而非 `inline-size`，只觸發合成
  - [x] 色彩吃 `var(--color-accent-solid)`，自動跟隨 `data-topic` 換色，元件不知道任何顏色
  - [x] `@supports` 不支援則整條隱藏，不留一條停在 0% 的死線
- [x] 安裝 `remark-cjk-friendly` —— 修正 CommonMark 強調符在中文下的**渲染錯誤**
      （實測失敗案例與成因見 ADR [0009](adr/0009-cjk-latin-spacing.md)）
- [x] 建立 `/style-guide/markdown` 驗收頁 —— 內容走 MDX，因此經過與 `/docs/*` 完全相同的管線
      （手寫 HTML 的 `/style-guide` 驗不到這一層），並複用 `DocLayout` + `article.prose`
- [x] ~~Shiki 設定~~ —— 已於階段二完成（雙主題 + `defaultColor: false`）
- [x] ~~中英混排 remark plugin~~ —— **不做**。`text-autospace` 覆蓋 80.7%（Baseline 2025-11），
      ROI 不足。調查、業界作法、備用設計與重啟條件見 ADR [0009](adr/0009-cjk-latin-spacing.md)
- [x] ~~閱讀時間~~ —— **不做**。中文需按字元數而非詞數估算，準確度可疑；捲動進度條提供的是
      即時且真實的資訊，資訊價值更高

**驗收**：
- [x] `pnpm build` 通過，12 頁
- [x] **client JS = 0**
- [x] CSS 14.2KB（未壓縮傳輸），`@layer` 順序保留
- [x] 錨點正確輸出且 id 無重複；TOC 未受 `rehypeHeadingIds` 前置影響
- [x] `mailto:` / 錨點 / 相對路徑未被誤判為站外
- [x] 17 個中文強調符案例全部正確渲染（原始 CommonMark 有 3 個失敗）
- [x] 錨點 hover／Tab 鍵、表格鍵盤捲動、進度條推進與換色
- [x] Firefox：進度條整條消失而非停在 0%
- [x] `text-autospace` 中英間距、`text-spacing-trim` 標點擠壓目測確認

---

## 階段四：效能預算閘門 ✅

> ADR [0008](adr/0008-performance-budget-gate.md)

**必須在任何互動元件之前完成。** 此時產物最乾淨，是設定基準線的最佳時機。

- [x] `scripts/perf-budget.mjs` —— build 後檢查 `dist/`，零新依賴
  - [x] 共用 chunk 的 JS 總量上限（核心防線）—— 定義為「被兩個以上頁面引用」，
        亦即位在所有讀者都要付錢的路徑上
  - [x] 單一 chunk 體積上限
  - [x] 每頁初始載入 JS 總量 —— 只計 `<script src>` + inline script + `modulepreload`。
        `client:visible` / `client:idle` 的元件走執行期 dynamic import，Astro 不發
        modulepreload，因此自然不計入 —— 這正是要保護的性質，不是漏算
  - [x] 字型與靜態資源總量
  - [x] （計畫外）CSS 總量 —— 每階段驗收本來就在人工記錄這個數字，順手機器化
- [x] 紅線抽到 `perf-budget.config.json`，與腳本分離 —— 讓調高紅線在 diff 裡
      是獨立且顯眼的一行，「必須說明理由」這條原則才有著力點
- [x] 接到 `package.json`：`astro build && node scripts/perf-budget.mjs`，超線即 exit 1
      （另有 `pnpm perf` 可單獨執行）
- [x] 以當前產物設定基準紅線並記錄於 config 的 `_baseline`
- [x] 使用原則寫進 config 的 `_usage` 與失敗訊息：**紅線調高必須在 commit message 說明理由**，
      預設反應是修正架構而非放寬閾值

**基準線**（2026-07-28，12 頁）：JS 全數為 0 ｜ CSS 14226 B（gzip 4.2KB）｜ 靜態資源 1414 B（字型 0）

**驗收**：
- [x] 在 `SiteHeader`（12 頁共用）注入一個約 90KB 的 runtime 依賴 →
      共用 JS／單一 chunk／單頁初始 JS 三條同時超線，build 以 exit 1 失敗
- [x] 順帶驗到 Rollup 的 tree-shaking：同一份 payload 若只取 `.length`，
      會被常數摺疊成 `console.log(900)` 而完全不進產物。閘門量的是**實際產物**，
      不是 import 敘述 —— 這正是要的語意
- [ ] `client:visible` 不計入初始 JS 的行為，待階段七第一個真實 island 出現時驗證
      （目前無任何 island，無從構造案例）

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

## 後續（無明確順序）

- [ ] **`<toc-highlight>` scroll spy** —— Web Component + IntersectionObserver（約 30 行），`client:idle`。
      **階段四閘門已完成，此項已解鎖**：基準線建立在零 JS 的乾淨產物上，因此它是全站第一筆 JS，
      閘門會直接報出它的真實代價（而不是淹沒在既有 bundle 裡）。也是驗證
      「`client:idle` 不計入單頁初始 JS」的第一個真實案例
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
