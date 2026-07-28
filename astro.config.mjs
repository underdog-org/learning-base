// @ts-check
import { defineConfig } from "astro/config";
import expressiveCode, { pluginFramesTexts } from "astro-expressive-code";
import mdx from "@astrojs/mdx";
import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import remarkCjkFriendly from "remark-cjk-friendly";
import { rehypeTableWrapper } from "./src/plugins/rehype-table-wrapper.mjs";
import { rehypeExternalLinks } from "./src/plugins/rehype-external-links.mjs";

import cloudflare from "@astrojs/cloudflare";

// EC 的 UI 文字預設為英文，而複製鈕的 tooltip 是全站唯一會被讀者看到的
// 介面字串 —— 中文站上留一顆寫著 Copy to clipboard 的按鈕很突兀。
// EC 不讀 <html lang>，它的 locale 來自自己的 defaultLocale（預設 "en"），
// 因此下方 expressiveCodeOptions 必須一併把 defaultLocale 設為 zh-Hant，
// 只覆寫文字是不會生效的。
const codeBlockTexts = {
  copyButtonTooltip: "複製程式碼",
  copyButtonCopied: "已複製",
  terminalWindowFallbackTitle: "終端機",
};
pluginFramesTexts.overrideTexts("zh-Hant", codeBlockTexts);

/**
 * L1 程式碼區塊（ADR 0005）
 *
 * EC 自帶一整套視覺預設，若原樣採用，程式碼區塊會是全站唯一不吃 token 的
 * 區塊 —— 圓角、邊框、字級各自為政，深色模式尤其明顯。因此這裡的原則是：
 * 語法著色交給主題，容器的幾何與字體一律指回 tokens.css。
 *
 * 刻意「不」覆寫顏色類的 styleOverrides：EC 會在建置期讀取這些值去推算
 * 對比度與 marker 的混色，而 var(--x) 在建置期無法求值，寫進去會得到
 * 無效的混色結果。容器底色改由 src/styles/code.css 在 CSS 層蓋掉。
 */
const expressiveCodeOptions = {
  // 第一個為預設主題，EC 依 theme.type 自動判斷何者為深色，
  // 並產生 @media (prefers-color-scheme: dark) 的覆寫。
  // 與階段二相同的兩個主題，讀者看到的著色不會因為換了渲染層而改變。
  themes: ["github-light", "github-dark-dimmed"],

  // 與 <html lang> 對齊，讓上方 overrideTexts("zh-Hant", …) 比對得到。
  defaultLocale: "zh-Hant",

  // EC 預設會把捲軸與選取色也主題化。本站的捲軸與選取色屬於全站一致的
  // 系統行為，不該只有程式碼區塊特立獨行 —— 關掉同時也省下對應的 CSS。
  useThemedScrollbars: false,
  useThemedSelectionColors: false,

  styleOverrides: {
    borderRadius: "var(--radius-3)",
    borderWidth: "1px",
    borderColor: "var(--color-border-subtle)",

    // 階段二的決策延續：底色取本站表面色，而非 Shiki 主題自帶的底色。
    // 主題底色獨立於 token 之外，深色模式下會與周圍表面對不齊；語法色在
    // 略微不同的深灰上仍有足夠對比。換了渲染層不代表這條決策失效。
    codeBackground: "var(--color-bg-subtle)",

    codeFontFamily: "var(--font-code)",
    // 等寬字的視覺字級偏大，0.9em 才與內文平衡（與 base.css 同一個值）
    codeFontSize: "0.9em",
    codeLineHeight: "var(--leading-tight)",
    codePaddingBlock: "var(--space-4)",
    codePaddingInline: "var(--space-4)",
    uiFontFamily: "var(--font-body)",

    // 檔名框（frames plugin）。若只改 codeBackground 而不動這裡，分頁標籤
    // 會維持主題底色，與下方的程式碼區塊接不起來，接縫會很明顯。
    frames: {
      editorTabBarBackground: "var(--color-surface)",
      editorActiveTabBackground: "var(--color-bg-subtle)",
      terminalBackground: "var(--color-bg-subtle)",
      terminalTitlebarBackground: "var(--color-surface)",
    },
  },
};

// https://astro.build/config
export default defineConfig({
  // 順序陷阱（與下方 rehypeHeadingIds 同類）：expressiveCode() 必須排在
  // mdx() 之前。EC 是以 remark 外掛的形式接管程式碼區塊的渲染，而 mdx()
  // 在自己初始化時就會固定住當下的 markdown 設定 —— 排在後面等於沒裝，
  // .md 會生效而 .mdx 靜默地維持 Shiki 原樣，兩種副檔名產出不同標記。
  integrations: [expressiveCode(expressiveCodeOptions), mdx()],

  markdown: {
    // CommonMark 的強調符判定規則以「標點 / 空白 / 其他」三分法決定
    // delimiter run 的 flanking 性質，而全形標點被歸入「標點」後，
    // 夾在中文之間的 **「引號」** 會兩側都不成立 —— 於是不產生 <strong>，
    // 星號原樣輸出。這不是排版不夠美，是渲染錯誤。
    //
    // 實測失敗案例（見 /style-guide/markdown）：
    //   這是**「引號開頭的粗體」**內容
    //   這是**（括號）**內容
    //   這是**粗體。**含句號
    //
    // CommonMark 下一版草案正在修這條規則，此外掛是該草案的先行實作。
    remarkPlugins: [remarkCjkFriendly],

    // Astro 已內建 GFM、smartypants 與標題 ID 生成（github-slugger），
    // 因此不需要 rehype-slug。
    //
    // 但有個順序陷阱：Astro 內建的 rehypeHeadingIds 預設跑在使用者外掛
    // 「之後」，而 autolink 只會替已經有 id 的標題加錨點 —— 直接放進來
    // 會靜默地什麼都不做（build 通過、錨點卻不存在）。
    // 明確地把它排在前面即可；Astro 偵測到已宣告就不會再加一次。
    rehypePlugins: [
      rehypeHeadingIds,
      [
        rehypeAutolinkHeadings,
        {
          // append：錨點放在標題文字之後。prepend 會讓標題左緣參差不齊，
          // 在中文標題上尤其明顯（方塊字的左緣本來就是一條直線）。
          behavior: "append",
          // 錨點的無障礙名稱直接指向標題自身的 id。標題的內容就是它的
          // 名稱，因此不需要另外計算文字，也不需要 hast-util-to-string。
          properties: (node) => ({
            className: ["heading-anchor"],
            ariaLabelledBy: node.properties.id,
            // 錨點的 # 是視覺工具，不是標題的一部分。不排除的話，
            // Pagefind 會把它算進標題文字，搜尋結果的章節標題全都
            // 變成「名稱不重要 #」（ADR 0007）。
            //
            // 值必須是 "all"（或 "index"）而非 true —— hast 會把布林值
            // 輸出成 data-pagefind-ignore="true"，那不是 Pagefind 認得的
            // scope，會被忽略而靜默失效。
            "data-pagefind-ignore": "all",
          }),
          // # 對螢幕閱讀器沒有意義，藏起來；名稱由上面的 aria-labelledby 提供。
          content: {
            type: "element",
            tagName: "span",
            properties: { ariaHidden: "true" },
            children: [{ type: "text", value: "#" }],
          },
        },
      ],
      rehypeTableWrapper,
      rehypeExternalLinks,
    ],
    // markdown.shikiConfig 已移除：EC 內部仍是 Shiki，但主題與著色全由
    // expressiveCodeOptions 接管，兩邊並存只會讓人不知道哪份設定有效。
    // 原本的 defaultColor: false 也不再需要 —— EC 不寫 inline 顏色，
    // 深淺切換由它自己產生的 @media (prefers-color-scheme) 規則負責。
  },

  build: {
    // Astro 預設的 "auto"（scoped CSS < 4KB 就內嵌進每一份 HTML）優化的是
    // 「只看一頁就走」的落地頁：省下一個請求，代價是那份 CSS 無法快取。
    // 文檔站的側寫正好相反 —— 讀者會連看好幾篇，內嵌的部分每一次站內導覽
    // 都重付一次。
    //
    // 實測（12 頁）：
    //             外部 CSS 總量   單頁內嵌（最大）   最貴單頁首次載入
    //   "auto"      38.5 KB (3 支)     3.8 KB            42.3 KB
    //   "never"     46.9 KB (7 支)       0 B             42.3 KB
    //
    // 最貴單頁的首次載入完全相同（同一批 bytes，只是換了送法），但之後
    // 每一次站內導覽從最多 3.8 KB 變成 0。外部總量增加是因為原本被複製進
    // 12 份 HTML 的 scoped 區塊收斂成 4 支獨立檔案 —— 那是同一批 bytes
    // 從「每頁重付」搬到「全站共付一次」，不是新增的成本。
    //
    // 代價是每頁多一個請求（文檔頁 3 → 4 支 <link>）。
    //
    // 連帶效果：perf-budget 的 pageInlineCss 從「刻意設緊的預算」變成
    // 「應恆為 0 的回歸測試」—— 設定既然是 never，任何內嵌都代表有東西
    // 繞過了這裡。
    inlineStylesheets: "never",
  },

  adapter: cloudflare(),
});