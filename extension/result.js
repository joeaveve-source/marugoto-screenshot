/**
 * まるごとスクショ ― 結果ページ
 *
 * 裏方から届いた「画面の断片」を、1枚の大きな絵につなぎ合わせて表示し、
 * 画像やPDFとして保存できるようにする。
 */

const MAX_DIM = 32000;             // 1辺の上限（これを超えると絵が作れない）
const MAX_AREA = 250 * 1000 * 1000; // 面積の上限
const A4_W = 595.276;              // ポイント
const A4_H = 841.89;

const el = {
  meta: document.getElementById('meta'),
  progressPanel: document.getElementById('progressPanel'),
  progressText: document.getElementById('progressText'),
  progressBar: document.getElementById('progressBar'),
  errorPanel: document.getElementById('errorPanel'),
  errorText: document.getElementById('errorText'),
  notice: document.getElementById('notice'),
  noticeText: document.getElementById('noticeText'),
  tools: document.getElementById('tools'),
  filename: document.getElementById('filename'),
  status: document.getElementById('status'),
  previewBox: document.getElementById('previewBox'),
  preview: document.getElementById('preview')
};

const shot = {
  meta: null,
  canvas: null,
  ctx: null,
  scale: 1,      // 撮影された絵の細かさ（実際の画素 ÷ 画面上の大きさ）
  out: 1,        // できあがりの倍率
  count: 0,
  done: 0
};

let chain = Promise.resolve();

const port = chrome.runtime.connect({ name: 'result' });

port.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'ERROR')  return showError(msg.message);
  if (msg.type === 'META')   return onMeta(msg);
  if (msg.type === 'TILE')   return onTile(msg);
  if (msg.type === 'DONE')   return chain = chain.then(finish);
});

port.onDisconnect.addListener(() => {
  if (!shot.meta) showError('撮影データを受け取れませんでした。もう一度お試しください。');
});

port.postMessage({ type: 'READY' });

/* ---------------- 受け取り ---------------- */

function onMeta(msg) {
  shot.meta = msg.meta;
  shot.count = msg.count;

  const m = msg.meta;
  el.meta.textContent = (m.title || '') + '  —  ' + (m.url || '');
  document.title = (m.title ? m.title + '｜' : '') + '撮影結果';
  el.filename.value = buildFileName(m);
  setProgress(0);
}

function onTile(msg) {
  chain = chain.then(async () => {
    const img = await createImageBitmap(dataUrlToBlob(msg.dataUrl));

    if (!shot.canvas) createCanvas(img);

    const f = shot.meta.frame;
    const s = shot.scale;
    const o = shot.out;

    // 貼り付け先は「端の位置」を先に丸めてから幅を出す。
    // こうすると、隣り合う断片のあいだに隙間も重なりも生まれない。
    const dx = Math.round(msg.x * o);
    const dy = Math.round(msg.y * o);
    const dw = Math.round((msg.x + f.width) * o) - dx;
    const dh = Math.round((msg.y + f.height) * o) - dy;

    shot.ctx.drawImage(
      img,
      Math.round(f.left * s), Math.round(f.top * s),
      Math.round(f.width * s), Math.round(f.height * s),
      dx, dy, dw, dh
    );
    img.close();

    shot.done++;
    setProgress(shot.done / Math.max(1, shot.count));
  }).catch((e) => showError('画像をつなぎ合わせる途中で止まりました。\n\n（詳細：' + (e.message || e) + '）'));

  chain.then(() => port.postMessage({ type: 'TILE_OK' }));
}

/** データURLを、そのまま画像として扱える形（Blob）に直す */
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const type = (head.match(/^data:([^;,]+)/) || [null, 'image/png'])[1];
  const bin = atob(dataUrl.slice(comma + 1));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}

function createCanvas(firstImage) {
  const m = shot.meta;
  // 撮れた絵の細かさを、1枚目の実物から割り出す（画面の拡大率にも自動で合う）
  shot.scale = firstImage.width / Math.max(1, m.viewport.width);

  const w = m.content.width;
  const h = m.content.height;
  let out = shot.scale;
  out = Math.min(out, MAX_DIM / w, MAX_DIM / h, Math.sqrt(MAX_AREA / (w * h)));
  out = Math.max(out, 0.05);
  shot.out = out;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * out));
  canvas.height = Math.max(1, Math.round(h * out));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  shot.canvas = canvas;
  shot.ctx = ctx;

  const notes = [];
  if (out < shot.scale - 0.001) {
    notes.push('ページがとても長いため、' + Math.round((out / shot.scale) * 100) + '％の大きさに縮めて保存します。');
  }
  if (m.truncated) {
    notes.push('ページが長すぎたため、途中までの撮影になりました。');
  }
  if (notes.length) {
    el.noticeText.textContent = notes.join('\n');
    el.notice.hidden = false;
  }
}

function setProgress(ratio) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  el.progressBar.style.width = pct + '%';
  el.progressText.textContent = '撮影した画像をつなぎ合わせています…（' + pct + '％）';
}

async function finish() {
  if (!shot.canvas) return showError('撮影された画像がありませんでした。');

  el.progressPanel.hidden = true;
  el.tools.hidden = false;

  const c = shot.canvas;
  el.meta.textContent += '　／　' + c.width + '×' + c.height + '画素';

  // 見本は小さく作り直して表示する（原寸のまま出すと重いため）
  const pv = document.createElement('canvas');
  const k = Math.min(1, 1000 / c.width, 4000 / c.height);
  pv.width = Math.max(1, Math.round(c.width * k));
  pv.height = Math.max(1, Math.round(c.height * k));
  const pctx = pv.getContext('2d');
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, pv.width, pv.height);
  pctx.drawImage(c, 0, 0, pv.width, pv.height);
  el.preview.src = pv.toDataURL('image/jpeg', 0.8);
  el.previewBox.hidden = false;

  // 自動保存も、ボタンと同じ二重実行の防止（guard）を通す
  const auto = shot.meta.settings || {};
  if (auto.autoSave) {
    await guard(auto.format === 'jpeg' ? saveJpeg : savePng);
  }
}

function showError(message) {
  el.progressPanel.hidden = true;
  el.errorText.textContent = message;
  el.errorPanel.hidden = false;
}

/* ---------------- 保存 ---------------- */

document.getElementById('savePng').addEventListener('click', () => guard(savePng));
document.getElementById('saveJpg').addEventListener('click', () => guard(saveJpeg));
document.getElementById('savePdfA4').addEventListener('click', () => guard(() => savePdf('a4')));
document.getElementById('savePdfLong').addEventListener('click', () => guard(() => savePdf('long')));
document.getElementById('copy').addEventListener('click', () => guard(copyToClipboard));
document.getElementById('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

let working = false;
async function guard(fn) {
  if (working) return;
  working = true;
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (e) {
    el.status.textContent = 'うまくいきませんでした。（' + (e.message || e) + '）';
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    working = false;
  }
}

async function savePng() {
  el.status.textContent = '画像を作っています…';
  const blob = await toBlob(shot.canvas, 'image/png');
  download(blob, name('.png'));
  el.status.textContent = '保存しました（' + size(blob) + '）。';
}

async function saveJpeg() {
  el.status.textContent = '画像を作っています…';
  const q = (shot.meta.settings && shot.meta.settings.jpegQuality) || 0.92;
  const blob = await toBlob(shot.canvas, 'image/jpeg', q);
  download(blob, name('.jpg'));
  el.status.textContent = '保存しました（' + size(blob) + '）。';
}

async function copyToClipboard() {
  el.status.textContent = 'コピーの用意をしています…';
  // 押した瞬間の操作として扱ってもらうため、画像は「あとで届く約束」の形で渡す
  const item = new ClipboardItem({ 'image/png': toBlob(shot.canvas, 'image/png') });
  await navigator.clipboard.write([item]);
  el.status.textContent = 'コピーしました。貼り付けてお使いください。';
}

async function savePdf(mode) {
  const c = shot.canvas;
  const q = (shot.meta.settings && shot.meta.settings.jpegQuality) || 0.92;

  if (mode === 'long') {
    const pageW = A4_W;
    const pageH = pageW * (c.height / c.width);
    if (pageH > 14400) {
      el.status.textContent = 'このページは長すぎて、1枚のPDFにできません（PDFの決まりで上限があります）。「用紙サイズに分ける」でお試しください。';
      return;
    }
    el.status.textContent = 'PDFを作っています…';
    const jpeg = new Uint8Array(await (await toBlob(c, 'image/jpeg', q)).arrayBuffer());
    const pdf = window.MarugotoPdf.build([{
      jpeg, pxW: c.width, pxH: c.height,
      pageW, pageH, drawX: 0, drawY: 0, drawW: pageW, drawH: pageH
    }]);
    download(pdf, name('.pdf'));
    el.status.textContent = 'PDFを保存しました（' + size(pdf) + '）。';
    return;
  }

  const sliceH = Math.round(c.width * (A4_H / A4_W));
  const pages = [];
  const slice = document.createElement('canvas');
  const sctx = slice.getContext('2d', { alpha: false });

  for (let y = 0; y < c.height; y += sliceH) {
    const h = Math.min(sliceH, c.height - y);
    el.status.textContent = 'PDFを作っています…（' + (pages.length + 1) + 'ページ目）';
    slice.width = c.width;
    slice.height = h;
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, slice.width, slice.height);
    sctx.drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);

    const jpeg = new Uint8Array(await (await toBlob(slice, 'image/jpeg', q)).arrayBuffer());
    const drawH = A4_W * (h / c.width);
    pages.push({
      jpeg, pxW: slice.width, pxH: slice.height,
      pageW: A4_W, pageH: A4_H,
      drawX: 0, drawY: A4_H - drawH, drawW: A4_W, drawH
    });
    await new Promise((r) => setTimeout(r, 0)); // 画面が固まらないよう、ひと呼吸おく
  }

  const pdf = window.MarugotoPdf.build(pages);
  download(pdf, name('.pdf'));
  el.status.textContent = pages.length + 'ページのPDFを保存しました（' + size(pdf) + '）。';
}

/* ---------------- 小道具 ---------------- */

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('画像が大きすぎて書き出せませんでした。設定で撮影の対象を分けてお試しください。'));
    }, type, quality);
  });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function name(ext) {
  // 空白だけの入力でも、必ず意味のあるファイル名に落ちるようにする
  const base = (el.filename.value || '').trim().replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.(png|jpe?g|pdf)$/i, '');
  return (base || 'screenshot') + ext;
}

function buildFileName(m) {
  let host = '';
  try { host = new URL(m.url).hostname.replace(/^www\./, ''); } catch (e) { host = 'page'; }
  const title = (m.title || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60);
  const d = new Date(m.capturedAt || Date.now());
  const p = (v) => String(v).padStart(2, '0');
  const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  return [host, title, stamp].filter(Boolean).join('_');
}

function size(blob) {
  const mb = blob.size / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + 'MB' : Math.round(blob.size / 1024) + 'KB';
}
