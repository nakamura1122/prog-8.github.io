# -*- coding: utf-8 -*-
"""窓ガラスフィルム解説ショート動画用のスライド画像を生成する"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1620, 2880  # 1.5x of 1080x1920 (zoompan品質確保のため大きめに描画)
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"
OUT = "/tmp/film_video/slides"
os.makedirs(OUT, exist_ok=True)


def font(size):
    return ImageFont.truetype(FONT, size)


def vgrad(top, bottom):
    """縦グラデーション背景"""
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    return img


def center_text(d, y, text, size, fill, stroke=0, stroke_fill=None, spacing=20):
    f = font(size)
    lines = text.split("\n")
    for line in lines:
        bbox = d.textbbox((0, 0), line, font=f, stroke_width=stroke)
        w = bbox[2] - bbox[0]
        d.text(((W - w) / 2, y), line, font=f, fill=fill,
               stroke_width=stroke, stroke_fill=stroke_fill)
        y += (bbox[3] - bbox[1]) + spacing
    return y


def rounded(d, box, r, **kw):
    d.rounded_rectangle(box, radius=r, **kw)


def draw_window(d, cx, cy, w, h, frame=(255, 255, 255), glass=(180, 225, 250), film=None):
    """窓のイラスト。filmに色を渡すと内側にフィルム面を重ねる"""
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    rounded(d, (x0 - 28, y0 - 28, x1 + 28, y1 + 28), 36, fill=frame)
    rounded(d, (x0, y0, x1, y1), 18, fill=glass)
    # 桟
    d.rectangle((cx - 12, y0, cx + 12, y1), fill=frame)
    d.rectangle((x0, cy - 12, x1, cy + 12), fill=frame)
    # ガラスの光沢
    d.line((x0 + 60, y0 + h * 0.55, x0 + w * 0.32, y0 + 40), fill=(235, 250, 255), width=26)
    d.line((x0 + 130, y0 + h * 0.62, x0 + w * 0.42, y0 + 80), fill=(225, 246, 255), width=14)
    if film:
        rounded(d, (x0 + 26, y0 + 26, cx - 30, y1 - 26), 12, fill=film)
    return x0, y0, x1, y1


def draw_sun(d, cx, cy, r, color=(255, 196, 64)):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    for i in range(12):
        a = i * math.pi / 6
        x0 = cx + math.cos(a) * (r + 26)
        y0 = cy + math.sin(a) * (r + 26)
        x1 = cx + math.cos(a) * (r + 78)
        y1 = cy + math.sin(a) * (r + 78)
        d.line((x0, y0, x1, y1), fill=color, width=22)


def badge(d, y, text, size=54, fg=(255, 255, 255), bg=(20, 110, 180)):
    f = font(size)
    bbox = d.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    pad = 44
    x0 = (W - tw) / 2 - pad
    rounded(d, (x0, y, x0 + tw + pad * 2, y + size + 56), (size + 56) / 2, fill=bg)
    d.text(((W - tw) / 2, y + 24), text, font=f, fill=fg)


def page_dots(d, idx, total=5):
    y = H - 170
    gap = 70
    x = W / 2 - gap * (total - 1) / 2
    for i in range(total):
        r = 22 if i == idx else 14
        c = (255, 255, 255) if i == idx else (255, 255, 255, 120)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255) if i == idx else (180, 215, 235))
        x += gap


def soft_card(img, box, r=48, alpha=235):
    """半透明の白カードを重ねる"""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle(box, radius=r, fill=(255, 255, 255, alpha))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


# ---------- Slide 1: タイトル ----------
img = vgrad((22, 105, 170), (90, 180, 225))
d = ImageDraw.Draw(img)
draw_sun(d, W - 260, 360, 110)
draw_window(d, W / 2, 1150, 760, 920, film=(140, 230, 215, 0)[:3])
# フィルムを貼る手のヘラ(スキージー)
d.polygon([(W / 2 + 60, 1380), (W / 2 + 320, 1300), (W / 2 + 340, 1360), (W / 2 + 90, 1445)], fill=(255, 214, 90))
d.rectangle((W / 2 + 320, 1280, W / 2 + 430, 1395), fill=(60, 70, 90))
badge(d, 1850, "暮らしを変える豆知識", bg=(255, 140, 50))
center_text(d, 2030, "窓ガラスフィルムって\n何がいいの？", 150, (255, 255, 255), stroke=10, stroke_fill=(15, 70, 120), spacing=56)
center_text(d, 2530, "貼るだけで、窓がもっと快適に！", 70, (235, 248, 255))
page_dots(d, 0)
img.save(f"{OUT}/slide1.png")

# ---------- Slide 2: UVカット ----------
img = vgrad((250, 165, 60), (255, 215, 140))
d = ImageDraw.Draw(img)
draw_sun(d, 300, 380, 130, color=(255, 240, 200))
x0, y0, x1, y1 = draw_window(d, W / 2 + 120, 1180, 700, 860)
# 紫外線が跳ね返る矢印
for i, ay in enumerate((900, 1180, 1460)):
    d.line((140, ay, x0 - 60, ay), fill=(150, 60, 200), width=24)
    d.polygon([(x0 - 60, ay - 30), (x0 - 60, ay + 30), (x0 - 10, ay)], fill=(150, 60, 200))
    d.line((x0 - 10, ay, 240, ay - 200), fill=(200, 150, 230), width=14)
d.text((150, 700), "UV", font=font(90), fill=(150, 60, 200))
soft_card(img, (90, 1840, W - 90, 2640))
d = ImageDraw.Draw(img)
badge(d, 1900, "メリット 1", bg=(150, 60, 200))
center_text(d, 2070, "紫外線を約99%カット", 118, (90, 40, 130), spacing=40)
center_text(d, 2300, "家具や床の色あせ、\nお肌の日焼け対策に効果的", 72, (80, 80, 90), spacing=36)
page_dots(d, 1)
img.save(f"{OUT}/slide2.png")

# ---------- Slide 3: 遮熱・断熱 ----------
img = vgrad((30, 140, 150), (130, 210, 200))
d = ImageDraw.Draw(img)
# 左: 夏(太陽) 右: 冬(雪)
draw_sun(d, 300, 420, 110, color=(255, 120, 80))
def draw_snowflake(d, cx, cy, r, color=(225, 246, 255)):
    for k in range(6):
        a = k * math.pi / 3
        ex, ey = cx + math.cos(a) * r, cy + math.sin(a) * r
        d.line((cx, cy, ex, ey), fill=color, width=14)
        # 枝
        for t in (0.55, 0.8):
            bx, by = cx + math.cos(a) * r * t, cy + math.sin(a) * r * t
            for da in (math.pi / 5, -math.pi / 5):
                d.line((bx, by, bx + math.cos(a + da) * r * 0.22,
                        by + math.sin(a + da) * r * 0.22), fill=color, width=10)

for sx, sy, sr in ((W - 300, 380, 90), (W - 160, 560, 60), (W - 430, 580, 55)):
    draw_snowflake(d, sx, sy, sr)
draw_window(d, W / 2, 1220, 720, 880)
# 室内の快適マーク
d.ellipse((W / 2 - 130, 1120, W / 2 + 130, 1380), fill=(255, 255, 255))
d.text((W / 2 - 88, 1165), "♨", font=font(180), fill=(50, 150, 140))
soft_card(img, (90, 1840, W - 90, 2640))
d = ImageDraw.Draw(img)
badge(d, 1900, "メリット 2", bg=(20, 130, 120))
center_text(d, 2070, "夏は涼しく 冬は暖かく", 112, (10, 90, 85), spacing=40)
center_text(d, 2300, "遮熱・断熱効果で\n冷暖房の効率アップ＆節電に", 72, (80, 80, 90), spacing=36)
page_dots(d, 2)
img.save(f"{OUT}/slide3.png")

# ---------- Slide 4: 飛散防止・防犯 ----------
img = vgrad((50, 60, 100), (110, 130, 180))
d = ImageDraw.Draw(img)
x0, y0, x1, y1 = draw_window(d, W / 2, 1150, 720, 880)
# ひび割れ(放射状の線) — フィルムで破片が留まるイメージ
ccx, ccy = W / 2 - 180, 1100
for ang in range(0, 360, 30):
    a = math.radians(ang)
    d.line((ccx, ccy, ccx + math.cos(a) * 200, ccy + math.sin(a) * 200), fill=(255, 255, 255), width=8)
for r in (80, 150):
    d.ellipse((ccx - r, ccy - r, ccx + r, ccy + r), outline=(255, 255, 255), width=6)
# 盾マーク
sx, sy = W / 2 + 250, 1450
d.polygon([(sx, sy - 150), (sx + 130, sy - 100), (sx + 130, sy + 40),
           (sx, sy + 150), (sx - 130, sy + 40), (sx - 130, sy - 100)], fill=(70, 200, 120))
d.line((sx - 55, sy - 10, sx - 10, sy + 45), fill=(255, 255, 255), width=24)
d.line((sx - 10, sy + 45, sx + 70, sy - 60), fill=(255, 255, 255), width=24)
soft_card(img, (90, 1840, W - 90, 2640))
d = ImageDraw.Draw(img)
badge(d, 1900, "メリット 3", bg=(40, 60, 120))
center_text(d, 2070, "割れても飛び散らない", 112, (35, 50, 100), spacing=40)
center_text(d, 2300, "台風・地震・空き巣対策に\n飛散防止・防犯フィルムが活躍", 72, (80, 80, 90), spacing=36)
page_dots(d, 3)
img.save(f"{OUT}/slide4.png")

# ---------- Slide 5: 目隠し・まとめ ----------
img = vgrad((25, 120, 190), (120, 195, 235))
d = ImageDraw.Draw(img)
x0, y0, x1, y1 = draw_window(d, W / 2, 1100, 720, 860)
# すりガラス風フィルム(ドットパターン)
for gy in range(int(y0) + 60, int(y1) - 40, 90):
    for gx in range(int(x0) + 60, int(x1) - 40, 90):
        d.ellipse((gx - 26, gy - 26, gx + 26, gy + 26), fill=(235, 245, 250))
badge(d, 1740, "こんな使い方も", bg=(255, 140, 50))
center_text(d, 1910, "目隠しでプライバシー対策", 100, (255, 255, 255), stroke=8, stroke_fill=(15, 70, 120), spacing=40)
center_text(d, 2120, "デザイン柄も豊富！\n貼ってはがせるタイプなら賃貸でもOK", 70, (235, 248, 255), spacing=36)
soft_card(img, (140, 2380, W - 140, 2620))
d = ImageDraw.Draw(img)
center_text(d, 2440, "用途に合わせて選んでみよう！", 80, (20, 100, 170))
page_dots(d, 4)
img.save(f"{OUT}/slide5.png")

print("slides done")
