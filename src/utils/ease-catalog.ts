/**
 * GSAP 內建 ease 的詞彙表（階段九，ADR 0005 L3）
 *
 * 與 ease-curve.ts 分開的理由：那支是純數學（取樣、viewBox），這支是
 * 「GSAP 怎麼稱呼它的 ease」。前者換掉動畫函式庫也不用改，後者是 GSAP
 * 專屬的知識，兩者的變動理由不同。
 *
 * 同樣不 import gsap —— 這裡只產生**字串**，交給 gsap.parseEase() 去解析。
 * build 期與執行期各自呼叫 easeString()，因此讀者面板上顯示的那串、
 * 畫出來的曲線、以及預覽動畫實際吃的參數，三者是同一個來源。
 */

export interface EaseParam {
  /** 對應 <input type="range"> 的 name，也是 dataset 的 key。 */
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface EaseFamily {
  id: string;
  label: string;
  /** `none` 沒有方向之分 —— 直線的 in / out / inOut 是同一條線。 */
  directional: boolean;
  params: EaseParam[];
  /** 一句話說明它「像什麼」，顯示在面板上。 */
  hint: string;
}

export const DIRECTIONS = [
  { id: "in", label: "in", hint: "慢進快出" },
  { id: "out", label: "out", hint: "快進慢出" },
  { id: "inOut", label: "inOut", hint: "兩頭慢、中間快" },
] as const;

export const FAMILIES: EaseFamily[] = [
  {
    id: "power",
    label: "power",
    directional: true,
    hint: "最常用的一族。次方越高，加速越劇烈。",
    // 次方是名稱的一部分（power2.out），不是括號參數 —— 見 easeString()。
    params: [{ key: "power", label: "次方", min: 1, max: 4, step: 1, value: 2 }],
  },
  {
    id: "back",
    label: "back",
    directional: true,
    hint: "先往回拉一點再衝出去，值越大回拉越明顯。",
    params: [
      { key: "overshoot", label: "overshoot", min: 0, max: 5, step: 0.1, value: 1.7 },
    ],
  },
  {
    id: "elastic",
    label: "elastic",
    directional: true,
    hint: "橡皮筋般來回擺盪。amplitude 是幅度，period 是擺盪的疏密。",
    params: [
      { key: "amplitude", label: "amplitude", min: 0.1, max: 3, step: 0.1, value: 1 },
      { key: "period", label: "period", min: 0.05, max: 1, step: 0.05, value: 0.3 },
    ],
  },
  {
    id: "bounce",
    label: "bounce",
    directional: true,
    hint: "落地彈跳，不會超過終點。",
    params: [],
  },
  {
    id: "sine",
    label: "sine",
    directional: true,
    hint: "最輕微的一族，幾乎察覺不到卻明顯比 none 自然。",
    params: [],
  },
  {
    id: "expo",
    label: "expo",
    directional: true,
    hint: "比 power4 更極端的加速。",
    params: [],
  },
  {
    id: "circ",
    label: "circ",
    directional: true,
    hint: "四分之一圓弧，尾端收得很急。",
    params: [],
  },
  {
    id: "none",
    label: "none",
    directional: false,
    hint: "等速。放在這裡是為了對照 —— 它是唯一看起來像機器的選項。",
    params: [],
  },
];

export const familyOf = (id: string): EaseFamily =>
  FAMILIES.find((f) => f.id === id) ?? FAMILIES[0];

/**
 * 組出 gsap 認得的 ease 字串。
 *
 * 三種形態，差別不是為了整齊而存在的，是 GSAP 本來就這樣命名：
 *
 *   power2.out              次方寫進名稱，沒有括號
 *   back.out(1.7)           括號帶一個參數
 *   elastic.out(1, 0.3)     括號帶兩個參數
 *   none                    沒有方向
 *
 * 這串會原樣顯示給讀者複製，所以格式必須是能直接貼進 gsap.to() 的形式 ——
 * 包含 elastic 那個逗號後的空格（GSAP 兩種都吃，但貼進程式碼時有空格才順眼）。
 */
export function easeString(
  familyId: string,
  direction: string,
  params: Record<string, number>,
): string {
  const family = familyOf(familyId);
  if (!family.directional) return family.id;

  const name =
    family.id === "power"
      ? `power${params.power ?? 2}`
      : family.id;

  const args =
    family.id === "power"
      ? []
      : family.params.map((p) => params[p.key] ?? p.value);

  const call = args.length > 0 ? `(${args.join(", ")})` : "";
  return `${name}.${direction}${call}`;
}

/** 各 family 的預設參數值，供初始渲染與切換 family 時重置使用。 */
export const defaultParams = (familyId: string): Record<string, number> =>
  Object.fromEntries(familyOf(familyId).params.map((p) => [p.key, p.value]));
