/** 設定画面 */

const DEFAULTS = {
  intervalMs: 450,   // 1枚撮るごとの待ち時間（短すぎるとChromeに断られる）
  preScroll: true,   // 撮る前に一度下まで流して、遅れて出る画像を読み込ませる
  hideFixed: true    // 2枚目以降は追従ヘッダー・フッターを隠す
};

const $ = (id) => document.getElementById(id);
const t = (key) => chrome.i18n.getMessage(key);

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  $('preScroll').checked = !!s.preScroll;
  $('hideFixed').checked = !!s.hideFixed;
  $('intervalMs').value = s.intervalMs;
}

function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function flash(key) {
  $('status').textContent = t(key);
  setTimeout(() => ($('status').textContent = ''), 2500);
}

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    preScroll: $('preScroll').checked,
    hideFixed: $('hideFixed').checked,
    intervalMs: clamp($('intervalMs').value, 200, 3000, DEFAULTS.intervalMs)
  });
  await load();
  flash('statusOptSaved');
});

$('reset').addEventListener('click', async () => {
  await chrome.storage.sync.set(DEFAULTS);
  await load();
  flash('statusOptReset');
});

load();
