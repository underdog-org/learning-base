/**
 * TOC 章節高亮（階段八，ADR 0003 / 0008）
 *
 * 這支檔案刻意不放在 src/components/ 底下的 <script> 裡，而是獨立成模組 ——
 * 它是 DocToc.astro 那段載入器 `import()` 的目標，因此會被 Rollup 切成獨立
 * chunk，沒有任何 HTML 會引用它。這正是「按需才付」的實作方式：
 *
 *   - 本專案沒有任何 UI framework renderer，因此 client:idle / client:visible
 *     一律不可用（Astro 的 client:* 只作用於 framework 元件）。延後載入靠的是
 *     hoisted 載入器 + 執行期 import()，與 SiteSearch 拉起 Pagefind 是同一招。
 *   - 判斷「該不該載入」的條件寫在 DocToc.astro，不在這裡：這支檔案被載入時
 *     就代表條件已成立，它不需要知道自己為什麼被載入。
 *
 * 功能上是純增強。沒有 JS 時 TOC 是一份完全可用的錨點清單，
 * 這裡只是把「你現在在哪一節」這個資訊加上去 —— 不改變版面、不承載內容。
 */

/**
 * 判定線的位置：視窗頂端往下 15%。
 *
 * 用比例而非 header 的實際高度，是為了不與任何 token 或元件耦合 ——
 * sticky header 約 3.5rem，在任何合理的視窗高度下都遠在 15% 之上，
 * 因此這條線永遠落在 header 底下、且大致就是讀者視線所在的位置。
 */
const LINE_RATIO = 0.15;

class TocHighlight extends HTMLElement {
  /** 標題與對應的 TOC 連結，維持文件順序（TOC 的順序即標題順序）。 */
  #sections: { heading: Element; link: HTMLAnchorElement }[] = [];

  #current: HTMLAnchorElement | null = null;
  #observer: IntersectionObserver | null = null;

  connectedCallback() {
    for (const link of this.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      // 用 link.hash 而非 getAttribute("href")：中文 slug 在 .hash 取得的是
      // percent-encoded 形式，decode 之後才對得上 id 屬性的原始值。
      const heading = document.getElementById(
        decodeURIComponent(link.hash.slice(1)),
      );
      if (heading) this.#sections.push({ heading, link });
    }

    if (this.#sections.length === 0) return;

    // IO 在這裡只是「有標題越線了，該重算」的觸發器，不是判定依據 ——
    // 理由見 #update()。rootMargin 把 root 的上緣往下推到判定線的位置，
    // 於是每次有標題越過那條線就會收到一次 callback。
    this.#observer = new IntersectionObserver(() => this.#update(), {
      rootMargin: `-${LINE_RATIO * 100}% 0px 0px 0px`,
    });
    for (const { heading } of this.#sections) this.#observer.observe(heading);

    // 頁尾補償，見 #update() 的 atBottom。
    //
    // scrollend 而非 scroll：一次捲動手勢只發一次，不是每一帧。這是全站唯一
    // 與捲動有關的 JS，成本必須是常數級 —— 捲動進度條之所以走純 CSS
    // （animation-timeline，跑在合成器執行緒）就是同一個理由。
    // 舊版 Safari 沒有 scrollend，那裡就只是少了頁尾補償，其餘照常運作。
    window.addEventListener("scrollend", () => this.#update(), {
      passive: true,
    });
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
  }

  /**
   * 當前章節 = 文件順序上「最後一個已越過判定線」的標題。
   *
   * 這條規則同時處理掉 scroll spy 的三個邊界情況，而且用的是同一句話：
   *
   *   1. 長章節捲到中途 —— 畫面上沒有任何標題，但最後越線者不變，高亮不動。
   *      （若改用「落在某條細帶內的標題才算當前」，這裡會失去高亮。）
   *   2. 頁尾 —— 最後一個標題越線後就停在那，不需要另外偵測是否捲到底。
   *   3. 點 TOC 連結或帶錨點的深連結進來 —— 跳到的標題停在線的上方，
   *      正好就是「最後一個越線者」。細帶做法在這裡會出錯：標題落在帶的
   *      上方而非帶內，高亮不會更新。
   *
   * 深連結落地時的初始狀態不需要另外處理：IntersectionObserver 在 observe()
   * 之後會立刻發一次 callback，這裡因此會在第一次繪製前就算出正確的高亮。
   *
   * **判定一律用即時的 getBoundingClientRect，不用 entry.boundingClientRect。**
   * 這是實作時踩到的坑，而且是靜默的：entry 裡的 rect 是「越線那一瞬間」的
   * 取樣，此時 rect.top 與 rootBounds.top 幾乎相等（實測都是 107），子像素
   * 差決定 `<` 成立與否 —— 一旦那一次記成「還沒越線」，之後不會再有 callback
   * 來糾正它，因為狀態已經不再變化。症狀是高亮永久落後一節，而且只在某些
   * 捲動速度下發生。用越線瞬間的取樣去問「它在線的哪一側」，問的正是那個
   * 瞬間最模糊的問題；改成收到通知後重讀所有標題的位置，問題就消失了。
   *
   * 代價是每次 callback 讀 N 次 rect（N = 標題數，約 5–15）。callback 只在
   * 有標題越線時發生、不是每一帧，而 IO callback 執行時版面已經算好，
   * 這些讀取不會觸發額外的 reflow。
   */
  #update() {
    const line = window.innerHeight * LINE_RATIO;

    let active: HTMLAnchorElement | null = null;
    for (const { heading, link } of this.#sections) {
      if (heading.getBoundingClientRect().top <= line) active = link;
    }

    // 頁尾補償：最後一節的標題不一定捲得到判定線。它到文件底部的距離若小於
    // 「視窗高度 − 判定線」，那個標題就永遠停在線下方 —— 而那是每一篇文章
    // 都會發生的情況（實測：最後一節連 PrevNext 只有 577px，差 79px 到不了），
    // 症狀是讀者讀完最後一節，TOC 卻還指著倒數第二節。
    const atBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 2;
    if (atBottom) active = this.#sections.at(-1)!.link;

    this.#activate(active);
  }

  /**
   * 搬動 aria-current。
   *
   * 用 "location" 而非 "page"：後者已被 sidebar 用來表示「當前頁面」，
   * 而這裡表示的是「頁面內的當前位置」—— 那正是 location 的語意。
   *
   * JS 只負責這一個屬性。h3 活躍時父層 h2 的淡標由 CSS 的 :has() 自己看出來，
   * 不需要在這裡維護一組父子關係。
   */
  #activate(link: HTMLAnchorElement | null) {
    if (link === this.#current) return;
    this.#current?.removeAttribute("aria-current");
    link?.setAttribute("aria-current", "location");
    this.#current = link;
  }
}

customElements.define("toc-highlight", TocHighlight);
