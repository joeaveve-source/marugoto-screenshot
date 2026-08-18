/**
 * 画面の文言を、ブラウザの言語に合わせて差し替える。
 * HTML側に data-i18n="キー" と書いておくと、_locales の文章がそこへ入る。
 */
(function () {
  const t = (key) => chrome.i18n.getMessage(key);

  document.documentElement.lang = chrome.i18n.getUILanguage();

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const text = t(el.dataset.i18n);
    if (text) el.textContent = text;
  }
  for (const el of document.querySelectorAll('[data-i18n-alt]')) {
    const text = t(el.dataset.i18nAlt);
    if (text) el.alt = text;
  }
})();
