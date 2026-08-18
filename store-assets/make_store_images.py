# -*- coding: utf-8 -*-
"""Chromeウェブストアに出す画像を作るスクリプト

作るもの：
  promo_440x280.png    小さい宣伝画像（掲載ページの一覧に出る）
  marquee_1400x560.png 大きい宣伝画像（特集に載るときに使われる）

Chromeウェブストアの案内では、宣伝画像は「文字を入れず、色をはっきりさせ、
商品の雰囲気そのものを伝える」ことが勧められている。そのため文字は載せず、
アイコンと同じ配色で「縦に長いページ」を見せるだけにしている。

スクリーンショット（1280×800）は、実際に撮った画面を fit_screenshot() に
通して作る。撮った画面そのものでなければならないため、絵を描いてはいけない。

使い方:  python make_store_images.py
"""

import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))

BLUE      = (31, 111, 235)
BLUE_DEEP = (21, 82, 180)
WHITE     = (255, 255, 255)
SS = 3   # 拡大して描いてから縮める（輪郭のギザギザを消すため）


def gradient(size, top, bottom):
    """上から下へ、色がなめらかに変わる下地を作る"""
    w, h = size
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        k = y / max(1, h - 1)
        d.line([(0, y), (w, y)],
               fill=tuple(int(round(top[i] + (bottom[i] - top[i]) * k)) for i in range(3)))
    return img


def promo(w, h, path):
    """縦に長い1枚のページを、まんなかに置いた宣伝画像"""
    W, H = w * SS, h * SS
    img = gradient((W, H), BLUE, BLUE_DEEP)
    d = ImageDraw.Draw(img, "RGBA")

    # ページは上下に画面からはみ出させる。「これより下にもまだ続く」を絵で見せるため。
    # 幅は高さから決める（横長の大きい画像でも、ページが間延びしないようにするため）
    pw = int(H * 0.47)
    px = (W - pw) // 2
    py = -int(H * 0.10)
    ph = int(H * 1.20)
    r = int(pw * 0.06)
    d.rounded_rectangle([px + int(pw * 0.05), py + int(H * 0.02), px + pw + int(pw * 0.05), py + ph],
                        radius=r, fill=(0, 0, 0, 38))          # 影
    d.rounded_rectangle([px, py, px + pw, py + ph], radius=r, fill=WHITE)

    # ページの中身を思わせる線（見出し1本＋本文3本を、下まで繰り返す）
    m = int(pw * 0.13)
    x0, x1 = px + m, px + pw - m
    y = py + int(ph * 0.10)
    step = int(ph * 0.075)
    block = 0
    while y < py + ph - step:
        if block % 4 == 0:
            d.rounded_rectangle([x0, y, x1, y + int(step * 0.52)],
                                radius=int(step * 0.12), fill=BLUE_DEEP + (205,))
            y += int(step * 1.15)
        else:
            end = x1 if block % 4 != 3 else x0 + int((x1 - x0) * 0.62)
            d.rounded_rectangle([x0, y, end, y + int(step * 0.20)],
                                radius=int(step * 0.06), fill=BLUE_DEEP + (110,))
            y += int(step * 0.62)
        block += 1

    # いま画面に見えている範囲の枠。ページに沿わせて、はみ出しを少しだけにする
    fw = int(pw * 1.34)
    fh = int(H * 0.36)
    fx0 = (W - fw) // 2
    fy = int(H * 0.32)
    d.rounded_rectangle([fx0, fy, fx0 + fw, fy + fh], radius=int(H * 0.028),
                        outline=WHITE + (240,), width=max(2, int(H * 0.012)))
    # 白いページの上を通る部分は、白のままだと消えてしまうので青で引き直す
    lw = max(2, int(H * 0.012))
    for cy in (fy, fy + fh):
        d.line([(px, cy), (px + pw, cy)], fill=BLUE_DEEP + (255,), width=lw)
    for cx in (fx0, fx0 + fw):
        for cy in (fy, fy + fh):
            rr = int(H * 0.019)
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=WHITE)

    img = img.resize((w, h), Image.LANCZOS)
    img.save(path)
    return path


def fit_screenshot(src, dst, w=1280, h=800):
    """撮った画面を、余白なしでぴったり 1280×800 にする（中央を切り出して縮小）"""
    im = Image.open(src).convert("RGB")
    sw, sh = im.size
    want = w / h
    have = sw / sh
    if have > want:                      # 横に広すぎる → 左右を切る
        nw = int(round(sh * want)); im = im.crop(((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh))
    elif have < want:                    # 縦に長すぎる → 上を残して下を切る
        nh = int(round(sw / want)); im = im.crop((0, 0, sw, nh))
    im.resize((w, h), Image.LANCZOS).save(dst)
    return dst


if __name__ == "__main__":
    for name, w, h in [("promo_440x280.png", 440, 280), ("marquee_1400x560.png", 1400, 560)]:
        print("作成:", promo(w, h, os.path.join(HERE, name)))
