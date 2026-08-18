/**
 * WholePage Shot（まるごとスクショ）― ページ側の担当
 *
 * 裏方（background.js）からの指示を受けて、ページを少しずつスクロールする役。
 * 画面を撮る操作そのものはできないので、位置を合わせて「今です」と返すだけ。
 */

(() => {
  if (window.__wholePageShotReady) return;
  window.__wholePageShotReady = true;

  const t = (key) => chrome.i18n.getMessage(key);

  const state = {
    scroller: null,      // スクロールを担当する要素
    isWindow: true,
    frame: null,
    styleEl: null,
    hidden: [],          // 隠した追従要素と、元の指定
    origin: { x: 0, y: 0 }
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handle(msg)
      .then((res) => sendResponse(res || {}))
      .catch((e) => sendResponse({ error: String((e && e.message) || e) }));
    return true; // 非同期で返す
  });

  async function handle(msg) {
    switch (msg && msg.type) {
      case 'PREPARE':    return prepare(msg.opts || {});
      case 'SCROLL_TO':  return scrollTo(msg.x, msg.y);
      case 'HIDE_FIXED': return hideFixed(msg.part);
      case 'CLEANUP':    return cleanup();
      default:           return { error: t('errUnknownCmd') };
    }
  }

  /* ---------------- 下ごしらえ ---------------- */

  async function prepare(opts) {
    if (!document.body) return { error: t('errBodyMissing') };

    cleanup(); // 前回のやり残しがあれば戻す

    // なめらかスクロールを一時的に切る（撮影位置がずれるため）
    const st = document.createElement('style');
    st.setAttribute('data-marugoto', '1');
    st.textContent = 'html,body,*{scroll-behavior:auto !important}';
    document.documentElement.appendChild(st);
    state.styleEl = st;

    const picked = pickScroller();
    state.scroller = picked.el;
    state.isWindow = picked.isWindow;
    state.origin = readScroll();

    // 遅れて出てくる画像やアニメーションを、先に一度読み込ませる
    if (opts.preScroll !== false) {
      await preloadPass();
    }

    await setScroll(0, 0);
    await settle(2);

    const frame = measureFrame();
    const content = measureContent();
    state.frame = frame;

    if (frame.width < 8 || frame.height < 8) {
      return { error: t('errNoArea') };
    }

    return {
      frame,
      content: {
        width: Math.max(content.width, frame.width),
        height: Math.max(content.height, frame.height)
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scale: window.devicePixelRatio || 1,
      title: document.title || location.hostname,
      url: location.href
    };
  }

  function pickScroller() {
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight - se.clientHeight > 4) return { el: se, isWindow: true };

    // ページ本体ではなく、中の枠だけがスクロールする作りのサイトに備える
    let best = null;
    let bestDelta = 0;
    const all = document.querySelectorAll('body *');
    const limit = Math.min(all.length, 4000);
    for (let i = 0; i < limit; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      if (!/(auto|scroll|overlay)/.test(cs.overflowY)) continue;
      const delta = el.scrollHeight - el.clientHeight;
      if (delta <= bestDelta) continue;
      const r = el.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.5 || r.height < window.innerHeight * 0.5) continue;
      best = el;
      bestDelta = delta;
    }
    return best ? { el: best, isWindow: false } : { el: se, isWindow: true };
  }

  function measureFrame() {
    if (state.isWindow) {
      const de = document.documentElement;
      return {
        left: 0,
        top: 0,
        width: Math.min(de.clientWidth, window.innerWidth),
        height: Math.min(de.clientHeight, window.innerHeight)
      };
    }
    const el = state.scroller;
    const r = el.getBoundingClientRect();
    const left = Math.max(0, Math.round(r.left));
    const top = Math.max(0, Math.round(r.top));
    return {
      left,
      top,
      width: Math.max(1, Math.min(Math.round(el.clientWidth), window.innerWidth - left)),
      height: Math.max(1, Math.min(Math.round(el.clientHeight), window.innerHeight - top))
    };
  }

  function measureContent() {
    if (state.isWindow) {
      const de = document.documentElement;
      const b = document.body;
      return {
        width: Math.max(de.scrollWidth, de.offsetWidth, b.scrollWidth, b.offsetWidth, de.clientWidth),
        height: Math.max(de.scrollHeight, de.offsetHeight, b.scrollHeight, b.offsetHeight, de.clientHeight)
      };
    }
    return { width: state.scroller.scrollWidth, height: state.scroller.scrollHeight };
  }

  /** 一度ざっと下まで流して、遅れて出る画像・アニメーションを起こしておく */
  async function preloadPass() {
    const frame = measureFrame();
    const step = Math.max(200, Math.round(frame.height * 0.9));
    let y = 0;
    let guard = 0;
    while (guard < 80) {
      const height = measureContent().height;
      if (y >= height) break;
      await setScroll(0, y);
      await wait(90);
      y += step;
      guard++;
    }
    await setScroll(0, 0);
    await wait(350);
    // 読み込みきれていない画像を、もうひと押しだけ待つ
    const pending = Array.from(document.images).filter((img) => !img.complete).slice(0, 40);
    if (pending.length) {
      await Promise.race([
        Promise.all(pending.map((img) => new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        }))),
        wait(1500)
      ]);
    }
  }

  /* ---------------- 移動 ---------------- */

  async function scrollTo(x, y) {
    await setScroll(x, y);
    await settle(2);
    const at = readScroll();
    return { x: at.x, y: at.y };
  }

  function readScroll() {
    if (state.isWindow) {
      const se = document.scrollingElement || document.documentElement;
      return { x: Math.round(se.scrollLeft), y: Math.round(se.scrollTop) };
    }
    return { x: Math.round(state.scroller.scrollLeft), y: Math.round(state.scroller.scrollTop) };
  }

  async function setScroll(x, y) {
    if (state.isWindow) {
      window.scrollTo({ left: x, top: y, behavior: 'auto' });
      const se = document.scrollingElement || document.documentElement;
      se.scrollLeft = x;
      se.scrollTop = y;
    } else {
      state.scroller.scrollLeft = x;
      state.scroller.scrollTop = y;
    }
    await settle(1);
  }

  /* ---------------- 追従ヘッダー・フッターを隠す ---------------- */

  function hideFixed(part) {
    // part='bottom' … 画面の下半分に貼り付いているもの（フッター等）だけ隠す。
    //                 1枚目の前に呼ぶ。ページ上部のヘッダーは1枚目では見せたい一方、
    //                 下の追従バーは1枚目に写ると絵の途中に残ってしまうため
    // part省略      … 残りすべて（2枚目以降用）
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const all = document.querySelectorAll('body *');
    const limit = Math.min(all.length, 6000);
    let count = 0;

    for (let i = 0; i < limit; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;

      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;

      // 画面いっぱいの敷物（背景の層など）は、消すと絵が壊れるので残す
      if (r.width >= vw * 0.85 && r.height >= vh * 0.85) continue;

      if (part === 'bottom' && r.top < vh * 0.5) continue;

      state.hidden.push({ el, value: el.style.getPropertyValue('visibility'), priority: el.style.getPropertyPriority('visibility') });
      el.style.setProperty('visibility', 'hidden', 'important');
      count++;
    }
    return { hidden: count };
  }

  function restoreFixed() {
    for (const item of state.hidden) {
      try {
        if (item.value) item.el.style.setProperty('visibility', item.value, item.priority);
        else item.el.style.removeProperty('visibility');
      } catch (e) { /* 要素が消えていた場合は何もしない */ }
    }
    state.hidden = [];
  }

  /* ---------------- 後片づけ ---------------- */

  function cleanup() {
    restoreFixed();
    document.querySelectorAll('style[data-marugoto]').forEach((el) => el.remove());
    state.styleEl = null;
    try {
      if (state.scroller) {
        if (state.isWindow) window.scrollTo(state.origin.x, state.origin.y);
        else { state.scroller.scrollLeft = state.origin.x; state.scroller.scrollTop = state.origin.y; }
      }
    } catch (e) { /* 戻せなくても支障はない */ }
    return { ok: true };
  }

  /* ---------------- 小道具 ---------------- */

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function settle(frames) {
    // 描画の区切りを待つ。ただしタブが裏に回ると描画が止まるので、
    // 時間切れの保険を置いて、どんな状態でも必ず戻れるようにする
    return new Promise((resolve) => {
      let left = Math.max(1, frames);
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const tick = () => { left--; left <= 0 ? finish() : requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      setTimeout(finish, 100 * Math.max(1, frames) + 150);
    });
  }
})();
