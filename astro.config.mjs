// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import remarkCjkFriendly from "remark-cjk-friendly";
import { rehypeTableWrapper } from "./src/plugins/rehype-table-wrapper.mjs";
import { rehypeExternalLinks } from "./src/plugins/rehype-external-links.mjs";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],
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
    // Shiki 為 Astro 內建，不需額外安裝。
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed",
      },
      // 關鍵：預設值 defaultColor: 'light' 會把亮色主題寫成 inline style，
      // 而 inline style 勝過任何樣式表 —— 深色模式下程式碼區塊會維持白底。
      // 設為 false 之後 Shiki 只輸出 --shiki-light / --shiki-dark 兩組自訂屬性，
      // 由 src/styles/code.css 用 light-dark() 決定取哪一組。
      defaultColor: false,
    },
  },
});
