# -*- coding: utf-8 -*-
"""まるごとスクショ ― 拡張機能のアイコンを作るスクリプト

外部ライブラリを使わず、Python標準の zlib だけでPNGを書き出す。
4倍の大きさで描いてから縮めることで、輪郭のギザギザを消している。

使い方:  python make_icons.py
"""

import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "extension", "icons")
SIZES = [16, 32, 48, 128]
SS = 4  # 拡大して描く倍率

BLUE = (31, 111, 235)
BLUE_DEEP = (21, 82, 180)
WHITE = (255, 255, 255)


def make_canvas(n):
    return [[(0, 0, 0, 0)] * n for _ in range(n)]


def rounded_rect(buf, x0, y0, x1, y1, radius, color, alpha=255):
    """角の丸い四角を塗る（座標は拡大後の画素）"""
    n = len(buf)
    r = radius
    for y in range(max(0, int(y0)), min(n, int(y1) + 1)):
        for x in range(max(0, int(x0)), min(n, int(x1) + 1)):
            cx, cy = x + 0.5, y + 0.5
            if cx < x0 + r and cy < y0 + r:
                if (cx - (x0 + r)) ** 2 + (cy - (y0 + r)) ** 2 > r * r:
                    continue
            elif cx > x1 - r and cy < y0 + r:
                if (cx - (x1 - r)) ** 2 + (cy - (y0 + r)) ** 2 > r * r:
                    continue
            elif cx < x0 + r and cy > y1 - r:
                if (cx - (x0 + r)) ** 2 + (cy - (y1 - r)) ** 2 > r * r:
                    continue
            elif cx > x1 - r and cy > y1 - r:
                if (cx - (x1 - r)) ** 2 + (cy - (y1 - r)) ** 2 > r * r:
                    continue
            buf[y][x] = blend(buf[y][x], (color[0], color[1], color[2], alpha))


def blend(dst, src):
    sa = src[3] / 255.0
    da = dst[3] / 255.0
    out_a = sa + da * (1 - sa)
    if out_a <= 0:
        return (0, 0, 0, 0)
    out = []
    for i in range(3):
        out.append(int(round((src[i] * sa + dst[i] * da * (1 - sa)) / out_a)))
    return (out[0], out[1], out[2], int(round(out_a * 255)))


def downsample(buf, factor):
    n = len(buf) // factor
    small = []
    for y in range(n):
        row = []
        for x in range(n):
            r = g = b = a = 0
            for dy in range(factor):
                for dx in range(factor):
                    px = buf[y * factor + dy][x * factor + dx]
                    r += px[0] * px[3]
                    g += px[1] * px[3]
                    b += px[2] * px[3]
                    a += px[3]
            if a == 0:
                row.append((0, 0, 0, 0))
            else:
                cnt = factor * factor
                row.append((int(round(r / a)), int(round(g / a)), int(round(b / a)), int(round(a / cnt))))
        small.append(row)
    return small


def write_png(path, buf):
    n = len(buf)
    raw = bytearray()
    for row in buf:
        raw.append(0)  # フィルタなし
        for px in row:
            raw += bytes((px[0], px[1], px[2], px[3]))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def draw(size):
    n = size * SS
    buf = make_canvas(n)
    u = n / 100.0  # 全体を100とした割合で置く

    # 土台（青い角丸）
    rounded_rect(buf, 3 * u, 3 * u, 97 * u, 97 * u, 22 * u, BLUE)

    # 縦に長いページ（白）
    rounded_rect(buf, 27 * u, 12 * u, 73 * u, 88 * u, 6 * u, WHITE)

    # ページの中身を思わせる線
    rounded_rect(buf, 34 * u, 22 * u, 66 * u, 33 * u, 2 * u, BLUE_DEEP, 210)
    rounded_rect(buf, 34 * u, 42 * u, 66 * u, 47 * u, 2 * u, BLUE_DEEP, 120)
    rounded_rect(buf, 34 * u, 55 * u, 58 * u, 60 * u, 2 * u, BLUE_DEEP, 120)
    rounded_rect(buf, 34 * u, 68 * u, 66 * u, 73 * u, 2 * u, BLUE_DEEP, 120)

    return downsample(buf, SS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in SIZES:
        path = os.path.join(OUT_DIR, "icon%d.png" % s)
        write_png(path, draw(s))
        print("作成:", path)


if __name__ == "__main__":
    main()
