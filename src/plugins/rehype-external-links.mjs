import { visit } from "unist-util-visit";

/**
 * 標記站外連結。
 *
 * 只加上 data-external 屬性，視覺標記與無障礙文字全部交給 CSS
 * （src/styles/prose.css 的 a[data-external]::after）。
 *
 * 為什麼不加 target="_blank"：
 *   1. WCAG 3.2.5 —— 未經預期地開新視窗會破壞返回鍵，那是讀者唯一可靠的
 *      逃生路徑。想開新分頁的人自己 Cmd／中鍵點擊即可，那是既有慣例。
 *   2. 本站是純靜態產物，所有裝置拿到同一份 HTML。「桌機開新分頁、
 *      手機同頁」這種分歧只能靠 client JS 改寫 DOM，違反零 JS 的基準線。
 *
 * 沒有 target="_blank" 就不需要 rel="noopener" —— 那條規則只在開新視窗時
 * 才有意義。
 */
export function rehypeExternalLinks() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;

      const href = node.properties?.href;
      if (typeof href !== "string") return;

      // 相對路徑、錨點、mailto:、tel: 一律不算站外
      if (!/^https?:\/\//i.test(href)) return;

      node.properties["data-external"] = "";
    });
  };
}
