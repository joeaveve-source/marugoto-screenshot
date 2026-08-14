/** まるごとスクショ ― 設定画面 */

const DEFAULTS = {
  intervalMs: 450,
  settleMs: 250,
  preScroll: true,
  hideFixed: true,
  format: 'png',
  jpegQuality: 0.92,
  autoSave: false,
  maxTiles: 120
};

const $ = (id) => document.getElementById(id);

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  $('preScroll').checked = !!s.preScroll;
  $('hideFixed').checked = !!s.hideFixed;
  $('autoSave').checked = !!s.autoSave;
  $('intervalMs').value = s.intervalMs;
  $('settleMs').value = s.settleMs;
  $('format').value = s.format;
  $('jpegQuality').value = Math.round(s.jpegQuality * 100);
  $('maxTiles').value = s.maxTiles;
}

function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    preScroll: $('preScroll').checked,
    hideFixed: $('hideFixed').checked,
    autoSave: $('autoSave').checked,
    intervalMs: clamp($('intervalMs').value, 200, 3000, DEFAULTS.intervalMs),
    settleMs: clamp($('settleMs').value, 0, 2000, DEFAULTS.settleMs),
    format: $('format').value === 'jpeg' ? 'jpeg' : 'png',
    jpegQuality: clamp($('jpegQuality').value, 40, 100, 92) / 100,
    maxTiles: clamp($('maxTiles').value, 5, 400, DEFAULTS.maxTiles)
  });
  await load();
  $('status').textContent = '設定を保存しました。';
  setTimeout(() => ($('status').textContent = ''), 2500);
});

$('reset').addEventListener('click', async () => {
  await chrome.storage.sync.set(DEFAULTS);
  await load();
  $('status').textContent = '初期の状態に戻しました。';
  setTimeout(() => ($('status').textContent = ''), 2500);
});

load();
