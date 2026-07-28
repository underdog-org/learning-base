# ADR 0005：Playground 分為 L1–L4 四級，不以單一方案通吃

- 狀態：已接受
- 日期：2026-07-27

## 脈絡

知識庫涵蓋 TypeScript、GSAP、AI/ML 等性質差異極大的主題。「互動程式碼」在這些主題下的意義並不相同：

- TypeScript 需要的是型別提示與編譯錯誤
- GSAP 需要的是即時看到動畫參數的視覺變化
- AI/ML 的程式碼根本無法在瀏覽器執行（需 GPU / Python 環境）

若用單一 Playground 方案通吃，結果會是「對每個主題都勉強可用，對每個主題都不好用」，且付出最重方案的效能代價。

## 決策

按互動需求分為四級，各級採用不同技術，**依內容實際需要選用最低的一級**。

### L1 —— 唯讀程式碼（絕大多數內容）

- **Shiki**（Astro 內建，無需安裝）+ **`astro-expressive-code`**
- Expressive Code 包在 Shiki 外層，提供 diff 標記、行高亮、檔名框、複製鈕
- **client JS 僅複製鈕，約 2.5KB，全站共用一支**（階段五實測後修正）
- 這一級應涵蓋全站 80% 以上的程式碼區塊

> **修正紀錄（2026-07-28，階段五實作）**：本節原寫「零 client JS」，不正確。
> 複製鈕需要 clipboard 操作，必然有 client JS —— EC 為此送出一支 2523 B 的
> module，被所有含程式碼區塊的頁面共用。這是全站第一筆 client JS。
>
> 保留複製鈕而非關閉它（`frames.showCopyToClipboardButton: false` 可退回真正的零 JS），
> 理由是 2.5KB 換一個讀者高頻使用的功能，代價與收益不成比例地划算，且它由
> [ADR 0008](0008-performance-budget-gate.md) 的閘門持續監看 —— 共用 JS 上限
> 8192 B 未因此調高，仍有 5669 B 餘裕。
>
> 真正的成本不在 JS 而在 CSS：EC 自帶 17674 B 樣式表，使 CSS 紅線由
> 20480 調高至 36864。詳見 `perf-budget.config.json`。

### L2 —— 可編輯 + 即時執行

- **`@codesandbox/sandpack-client`**（framework-agnostic bundler 通訊層）+ **CodeMirror 6**
- API 形態：`loadSandpackClient(iframe, content, options)` → `client.updateSandbox({ files })` 熱更新
- 該套件**完全不管 editor 是什麼**，將 CodeMirror 的 `onChange` 接到 `updateSandbox` 即可，glue code 約 80–100 行
- 適用：vanilla JS/TS、GSAP 完整範例

### L3 —— 控制變數面板（GSAP 主力）

**關鍵判斷：GSAP 教學不需要 code editor，需要的是控制變數面板。**

- timeline scrubber + `ease` / `duration` / `stagger` 的 slider，即改即看
- 讓讀者打字修改 `duration: 0.5` 的學習效率，遠低於拖動 slider 觀察曲線變化
- 實作：Web Component + `<input type="range">` + GSAP，無需 bundler

### L4 —— 視覺化（AI/ML）

- 程式碼無法在瀏覽器執行，因此**做視覺化而非執行**：梯度下降動畫、attention heatmap、latent space 散點圖
- 此處可複用 GSAP 與 Canvas 能力
- 若確有執行需求，再評估 Pyodide 跑輕量 numpy demo

## 鐵則

> **所有 L2 以上的元件一律是 Astro island，禁用 `client:load`，永遠不進 global bundle。**
> 預設 `client:visible`；不改變版面、不承載內容的輕量增強元件可用 `client:idle`
> （措辭修訂的理由見 [ADR 0003](0003-no-ui-framework.md)）。

一篇 MDX 可混入十個 demo，讀者只載入實際滾動到的那幾個。這是選擇自建 Astro（[ADR 0001](0001-self-built-astro-docs.md)）的最大兌現點。

## 後果

- 需維護四套元件而非一套，但各自複雜度都低於一個通用方案。
- L2 需自行撰寫 editor ↔ bundler glue、檔案分頁、錯誤顯示、loading 狀態（見 [ADR 0003](0003-no-ui-framework.md)）。
- 內容作者需判斷每段程式碼該用哪一級 —— 預設 L1，有明確理由才升級。

## 建置順序上的刻意安排

**判準是「依 island 複雜度遞增地驗證邊界」，不是各級的編號順序。** 實作順序為：

1. **一個最小 island 先行** —— `<toc-highlight>` scroll spy，約 30 行，`client:idle`。
   [ADR 0008](0008-performance-budget-gate.md) 的閘門有一條性質「按需載入的元件不計入
   單頁初始 JS」從未被真實案例驗證過（基準線建立在零 island 的乾淨產物上，無從構造案例）。
   用 30 行程式碼驗這件事，撞線時歸因是明確的；用 L2 驗，撞線時分不出是 island 邊界壞了、
   還是那個套件本來就大
2. **L3 先於 L2** —— L3 技術上簡單得多，但對 GSAP 這類內容的教學價值更高
3. **L2 最後** —— 唯一需要 200KB 級 chunk 的一級，放在邊界與閘門語意都已驗證之後

> **修訂紀錄（2026-07-28）**：原文只有現在的第 2 點，理由寫的是「可先驗證 island
> 邊界設計是否成立，再去碰複雜的 bundler 整合」。那條理由貫徹到底的結論並不是 L3 ——
> L3 要裝 `gsap`、要寫 timeline scrubber 與 ease 曲線視覺化，它不是最便宜的驗證載體。
> 第 1 點是把同一條理由推到底，不是新的判斷。
>
> 同時修正一處自相矛盾：`docs/roadmap/todo.md` 曾把 L2 編為階段七、L3 編為階段八，
> 而階段八的內文寫著「刻意排在 L2 之前」—— 編號與內文互相否定。已依本節重排。

## 已評估的替代方案

| 方案 | 否決理由 |
|---|---|
| `@codesandbox/sandpack-react` | 內建完整 UI 與 CodeMirror，最快出貨，但強制引入 React，違反 [ADR 0003](0003-no-ui-framework.md) |
| **WebContainers**（StackBlitz） | 能力最強（瀏覽器內跑完整 Node、`npm install`、`vite dev`），但需 `SharedArrayBuffer` → 全站須掛 COOP/COEP header，會連帶影響第三方 embed 與跨網域圖片。若日後確有需求，僅在少數頁面以 iframe 隔離引入 |
| 統一用 L2 涵蓋所有情境 | GSAP 的教學效率會下降，AI/ML 根本無法執行，且所有頁面付出 bundler 的載入代價 |
| 嵌入外部 CodeSandbox / StackBlitz iframe | 零維護成本，但樣式無法統一、載入慢、離線不可用、且無法與自有 token 體系整合 |

## 相關

- [ADR 0006](0006-editor-codemirror.md)：L2 的 editor 選型
- [ADR 0008](0008-performance-budget-gate.md)：確保分層策略不被逐步侵蝕
