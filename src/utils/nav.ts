import type { CollectionEntry } from "astro:content";

/**
 * 側邊欄導航樹的建構
 *
 * 純函式，build 期執行。不 import 任何 Astro component、不觸碰 DOM。
 * Component 只負責渲染這裡的輸出，不參與計算 —— 見 ADR 0003 的拆分原則。
 */

type Entry = CollectionEntry<"docs">;

export interface NavLink {
  type: "link";
  title: string;
  href: string;
  id: string;
  order: number;
}

export interface NavGroup {
  type: "group";
  title: string;
  /** 群組若有 index 檔案則本身可點擊 */
  href?: string;
  id?: string;
  order: number;
  children: NavNode[];
}

export type NavNode = NavLink | NavGroup;

const DOCS_BASE = "/docs";

export function hrefOf(id: string): string {
  return `${DOCS_BASE}/${id}`;
}

/** "type-system" → "Type System"。僅在目錄缺少 index 檔案時作為後備。 */
function humanize(segment: string): string {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function labelOf(entry: Entry): string {
  return entry.data.sidebarLabel ?? entry.data.title;
}

function byOrder(a: NavNode, b: NavNode): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title, "zh-Hant");
}

/**
 * 建構單一主題的導航樹。
 *
 * 支援任意巢狀深度：目錄成為 group，目錄下的 index 檔案提供該 group 的
 * 標題與排序；沒有 index 時退回目錄名的人類可讀形式。
 */
export function buildNavTree(entries: Entry[], topic: string): NavNode[] {
  const prefix = `${topic}/`;
  const items = entries
    .filter((e) => !e.data.draft && e.id.startsWith(prefix))
    .map((entry) => ({ entry, segs: entry.id.split("/") }));

  // 先算出哪些路徑是「目錄」—— 唯有如此才能區分
  // 「群組的 index 檔案」與「同層級的一般頁面」
  const dirs = new Set<string>();
  for (const { segs } of items) {
    for (let i = 1; i < segs.length; i++) {
      dirs.add(segs.slice(0, i).join("/"));
    }
  }

  return build(items, [topic], dirs);
}

type Item = { entry: Entry; segs: string[] };

function build(items: Item[], prefix: string[], dirs: Set<string>): NavNode[] {
  const nodes: NavNode[] = [];
  const groups = new Map<string, Item[]>();

  for (const item of items) {
    const rel = item.segs.slice(prefix.length);
    // 長度 0 表示這是 prefix 本身的 index，由上層處理
    if (rel.length === 0) continue;

    const key = rel[0]!;
    const fullPath = [...prefix, key].join("/");

    if (dirs.has(fullPath)) {
      // 屬於某個子目錄 —— 包含該目錄自身的 index 檔案
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    } else if (rel.length === 1) {
      nodes.push({
        type: "link",
        title: labelOf(item.entry),
        href: hrefOf(item.entry.id),
        id: item.entry.id,
        order: item.entry.data.order,
      });
    }
  }

  for (const [key, children] of groups) {
    const groupPrefix = [...prefix, key];
    const indexItem = children.find(
      (c) => c.segs.length === groupPrefix.length,
    );

    nodes.push({
      type: "group",
      title: indexItem ? labelOf(indexItem.entry) : humanize(key),
      href: indexItem ? hrefOf(indexItem.entry.id) : undefined,
      id: indexItem?.entry.id,
      order: indexItem?.entry.data.order ?? 999,
      children: build(children, groupPrefix, dirs),
    });
  }

  return nodes.sort(byOrder);
}

/**
 * 依側邊欄的顯示順序攤平成線性序列，供上／下一篇導航使用。
 * 群組本身若可點擊，排在其子項目之前。
 */
export function flattenNav(
  nodes: NavNode[],
): Array<{ title: string; href: string; id: string }> {
  const out: Array<{ title: string; href: string; id: string }> = [];
  for (const node of nodes) {
    if (node.type === "link") {
      out.push({ title: node.title, href: node.href, id: node.id });
    } else {
      if (node.href && node.id) {
        out.push({ title: node.title, href: node.href, id: node.id });
      }
      out.push(...flattenNav(node.children));
    }
  }
  return out;
}

export interface Siblings {
  prev?: { title: string; href: string };
  next?: { title: string; href: string };
}

/**
 * @param prepend 主題總覽頁。它不在導航樹裡（樹只含 topic 底下的章節），
 *   但在閱讀順序上是第一篇，因此需要外部補進序列頭部。
 */
export function findSiblings(
  nodes: NavNode[],
  currentId: string,
  prepend?: { title: string; href: string; id: string },
): Siblings {
  const flat = prepend
    ? [prepend, ...flattenNav(nodes)]
    : flattenNav(nodes);
  const i = flat.findIndex((item) => item.id === currentId);
  if (i === -1) return {};
  return { prev: flat[i - 1], next: flat[i + 1] };
}

/** 判斷某個群組是否包含當前頁面，用於決定預設展開狀態 */
export function containsId(node: NavNode, id: string): boolean {
  if (node.type === "link") return node.id === id;
  if (node.id === id) return true;
  return node.children.some((child) => containsId(child, id));
}
