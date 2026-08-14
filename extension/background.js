/**
 * まるごとスクショ ― 裏方（サービスワーカー）
 *
 * やっていること：
 *  1. ツールバーのボタン（またはショートカット）が押されたら、開いているページに撮影用の
 *     スクリプトを差し込む
 *  2. 「少し下へスクロール → 見えている範囲を1枚撮る」を、ページの一番下まで繰り返す
 *  3. 撮った断片を結果ページ（result.html）へ送り、そちらで1枚につなぎ合わせる
 */

const DEFAULTS = {
  intervalMs: 450,        // 1枚撮るごとの待ち時間（短すぎるとChromeに断られる）
  settleMs: 250,          // スクロール後、描画が落ち着くまでの待ち時間
  preScroll: true,        // 撮る前に一度下まで流して、遅れて出る画像を読み込ませる
  hideFixed: true,        // 2枚目以降は追従ヘッダー・フッターを隠す
  format: 'png',          // 保存形式の初期値
  jpegQuality: 0.92,
  autoSave: false,        // 撮り終わったら自動で保存する
  maxTiles: 120           // 安全弁（これを超えたら打ち切る）
};

// 結果ページへ渡すための保管場所（撮影が終わってから結果タブを開く）
const pendingJobs = new Map(); // resultTabId -> job

async function getSettings() {
  const saved = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...saved };
}

chrome.action.onClicked.addListener((tab) => { run(tab); });

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-full-page') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) run(tab);
});

// 結果ページからの接続を受けて、撮った断片を1枚ずつ流す
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'result') return;
  const tabId = port.sender && port.sender.tab && port.sender.tab.id;
  const job = pendingJobs.get(tabId);
  if (!job) {
    port.postMessage({ type: 'ERROR', message: '撮影データが見つかりませんでした。もう一度お試しください。' });
    return;
  }
  pendingJobs.delete(tabId);
  streamJob(port, job);
});

const restricted = [
  /^chrome:\/\//i, /^edge:\/\//i, /^about:/i, /^devtools:\/\//i,
  /^view-source:/i, /^chrome-extension:\/\//i, /^https?:\/\/chromewebstore\.google\.com/i,
  /^https?:\/\/chrome\.google\.com\/webstore/i
];

let busy = false;

async function run(tab) {
  if (busy) return;
  if (!tab || !tab.id) return;

  busy = true;
  try {
    if (!tab.url || restricted.some((re) => re.test(tab.url))) {
      await openResult({
        error: 'このページは Chrome の決まりで撮影できません。\n' +
               '設定画面・拡張機能の管理画面・Chromeウェブストアなどが対象です。\n' +
               '通常のウェブサイトを開いた状態でお試しください。'
      }, tab);
      return;
    }

    const settings = await getSettings();
    await badge('…', '#1f6feb');

    // ページ側へ撮影用スクリプトを差し込む
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: false }, files: ['capture.js'] });
    } catch (e) {
      await openResult({
        error: 'このページに接続できませんでした。\n' +
               'ページを一度読み込み直してから、もう一度お試しください。\n\n（詳細：' + (e.message || e) + '）'
      }, tab);
      return;
    }

    const plan = await ask(tab.id, { type: 'PREPARE', opts: settings });
    if (plan.error) throw new Error(plan.error);

    const cols = Math.max(1, Math.ceil((plan.content.width - 1) / plan.frame.width));
    const rows = Math.max(1, Math.ceil((plan.content.height - 1) / plan.frame.height));
    const total = Math.min(cols * rows, settings.maxTiles);

    const tiles = [];
    let index = 0;
    let truncated = false;

    outer:
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (index >= settings.maxTiles) { truncated = true; break outer; }

        const want = { x: c * plan.frame.width, y: r * plan.frame.height };
        const at = await ask(tab.id, { type: 'SCROLL_TO', x: want.x, y: want.y });
        if (at.error) throw new Error(at.error);

        await sleep(settings.settleMs);
        const dataUrl = await captureWithRetry(tab);

        tiles.push({ dataUrl, x: at.x, y: at.y });
        index++;
        await badge(`${index}/${total}`, '#1f6feb');

        // 1枚目を撮り終えたら、追従ヘッダー・フッターを隠す（重複して写り込むため）
        if (index === 1 && settings.hideFixed) {
          await ask(tab.id, { type: 'HIDE_FIXED' });
        }
        if (index < total) await sleep(settings.intervalMs);
      }
    }

    await ask(tab.id, { type: 'CLEANUP' }).catch(() => {});
    await badge('', '#1f6feb');

    await openResult({
      meta: {
        title: plan.title,
        url: plan.url,
        scale: plan.scale,
        frame: plan.frame,
        content: plan.content,
        viewport: plan.viewport,
        capturedAt: new Date().toISOString(),
        truncated,
        settings: { format: settings.format, jpegQuality: settings.jpegQuality, autoSave: settings.autoSave }
      },
      tiles
    }, tab);

  } catch (e) {
    await ask(tab.id, { type: 'CLEANUP' }).catch(() => {});
    await badge('', '#d93025');
    await openResult({ error: '撮影の途中で止まりました。\n\n（詳細：' + (e.message || e) + '）' }, tab);
  } finally {
    busy = false;
  }
}

async function captureWithRetry(tab) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const active = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      if (!active[0] || active[0].id !== tab.id) {
        throw new Error('撮影中に別のタブへ切り替わりました。撮り終わるまで、そのタブを開いたままにしてください。');
      }
      return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    } catch (e) {
      lastError = e;
      const msg = String(e.message || e);
      if (/切り替わりました/.test(msg)) throw e;
      // 「1秒あたりの上限」に当たった場合は、少し待って撮り直す
      await sleep(700 + attempt * 500);
    }
  }
  throw new Error('画面の取り込みに失敗しました。（' + (lastError && lastError.message) + '）');
}

function ask(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(res || {});
    });
  });
}

async function openResult(job, sourceTab) {
  const created = await chrome.tabs.create({
    url: chrome.runtime.getURL('result.html'),
    active: true,
    index: sourceTab && typeof sourceTab.index === 'number' ? sourceTab.index + 1 : undefined
  });
  pendingJobs.set(created.id, job);
  // 5分たっても受け取りに来なければ、メモリを解放する
  setTimeout(() => pendingJobs.delete(created.id), 5 * 60 * 1000);
}

async function streamJob(port, job) {
  if (job.error) {
    port.postMessage({ type: 'ERROR', message: job.error });
    return;
  }

  port.postMessage({ type: 'META', meta: job.meta, count: job.tiles.length });

  let i = 0;
  const sendNext = () => {
    if (i >= job.tiles.length) {
      port.postMessage({ type: 'DONE' });
      job.tiles.length = 0;
      return;
    }
    const t = job.tiles[i];
    port.postMessage({ type: 'TILE', index: i, x: t.x, y: t.y, dataUrl: t.dataUrl });
    job.tiles[i] = { dataUrl: null, x: t.x, y: t.y }; // 送った分は手放す
    i++;
  };

  port.onMessage.addListener((msg) => {
    if (msg && msg.type === 'READY') sendNext();
    if (msg && msg.type === 'TILE_OK') sendNext();
  });
  port.onDisconnect.addListener(() => { job.tiles.length = 0; });
}

async function badge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
  } catch (e) { /* 表示できなくても撮影は続ける */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
