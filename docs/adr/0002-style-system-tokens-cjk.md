# ADR 0002：樣式體系 —— CSS `@layer` + 中西雙軸 Token + `:lang()` 隔離

- 狀態：已接受
- 日期：2026-07-27

## 脈絡

中文網頁排版難看的根因不在框架，而在 typography CSS 層。經拆解，實際問題有六項，全部可用純 CSS 解決：

| 項目 | 拉丁文預設 | 中文需要 |
|---|---|---|
| `line-height` | 1.5–1.6 | **1.75–1.85**（方塊字缺乏 x-height 起伏，行距需更鬆） |
| 字體堆疊 | 單一 family | **中西分離**：拉丁排前、中文排後，瀏覽器按 codepoint 自動分派 |
| 字重 | 300/500 隨意使用 | 只用**真實字重檔**（400/700），合成假粗體在中文上會糊 |
| 內文寬度 | `max-width: 65ch` | `ch` 是拉丁字元寬，中文會爆行 → 用 `em`，目標 38–42 字/行 |
| 標點 | 不處理 | `text-spacing-trim: space-first` 擠壓全形標點空白，視覺改善最大 |
| 中英混排 | 不處理 | `text-autospace: normal`，或 build 期以 pangu 插入細空格 |

此外，中文缺乏大小寫的視覺起伏，段落節奏只能靠段距建立 —— 段距需拉到行距的 1.5 倍以上。

關鍵難點在於：內容是 MDX，中文文章中會夾雜英文段落、程式碼、術語，**語言不是頁面層級的屬性，而是節點層級的屬性**。

## 決策

採用**零依賴的原生 CSS**，以三層結構組織：

### 1. 分層：`@layer`

```
@layer reset, tokens, base, components, utilities;
```

明確的 cascade 順序取代選擇器權重競賽，避免 `!important`。

### 2. Token 雙軸

Primitive token 本身就分中西兩軸，語意 token 由 primitive 組合而成：

```css
@layer tokens {
  :root {
    /* primitive：中西分離 */
    --font-latin: "Inter", system-ui;
    --font-cjk: "PingFang TC", "Noto Sans TC", sans-serif;

    --leading-latin: 1.6;
    --leading-cjk: 1.8;

    --measure-latin: 65ch;   /* ch 對拉丁有效 */
    --measure-cjk: 40em;     /* 中文用 em，約 40 字/行 */
  }

  /* semantic：預設走拉丁 */
  :root {
    --font-body: var(--font-latin), var(--font-cjk);
    --leading-body: var(--leading-latin);
    --measure-body: var(--measure-latin);
  }
}
```

中西差異在 **token 層**解決，component 層只消費語意 token，不做語言判斷。

### 3. 隔離：`:lang()` 而非 class

```css
@layer tokens {
  :root:lang(zh), [lang^="zh"] {
    --leading-body: var(--leading-cjk);
    --measure-body: var(--measure-cjk);
  }
}
```

**使用 `:lang()` 而非 class 是本 ADR 的核心。** 理由：MDX 內容必然出現中文文章夾英文段落的情況，`:lang()` 可被任意層級的 `<div lang="en">` 局部覆蓋並自然繼承，class 方案做不到，且會迫使作者在內容中手動標註樣式。

### 4. Variant：`data-*` 屬性

元件變體用 `data-*` 屬性 + attribute selector 表達，不引入樣式框架。若日後需要型別安全的 variant API，可考慮 `class-variance-authority`（~1KB）—— 在 `.astro` frontmatter 中屬 **build 期執行**，client bundle 零成本。

## 後果

- 排版調整完全自主，無升版破壞風險。
- 新增元件需自行撰寫 CSS，無 utility class 可用（刻意的取捨，見替代方案）。
- Token 命名與色階需自行設計，參考 Radix Colors 與 Open Props 的 scale 命名法。
- `text-spacing-trim` / `text-autospace` 屬較新的 CSS Text Level 4 特性，需確認目標瀏覽器支援度並準備 fallback。

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| Tailwind v4（`@theme`） | `@theme` 確實是 token 系統，但會把 CJK 分層邏輯綁進它的 cascade，與「隔離處理」的目標衝突 |
| Open Props（安裝） | 作為 token 命名的**參考**採用，但不安裝 —— 其 scale 為拉丁排版設計，仍需大幅覆寫 |
| UI Library（Radix UI / shadcn / Ark） | 見 [ADR 0003](0003-no-ui-framework.md)，會帶入自己的 token 體系與預設排版 |
| class 切換語言（`.zh` / `.en`） | 無法處理 MDX 的節點級語言混排，且污染內容層 |

## 參考來源

- **Radix Colors** —— 12 階色階、light/dark 自動配對，語意 token 的範本
- **Open Props** —— 純 CSS 變數的 scale 命名法
- **`@tailwindcss/typography` 原始碼** —— prose 節奏規則（標題與前後段間距比例）最成熟的一份，讀後重寫為 CJK 版本
- **Han.css（漢字標準格式）** —— 實作方式過時，但其整理的 CJK 排版規則清單今日依然正確，作為 checklist 使用

## 相關

- [ADR 0004](0004-cjk-font-strategy.md)：`--font-cjk` 的實際來源策略
