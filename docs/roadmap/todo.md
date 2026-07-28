# 建置順序與任務

依賴順序：**Styles（Token + Variant） → DocLayout → Rehype → 效能閘門 → 互動元件**

決策依據見 [docs/adr](../adr/)。本文件只描述「做什麼、依什麼順序」，「為什麼」一律回查 ADR。

---

## 現況

**階段一至六完成並通過人工驗證**，含行動裝置、深色模式、Firefox / Safari 的跨裝置回測
（階段五遺留的行動裝置項目也在此輪一併補驗）。
效能閘門在零 JS 的乾淨產物上設好基準線，之後每次 `pnpm build` 都會擋 ——
階段五的 EC 複製鈕成為全站第一筆 client JS（2523 B），階段六的搜尋在索引當天就撞線兩次
（Pagefind 無條件產出的預設 UI），兩次都是由閘門而非人工發現，這正是把閘門排在
互動元件之前的兌現點。

**但閘門本身也會壞，而且壞得沒有聲音** —— Cloudflare adapter 把產物移到 `dist/client/`
之後，閘門有一段時間量的是不存在的路徑，回報 `0 B` 與「全數通過」。經過見「階段六補」。
以下所有數字都是修正之後的。

**階段七已完成**：`dist/server/` 的盲區改由程式碼擋著（原本只有一條 JSON 註解），
`inlineStylesheets` 改為 `"never"`，紅線依「人人都付 / 按需才付」分組。
量測本身的可信度到此為止都已處理過一輪，之後的 island 才有可歸因的數字可看。

**階段八已完成**，而它兌現的比預期多。第一個延後載入的元件（`<toc-highlight>`，938 B）
證明了階段四那個一直打不了勾的性質：元件本體在 HTML 裡完全沒有名字，單頁初始 JS 的
增量只有載入器的 316 B。但它同時撞出兩件比功能重要的事：

1. **`client:idle` 在本專案從來就不存在** —— `client:*` 只作用於 UI framework 元件，
   而 ADR 0003 的決策就是不引入 renderer。鐵則從第一天起引用著取用不到的機制，
   五份文件照抄同一組措辭。措辭已整組改寫為可觀測的性質陳述。
2. **閘門漏算了整個靜態 import 圖**，於是把共用 JS 從 6.9 KB 報成 6.0 KB ——
   實際增加約 500 B。這是同一形狀的第三次事故，見階段八補。

兩件事的共同點：**一份沒有被執行過的規範，讀起來與可執行的規範沒有差別。**

**剩餘階段已於 2026-07-28 重排**（原本階段七是 L2、階段八是 L3，而階段八的內文
寫著「刻意排在 L2 之前」—— 編號與內文互相否定，且與 ADR [0005](../adr/0005-playground-tiers.md)
牴觸）。新順序與其判準：

| 階段 | 內容 | 為什麼在這 |
|---|---|---|
| 七 ✅ | 閘門修補 | 在最重的依賴進來之前，先讓量測可信 |
| 八 ✅ | `<toc-highlight>` | 最便宜的邊界驗證，兌現階段四未完成的驗收項 |
| 九 | L3 控制變數面板 | 對齊 ADR 0005 原意 |
| 十 | L2 Playground | 唯一需要 200KB 級 chunk 的一步，放最後 |

判準是**依 island 複雜度遞增地驗證邊界**（ADR 0005「建置順序上的刻意安排」）。
階段七之所以插在最前面，理由與階段六補是同一個：在閘門可能靜默量不到東西的情況下
加新元件，是在對著錯的數字做決定 —— 而 `css` 那次至少報了一個「錯的數字」，
adapter 那次報的是 `0 B` 與「全數通過」。

- `astro@^7.1.4` + `@astrojs/mdx@^7.0.4` + `astro-expressive-code@^0.44.1` + `pagefind@1.5.2`
- 部署：`@astrojs/cloudflare@^14.1.5` + `wrangler` —— 目前所有路由皆預渲染，
  `dist/server/` 為空，adapter 實際只負責產物佈局（`dist/client/`）
- 效能閘門：`scripts/perf-budget.mjs` + `perf-budget.config.json`（`distDir: "dist/client"`、
  `serverDir: "dist/server"`），接在 `build` 之後。紅線分「人人都付 / 按需才付」兩組，
  報告依此分段（階段七）
- 搜尋：`pnpm search:index`（`pagefind --site dist/client` + `scripts/prune-search-bundle.mjs`），
  夾在建置與閘門之間。**`dist/client` 而非 `dist`** —— Cloudflare adapter 的產物位置，理由見階段六補
- Markdown 管線：`remark-cjk-friendly`、`rehype-autolink-headings`、兩個自訂 rehype 外掛
- 12 頁靜態產物（索引 9 頁），**共用 client JS 7.4KB**（EC 複製鈕 2.5 + 搜尋 3.2 +
  Vite preload helper 1.4 + TOC 載入器 0.3），外部 CSS 47.3KB／7 支、內嵌 CSS 0，
  另有按需載入的 Pagefind 執行期 151KB + 索引 21KB + `<toc-highlight>` 938 B
  —— JS 為階段八補修正 import 圖漏算後的數字（此前少算 1.4KB，更早期讀到的是 0），
  CSS 為階段七改用 `inlineStylesheets: "never"` 之後的數字
- 延後載入：`src/scripts/`（元件本體，`import()` 的目標）＋ 元件內的載入器。
  **不使用 `client:*` directive**，理由見三條鐵則第 1 條
- 樣式：`index / reset / tokens / base / prose / code / doc-layout / topics`
  （`code.css` 於階段五縮減為只剩一條 CJK 規則，視覺樣式改由 EC 的 `styleOverrides` 承擔）
- 資料層：`utils/nav.ts`、`utils/toc.ts`、`utils/topics.ts`（皆為 build 期純函式）
- 驗收頁：`/style-guide`（手寫 HTML，排版）、`/style-guide/markdown`（MDX，管線）
  —— 兩者與首頁皆以 `searchable={false}` 排除於搜尋索引之外
- 四個主題：`typescript`（含二層巢狀）、`gsap`、`ai-ml`、`claude`

---

## 階段一：樣式地基 ✅

> ADR [0002](../adr/0002-style-system-tokens-cjk.md)、[0004](../adr/0004-cjk-font-strategy.md)

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
        `text-spacing-trim` 僅 Chromium 但無合理修補路徑。見 ADR [0009](../adr/0009-cjk-latin-spacing.md)）
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

> ADR [0001](../adr/0001-self-built-astro-docs.md)

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

> ADR [0002](../adr/0002-style-system-tokens-cjk.md)、[0009](../adr/0009-cjk-latin-spacing.md)

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
      （實測失敗案例與成因見 ADR [0009](../adr/0009-cjk-latin-spacing.md)）
- [x] 建立 `/style-guide/markdown` 驗收頁 —— 內容走 MDX，因此經過與 `/docs/*` 完全相同的管線
      （手寫 HTML 的 `/style-guide` 驗不到這一層），並複用 `DocLayout` + `article.prose`
- [x] ~~Shiki 設定~~ —— 已於階段二完成（雙主題 + `defaultColor: false`）
- [x] ~~中英混排 remark plugin~~ —— **不做**。`text-autospace` 覆蓋 80.7%（Baseline 2025-11），
      ROI 不足。調查、業界作法、備用設計與重啟條件見 ADR [0009](../adr/0009-cjk-latin-spacing.md)
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

> ADR [0008](../adr/0008-performance-budget-gate.md)

**必須在任何互動元件之前完成。** 此時產物最乾淨，是設定基準線的最佳時機。

- [x] `scripts/perf-budget.mjs` —— build 後檢查 `dist/`，零新依賴
  - [x] 共用 chunk 的 JS 總量上限（核心防線）—— 定義為「被兩個以上頁面引用」，
        亦即位在所有讀者都要付錢的路徑上
  - [x] 單一 chunk 體積上限
  - [x] 每頁初始載入 JS 總量 —— 只計 `<script src>` + inline script + `modulepreload`
        （**階段八補**：以及這些檔案靜態 import 進來的所有 chunk —— 原本漏了這半句，
        後果見階段八補）。延後載入的元件走執行期 dynamic import，沒有任何東西在載入
        當下指向它，因此自然不計入 —— 這正是要保護的性質，不是漏算
  - [x] 字型與靜態資源總量
  - [x] （計畫外）CSS —— 初版寫成「CSS 總量」，理由是「每階段驗收本來就在人工記錄
        這個數字，順手機器化」。**那句話就是病灶**：把一個既有的人工數字照抄成閘門，
        沒有問它量的是不是成本。階段六修正為 `cssCacheable` + `pageInlineCss` 兩條，
        經過見階段六段落
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
- [x] 按需載入的元件不計入初始 JS 的行為 —— **已於階段八驗證**：`<toc-highlight>`
      的 938 B 在 HTML 裡完全沒有名字（無 `<script src>`、無 `modulepreload`），
      單頁初始 JS 的增量只有載入器的 316 B。順帶撞出閘門自己的漏算，見階段八補

---

## 階段五：L1 程式碼區塊 ✅

> ADR [0005](../adr/0005-playground-tiers.md)

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

> ADR [0007](../adr/0007-search-pagefind.md) 

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
      完整數據與對 UI 的三條約束見 ADR [0007](../adr/0007-search-pagefind.md)
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
｜ 搜尋執行期 151.4KB／160 ｜ 搜尋索引 21.3KB／128 ｜ 外部 CSS 35.5KB／44.0（gzip 9.0KB）
｜ 單頁內嵌 CSS 3.8KB／6.0

**紅線未動。** 共用 JS 到 83%。（原本記錄的「CSS 已到 99%」是虛的 —— 見下方已結案的
待決事項，那條指標量錯了東西。重新定義後為外部 81%、內嵌 63%。）

> **上面這組數字是在閘門指向 `dist` 的期間記錄的，僅存作階段六當下的紀錄。**
> 加上 Cloudflare adapter 之後，由頁面反推的三條會讀成 0 —— 見「階段六補」。
> 修正後的當前數字：共用 JS 6.9KB／8.0（87%）、外部 CSS 38.5KB／44.0（88%）。

**已結案：`css` 這條紅線量錯了東西。** Astro 的 `inlineStylesheets: "auto"` 會把小於
4KB 的 scoped CSS 直接內嵌進每一份 HTML，而閘門只加總 `.css` 檔案 —— 內嵌的部分
完全不在統計內。階段六加入 SiteSearch 後 scoped CSS 越過 4KB 門檻、由內嵌轉為外部檔，
於是閘門顯示 CSS 從 30.9KB「暴增」到 35.5KB。實際量測：

| | 外部 CSS 檔 | HTML 內嵌 | 合計 |
|---|---|---|---|
| 無 SiteSearch | 31628 B | 50727 B | 82355 B |
| 有 SiteSearch | 36229 B | 39441 B | **75670 B** |

**實際送出的 CSS 總量少了 6685 B**（12 份內嵌副本變成 1 份共用檔），閘門卻報成增加。
這條檢查會獎勵「把 CSS 複製 12 份塞進 HTML」。

**修法**：`css` 一條拆成兩條，理由是**文檔站的主場景是站內導覽**（讀者會連看好幾篇），
外部檔快取後只付一次、內嵌則每次導覽重付 —— 兩者成長曲線不同、修法也不同，
加總成一個數字就無法歸因。這也是為什麼不採用「總量加上 inline」：那個數字會隨文章數
線性成長，到 100 篇時會在沒有任何退化的情況下爆掉，跟原本的錯誤是同一類（量了一個
不存在的成本）。

| 新紅線 | 語意 | 基準線 | 上限 |
|---|---|---|---|
| `cssCacheable` | 外部樣式表總量，跨頁快取，一次瀏覽最多付一次 | 36356 B | 45056 |
| `pageInlineCss` | 單頁內嵌 `<style>` 最大值，每次導覽重付 | 3853 B | 6144 |

內嵌那條刻意設緊（餘裕 2291 B，約只夠再多一個小型 scoped 區塊），且撞線的正確反應是
改 `inlineStylesheets: "never"` 把 bytes 移進可快取的那條，而非調高 —— 這句話寫在
config 註解與閘門的失敗訊息裡。另加一行**不設閘的診斷**輸出「最貴單頁首次載入 CSS
（內嵌 + 該頁外部檔）」：這個數字對 LCP 有意義，但它把兩種成本加在一起、撞線時無法
歸因，正是原指標的毛病，所以只報不擋。它存在的理由是讓內嵌↔外部的搬移不再從報告裡消失。

新舊數字不可比較：36864 是舊定義下的總量上限，新的兩條是重新定義後的兩種成本，非放寬。

- [x] ~~**待決：`inlineStylesheets` 是否改為 `"never"`。**~~ —— **已定案採用 `"never"`**
      （2026-07-28），實作排在**階段七**。實測（12 頁，非提交狀態）：

  | | 外部 CSS | 單頁內嵌（最大） | 最貴單頁首次載入 |
  |---|---|---|---|
  | `"auto"`（現況） | 35.5 KB | 3.8 KB | **39.3 KB** |
  | `"never"` | 43.9 KB | 0 B | **39.3 KB** |

  > 這組數字量於階段六補修正閘門目錄之前，外部 CSS 一律少 3.0 KB。
  > 階段七實作時的實測值見該節，結論（首次載入不變、導覽成本歸零）不受影響。

  **首次載入完全相同**（同一批 bytes，只是換了送法），但之後每一次站內導覽從最多
  3.8 KB 變成 0。Astro 預設的 `"auto"`（<4KB 即內嵌）優化的是「只看一頁就走」的落地頁，
  與文檔站的側寫相反。唯一的代價是首屏多一個請求。
  `cssCacheable` 需同步調高（43.9 KB 會貼在 44.0 KB 上限），那是重新定義的
  連帶調整而非放寬，理由須寫進 commit message。

---

## 階段六補：Cloudflare adapter 讓兩件事靜默壞掉 ✅（另留一項待辦）

> 起因：`@astrojs/cloudflare` 把靜態產物從 `dist/` 移到 `dist/client/`（`dist/server/` 是 worker）。
> adapter 本身沒問題 —— 目前所有路由都預渲染，`dist/server/` 是空的。問題是**兩個依賴
> 「產物在 `dist/` 根目錄」的既有假設沒有跟著改**，而兩者壞掉的方式都不會有錯誤訊息。

**這一節的共同主題是「失敗看起來跟成功一樣」。** 階段六已經有五個無錯誤訊息的坑，
這裡再加兩個，但性質更糟：前五個至少「畫面上看得出不對」，這兩個是**綠燈的謊**。

- [x] **搜尋在 production 會 404**（部署後才會發生，本機 `pnpm preview` 也照不到）
  - [x] Pagefind 寫到 `dist/pagefind/`，Cloudflare 服務的是 `dist/client/` ——
        `/pagefind/pagefind.js` 在線上根本不存在
  - [x] 降級機制**運作正常**，讀者會如實看到「搜尋暫時無法使用」——
        也就是說錯誤處理沒壞，是搜尋永遠不會成功。這正是它難被發現的原因：
        沒有例外、沒有紅字，只有一句設計好的訊息
  - [x] 改為 `pagefind --site dist/client`，`prune-search-bundle.mjs` 收 `dist/client/pagefind` 參數
- [x] **效能閘門在量錯的目錄，而且報綠燈**（比上一條嚴重）
  - [x] `byUrl` 以 `dist` 為基準算 key，得到 `/client/_astro/…`，而頁面裡寫的是 `/_astro/…`，
        對不上。所有**由頁面反推**的檢查（共用 JS、單頁初始 JS、外部 CSS）全部讀成 0
  - [x] 輸出是 `✓ 0 B / 8.0 KB 0%` 與「全數通過」—— 沒有任何一行說「我沒找到東西」。
        零與通過在報告裡長得跟「乾淨」一模一樣，而這個站的前四個階段**真的**是 0 B，
        誤導性因此加倍
  - [x] 改 `distDir: "dist/client"` 後數字回來：共用 JS 6.9KB、外部 CSS 38.5KB
  - [x] `_distDir` / `_distDir_gap` 兩條註記寫進 config，記錄病灶與下述盲區

- [x] ~~**待辦：讓 `dist/server/` 的盲區發得出聲。**~~ —— **已於階段七完成。**
      目前 `distDir` 指向 client 沒有漏掉
      任何東西（server 為空），但哪天出現 on-demand 路由，worker 的 JS 就完全不在閘門
      視野內 —— 而且是**靜默地**不在：閘門不會變紅，只是繼續回報 client 的數字並通過。
      修法不是把 `distDir` 改回 `dist`（會重現上面的 key 對不上），而是在
      `scripts/perf-budget.mjs` 前置檢查 `dist/server/` 是否出現 `.js`，有就直接失敗並
      說明原因。~~在那之前，擋在盲區前面的只有一條 JSON 註解 —— 註解擋不住，只能提醒。~~

**同一輪一併處理的三件事**（來自 Review，與 adapter 無關）：

- [x] `#run()` 補 try/catch。`#load()` 的 try 只包得住 `import()`，若 pagefind.js 載入成功
      但 wasm 或索引分片抓不到，例外會落在 `#run()` —— 而它是以 `void this.#run()` 呼叫的，
      沒有 catch 就變成沒人接的 unhandled rejection。**重點是清空結果**：留著上一次查詢的
      結果、而輸入框是新的查詢字串，讀者看到的不是「壞了」而是「這個詞的結果是這些」
- [x] 失敗後真的能重試 —— 必須呼叫 `pagefind.destroy()`。第一版修法（把 `#pagefind`
      與 `#loading` 設回 `null`）是**錯的**：動態 `import()` 回傳的是瀏覽器模組登錄表裡的
      同一個實例（實測 `m === m2` 為 `true`），Pagefind 已經壞掉的內部狀態原封不動，
      重開只會再失敗一次。`destroy()` 釋放那份狀態，下次呼叫才會重新初始化
- [x] 錯誤文案改為「搜尋暫時無法使用，請稍後再試，或重新整理頁面。」
      —— 原本的「請關閉後重新開啟再試一次」承諾了一個**不保證成立**的動作：失敗那次的
      回應若被瀏覽器或 CDN 快取住，`destroy()` 也救不回來（實測時就以 `invalid gzip data`
      的形式撞到過）。而且「關閉再打開」是我們的實作細節（`#loading` 在 close 事件上失效），
      讀者的直覺「重新整理」本來就是更強的復原手段。
      **`destroy()` 保留不動** —— 重置是實質行為，文案是承諾強度，兩者不必一致

**端到端驗證**（`dist/client` 靜態伺服，真實滑鼠與鍵盤，非只用 JS 驅動）：
移走 `dist/client/pagefind/fragment/` 構造「import 成功、但分片抓不到」→ 結果清空並顯示
新文案 → 還原 → Esc 關閉 → 重新打開 → 搜「動畫」得 4 筆結果與 `<mark>` 標記。

---

## 階段七：閘門修補（在任何 island 之前）✅

> ADR [0008](../adr/0008-performance-budget-gate.md)

**這一階段不新增任何功能，只讓量測可信。** 階段八起會陸續引進 island，階段十更是
200KB 級的依賴 —— 那正是最不能容忍閘門說謊的時刻。階段六補已經示範過一次
「綠燈的謊」長什麼樣子，這階段是不讓它再發生一次。

- [x] **`dist/server/` 盲區發得出聲**（承接階段六補的待辦）
  - [x] `scripts/perf-budget.mjs` 前置檢查：`dist/server/` 出現 `.js` 就直接失敗，
        並在訊息裡說明「有 on-demand 路由，worker 的 JS 不在閘門視野內」
  - [x] 目錄由 config 的 `serverDir` 顯式指定，不從 `distDir` 推導 ——
        推導會讓「閘門知道有兩個目錄」這件事變成隱含的，而這一階段要消滅的正是隱含
  - [x] **不是**把 `distDir` 改回 `dist` —— 那會重現階段六補的 key 對不上問題
  - [x] `_distDir_gap` 改寫為 `_serverDir`，記錄病灶與「現在擋在前面的是程式碼而非註解」
- [x] **`inlineStylesheets: "never"`**（階段六待決事項已定案採用）
  - [x] `astro.config.mjs` 設 `build.inlineStylesheets: "never"`，實測數字寫進註解
  - [x] `cssCacheable` 由 45056 調高至 53248，理由寫進 commit message
        —— 那是重新定義的連帶調整而非放寬（同一批 bytes 從 `pageInlineCss` 搬過來，
        而該條上限同時由 6144 收到 0，兩條合起來是收緊）
  - [x] **`pageInlineCss` 語意改為「應恆為 0 的回歸測試」**，上限設 0。
        config 註解與腳本失敗訊息一併改寫 —— 原本那句「撞線的正確反應是改成 `"never"`」
        在採用之後會指向一個已經做過的動作
  - [x] 每頁多一個請求是已知且接受的代價（文檔頁 `<link>` 3 → 4 支）
- [x] **紅線分類落地**（ADR 0008 的「人人都付 / 按需才付」）
  - [x] `budgets` 巢狀分為 `everyonePays` / `onDemand`，`_classes` 記錄兩類的語意
        與「撞線時的正確反應完全相反」
  - [x] 閘門輸出按分類分段
  - [x] 為階段九／十預留：腳本強制 checks 與 budgets 兩邊完全對得起來 ——
        檢查沒有紅線、或紅線沒有檢查，都直接失敗。**這是 ADR 0008「沒有產物可以
        因為不屬於任何一條而消失在報告裡」的機器化**：忘記開紅線與忘記歸類都過不了

**閘門結果**（12 頁，乾淨 build）：

| 類別 | 項目 | 實測 | 上限 |
|---|---|---|---|
| 人人都付 | 共用 JS | 6.9 KB | 8.0 |
| | 最大單一 chunk | 4.5 KB | 50.0 |
| | 單頁初始 JS | 6.9 KB | 8.0 |
| | 字型與靜態資源 | 1.4 KB | 32.0 |
| | 外部 CSS（可快取） | 46.9 KB / 7 支 | 52.0 |
| | 單頁內嵌 CSS | **0 B** | 0（回歸測試）|
| 按需才付 | 搜尋執行期 | 151.4 KB | 160.0 |
| | 搜尋索引 | 21.3 KB | 128.0 |

診斷（不設閘）最貴單頁首次載入 CSS **42.3 KB，與 `"auto"` 時完全相同** ——
同一批 bytes 換了送法，之後每次站內導覽從 3.8 KB 變成 0。

**驗收**：
- [x] 手動在 `dist/server/` 放一支 `.js` → exit 1，訊息說得出原因與修法方向
      （`pnpm perf`，即 build 的最後一步）
- [x] 構造「檢查沒有紅線」與「紅線沒有檢查」兩種缺漏 → 皆 exit 1
- [x] `pnpm build`（`rm -rf dist` 後）通過，JS 數字與階段六補一致（共用 JS 6.9KB）；
      CSS 依 `"never"` 重新定義為外部 46.9KB / 內嵌 0
- [x] 報告能直接讀出「人人都付」與「按需才付」各是多少

---

## 階段八：第一個延後載入的元件（`<toc-highlight>`）

> ADR [0003](../adr/0003-no-ui-framework.md)、[0008](../adr/0008-performance-budget-gate.md)

**約 40 行，功能價值不是重點 —— 它的作用是驗證按需載入的邊界。**
階段四留下的驗收項「按需載入的元件不計入單頁初始 JS」至今沒有任何案例可構造
（EC 與搜尋的元件 JS 都是一般 `<script src>`，驗不到這一層）。用 40 行驗這件事，
撞線時歸因是明確的；留到階段九／十才驗，撞線時分不出是邊界壞了、
還是那個套件本來就大。

**實作前先撞到的第一件事：`client:idle` 在本專案不存在。** Astro 的 `client:*`
只作用於 UI framework 元件，而 ADR 0003 的決策就是不引入 renderer —— 也就是說
鐵則從第一天起就在引用一個取用不到的機制，五份文件照抄了同一組措辭。措辭已整組
改寫為可觀測的性質陳述（見 ADR 0003 的第二次修訂紀錄）。**要禁的東西沒有變**
（重量不得進初始載入路徑），變的是它靠什麼機制成立。

- [x] `<toc-highlight>` Web Component（`src/scripts/toc-highlight.ts`，獨立模組而非
      元件內 `<script>` —— 它必須是 `import()` 的目標才會成為獨立 chunk）
  - [x] `customElements.define`，不使用 Shadow DOM 樣式隔離，讓 token 穿透
  - [x] 包住 `<ul>` 而非整個 `<aside>` —— `.doc-toc` 是 grid item（`grid-column` + sticky），
        包在外面會讓自訂元素變成 grid item，`doc-layout.css` 得跟著改
  - [x] 無 JS 時 TOC 維持完全可用（純增強，不改變版面、不承載內容）
  - [x] `:not(:defined)` 不需隱藏 —— 與搜尋按鈕不同，這裡沒有「按下去沒反應」的元素
  - [x] `aria-current="location"`（sidebar 已用 `page` 表示當前頁面，這裡是頁內位置）；
        h3 活躍時父層 h2 的淡標由 CSS `:has()` 自己看出來，JS 只搬一個屬性
- [x] 載入器（`DocToc.astro` 的 `<script>`，316 B，是唯一進共用 bundle 的部分）
  - [x] 觸發條件是 `getComputedStyle(.doc-toc).display !== "none"`，**不寫
        `matchMedia("(min-width: 80rem)")`** —— 那個斷點的唯一真相在 `doc-layout.css`，
        在 JS 裡重述一次就是等著哪天只改一邊。窄螢幕因此一個位元組都不付，
        而這個條件是任何 `client:*` directive 都表達不出來的
  - [x] `requestIdleCallback`（無此 API 則 `setTimeout`）
  - [x] 不監聽 `matchMedia` 的 change：中途拉寬視窗跨過 80rem 時 TOC 會出現但不高亮。
        刻意的遺留 —— 情境極少，而 TOC 本身完全可用，不值得常駐一個監聽器
- [x] 更新 `src/components/DocToc.astro` 的註解（原本三處都不對：Phase 4、
      `client:idle`、已搬移的 `docs/todo.md`）
- [x] 通過階段七修補後的閘門（**閘門本身要先修，見下**）

**兩個實作時踩到的坑**（都無錯誤訊息）：

1. **`entry.boundingClientRect` 不能用來判斷「標題在判定線的哪一側」。** 它是越線
   那一瞬間的取樣，此時 `rect.top` 與 `rootBounds.top` 幾乎相等（實測都是 107），
   子像素差決定 `<` 成立與否 —— 一旦那次記成「還沒越線」，之後不會再有 callback 來
   糾正，因為狀態已經不再變化。症狀是高亮永久落後一節，且只在某些捲動速度下發生。
   修法：**IO 只當觸發器，判定一律用即時的 `getBoundingClientRect`** —— 反而更短，
   整個狀態 Map 可以刪掉，深連結落地的初始狀態也一併免費解掉。
2. **最後一節永遠不會被高亮。** 它到文件底部的距離若小於「視窗高度 − 判定線」，
   那個標題就永遠停在線下方（實測差 79px），而這是每一篇文章都會發生的情況。
   補一個 `scrollend` 上的頁尾補償（一次手勢只發一次，不是每一帧 ——
   捲動進度條走純 CSS 是同一個理由）。舊版 Safari 沒有 `scrollend`，那裡就只是
   少了這項補償。

**閘門修補**（本階段真正的產出，見下方「階段八補」）：新增 `onDemand.deferredIslands`
底網，並修掉一個從第一天就存在的漏算。

**閘門結果**（12 頁）：共用 JS **7.4 KB / 8.0**（92%）｜單頁初始 JS 7.4 KB / 8.0
｜最大單一 chunk 3.2 KB / 50.0 ｜延後載入的元件 **938 B / 8.0** ｜其餘各條未動。
**沒有任何一條紅線調高。** 但 `sharedJs` 與 `pageInitialJs` 只剩 750 B 餘裕 ——
階段九之前要處理的第一件事。

**驗收**：
- [x] **元件本體（938 B）在單頁初始 JS 的增量為 0** —— 補上階段四那個打不了勾的項目。
      實測 HTML 完全沒有它的名字：沒有 `<script src>`、沒有 `modulepreload`
      （這一點原本只是推論：Astro 只為靜態 import 圖發 preload）
- [x] 該元件確實出現在產物中，且是獨立 chunk（不在 `sharedJs` 內）
- [x] 報告中它落在「按需才付」那一組
- [x] 高亮正確：逐節捲動、長節落中途不跳、h3 活躍時父層 h2 一併脫離淡色、
      帶錨點深連結落地、捲到底時最後一節（真實滾輪與鍵盤，非只用 JS 驅動）
- [x] 窄螢幕**完全不載入**（`display: none` 已實測為 `none`，但頂層視窗尺寸在
      驗證環境改不動，這一項留給真實裝置那一輪）
- [x] 深淺模式、行動裝置
      —— 活躍樣式用的 `--accent-3` / `--accent-11` 與 sidebar 的當前頁面完全同一組，
      深色模式的風險僅止於「與既有樣式一致」這個假設

---

## 階段八補：閘門漏算了整個靜態 import 圖 ✅

> ADR [0008](../adr/0008-performance-budget-gate.md)

**這是本階段最有價值的產出，而且是第一個 island 一放進去就把它撞出來的。**

- [x] **新增 `onDemand.deferredIslands`（底網）**
  - [x] 定義：沒有任何頁面在初始載入時抓它的自有 JS。新元件忘記開專屬紅線也不會
        消失（自動落進底網），大型套件另開專屬紅線後再從底網扣除
        （腳本的 `COVERED_BY_OWN_LINE`）
  - [x] 原本 ADR 0008 那條「每一項排除都必須同時開一條屬於自己的紅線」靠人記得，
        而忘記的下場不是報錯，是那筆體積永遠不會失敗 —— 規則從「記得開一條」
        變成「預設就有一條」
- [x] **修掉「只認 HTML 裡寫出來的檔名」這個漏算**
  - [x] 病灶：Rollup 把多個動態 import 點共用的 Vite preload helper 抽成獨立 chunk，
        那支 chunk 只被 entry chunk 以 `import` 敘述引用，HTML 裡沒有它的名字
  - [x] 後果：階段八新增第二個動態 import 點時，1394 B 從「人人都付」憑空消失，
        閘門把共用 JS 從 6.9 KB 報成 **6.0 KB** —— 初始 JS 實際增加約 500 B，
        報告卻說減少 900 B。而且它一開始還被底網歸類成「按需才付」，
        方向錯得特別糟
  - [x] 修法：`sharedJs` / `pageInitialJs` 跟著靜態 import 圖遞迴展開
        （只認 `from"…"` 與裸 `import"…"`；動態 `import(…)` 帶括號、不帶 from，
        因此天然被排除 —— 這個區別就是兩類紅線的分界線，寫死在正則裡比寫在註解裡可靠）
  - [x] 判準因此改為與鐵則逐字對應：**HTML 沒有引用，且不在任何被引用 chunk 的
        靜態 import 圖上**

**這是同一形狀的第三次事故**（階段六量錯對象、階段六補量錯目錄、這次漏跟 import 圖），
三次的共同點都是**閘門說的話比它知道的多**，而且三次都是綠燈。ADR 0008 的使用原則
因此補上一條：新增或修改檢查時，除了「它會不會誤報」，必須一併問
**「它讀不到東西時會說什麼」**。

**驗收**：
- [x] preload helper 從「按需才付」移回「人人都付」，共用 JS 由 6.0 → 7.4 KB
      （這是修正而非退化：那 1394 B 一直都在初始載入路徑上）
- [x] `toc-highlight.js` 是底網裡唯一的一支，938 B
- [x] 階段七建立的「checks 與 budgets 必須兩邊對得上」仍然生效（新增檢查時實測過
      —— 忘記在 config 開紅線會直接 exit 1）

---

## 階段九：L3 控制變數面板（GSAP 主力）

> ADR [0005](../adr/0005-playground-tiers.md)、[0003](../adr/0003-no-ui-framework.md)

**刻意排在 L2 之前** —— 技術上簡單得多、對 GSAP 教學價值更高。
按需載入的邊界已由階段八驗過，這裡驗的是**帶第三方依賴**的元件。

- [ ] 安裝 `gsap`
- [ ] 建立 Web Component（`customElements.define`，不使用 Shadow DOM 樣式隔離，讓 token 穿透）
  - [ ] `<control-panel>` —— `<input type="range">` 群組，即改即看
  - [ ] `<timeline-scrubber>` —— GSAP timeline 進度控制
  - [ ] ease 曲線視覺化
- [ ] 延後載入，觸發條件為「元素進入視窗」（IntersectionObserver + `import()`，
      比照階段八的載入器；`client:visible` 不可用，理由見 ADR 0003）
- [ ] 在 MDX 中直接使用，寫一篇 GSAP 文章驗證
- [ ] 通過階段四閘門
  - [ ] **先處理 `sharedJs` / `pageInitialJs` 的餘裕**：階段八後只剩 750 B（92%），
        而每個新元件都會再加一個載入器
  - [ ] `gsap` 為按需產物 —— 依 ADR 0008 開一條屬於它的紅線，不併進 `singleChunk`，
        並加進腳本的 `COVERED_BY_OWN_LINE` 從底網扣除

**驗收**：未使用該元件的頁面 JS 增量為 0；同頁多個實例互不干擾；
`gsap` 未被 Rollup 拉進共用 chunk。

---

## 階段十：L2 可執行 Playground

> ADR [0005](../adr/0005-playground-tiers.md)、[0006](../adr/0006-editor-codemirror.md)

**放在最後**：唯一需要 200KB 級 chunk 的一級，且是全站最複雜的 island。
邊界（階段八）、第三方依賴（階段九）、閘門語意（階段七）都已先行驗證，
撞線時才有辦法歸因。

- [ ] 安裝 `@codesandbox/sandpack-client`
- [ ] 安裝 `codemirror` + 語言套件（`@codemirror/lang-javascript` 等，按需）
- [ ] 撰寫 glue code（核心約 80–100 行，含 UI 約 150–250 行）
  - [ ] `loadSandpackClient(iframe, content, options)` 掛載
  - [ ] CodeMirror `onChange` → `client.updateSandbox({ files })` 熱更新（含 debounce）
  - [ ] 多檔案分頁
  - [ ] 錯誤顯示與 loading 狀態
  - [ ] reset 到初始程式碼
- [ ] 延後載入，觸發條件為「元素進入視窗」（比照階段八／九的載入器）
- [ ] **驗證中文 IME 輸入正常**（選 CodeMirror 的關鍵理由，ADR 0006）
- [ ] 驗證行動裝置可用性
- [ ] 通過階段四閘門
  - [ ] **CodeMirror ~200KB 會直接撞 `singleChunk`（51200 B）** —— 依 ADR 0008
        的分類，正確處理是排除後另開 `editorRuntime` 一條（比照階段六的 `searchRuntime`），
        **而非調高 `singleChunk`**。後者會讓那條檢查再也答不出「我們自己的程式碼
        有沒有意外合併」
  - [ ] 確認 `sharedJs` / `pageInitialJs` 增量為 0

**驗收**：一篇文章放 5 個 Playground，只有滾動到的才載入。

---

## 後續（無明確順序）

- [x] ~~`<toc-highlight>` scroll spy~~ —— **已升格為階段八**，不再是「無明確順序」的後續項。
      它是驗證 island 邊界最便宜的載體，因此排進主線
- [ ] 中文字型分片子集化 —— `cn-font-split`，僅在排版規則到位且視覺確有需求時啟動（ADR [0004](../adr/0004-cjk-font-strategy.md)）
- [ ] Monaco —— 僅限 TypeScript 型別教學路由，動態 `import()`，需驗證 chunk 分離（ADR [0006](../adr/0006-editor-codemirror.md)）
- [ ] OG image 自動生成
- [ ] RSS / sitemap
- [ ] 深色模式（token 已預留，需補切換 UI）
- [ ] `class-variance-authority` —— 若 variant 複雜度上升再評估（build 期執行，client 零成本）

---

## 三條鐵則

任何新增元件都必須遵守，由階段四的閘門保障：

1. **所有 editor 與重量級互動元件一律不得進入初始載入路徑。**
   元件本體只能由執行期 `import()` 取得，頁面裡留下的只能是載入器；預設觸發條件是
   「元素進入視窗」，不改變版面、不承載內容的輕量增強元件可用 idle 或其他更早的條件。
   **不使用 Astro 的 `client:*` directive** —— 它只作用於 UI framework 元件，
   而本專案不引入 renderer（措辭兩次修訂的理由見 ADR [0003](../adr/0003-no-ui-framework.md)）。
2. **同一頁面永遠不出現兩套 editor engine。**
3. **樣式 token 必須區分中西兩軸，語言切換透過 `:lang()` 而非 class。**

## 明確排除

- React / Vue / 任何 UI 元件庫（ADR [0003](../adr/0003-no-ui-framework.md)）
- Tailwind 或任何樣式框架（ADR [0002](../adr/0002-style-system-tokens-cjk.md)）
- 全量載入中文 webfont（ADR [0004](../adr/0004-cjk-font-strategy.md)）
- WebContainers —— 需 COOP/COEP header，影響全站（ADR [0005](../adr/0005-playground-tiers.md)）
