/**
 * ease 實驗室（階段九，ADR 0005 L3 / ADR 0003）
 *
 * 這支檔案是 EaseLab.astro 那段載入器 `import()` 的目標，因此會被 Rollup
 * 切成獨立 chunk，沒有任何 HTML 引用它。gsap 在這裡是**靜態** import ——
 * 它會跟本檔切在同一支（或相鄰的）chunk，而那支 chunk 一樣沒有人在載入
 * 當下指向它，所以整體仍然是「按需才付」。
 *
 * 這點與 SiteSearch 相反：那邊的 Pagefind 必須是動態 import，因為要延到
 * 「讀者打開搜尋」那一刻，而不只是「元件升級」那一刻。這裡沒有那層區別——
 * 元件被載入的唯一理由就是它捲進了視窗，屆時 gsap 立刻就要用上。
 *
 * DOM 全部由 EaseLab.astro 在 build 期輸出，這裡**不建立任何節點**。
 * 那是階段六踩過的坑（createElement 出來的元素沒有 data-astro-cid-*，
 * 吃不到 Astro 的 scoped style，症狀是一堆沒樣式的裸元素）—— 這裡連
 * 踩的機會都不留。同理，slider 的顯示與隱藏交給 CSS 屬性選擇器，
 * 本檔只負責搬動 data-family。
 */
import { gsap } from "gsap";

import { sampleEase, viewBoxOf } from "../utils/ease-curve";
import { defaultParams, easeString, familyOf } from "../utils/ease-catalog";

/** 預覽動畫的長度。固定值 —— duration 不改變曲線形狀，見設計討論。 */
const DURATION = 1.2;

class EaseLab extends HTMLElement {
  #svg!: SVGSVGElement;
  #path!: SVGPathElement;
  #dot!: SVGCircleElement;
  #box!: HTMLElement;
  #track!: HTMLElement;
  #output!: HTMLOutputElement;
  #copy!: HTMLButtonElement;
  #hint!: HTMLElement;

  #familySelect!: HTMLSelectElement;
  #directions!: NodeListOf<HTMLInputElement>;
  #sliders!: NodeListOf<HTMLInputElement>;

  /** 目前播放中的預覽。改參數時要先殺掉，否則兩個 tween 會搶同一顆方塊。 */
  #tween: gsap.core.Tween | null = null;

  /**
   * 偏好減少動態時不自動重播。
   *
   * 刻意不是「關掉動畫」—— 這裡的動畫是內容本身而非裝飾，關掉等於刪掉
   * 教材。改成不自動觸發、由讀者按播放鈕決定，資訊一點都沒少：曲線圖
   * 隨參數即時更新，那才是這個元件真正在教的東西。
   */
  #reduced = matchMedia("(prefers-reduced-motion: reduce)");

  connectedCallback() {
    const q = <T extends Element>(role: string) =>
      this.querySelector<T>(`[data-role="${role}"]`)!;

    this.#svg = q<SVGSVGElement>("curve");
    this.#path = q<SVGPathElement>("path");
    this.#dot = q<SVGCircleElement>("dot");
    this.#box = q<HTMLElement>("box");
    this.#track = q<HTMLElement>("track");
    this.#output = q<HTMLOutputElement>("ease");
    this.#copy = q<HTMLButtonElement>("copy");
    this.#hint = q<HTMLElement>("hint");

    this.#familySelect = q<HTMLSelectElement>("family");
    this.#directions = this.querySelectorAll('input[name^="direction"]');
    this.#sliders = this.querySelectorAll('input[type="range"]');

    this.#familySelect.addEventListener("change", () => {
      // 換 family 時把參數重置回該族的預設值。不重置的話，把 back 的
      // overshoot 拉到 5 再切到 elastic，會拿到一個沒人選過的 amplitude=5。
      const params = defaultParams(this.#familySelect.value);
      for (const slider of this.#sliders) {
        const value = params[slider.name];
        if (value !== undefined) slider.value = String(value);
      }
      this.dataset.family = this.#familySelect.value;
      this.#update();
    });

    for (const input of this.#directions)
      input.addEventListener("change", () => this.#update());
    for (const slider of this.#sliders)
      slider.addEventListener("input", () => this.#update());

    q<HTMLButtonElement>("play").addEventListener("click", () => this.#play());

    this.#copy.addEventListener("click", () => void this.#copyEase());

    // 升級完成。CSS 用這個屬性把「靜態圖」切換成「可操作的面板」——
    // 例如讓播放鈕現形。沒有它的話，無 JS 的讀者會看到一顆按了沒事的鈕，
    // 那正是階段六在搜尋按鈕上學到的教訓。
    this.dataset.ready = "";

    this.#update();
  }

  disconnectedCallback() {
    this.#tween?.kill();
    this.#tween = null;
  }

  /** 目前所有 slider 的值。只讀屬於當前 family 的那幾支。 */
  #params(): Record<string, number> {
    const wanted = new Set(familyOf(this.dataset.family!).params.map((p) => p.key));
    const params: Record<string, number> = {};
    for (const slider of this.#sliders)
      if (wanted.has(slider.name)) params[slider.name] = Number(slider.value);
    return params;
  }

  #direction(): string {
    for (const input of this.#directions) if (input.checked) return input.value;
    return "out";
  }

  /**
   * 參數 → ease 字串 → 曲線 → 預覽。單向，一次跑完，沒有中間狀態。
   *
   * 沒有框架也沒有響應式系統：一個函式打三件事，與 <toc-highlight> 的
   * #update() 是同一個心智模型。這個元件的狀態小到「重算全部」永遠比
   * 「算出差異再更新」便宜。
   */
  #update() {
    const family = familyOf(this.dataset.family!);
    // textContent 而非建立節點 —— 見本檔頂部。說明文字必須跟著 family 換，
    // 否則讀者會看到 elastic 的曲線配著 back 的說明。
    this.#hint.textContent = family.hint;

    const ease = easeString(family.id, this.#direction(), this.#params());
    this.#output.value = ease;

    const samples = sampleEase(gsap.parseEase(ease));
    this.#path.setAttribute("d", samples.d);
    this.#svg.setAttribute("viewBox", viewBoxOf(samples));

    // 複製鈕的狀態屬於「上一次的動作」，參數一改就不再成立。
    this.#copy.dataset.copied = "";

    if (!this.#reduced.matches) this.#play();
    else this.#reset();
  }

  /** 把方塊與圓點放回起點。reduced-motion 下改參數時走這條。 */
  #reset() {
    this.#tween?.kill();
    this.#tween = null;
    this.#render(0);
  }

  /**
   * 播放一次預覽。
   *
   * 這裡用一條 `ease: "none"` 的 tween 推進度、再自己把進度餵給 ease
   * 函式，而不是直接 `gsap.to(box, { x, ease })`。兩者算出來的位置完全
   * 相同，但前者讓曲線上的圓點與方塊吃的是**同一次**求值 —— 兩條路徑
   * 各自演化的話，讀者看到的「曲線」與「動作」有機會對不上，而這個元件
   * 存在的唯一理由就是讓那兩件事是同一件事。
   *
   * 距離每次播放前重讀，因此視窗縮放後不需要另外處理。
   */
  #play() {
    this.#tween?.kill();

    const ease = gsap.parseEase(
      easeString(this.dataset.family!, this.#direction(), this.#params()),
    );
    const progress = { t: 0 };

    this.#tween = gsap.to(progress, {
      t: 1,
      duration: DURATION,
      ease: "none",
      onUpdate: () => this.#render(progress.t, ease),
    });
  }

  /** 把進度畫成兩個位置：曲線上的圓點，與軌道上的方塊。 */
  #render(t: number, ease?: (t: number) => number) {
    const v = ease ? ease(t) : 0;

    this.#dot.setAttribute("cx", t.toFixed(4));
    this.#dot.setAttribute("cy", v.toFixed(4));

    // 用 translate 而非 left：只觸發合成，與捲動進度條選 scaleX 同一個理由。
    const distance = this.#track.clientWidth - this.#box.offsetWidth;
    this.#box.style.transform = `translateX(${(v * distance).toFixed(2)}px)`;
  }

  /**
   * 把 ease 字串複製到剪貼簿。
   *
   * 這串才是讀者能從這個元件帶走的東西 —— 拖完 slider 得到的不是「感覺
   * 對了」，是一串可以貼進自己 gsap.to() 的 back.out(2.4)。
   *
   * 失敗（非安全來源、權限被拒）時把 <output> 選起來，讓讀者自己按 ⌘C。
   * 不跳任何錯誤訊息：這是次要功能，字串本來就明明白白顯示在旁邊。
   */
  async #copyEase() {
    try {
      await navigator.clipboard.writeText(this.#output.value);
      this.#copy.dataset.copied = "true";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(this.#output);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }
}

customElements.define("ease-lab", EaseLab);
