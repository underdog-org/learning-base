import { visit } from "unist-util-visit";

/**
 * 把每個 <table> 包進一個可橫向捲動的容器。
 *
 * 為什麼捲動容器不能是 <table> 自己：
 *   overflow 會建立 block formatting context，而 table 的自動欄寬演算法
 *   依賴它在 normal flow 中的量測結果 —— 直接對 table 設 overflow-x
 *   會讓欄寬計算失準。必須外包一層。
 *
 * 為什麼是 rehype 而非 remark：
 *   mdast 的 table 節點沒有「任意元素包裹」的表達方式，包裹是 HTML 結構的事。
 *
 * 無障礙：可捲動區域必須能用鍵盤操作（WCAG 2.1.1）。tabindex 讓它成為
 * 焦點停留點，role + aria-label 則讓這個停留點對螢幕閱讀器有意義 ——
 * 只給 tabindex 會產生一個沒有名稱的焦點站，比不給更糟。
 *
 * 樣式見 src/styles/prose.css 的 .table-wrapper。
 */
export function rehypeTableWrapper() {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "table") return;
      if (!parent || index === undefined) return;

      // 已經包過就不再包（例如作者在 MDX 中手寫了 wrapper）
      const className = parent.properties?.className;
      if (Array.isArray(className) && className.includes("table-wrapper")) {
        return;
      }

      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["table-wrapper"],
          tabIndex: 0,
          role: "region",
          "aria-label": "表格，可橫向捲動",
        },
        children: [node],
      };
    });
  };
}
