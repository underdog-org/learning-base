import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

/**
 * 文檔集合
 *
 * 目錄結構即路由結構：
 *   src/content/docs/typescript/generics.mdx        → /docs/typescript/generics
 *   src/content/docs/typescript/type-system/index.mdx → /docs/typescript/type-system
 *
 * id 的第一段永遠是 topic。側邊欄、accent 色、麵包屑都由它推導，
 * 因此不需要在 frontmatter 重複宣告 topic。
 */
const docs = defineCollection({
  loader: glob({
    // 底線開頭的檔案不進集合，供草稿與片段使用
    pattern: "**/[^_]*.{md,mdx}",
    base: "./src/content/docs",
    // 明確定義 id，不依賴 loader 預設行為：
    // 去副檔名，並讓 index 檔案代表其所在目錄
    generateId: ({ entry }) =>
      entry.replace(/\.mdx?$/, "").replace(/(^|\/)index$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    /** 側邊欄排序。同層級由小到大，未指定者沉底。 */
    order: z.number().default(999),
    /** 側邊欄顯示的簡短名稱，未指定時用 title */
    sidebarLabel: z.string().optional(),
    /** 內容語言，決定 :lang() 套用哪一組排版軸 */
    lang: z.string().default("zh-Hant"),
    draft: z.boolean().default(false),
  }),
});

export const collections = { docs };
