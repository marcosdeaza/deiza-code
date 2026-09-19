import os
import shutil
import tempfile
import subprocess
from PIL import Image, ImageDraw, ImageFont

WIDTH = 960
HEIGHT = 640
BG_COLOR = (12, 10, 13)       # Dark obsidian
BAR_COLOR = (24, 20, 22)     # Title bar
BORDER_COLOR = (140, 47, 57) # Granate #8C2F39

FONT_PATH = '/System/Library/Fonts/Menlo.ttc'
font = ImageFont.truetype(FONT_PATH, 12)
font_bold = ImageFont.truetype(FONT_PATH, 12)
font_title = ImageFont.truetype(FONT_PATH, 11)

# Exact Deiza color palette
C_WHITE = (245, 245, 250)
C_GRAY = (140, 140, 150)
C_DARK_GRAY = (75, 75, 85)
C_GRANATE = (184, 74, 85)
C_GRANATE_BOLD = (225, 112, 128)
C_GRANATE_DARK = (140, 47, 57)
C_ROSE = (235, 125, 140)
C_GOLD = (235, 185, 85)
C_GREEN = (80, 220, 130)
C_BLUE = (90, 160, 235)
C_CYAN = (100, 200, 225)
C_RED = (235, 75, 75)

frames_dir = tempfile.mkdtemp()

def draw_window_frame(draw):
    draw.rounded_rectangle([1, 1, WIDTH - 2, HEIGHT - 2], radius=12, fill=BG_COLOR, outline=BORDER_COLOR, width=2)
    draw.rounded_rectangle([2, 2, WIDTH - 3, 34], radius=10, fill=BAR_COLOR)
    draw.rectangle([2, 22, WIDTH - 3, 34], fill=BAR_COLOR)
    draw.line([(2, 34), (WIDTH - 3, 34)], fill=(40, 32, 36), width=1)
    # macOS window traffic lights
    draw.ellipse([14, 11, 26, 23], fill=(255, 95, 86))
    draw.ellipse([34, 11, 46, 23], fill=(255, 189, 46))
    draw.ellipse([54, 11, 66, 23], fill=(39, 201, 63))
    draw.text((WIDTH // 2 - 110, 11), "deiza-code — zsh — 96x34", fill=C_GRAY, font=font_title)

startup_lines = [
    ("  ██████╗  ███████╗ ██╗ ███████╗  █████╗       ██████╗  ██████╗  ██████╗  ███████╗", C_GRANATE_BOLD),
    ("  ██╔══██╗ ██╔════╝ ██║ ╚══███╔╝ ██╔══██╗     ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝", C_GRANATE_BOLD),
    ("  ██║  ██║ ██████╗  ██║   ███╔╝  ███████║     ██║      ██║   ██║ ██║  ██║ ██████╗ ", C_GRANATE_BOLD),
    ("  ██║  ██║ ██╔═══╝  ██║  ███╔╝   ██╔══██║     ██║      ██║   ██║ ██║  ██║ ██╔═══╝ ", C_GRANATE_BOLD),
    ("  ██████╔╝ ███████╗ ██║ ███████╗ ██║  ██║     ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗", C_GRANATE_BOLD),
    ("  ╚═════╝  ╚══════╝ ╚═╝ ╚══════╝ ╚═╝  ╚═╝      ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝", C_GRANATE_BOLD),
    ("  Autonomous Terminal Coding Agent · v1.2.0", C_GRAY),
    ("", C_WHITE),
    ("  Cuenta: marcos@deiza.org · [SIGNET] · Uso: 14% (4h 12m restantes)", C_WHITE),
    ("  Modelo activo: Deiza Omniscient [Deiza Liquid 5.1 · infraestructura dedicada]", C_GRANATE),
    ("  Workspace: /Users/marcos/projects/api-service [Node.js / TS] · git:main", C_GRAY),
    ("  ● Sesión persistente restaurada: ses_20260919_7a1b (6 mensajes guardados)", C_ROSE),
    ("  Usa /new para iniciar limpia o /history para ver sesiones anteriores.", C_GRAY),
    ("", C_WHITE),
    ("  Escribe / para ver comandos en tiempo real, o escribe tu consulta directamente.", C_GRAY),
    ("", C_WHITE),
]

palette_preview_lines = [
    ("┌─ Comandos Disponibles (escribe para filtrar o presiona [Tab] para autocompletar) ───────────────┐", C_GRANATE_DARK),
    ("│   /build [query]              Modo implementación: edición quirúrgica, diffs y tests activos     │", C_WHITE),
    ("│   /plan [query]               Modo arquitectura: exploración y blueprint sin editar archivos     │", C_WHITE),
    ("│   /history                    Ver historial de conversaciones guardadas en este proyecto         │", C_WHITE),
    ("│   /resume [id]                Continuar una conversación anterior con todo su contexto           │", C_WHITE),
    ("│   /new                        Iniciar una nueva conversación limpia en este workspace             │", C_WHITE),
    ("│   /paste                      Pegar captura del portapapeles del SO (Win+Shift+S / PrtScn)       │", C_WHITE),
    ("│   /agent <rol> <tarea>        Lanzar un subagente worker aislado (ej: Auditor, Tester)           │", C_WHITE),
    ("│   /usage                      Consultar consumo de tokens y ventana rodante de 5 horas           │", C_WHITE),
    ("│   /whoami                     Ver estado de tu cuenta, plan, tokens y cuota activa               │", C_WHITE),
    ("│   /update                     Comprobar y actualizar Deiza Code a la última versión              │", C_WHITE),
    ("└──────────────────────────────────────────────────────────────────────────────────────────────────┘", C_GRANATE_DARK),
]

execution_steps = [
    # Step 1: Thinking & Read
    [
        ("  ● Analizando y procesando...", C_GRANATE),
        ("  📖 [read] src/server.ts (1-35)", C_CYAN),
    ],
    # Step 2: Surgical Edit with Unified Diff
    [
        ("  ✎ [edit] src/server.ts", C_BLUE),
        ("  Diff: src/server.ts", C_WHITE),
        ("  ──────────────────────────────────────────────────────────", C_DARK_GRAY),
        ("    24 │   app.use(express.json());", C_GRAY),
        ("    25 + │ + import { metricsEndpoint } from './routes/metrics';", C_GREEN),
        ("    26 + │ + app.get('/metrics', metricsEndpoint);", C_GREEN),
        ("    27 │   app.listen(PORT, () => console.log('Ready'));", C_GRAY),
        ("  ──────────────────────────────────────────────────────────", C_DARK_GRAY),
    ],
    # Step 3: Write test & run bash command
    [
        ("  + [write] test/metrics.test.ts (780 bytes)", C_GREEN),
        ("  ⚡ [bash] npm test", C_GOLD),
        ("  PASS test/metrics.test.ts", C_GREEN),
        ("  ✓ GET /metrics exports standard prometheus counters (18 ms)", C_GRAY),
        ("  Test Suites: 1 passed, 1 total | Tests: 1 passed, 1 total", C_GREEN),
    ],
    # Step 4: Success & Persistent Session
    [
        ("", C_WHITE),
        ("  ✓ Completado con éxito en 1.8s", C_GREEN),
        ("  Sesión guardada en ses_20260919_7a1b", C_DARK_GRAY),
        ("", C_WHITE),
        ("deiza-code [BUILD] ❯ █", C_GRANATE_BOLD),
    ]
]

frame_idx = 0

def save_frame(lines_to_draw, hold=1):
    global frame_idx
    img = Image.new('RGB', (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    draw_window_frame(draw)

    y = 44
    line_h = 15
    for item in lines_to_draw:
        text, col = item
        draw.text((14, y), text, fill=col, font=font)
        y += line_h

    for _ in range(hold):
        img.save(os.path.join(frames_dir, f"frame_{frame_idx:05d}.png"))
        frame_idx += 1

# 1. Startup screen (hold ~1.5s)
current = list(startup_lines)
current.append(("deiza-code [BUILD] ❯ ", C_GRANATE_BOLD))
save_frame(current, hold=18)

# 2. User types '/' -> Palette immediately pops up
current[-1] = ("deiza-code [BUILD] ❯ /", C_WHITE)
palette_view = current + palette_preview_lines
save_frame(palette_view, hold=22) # hold palette ~1.5s

# 3. User types the instruction
instruction = "añade endpoint /metrics con test unitario y corre la suite"
typed = ""
base_lines = list(startup_lines)
for char in instruction:
    typed += char
    temp = base_lines + [(f"deiza-code [BUILD] ❯ {typed}█", C_GRANATE_BOLD)]
    save_frame(temp, hold=1)

base_lines.append((f"deiza-code [BUILD] ❯ {instruction}", C_WHITE))
save_frame(base_lines, hold=8)

# 4. Agent Execution Steps
for step in execution_steps:
    base_lines.extend(step)
    save_frame(base_lines, hold=14)

# 5. Hold final frame ~3.5s
save_frame(base_lines, hold=45)

gif_output = "assets/demo.gif"
palette = os.path.join(frames_dir, "palette.png")

print(f"Generated {frame_idx} frames. Compiling high-fidelity GIF with ffmpeg...")

subprocess.run([
    "/opt/homebrew/bin/ffmpeg", "-y", "-framerate", "14",
    "-i", os.path.join(frames_dir, "frame_%05d.png"),
    "-vf", "palettegen=max_colors=128:reserve_transparent=0",
    palette
], check=True)

subprocess.run([
    "/opt/homebrew/bin/ffmpeg", "-y", "-framerate", "14",
    "-i", os.path.join(frames_dir, "frame_%05d.png"),
    "-i", palette,
    "-lavfi", "paletteuse=dither=bayer:bayer_scale=3",
    gif_output
], check=True)

shutil.rmtree(frames_dir)
print(f"Realistic Demo GIF saved to: {gif_output} ({os.path.getsize(gif_output)} bytes)")
