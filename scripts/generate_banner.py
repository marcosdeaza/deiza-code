import os
import math
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1200
HEIGHT = 400

# High-res canvas for supersampling anti-aliasing (2x)
SCALE = 2
W = WIDTH * SCALE
H = HEIGHT * SCALE

img = Image.new("RGBA", (W, H), (10, 9, 12, 255))
draw = ImageDraw.Draw(img)

# 1. Subtle radial gradient from center-left in granate #8C2F39
cx = int(W * 0.35)
cy = int(H * 0.5)
max_radius = int(W * 0.6)

# Create radial gradient overlay
grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
grad_draw = ImageDraw.Draw(grad)

for r in range(max_radius, 0, -8):
    factor = 1.0 - (r / max_radius)
    alpha = int(45 * (factor ** 2.2))
    # #8C2F39 = (140, 47, 57)
    grad_draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=(140, 47, 57, alpha)
    )

img = Image.alpha_composite(img, grad)
draw = ImageDraw.Draw(img)

# 2. Subtle technical grid lines (clean developer aesthetic)
grid_step = 60 * SCALE
for x in range(0, W, grid_step):
    draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 6), width=1)
for y in range(0, H, grid_step):
    draw.line([(0, y), (W, y)], fill=(255, 255, 255, 6), width=1)

# 3. Outer border and accent corner indicators
border_pad = 20 * SCALE
draw.rounded_rectangle(
    [border_pad, border_pad, W - border_pad, H - border_pad],
    radius=16 * SCALE,
    outline=(140, 47, 57, 100),
    width=2 * SCALE
)

# Subtle corner plus signs
corner_len = 12 * SCALE
corners = [
    (border_pad + 10 * SCALE, border_pad + 10 * SCALE),
    (W - border_pad - 10 * SCALE, border_pad + 10 * SCALE),
    (border_pad + 10 * SCALE, H - border_pad - 10 * SCALE),
    (W - border_pad - 10 * SCALE, H - border_pad - 10 * SCALE)
]
for (x, y) in corners:
    draw.line([(x - corner_len, y), (x + corner_len, y)], fill=(184, 74, 85, 120), width=SCALE)
    draw.line([(x, y - corner_len), (x, y + corner_len)], fill=(184, 74, 85, 120), width=SCALE)

# Load fonts
font_title = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 72 * SCALE)
font_bold = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 24 * SCALE)
font_tag = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 22 * SCALE)
font_mono = ImageFont.truetype('/System/Library/Fonts/SFNSMono.ttf', 19 * SCALE)
font_mono_small = ImageFont.truetype('/System/Library/Fonts/SFNSMono.ttf', 16 * SCALE)
font_pill = ImageFont.truetype('/System/Library/Fonts/SFNSMono.ttf', 15 * SCALE)

# 4. Kicker badge
kicker_x = 60 * SCALE
kicker_y = 52 * SCALE
draw.text((kicker_x, kicker_y), "DEIZA ORG  /  DEVELOPER CLI TOOLCHAIN", font=font_mono_small, fill=(225, 112, 128, 220))

# 5. Main Title: DEIZA CODE
title_y = kicker_y + 32 * SCALE
draw.text((kicker_x, title_y), "DEIZA", font=font_title, fill=(255, 255, 255, 255))
deiza_w = draw.textlength("DEIZA ", font=font_title)
draw.text((kicker_x + deiza_w, title_y), "CODE", font=font_title, fill=(225, 112, 128, 255))

# 6. Tagline
sub_y = title_y + 86 * SCALE
draw.text((kicker_x, sub_y), "Autonomous AI Terminal Pair Programmer", font=font_tag, fill=(255, 255, 255, 240))
draw.text((kicker_x, sub_y + 32 * SCALE), "Deiza Omniscient · Dedicated Clusters · Zero Queue Latency", font=font_mono_small, fill=(180, 180, 195, 200))

# 7. Sleek Pill badges (arranged in two clean compact rows on left side)
pill_row1 = [
    "DEDICATED CLUSTER",
    "BUILD · COPILOT · PLAN",
]
pill_row2 = [
    "MULTI-AGENT WORKERS",
    "SURGICAL DIFFS",
    "VISION ENABLED",
]

pill_h = 28 * SCALE
pill_pad_x = 12 * SCALE

# Row 1
pill_x = kicker_x
pill_y = sub_y + 74 * SCALE
for text in pill_row1:
    text_w = draw.textlength(text, font=font_pill)
    pw = text_w + pill_pad_x * 2
    draw.rounded_rectangle(
        [pill_x, pill_y, pill_x + pw, pill_y + pill_h],
        radius=pill_h // 2,
        fill=(25, 22, 28, 220),
        outline=(140, 47, 57, 160),
        width=1 * SCALE
    )
    draw.text((pill_x + pill_pad_x, pill_y + 6 * SCALE), text, font=font_pill, fill=(230, 225, 235, 230))
    pill_x += pw + 10 * SCALE

# Row 2
pill_x = kicker_x
pill_y += pill_h + 8 * SCALE
for text in pill_row2:
    text_w = draw.textlength(text, font=font_pill)
    pw = text_w + pill_pad_x * 2
    draw.rounded_rectangle(
        [pill_x, pill_y, pill_x + pw, pill_y + pill_h],
        radius=pill_h // 2,
        fill=(25, 22, 28, 220),
        outline=(140, 47, 57, 160),
        width=1 * SCALE
    )
    draw.text((pill_x + pill_pad_x, pill_y + 6 * SCALE), text, font=font_pill, fill=(230, 225, 235, 230))
    pill_x += pw + 10 * SCALE

# 8. Terminal preview card on the right side
term_w = 460 * SCALE
term_h = 270 * SCALE
term_x = W - border_pad - term_w - 25 * SCALE
term_y = 55 * SCALE

# Terminal background & border
draw.rounded_rectangle(
    [term_x, term_y, term_x + term_w, term_y + term_h],
    radius=14 * SCALE,
    fill=(13, 12, 15, 250),
    outline=(75, 65, 75, 220),
    width=1 * SCALE
)

# Terminal title bar
bar_h = 34 * SCALE
draw.line([(term_x, term_y + bar_h), (term_x + term_w, term_y + bar_h)], fill=(40, 35, 42, 220), width=1 * SCALE)

# 3 window buttons
btn_r = 5 * SCALE
btn_y = term_y + bar_h // 2
draw.ellipse([term_x + 18 * SCALE - btn_r, btn_y - btn_r, term_x + 18 * SCALE + btn_r, btn_y + btn_r], fill=(230, 70, 70, 220))
draw.ellipse([term_x + 36 * SCALE - btn_r, btn_y - btn_r, term_x + 36 * SCALE + btn_r, btn_y + btn_r], fill=(230, 185, 70, 220))
draw.ellipse([term_x + 54 * SCALE - btn_r, btn_y - btn_r, term_x + 54 * SCALE + btn_r, btn_y + btn_r], fill=(70, 200, 110, 220))

draw.text((term_x + 80 * SCALE, term_y + 8 * SCALE), "deiza-code --plan", font=font_mono_small, fill=(170, 165, 180, 200))

# Terminal lines inside
line_x = term_x + 20 * SCALE
line_y = term_y + bar_h + 18 * SCALE

draw.text((line_x, line_y), "$ deiza --plan \"Audit API security\"", font=font_mono, fill=(240, 240, 245, 255))

line_y += 32 * SCALE
draw.text((line_x, line_y), "● [PLAN] Exploring workspace context...", font=font_mono_small, fill=(100, 200, 220, 240))

line_y += 28 * SCALE
draw.text((line_x, line_y), "🤖 [agent:Auditor] Scanning auth endpoints", font=font_mono_small, fill=(225, 112, 128, 240))

line_y += 28 * SCALE
draw.text((line_x, line_y), "📖 [read] src/auth.js: 120 lines analyzed", font=font_mono_small, fill=(170, 170, 190, 210))

line_y += 28 * SCALE
draw.text((line_x, line_y), "✓ Blueprint ready. Switch to /build to apply.", font=font_mono_small, fill=(80, 220, 130, 240))

line_y += 32 * SCALE
draw.text((line_x, line_y), "deiza-code [PLAN] ❯ _", font=font_mono, fill=(255, 255, 255, 255))

# 9. Resize down using Lanczos for crisp, anti-aliased perfection
out_img = img.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
out_path = "assets/banner.png"
out_img.save(out_path, "PNG", optimize=True)
print(f"Generated clean banner at {out_path} ({os.path.getsize(out_path)} bytes)")
