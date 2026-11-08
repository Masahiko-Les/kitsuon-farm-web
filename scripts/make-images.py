"""Android のアイコンと起動画像を作る。

アプリのアイコンは assets/images/icon.png（手描きのドット絵）をそのまま使う。
起動画像は、ゲーム内の芽のドット絵（farm-map.tsx の drawSprout）を大きくしている。
使い方：python3 scripts/make-images.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"
FONT = ROOT / "node_modules/@expo-google-fonts/dotgothic16/400Regular/DotGothic16_400Regular.ttf"

MOSS = "#2e3a2b"
LEAF = "#9cc86a"
PAPER = "#f6efd9"


def sprout(draw, ox, oy, px, soil=True, mono=None):
    """16×16 のマスに、畑と芽を描く。px は1ドットの大きさ。"""
    def rect(x, y, w, h, c):
        draw.rectangle([ox + x * px, oy + y * px, ox + (x + w) * px - 1, oy + (y + h) * px - 1], fill=mono or c)

    if soil:
        rect(0, 0, 16, 16, "#8a5a34")
        for r in (3, 7, 11, 15):
            rect(0, r, 16, 1, "#6f4526")
        rect(3, 1, 2, 1, "#a06c42")
        rect(10, 9, 2, 1, "#a06c42")
    # 土の盛り上がり
    rect(5, 11, 6, 2, "#6b4226")
    rect(6, 10, 4, 1, "#6b4226")
    # 芽（育ちきった大きさ）
    h = 8
    rect(7, 10 - h, 2, h, "#4f8f3a")
    rect(4, 10 - h, 3, 2, "#7cc35a")
    rect(9, 9 - h, 3, 2, "#7cc35a")


def android():
    # アダプティブアイコン：中央 66% が必ず見える範囲
    bg = Image.new("RGB", (512, 512), MOSS)
    bg.save(OUT / "android-icon-background.png")

    # 前景はアプリのアイコン（assets/images/icon.png）を縮めて、切り抜かれても欠けない中央に置く
    fg = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    art = Image.open(OUT / "icon.png").convert("RGBA").resize((340, 340), Image.NEAREST)
    fg.paste(art, ((512 - 340) // 2, (512 - 340) // 2))
    fg.save(OUT / "android-icon-foreground.png")

    mono = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    sprout(ImageDraw.Draw(mono), 128, 128, 16, soil=False, mono="#ffffff")
    mono.save(OUT / "android-icon-monochrome.png")


def splash():
    # 起動画像：芽の下に「吃音農場」。苔色の背景の上に置く前提で、背景は透明
    w, h = 720, 520
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    px = 18
    sprout(d, (w - 16 * px) // 2, 0, px, soil=False)

    font = ImageFont.truetype(str(FONT), 128)
    text = "吃音農場"
    box = d.textbbox((0, 0), text, font=font)
    tw = box[2] - box[0]
    d.text(((w - tw) // 2 - box[0], 16 * px + 40 - box[1]), text, font=font, fill=LEAF)
    img.save(OUT / "splash-icon.png")


if __name__ == "__main__":
    android()
    splash()
    print("assets/images に書き出しました")
