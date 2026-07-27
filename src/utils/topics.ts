/**
 * 主題註冊表
 *
 * 新增一個知識主題需要兩步：
 *   1. 在此加入一筆設定
 *   2. 在 src/styles/topics.css 覆寫該 topic 的 --accent-1..12
 *
 * 不需要新增任何 component —— 兌現 ADR 0002 的承諾。
 */

export interface Topic {
  /** URL 片段，同時是 src/content/docs/ 下的目錄名 */
  slug: string;
  /** 導航列與麵包屑顯示的名稱 */
  label: string;
  /** 主題首頁的一句話說明 */
  description: string;
  /** 全站導航的排序 */
  order: number;
}

export const TOPICS: Topic[] = [
  {
    slug: "typescript",
    label: "TypeScript",
    description: "型別系統的思考方式，而不是語法速查表。",
    order: 1,
  },
  {
    slug: "gsap",
    label: "GSAP",
    description: "動畫的時間軸模型與參數控制。",
    order: 2,
  },
  {
    slug: "ai-ml",
    label: "AI / ML",
    description: "以視覺化理解模型內部發生了什麼。",
    order: 3,
  },
  {
    slug: "claude",
    label: "Claude",
    description: "Agent 的上下文管理與工作流設計。",
    order: 4,
  },
];

const BY_SLUG = new Map(TOPICS.map((t) => [t.slug, t]));

export function getTopic(slug: string): Topic | undefined {
  return BY_SLUG.get(slug);
}

export function sortedTopics(): Topic[] {
  return [...TOPICS].sort((a, b) => a.order - b.order);
}

/** 從文檔 id 取出所屬 topic，例如 "typescript/generics" → "typescript" */
export function topicOf(id: string): string {
  return id.split("/")[0] ?? "";
}
