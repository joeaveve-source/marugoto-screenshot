# Privacy Policy — WholePage Shot

Last updated: 18 August 2026

## Short version

WholePage Shot does not collect, store, transmit or sell any user data.
Everything the extension does happens inside your own browser, on your own computer.

## What the extension does with your data

**Captured images.** When you click the toolbar icon, the extension takes pictures of the
visible area of that tab and joins them into one image. The image is held in your browser's
memory and is written to disk only when you press one of the save buttons, or copied to your
clipboard only when you press Copy. It is never uploaded anywhere.

**Your settings.** Three settings (scroll to the bottom before capturing, hide sticky menus,
and the wait between captures) are stored with `chrome.storage.sync`, which is Chrome's own
settings storage. If you are signed in to Chrome, Chrome may sync them across your own devices.
The developer has no access to this data.

**Browsing history.** The extension does not read, record or transmit your browsing history.
It has no host permissions, so it cannot see any page until you click the icon on that page.

## Network activity

The extension makes no network requests of any kind. It bundles no third-party libraries,
no analytics, no advertising and no crash reporting.

## Permissions

- `activeTab` — grants temporary access to the tab you are on, only at the moment you click the icon
- `scripting` — runs a small script in that tab to measure the page, scroll it, and hide sticky menus
- `storage` — remembers the three settings above

## Changes

If this policy ever changes, the new version will be published on this page and the date above
will be updated.

## Contact

Please open an issue at
https://github.com/joeaveve-source/marugoto-screenshot/issues

---

# プライバシーポリシー — まるごとスクショ

最終更新：2026年8月18日

## 要点

まるごとスクショは、利用者のデータを一切集めません。保存も送信も販売もしません。
処理はすべて、利用者自身のパソコンの中、ブラウザの中で完結します。

## データの扱い

**撮った画像**：アイコンを押すと、そのタブの見えている範囲を撮り、1枚につなぎ合わせます。
画像はブラウザの中に置かれるだけで、保存ボタンを押したときにパソコンへ書き出され、
コピーボタンを押したときにクリップボードへ渡されます。外部へ送られることはありません。

**設定**：3つの設定（撮る前に下までスクロールする／貼り付いたメニューを隠す／1枚ごとの待ち時間）を
Chrome自身の設定保存領域（`chrome.storage.sync`）に記録します。Chromeにログインしている場合、
Chromeが本人の端末間で同期することがあります。開発者はこのデータに触れられません。

**閲覧履歴**：読み取りも記録も送信もしません。ホスト権限を要求していないため、
アイコンを押すまで、どのページの中身も見ることができません。

## 通信

外部との通信は一切行いません。外部のライブラリ、アクセス解析、広告、エラー収集のいずれも含みません。

## 権限

- `activeTab` — アイコンを押したその瞬間だけ、そのタブへの一時的なアクセスを得る
- `scripting` — そのタブでページの高さを測り、スクロールし、貼り付いたメニューを隠す小さなスクリプトを動かす
- `storage` — 上の3つの設定を覚えておく

## 変更

内容を変更する場合は、このページに新しい版を掲載し、上の日付を更新します。

## 連絡先

https://github.com/joeaveve-source/marugoto-screenshot/issues にIssueを立ててください。
