# 建置順序與任務

依賴順序：**Styles（Token + Variant） → DocLayout → Rehype → 效能閘門 → 互動元件**

決策依據見 [docs/adr](adr/)。本文件只描述「做什麼、依什麼順序」，「為什麼」一律回查 ADR。

---

## 現況

**階段一至六完成並通過人工驗證**，含行動裝置、深色模式、Firefox / Safari 的跨裝置回測
（階段五遺留的行動裝置項目也在此輪一併補驗）。
效能閘門在零 JS 的乾淨產物上設好基準線，之後每次 `pnpm build` 都會擋 ——
階段五的 EC 複製鈕成為全站第一筆 client JS（2523 B），階段六的搜尋在索引當天就撞線兩次
（Pagefind 無條件產出的預設 UI），兩次都是由閘門而非人工發現，這正是把閘門排在
互動元件之前的兌現點。

**下一步有兩個候選，建議先做後者**：

- `<toc-highlight>` scroll spy —— 約 30 行，是驗證「`client:idle` 不計入單頁初始 JS」的
  第一個真實案例（EC 與搜尋的 JS 都是一般 `<script src>`，驗不到這一層）
- **先修 `css` 這條紅線的量測語意**（見階段六末的待決事項）。目前它顯示 99%，
  但那個數字把 12 份內嵌副本算成 0、把 1 份共用檔算成全額 —— 在不知道真實餘裕的情況下
  加任何新元件，都會是在對著錯的數字做決定

- `astro@^7.1.4` + `@astrojs/mdx@^7.0.4` + `astro-expressive-code@^0.44.1` + `pagefind@1.5.2`
- 效能閘門：`scripts/perf-budget.mjs` + `perf-budget.config.json`，接在 `build` 之後
- 搜尋：`pnpm search:index`（`pagefind --site dist` + `scripts/prune-search-bundle.mjs`），
  夾在建置與閘門之間
- Markdown 管線：`remark-cjk-friendly`、`rehype-autolink-headings`、兩個自訂 rehype 外掛
- 12 頁靜態產物（索引 9 頁），**共用 client JS 6.6KB**（EC 複製鈕 2.5 + 搜尋 4.2），
  CSS 35.5KB，另有按需載入的 Pagefind 執行期 151KB + 索引 21KB
- 樣式：`index / reset / tokens / base / prose / code / doc-layout / topics`
  （`code.css` 於階段五縮減為只剩一條 CJK 規則，視覺樣式改由 EC 的 `styleOverrides` 承擔）
- 資料層：`utils/nav.ts`、`utils/toc.ts`、`utils/topics.ts`（皆為 build 期純函式）
- 驗收頁：`/style-guide`（手寫 HTML，排版）、`/style-guide/markdown`（MDX，管線）
  —— 兩者與首頁皆以 `searchable={false}` 排除於搜尋索引之外
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

## 階段五：L1 程式碼區塊 ✅

> ADR [0005](adr/0005-playground-tiers.md)

- [x] 安裝 `astro-expressive-code`（`0.44.1`，peer 已含 `astro ^7.0.0`）
- [x] **整合順序陷阱**：`expressiveCode()` 必須排在 `mdx()` 之前。EC 以 remark 外掛
      形式接管渲染，而 `mdx()` 初始化時就固定住當下的 markdown 設定 —— 排在後面
      等於沒裝，`.md` 生效而 `.mdx` 靜默維持 Shiki 原樣，兩種副檔名產出不同標記
- [x] 移除 `markdown.shikiConfig` —— Shiki 本身保留（是 Astro 與 EC 各自的內部依賴，
      無從移除），換掉的是「誰來驅動它」。兩份主題設定並存只會讓人不知道哪份有效
- [x] 設定主題，色彩對齊階段一 token
  - [x] `styleOverrides` 吃 `var(--radius-3)` / `var(--font-code)` / `var(--space-4)` 等 token，
        建置期不求值、原樣寫進 EC 自己的 `--ec-*` 變數，深淺切換仍由 `light-dark()` 負責
  - [x] 延續階段二決策：`codeBackground` 用 `--color-bg-subtle` 而非 Shiki 主題自帶底色
  - [x] 檔名框（`frames.editorActiveTabBackground`）必須跟著一起改，否則分頁與
        程式碼區塊接縫處會有明顯色差
  - [x] 關閉 `useThemedScrollbars` / `useThemedSelectionColors` —— 捲軸與選取色屬於
        全站一致的系統行為，不該只有程式碼區塊特立獨行，順帶省下對應 CSS
  - [x] UI 文字中文化 —— `pluginFramesTexts.overrideTexts("zh-Hant", …)`。
        **EC 不讀 `<html lang>`**，必須同時設 `defaultLocale: "zh-Hant"` 才比對得到，
        只覆寫文字會靜默失效
- [x] **`all: revert` 的回測**（本階段最大的隱性退化）
  - [x] EC 樣式表開頭有 `.expressive-code *:not(:is(svg, svg *)) { all: revert }`。
        好處是 `prose.css` 的 `.prose pre` 完全漏不進去，那邊不需要任何例外
  - [x] 但它同時把 `base.css` 為中文設的 `text-autospace: no-autospace` /
        `text-spacing-trim: space-all` 一起清掉 —— 含中文註解的程式碼會重新吃到
        全站規則，縮排與字串內容偏移。這是階段一決策的實質退化，且無任何錯誤訊息
  - [x] 修法不是比特異性（EC 樣式表未分層，永遠贏過 `@layer`，且 `<link>` 在我們之後，
        平手也是它贏），而是宣告在容器 `.expressive-code` 上 —— 它不被那條 `*` 選擇器
        匹配，而 `all: revert` 對可繼承屬性的行為正是「回到繼承父層的值」，於是自然流下去
  - [x] `src/styles/code.css` 因此從「Shiki 深淺主題切換」縮減為只剩這一條規則
- [x] 驗證功能：檔名框、行高亮 `{4-6}`、`ins=` / `del=`、整段 `diff`、
      終端機框 `frame="terminal"`、行內標記、複製鈕（`/style-guide/markdown`）
- [x] 確認 client JS 增量僅為複製鈕 —— 2523 B，12 頁共用一支
- [x] 通過階段四閘門（CSS 紅線調高，理由見下）

**閘門結果**：共用 JS 2523 B／8192 ｜ 單頁初始 JS 2523 B／8192 ｜ CSS 31628 B／36864（gzip 7.9KB）

**紅線調整**：CSS 由 20480 調高至 36864。EC 自帶 17674 B 樣式表（gzip 3898），
是 ADR 0005 指定的那組功能的價格而非退化；可關的選項都已關閉，其餘無可裁減項。
餘裕刻意只留 5236 B，讓階段六的搜尋 UI 若體積失控會立刻撞線。
**共用 JS 與單頁初始 JS 兩條上限未動** —— 2523 B 仍有 5669 B 餘裕。

**驗收**：
- [x] `pnpm build` 通過，12 頁
- [x] 全站程式碼區塊 100% 由此層涵蓋（目前無任何 L2 以上需求）
- [x] 中文註解在 `all: revert` 之後仍未被插入間距
- [x] 深淺模式渲染
- [x] 複製鈕實際點擊
- [x] diff 標記與語法著色目測
- [x] 行動裝置 —— 於階段六的跨裝置回測一併完成

---

## 階段六：搜尋 ✅

> ADR [0007](adr/0007-search-pagefind.md) 

- [x] 定案 ADR 0007（`adr/README.md` 索引表原本仍是「待決定」，三處狀態已對齊）
- [x] 安裝 `pagefind`（1.5.2，devDependency），接進 pipeline
  - [x] 順序：`astro build && pnpm search:index && node scripts/perf-budget.mjs` ——
        索引必須夾在建置與閘門之間，排在閘門之後等於閘門量不到它
  - [x] 確認取得 **extended** 二進位（`pagefind_extended`，55MB）—— CJK 分詞只存在於
        extended release，拿到一般版會靜默退化成整段中文一個詞（build 照過、UI 照在、就是搜不到）
- [x] 標記索引範圍
  - [x] `DocLayout` 的 `<main>` 加 `data-pagefind-body` —— Pagefind 只看得到 HTML，
        沒有 component 的概念；側邊欄與 TOC 若一併進索引，等於每頁重複收錄整棵導航樹
  - [x] `searchable` prop 排除驗收頁與首頁（12 頁 → 索引 9 頁）。
        嚴格說這個 false 分支是多餘的（沒標 body 的頁面本就整頁不進索引），
        但那是靠沉默生效，讀 layout 的人分不出「刻意不收」與「漏標」
  - [x] `PrevNext` 加 `data-pagefind-ignore` —— 它在 `.prose` 之內，
        但文字是「別篇文章的標題」，不排除的話搜某個標題會連帶命中它的前後鄰居
- [x] **驗證中文分詞召回率**（先做這步再寫 UI）—— 18 個查詢，期望值來自對 `src/content` 的
      grep 而非印象。結論：**召回沒問題，精確度有結構性的洞，且分數門檻救不了**。
      完整數據與對 UI 的三條約束見 ADR [0007](adr/0007-search-pagefind.md)
  - [x] `lang="zh-Hant"` 已足夠，不需要 `--force-language zh`（兩者詞數同為 784）
  - [x] `"wasm": null` 與 stemming 警告都是 CJK 的正常現象，非退化
- [x] 通過階段四閘門（新增兩條紅線，見下）
- [x] 自建搜尋 UI（`src/components/SiteSearch.astro`），**不使用 `@pagefind/default-ui`**
  - [x] 三層載入：HTML（每頁，一顆按鈕與空 `<dialog>`）／元件 JS 4.2KB（12 頁共用）／
        Pagefind 執行期 176KB（**只在讀者第一次打開搜尋時 import**）
  - [x] `await import()` 的路徑放進變數 + `/* @vite-ignore */` ——
        `/pagefind/pagefind.js` 在 build 期還不存在，讓 Vite 靜態分析會中斷建置
  - [x] dev 模式優雅降級（`/pagefind/` 為 404）—— 訊息直接寫出該執行什麼指令，
        而不是只說「搜尋失敗」。已在 `astro dev` 實測
  - [x] 少於 2 字元不觸發；摘要顯示 `<mark>`；不暴露空白分隔語法
  - [x] 原生 `<dialog>` + `showModal()` —— 焦點陷阱、Esc、inert 背景、`::backdrop`
        全部由瀏覽器負責
  - [x] **IME**：`compositionstart` / `compositionend` 期間不送查詢。
        注音／拼音的選字過程會讓 `input` 帶著中間狀態不斷觸發，
        不擋的話查的是使用者還沒打完的字
  - [x] 查詢序號防競態（索引分片的回應順序不保證與送出順序相同）
  - [x] ↑↓ 移動真實焦點而非 `aria-activedescendant`；結果本身是真連結
  - [x] 元件升級前 `site-search:not(:defined) { display: none }` ——
        沒有 JS 就沒有搜尋，一顆按下去沒反應的按鈕比沒有按鈕更糟

**實作時踩到的五個坑**（全部無錯誤訊息，只能靠實際打開瀏覽器看）：

1. **`<dialog>` 的 display 必須掛在 `[open]` 上**。作者樣式的優先權高於 UA 樣式
   （與特異性無關，是層疊來源的差別），無條件寫 `display: flex` 會讓對話框
   在頁面載入時就攤在內容上，且沒有 backdrop。
2. **JS 建立的節點吃不到 Astro 的 scoped style**。scoped 是靠建置期在標記上加
   `data-astro-cid-*` 實作的，`createElement` 出來的元素沒有那個屬性。
   症狀是結果變成一串沒有樣式的藍色底線連結。祖先選擇器維持 scoped、
   後代包 `:global()`，作用域仍然關得住。
3. **`type="search"` 會吃掉 Esc**（拿去清空自己），鍵盤事件傳不到 `<dialog>`，
   Esc 關不掉對話框 —— 而且第一次按下去看起來「有反應」，很容易被當成正常。改用 `type="text"`。
4. **自訂元素預設 `display: inline`**，在 header 的 flex 容器裡被壓成 26px，
   按鈕被自己的宿主切掉。需要 `display: flex; flex-shrink: 0`。
5. **標題錨點的 `#` 會被算進標題文字**，搜尋結果的章節標題全變成「名稱不重要 #」。
   在 `rehype-autolink-headings` 的 properties 加 `data-pagefind-ignore`，
   且值必須是 `"all"` 而非 `true` —— hast 會輸出成 `="true"`，那不是 Pagefind
   認得的 scope，會靜默失效。

**人工驗收**（`pnpm build && pnpm preview`，Chrome）：
- [x] ⌘K 開啟、Esc 關閉並清空、點擊結果導向正確錨點且主題色跟著換
- [x] 中文查詢（IME 輸入）、`<mark>` 標記、章節子結果去重
- [x] 少於 2 字元提示、查無結果提示、dev 模式降級提示
- [x] 400px 窄螢幕：觸發鈕縮為圖示、對話框與結果可讀
- [x] 真實行動裝置、深色模式
- [x] Firefox / Safari（`<dialog>`、`:defined`、`light-dark()` 皆已 Baseline）

**閘門變更**：`dist/pagefind/` 排除於 `singleChunk` 之外，另新增兩條 ——
`searchRuntime` 155009 B（固定成本，實為回歸測試）與 `searchIndex` 21536 B / 9 頁
（全站唯一隨內容線性成長的產物，約每頁 2.4KB）。理由見 ADR 0007「產物與預算」。

**`scripts/prune-search-bundle.mjs`**：Pagefind CLI 沒有「只產索引、不產 UI」的選項，
一律寫出三套預設 UI + highlight 腳本（408KB）。它們沒有任何頁面引用，但會一起被部署，
也會被閘門看見 —— 與其為死檔放寬紅線，不如刪掉。已實測刪除清單失準時閘門會報 497.5 KB。

**閘門結果**（12 頁）：共用 JS 6.6KB／8.0 ｜ 單頁初始 JS 6.6KB／8.0 ｜ 最大 chunk 4.2KB／50
｜ 搜尋執行期 151.4KB／160 ｜ 搜尋索引 21.3KB／128 ｜ CSS 35.5KB／36.0（gzip 9.0KB）

**紅線未動。** 但 CSS 已到 99%、共用 JS 到 83%，階段七的 island 幾乎沒有餘裕 ——
下一個元件很可能要先處理下面這條待決事項。

**待決：`css` 這條紅線量錯了東西。** Astro 的 `inlineStylesheets: "auto"` 會把小於
4KB 的 scoped CSS 直接內嵌進每一份 HTML，而閘門只加總 `.css` 檔案 —— 內嵌的部分
完全不在統計內。階段六加入 SiteSearch 後 scoped CSS 越過 4KB 門檻、由內嵌轉為外部檔，
於是閘門顯示 CSS 從 30.9KB「暴增」到 35.5KB。實際量測：

| | 外部 CSS 檔 | HTML 內嵌 | 合計 |
|---|---|---|---|
| 無 SiteSearch | 31628 B | 50727 B | 82355 B |
| 有 SiteSearch | 36229 B | 39441 B | **75670 B** |

**實際送出的 CSS 總量少了 6685 B**（12 份內嵌副本變成 1 份共用檔），閘門卻報成增加。
這條檢查目前會獎勵「把 CSS 複製 12 份塞進 HTML」。修法是把 HTML 內的 `<style>`
一併計入，或改成量「單頁 CSS」（與 `pageInitialJs` 同一個語意）—— 兩者都需要重設基準線。

---

## 階段七：L2 可執行 Playground

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

## 階段八：L3 控制變數面板（GSAP 主力）

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

## 內容清單

- [ ] Claude & Harness Engineer & Loop Engineer

**TS**
- [ ] TypeScript
- [ ] Zod
- [ ] Monorepo & Pnpm & Workspace

**Frontend**
- [ ] React
- [ ] React Native
- [ ] UI & Shadcn UI
- [ ] GSAP & Web Animation

**Backend**
- [ ] Drizzle ORM
      - [ ] Database Design & Schema
      - [ ] Postgres Deep-Dive
- [ ] API & GraphQL & gRPC
- [ ] Authentication & BetterAuth
- [ ] Fastify

**Other**
- [ ] Computer Science
      - [ ] Network
- [ ] Cybersecurity
- [ ] LeetCode & DSA

<!-- **Daily** -->
<!-- - [ ] IELTS & English -->
<!-- - [ ] Finance & Investment -->

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
