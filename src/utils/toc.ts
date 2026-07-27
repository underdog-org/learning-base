import type { MarkdownHeading } from "astro";

/**
 * 目錄（TOC）的資料轉換
 *
 * Astro 的 render() 在 build 期就回傳完整的 headings 陣列，
 * 因此**不需要**在 client 端掃描 DOM 取標題 —— 那是一筆可以完全避免的 JS 成本。
 * 這裡只做扁平轉巢狀的純函式運算。
 */

export interface TocNode {
  depth: number;
  slug: string;
  text: string;
  children: TocNode[];
}

export interface TocOptions {
  /** 納入目錄的最淺層級，預設 h2（h1 是文章標題，不重複列出） */
  minDepth?: number;
  /** 納入目錄的最深層級，預設 h3 */
  maxDepth?: number;
}

/**
 * 把 render() 給的扁平 headings 轉成巢狀結構。
 *
 * 容忍層級跳躍（h2 直接跳 h4）—— 內容作者的疏漏不應該讓版面崩壞，
 * 跳躍的標題會掛在最近的合法父節點下。
 */
export function nestHeadings(
  headings: MarkdownHeading[],
  options: TocOptions = {},
): TocNode[] {
  const { minDepth = 2, maxDepth = 3 } = options;

  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const heading of headings) {
    if (heading.depth < minDepth || heading.depth > maxDepth) continue;

    const node: TocNode = {
      depth: heading.depth,
      slug: heading.slug,
      text: heading.text,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= node.depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);

    stack.push(node);
  }

  return roots;
}

/** 目錄少於兩項時不值得佔用一整欄 */
export function hasUsefulToc(nodes: TocNode[]): boolean {
  return countNodes(nodes) >= 2;
}

function countNodes(nodes: TocNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}
