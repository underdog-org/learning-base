/**
 * ease 曲線取樣（階段九，ADR 0005 L3）
 *
 * 這裡刻意「不」import gsap —— 它只接一個 `(t: number) => number`。
 *
 * 理由是這支檔案有兩個呼叫端，而它們拿到 ease 函式的方式不同：
 *
 *   - build 期：EaseLab.astro 的 frontmatter，用 gsap.parseEase() 求值後
 *     把靜態曲線寫進 HTML。frontmatter 的 import 不進 client bundle。
 *   - 執行期：src/scripts/ease-lab.ts，讀者拖 slider 後重算。
 *
 * 兩邊餵進來的是同一個 gsap.parseEase(…)，因此畫出來必然是同一條線 ——
 * 靜態圖與動畫不可能對不上。若這裡自己 import gsap，build 期那條路徑就會
 * 把 gsap 拉進一個不需要它的模組圖，而「兩邊同源」這個性質反而沒有變強。
 *
 * 純函式、build 期可獨立測試、元件不參與計算 —— 與 utils/nav.ts、
 * utils/toc.ts 是同一個慣例。
 */

/** 取樣結果。y 的值域**不保證**落在 [0, 1] —— 見 EaseSamples.min / max。 */
export interface EaseSamples {
  /** SVG path 的 d 屬性，x ∈ [0, 1]，y 為 ease 的原始輸出（未翻轉）。 */
  d: string;
  /** 取樣到的最小值。back / elastic 會低於 0（回拉）。 */
  min: number;
  /** 取樣到的最大值。back / elastic 會高於 1（overshoot）。 */
  max: number;
}

const SAMPLES = 64;

/**
 * 把一個 ease 函式取樣成 SVG path。
 *
 * 座標系刻意維持數學慣例（x 向右為時間，y 向上為進度，原點在左下），
 * 由呼叫端用 SVG 的 transform 或 viewBox 翻轉 —— 在這裡先翻轉的話，
 * min / max 的語意就會跟 `ease(t)` 的輸出相反，讀的人得在腦中翻回來。
 *
 * **min / max 必須回傳，不能讓呼叫端假設值域是 [0, 1]。**
 * `back.out(3)` 會衝到 1.25、`elastic` 會來回穿越 —— 把 viewBox 寫死成
 * 0–1 的話，那段 overshoot 會被裁掉，而那正是這兩個 ease 唯一值得看的
 * 部分。這是實測 gsap.parseEase("back.out(3)") 得到 1.25 後補上的。
 */
export function sampleEase(
  ease: (t: number) => number,
  samples: number = SAMPLES,
): EaseSamples {
  let min = Infinity;
  let max = -Infinity;
  const points: string[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const v = ease(t);
    if (v < min) min = v;
    if (v > max) max = v;
    // 3 位小數在任何合理的顯示尺寸下都在次像素以內，再多只是讓 HTML 變大。
    points.push(`${t.toFixed(3)},${v.toFixed(3)}`);
  }

  return { d: `M${points.join("L")}`, min, max };
}

/**
 * 由取樣結果算出 SVG 的 viewBox，並把 y 軸翻成螢幕方向（向下為正）。
 *
 * 回傳的 viewBox 直接對應「未經 transform 的數學座標再乘上 -1」，因此
 * 呼叫端只要在 path 外面包一層 `scale(1, -1)` 就對齊了。padding 以曲線的
 * 實際值域為基準而非固定值 —— elastic 的振幅比 power 大得多，固定 padding
 * 會讓前者貼邊、後者浮在中間。
 */
export function viewBoxOf({ min, max }: EaseSamples, padding = 0.08): string {
  const lo = Math.min(0, min) - padding;
  const hi = Math.max(1, max) + padding;
  // y 軸翻轉後，上緣是 -hi、下緣是 -lo。
  return `${-padding} ${-hi} ${1 + padding * 2} ${hi - lo}`;
}
