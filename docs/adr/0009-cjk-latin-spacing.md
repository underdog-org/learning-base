# ADR 0009：中英混排空白交由 CSS `text-autospace`，暫緩自訂 remark／rehype 外掛

- 狀態：已接受
- 日期：2026-07-28

## 脈絡

漢字是全形，字面幾乎撐滿字身框，左右沒有側邊空隙（side bearing）；拉丁字母則天生帶側邊空隙，而且西文以空格切分單字、本身就有節奏。兩者相接時中文那一側完全沒有留白，字母直接貼上漢字筆畫 —— `使用TypeScript開發` 讀起來黏成一團，正確排版應是 `使用 TypeScript 開發`。W3C《中文排版需求》（clreq）建議此處留約 1/4 em 的間隙。

這不是字型選錯，是兩套書寫系統的度量標準不同，因此不可能靠換字型解決。

[ADR 0002](0002-style-system-tokens-cjk.md) 當時採用 `text-autospace: normal`（實作於 `src/styles/base.css`），並在「後果」段落預留了一個未解問題：**這是 CSS Text Level 4 的新特性，需確認支援度並準備 fallback。** 本 ADR 回答那個問題。

### 支援度調查（2026-07-28）

| 屬性 | Chrome / Edge | Safari | Firefox | 全球覆蓋 |
|---|---|---|---|---|
| `text-autospace`（中英混排） | 120（`normal` 值 140） | 18.4 | 145 | **80.7%** |
| `text-spacing-trim`（標點擠壓） | 123 | ✗ | ✗ | 69.9% |

`text-autospace` 已於 2025-11 進入 **Baseline newly available**，Firefox 145 補上最後一塊。Firefox 的實作不含 `punctuation` 與 `replace` 兩個值，但本專案只用 `normal`，不受影響。

**調查結果與立案時的假設相反。** 原先預期需要 fallback 的中英混排，反而是兩者中支援度較好的那個；真正僅 Chromium 支援的是 `text-spacing-trim` —— 而 ADR 0002 明確記載它「對中文排版的視覺改善幅度最大」。

剩餘缺口主要是舊版 in-app 瀏覽器（微信、LINE）與舊 Android WebView，且隨時間自然收斂。

### 業界作法

社群分成兩派，分歧點在於**空白算內容還是算樣式**：

| 派別 | 代表 | 作法 |
|---|---|---|
| 空白是**內容** | [中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines) | 要求作者在原始碼手動打空格。Vue／React 中文文檔採此法 |
| 空白是**內容**（自動化） | [pangu.js](https://github.com/vinta/pangu.js)（盤古之白） | 執行期走訪 DOM 於交界插入 `U+0020`，會偵測既有空格不重複插。衍生 `hexo-filter-pangu`、`markdown-it-pangu`、`remark-pangu` |
| 空白是**樣式** | `text-autospace` | 瀏覽器於排版期插入視覺間隙，DOM 不變 |

兩派插入的都是真的空格字元，這是**刻意選擇**而非疏忽 —— 他們認為那個空格本來就該是正文的一部分。

VitePress、Docusaurus、Starlight **均未內建**任何處理，一律靠作者或社群外掛。此題沒有「框架標準作法」可循。

## 決策

**中英混排空白完全交由 CSS `text-autospace: normal`，不寫自訂 remark／rehype 外掛，也不要求作者手動打空格。**

理由：

1. **覆蓋率已達 80.7% 且持續成長**，瀏覽器追上了這個問題，外掛的 ROI 隨時間遞減。
2. **DOM 保持乾淨** —— 複製貼上不帶隱形字元、`Ctrl+F` 搜「使用TypeScript」照樣命中、內容層不被樣式污染。
3. **規則集中在一行 CSS** —— 自訂 AST 外掛等於長期維護一份 CJK 邊界判定邏輯，而本站滿是程式碼，誤傷成本高。
4. **涵蓋範圍更廣** —— 外掛只能處理 MDX 正文；CSS 連 frontmatter 標題、側邊欄標籤、TOC 這些由 component 輸出的字串一併處理。

`text-spacing-trim` 在 Safari／Firefox 的缺口**接受降級**。它要壓縮全形標點本身的字身空白，靜態文字處理做不到，只能像 Han.css 那樣把每個標點包成元素再套負 margin —— 重、脆、破壞文字選取，不值得。

### 重啟條件

出現下列任一情況時重新評估，並採用下節保留的設計：

- 實測發現目標讀者的 in-app 瀏覽器（微信、LINE、舊 Android WebView）佔比顯著
- 階段六搜尋落地後，證實缺少實體空格明顯影響 Pagefind 的中文分詞召回率

### 保留備用的設計（未實作）

若日後需要 fallback，**不得插入真的空格字元** —— 那會與 CSS 在支援的瀏覽器上疊加成兩倍間距，且無法用 CSS 收回。正確作法是插入空元素，再以 `@supports` 中和：

```css
/* 沒有 text-autospace 的瀏覽器：span 撐出間隙 */
.cjk-gap { margin-inline-start: 0.125em; }

/* 有 text-autospace 的瀏覽器：交還給 CSS，span 歸零 */
@supports (text-autospace: normal) {
  .cjk-gap { margin-inline-start: 0; }
}
```

此設計的關鍵性質是**會自動退場**：瀏覽器更新後 span 自己失效，不需要回頭改任何內容。實作時另有四項要求：

- **寫成 rehype 而非 remark。** mdast 上 `使用 **TypeScript** 開發` 的交界落在 text 節點與 strong 節點**之間**，只走 text 節點的實作會漏掉 —— 這是 pangu 類外掛最常見的 bug。hast 看得到 element 邊界與前後兄弟節點。
- **用白名單而非黑名單決定可進入的元素。** 不只 `code` 與連結 URL，`<pre>`、`<kbd>`、以及日後 L2／L3 互動元件輸出的節點都不能碰。黑名單會隨專案長大而破洞。
- **規則需與 CSS 對齊。** `normal` 同時處理 ideograph-alpha 與 ideograph-numeric，外掛若漏掉數字（`第3章`）就會讓兩種瀏覽器呈現不同結果，失去 fallback 的意義。
- **`@supports` 查詢字串須與實際宣告一致**，如此「查詢通過 = CSS 真的生效」永遠成立。

## 後果

- 階段三不新增任何與混排空白相關的依賴或外掛。
- Safari／Firefox 讀者目前缺少的是**標點擠壓**而非混排空白，且無合理修補路徑，屬已知且接受的降級。
- ADR 0002「後果」段落的待確認項就此結案；`src/styles/base.css` 的註解「不需要 fallback」在調查後成立，但理由與當初不同 —— 當初是「漸進增強故不需要」，現在是「支援度已足夠故不需要」。
- 作者撰寫 MDX 時**不需要**手動打空格。若作者習慣性打了，`text-autospace: normal` 的預設行為不會再疊加一次，無害。

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| 作者手動打空格 | 無機制保證作者記得；日後改規則得改所有文章；空白成為正文的一部分，搜尋與複製行為被綁死 |
| `remark-pangu` ／ pangu.js build 期版 | 插入真空格，與 CSS 疊加成兩倍間距且無法用 CSS 收回；mdast 有跨節點邊界漏判問題 |
| pangu.js 執行期版 | 需 client JS 走訪整個 DOM，違反全站零 JS 的基準線（[ADR 0008](0008-performance-budget-gate.md)） |
| Han.css 式元素包裹 | 需為每個字元產生元素，HTML 體積與文字選取行為皆不可接受 |
| 空 span + `@supports`（本次設計） | 設計本身成立，但在 80.7% 覆蓋率下 ROI 不足，保留備用而非現在實作 |

## 附帶決策：採用 `remark-cjk-friendly`

調查過程中發現 [markdown-cjk-friendly](https://github.com/tats-u/markdown-cjk-friendly)。經實測，CommonMark 的強調符缺陷在本專案的寫作習慣下**確實會觸發**：

| 原始碼 | 原始 CommonMark | 加上外掛後 |
|---|---|---|
| `這是**「引號開頭的粗體」**內容` | ❌ 星號原樣輸出 | ✅ |
| `這是**（括號）**內容` | ❌ | ✅ |
| `這是**粗體。**含句號` | ❌ | ✅ |
| `中文**粗體**中文` | ✅ | ✅ |
| `「粗體」**「緊接引號」**「後方」` | ✅ | ✅ |

成因：CommonMark 以「標點／空白／其他」三分法決定 delimiter run 的 flanking 性質。全形標點被歸入「標點」後，夾在中文之間、且內容以全形標點開頭或結尾的強調符會兩側都不成立，於是不產生 `<strong>`。

**這與空白問題性質不同 —— 它是渲染錯誤，不是不夠美**，因此判斷標準也不同：無論覆蓋率如何都該修。已安裝 `remark-cjk-friendly@2`（CommonMark 下一版草案的先行實作），設定於 `astro.config.mjs`，回歸案例永久保留在 `/style-guide/markdown`。

已知未修正：`__底線粗體__` 夾在中文之間仍然無效，那是 `_` 的 intraword 限制，屬另一條規則。本專案一律使用 `**`，不受影響。

## 參考來源

- [caniuse：`text-autospace: normal`](https://caniuse.com/mdn-css_properties_text-autospace_normal)
- [caniuse：`text-spacing-trim`](https://caniuse.com/mdn-css_properties_text-spacing-trim)
- [MDN：`text-autospace`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-autospace)
- [Bugzilla 1869577：Implement text-autospace](https://bugzilla.mozilla.org/show_bug.cgi?id=1869577)
- [W3C 中文排版需求（clreq）](https://www.w3.org/TR/clreq/)
- [pangu.js](https://github.com/vinta/pangu.js)、[remark-pangu](https://www.npmjs.com/package/remark-pangu)

## 相關

- [ADR 0002](0002-style-system-tokens-cjk.md)：本 ADR 結案其「後果」段落預留的支援度問題
