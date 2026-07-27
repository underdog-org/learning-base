// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],
  markdown: {
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
