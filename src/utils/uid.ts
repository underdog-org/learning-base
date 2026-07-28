/**
 * build 期的實例編號。
 *
 * 用途是同一頁出現多個同類元件時，radio 的 name 與 label 的 for 必須各自
 * 獨立。計數器放在模組層級而非 .astro 的 frontmatter —— frontmatter 的
 * 程式碼被編譯進 component 的 render 函式裡，每次渲染都會重新執行，
 * 寫在那裡的 `let counter = 0` 會永遠回到 0，兩個實例於是拿到同一組 name
 * （症狀：點第二個面板的 radio 會把第一個的選擇清掉）。
 *
 * 不用 Math.random()：單次 build 內的渲染順序是決定性的，計數器因此每次
 * build 都產出相同的 HTML，不會在產物 diff 裡製造雜訊。
 */
const counters = new Map<string, number>();

export function nextUid(prefix: string): string {
  const n = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, n);
  return `${prefix}-${n}`;
}
