from __future__ import annotations

from pathlib import Path

from PIL import Image
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "CVFuzz_Brand_Guidelines.pdf"
LOGO_PATH = ROOT / "frontend" / "public" / "brand" / "cvfuzz-logo.png"
COVER_PATH = ROOT / "docs" / "brand" / "assets" / "cvfuzz-boundary-cover.png"
MOCKUP_PATH = ROOT / "docs" / "brand" / "assets" / "cvfuzz-workstation-mockup.png"
GEIST_PATH = ROOT / "frontend" / "node_modules" / "next" / "dist" / "compiled" / "@vercel" / "og" / "Geist-Regular.ttf"

W, H = 960, 540
INK = HexColor("#0B0E12")
INK_2 = HexColor("#12171D")
INK_3 = HexColor("#1A2129")
SIGNAL = HexColor("#D7FA03")
PAPER = HexColor("#F7F9F2")
WHITE = HexColor("#FFFFFF")
MIST = HexColor("#E7ECE3")
SLATE = HexColor("#69737F")
STEEL = HexColor("#96A0AA")
RED = HexColor("#F45B69")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Geist", str(GEIST_PATH)))


def crop_reader(path: Path, box: tuple[int, int, int, int]) -> ImageReader:
    image = Image.open(path).convert("RGBA")
    return ImageReader(image.crop(box))


LOGO = ImageReader(str(LOGO_PATH))
SYMBOL = crop_reader(LOGO_PATH, (40, 70, 575, 630))
WORDMARK = crop_reader(LOGO_PATH, (575, 115, 2100, 600))
COVER = ImageReader(str(COVER_PATH))
MOCKUP = ImageReader(str(MOCKUP_PATH))


def set_alpha(c: canvas.Canvas, fill: float = 1, stroke: float = 1) -> None:
    if hasattr(c, "setFillAlpha"):
        c.setFillAlpha(fill)
    if hasattr(c, "setStrokeAlpha"):
        c.setStrokeAlpha(stroke)


def reset_alpha(c: canvas.Canvas) -> None:
    set_alpha(c, 1, 1)


def cover_image(c: canvas.Canvas, image: ImageReader, x: float = 0, y: float = 0, w: float = W, h: float = H) -> None:
    iw, ih = image.getSize()
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")


def contain_image(c: canvas.Canvas, image: ImageReader, x: float, y: float, w: float, h: float) -> tuple[float, float, float, float]:
    iw, ih = image.getSize()
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    c.drawImage(image, dx, dy, dw, dh, mask="auto")
    return dx, dy, dw, dh


def tracked_text(c: canvas.Canvas, text: str, x: float, y: float, size: float, color: Color, tracking: float = 0, font: str = "Geist") -> None:
    obj = c.beginText(x, y)
    obj.setFont(font, size)
    obj.setFillColor(color)
    obj.setCharSpace(tracking)
    obj.textLine(text)
    c.drawText(obj)


def wrap_lines(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(test, font, size) <= width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(c: canvas.Canvas, text: str, x: float, y: float, width: float, size: float = 12, leading: float | None = None, color: Color = INK, font: str = "Helvetica", max_lines: int | None = None) -> float:
    leading = leading or size * 1.42
    lines = wrap_lines(text, font, size, width)
    if max_lines:
        lines = lines[:max_lines]
    obj = c.beginText(x, y)
    obj.setFont(font, size)
    obj.setFillColor(color)
    obj.setLeading(leading)
    obj.setCharSpace(0)
    for line in lines:
        obj.textLine(line)
    c.drawText(obj)
    return y - len(lines) * leading


def label(c: canvas.Canvas, text: str, x: float, y: float, color: Color = SLATE) -> None:
    tracked_text(c, text.upper(), x, y, 8, color, 1.6)


def title(c: canvas.Canvas, text: str, x: float, y: float, size: float = 42, color: Color = INK, width: float | None = None) -> float:
    if "\n" in text:
        lines = text.split("\n")
    elif width is None:
        lines = [text]
    else:
        lines = wrap_lines(text, "Geist", size, width)
    for index, line in enumerate(lines):
        tracked_text(c, line, x, y - index * size * 1.08, size, color, -0.8)
    return y - len(lines) * size * 1.08


def page_header(c: canvas.Canvas, section: str, page: int, dark: bool = False) -> None:
    color = STEEL if dark else SLATE
    label(c, section, 48, 507, color)
    label(c, f"CVFUZZ / BRAND GUIDELINES / {page:02d}", 724, 507, color)


def footer_rule(c: canvas.Canvas, dark: bool = False) -> None:
    c.setStrokeColor(INK_3 if dark else MIST)
    c.setLineWidth(0.7)
    c.line(48, 32, 912, 32)


def rounded_panel(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill: Color, radius: float = 16, stroke: Color | None = None) -> None:
    c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(0.8)
        c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    else:
        c.roundRect(x, y, w, h, radius, fill=1, stroke=0)


def draw_logo(c: canvas.Canvas, x: float, y: float, width: float) -> tuple[float, float]:
    iw, ih = LOGO.getSize()
    height = width * ih / iw
    c.drawImage(LOGO, x, y, width, height, mask="auto")
    return width, height


def metric_card(c: canvas.Canvas, x: float, y: float, w: float, number: str, heading: str, body: str, dark: bool = False) -> None:
    fill = INK_2 if dark else WHITE
    border = INK_3 if dark else MIST
    rounded_panel(c, x, y, w, 148, fill, 14, border)
    tracked_text(c, number, x + 18, y + 112, 11, SIGNAL, 1.1)
    tracked_text(c, heading, x + 18, y + 79, 20, PAPER if dark else INK, -0.2)
    paragraph(c, body, x + 18, y + 56, w - 36, 9.5, 13.5, STEEL if dark else SLATE)


def status_mark(c: canvas.Canvas, x: float, y: float, ok: bool) -> None:
    color = SIGNAL if ok else RED
    c.setStrokeColor(color)
    c.setLineWidth(2.5)
    if ok:
        c.line(x, y + 5, x + 5, y)
        c.line(x + 5, y, x + 15, y + 12)
    else:
        c.line(x, y, x + 13, y + 13)
        c.line(x + 13, y, x, y + 13)


def page_01(c: canvas.Canvas) -> None:
    cover_image(c, COVER)
    c.setFillColor(INK)
    set_alpha(c, 0.78)
    c.rect(0, 0, 440, H, fill=1, stroke=0)
    reset_alpha(c)
    rounded_panel(c, 48, 408, 300, 82, PAPER, 10)
    draw_logo(c, 63, 422, 270)
    label(c, "Identity system / Version 1.0", 49, 369, SIGNAL)
    title(c, "Brand\nGuidelines", 48, 322, 52, PAPER)
    paragraph(c, "Precision under pressure. A visual and verbal system for turning model instability into clear, reproducible evidence.", 50, 179, 310, 15, 21, MIST)
    tracked_text(c, "AUGUST 2026", 50, 51, 9, STEEL, 1.7)


def page_02(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "01 / Brand idea", 2)
    label(c, "THE PREMISE", 48, 449, SLATE)
    title(c, "Find what breaks.", 48, 394, 57, INK)
    title(c, "Know exactly where.", 48, 331, 57, INK)
    c.setFillColor(SIGNAL)
    c.rect(50, 263, 156, 8, fill=1, stroke=0)
    paragraph(c, "CVFuzz searches for the smallest realistic transformation that destabilizes a computer-vision model. The brand makes that failure boundary visible, measured, and actionable.", 50, 222, 470, 15, 22, INK)
    rounded_panel(c, 627, 112, 285, 300, INK, 18)
    label(c, "BRAND PROMISE", 655, 373, SIGNAL)
    paragraph(c, "CVFuzz turns model instability into a measurable, reproducible boundary.", 655, 326, 220, 23, 30, PAPER)
    c.setStrokeColor(SIGNAL)
    c.setLineWidth(2)
    c.rect(675, 165, 115, 82, fill=0, stroke=1)
    for i in range(7):
        c.setFillColor(SIGNAL)
        set_alpha(c, 1 - i * 0.11)
        c.rect(790 + i * 10, 165 - i * 3, 7, 7, fill=1, stroke=0)
    reset_alpha(c)
    footer_rule(c)


def page_03(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "01 / Brand idea", 3, True)
    label(c, "BRAND CHARACTER", 48, 449, SIGNAL)
    title(c, "Rigorous, never rigid.", 48, 399, 44, PAPER)
    paragraph(c, "The system balances laboratory precision with the curiosity required to investigate unexpected failure.", 50, 351, 560, 13, 19, STEEL)
    cards = [
        ("01", "Precise", "Name the object, parameter, threshold, and evidence."),
        ("02", "Investigative", "Probe methodically. Let the result lead the story."),
        ("03", "Calm", "Report risk without fear, drama, or inflated claims."),
        ("04", "Transparent", "Separate observed instability from proven model error."),
    ]
    for i, item in enumerate(cards):
        metric_card(c, 48 + i * 216, 105, 198, *item, dark=True)
    footer_rule(c, True)


def page_04(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "02 / Logo", 4)
    label(c, "PRIMARY LOCKUP", 48, 446)
    title(c, "The master mark", 48, 397, 43, INK)
    paragraph(c, "The symbol expresses controlled visual instability. The wordmark restores balance and authority. Use them together as the primary signature.", 50, 354, 500, 12.5, 18, SLATE)
    rounded_panel(c, 48, 82, 864, 230, WHITE, 18, MIST)
    draw_logo(c, 115, 133, 730)
    label(c, "APPROVED MASTER / TRANSPARENT PNG / 2172 X 724", 612, 61, SLATE)
    footer_rule(c)


def page_05(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "02 / Logo", 5, True)
    label(c, "ANATOMY", 48, 447, SIGNAL)
    title(c, "Order meets disruption.", 48, 397, 43, PAPER)
    rounded_panel(c, 48, 104, 344, 224, PAPER, 16)
    contain_image(c, SYMBOL, 84, 130, 272, 170)
    rounded_panel(c, 414, 104, 498, 224, PAPER, 16)
    contain_image(c, WORDMARK, 451, 143, 424, 136)
    callouts = [
        ("01", "Detection frame", 48, "Computer-vision region of interest."),
        ("02", "Object target", 274, "The individual detection under test."),
        ("03", "Boundary trail", 500, "The smallest controlled break in stability."),
        ("04", "Stable wordmark", 726, "Weight and geometry restore confidence."),
    ]
    for num, head, x, body in callouts:
        tracked_text(c, num, x, 78, 8, SIGNAL, 1.2)
        tracked_text(c, head, x + 25, 78, 10, PAPER)
        paragraph(c, body, x + 25, 60, 180, 8, 11, STEEL)
    footer_rule(c, True)


def page_06(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "02 / Logo", 6)
    label(c, "CLEAR SPACE", 48, 447)
    title(c, "Give the signal room.", 48, 397, 43, INK)
    paragraph(c, "Define x as the height of the lime bar above the F. Keep at least 1x clear on every side; use 2x for covers and hero moments.", 50, 352, 460, 12, 18, SLATE)
    panel_x, panel_y, panel_w, panel_h = 95, 104, 770, 210
    rounded_panel(c, panel_x, panel_y, panel_w, panel_h, WHITE, 16, MIST)
    c.setStrokeColor(SIGNAL)
    c.setDash(4, 4)
    c.setLineWidth(1.1)
    c.rect(162, 137, 636, 143, fill=0, stroke=1)
    c.setDash()
    draw_logo(c, 207, 167, 546)
    c.setStrokeColor(SLATE)
    c.setLineWidth(0.8)
    c.line(162, 292, 207, 292)
    c.line(162, 286, 162, 299)
    c.line(207, 286, 207, 299)
    tracked_text(c, "1x", 179, 304, 8, SLATE)
    c.line(809, 137, 809, 167)
    c.line(803, 137, 816, 137)
    c.line(803, 167, 816, 167)
    tracked_text(c, "1x", 822, 149, 8, SLATE)
    label(c, "DASHED LINE = PROTECTED CLEAR SPACE", 674, 79, SLATE)
    footer_rule(c)


def page_07(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "02 / Logo", 7, True)
    label(c, "SCALE", 48, 447, SIGNAL)
    title(c, "Stay legible at speed.", 48, 397, 43, PAPER)
    rows = [(420, 286, "420 PX / HERO"), (280, 188, "280 PX / DOCUMENTATION"), (180, 105, "180 PX / DIGITAL MINIMUM")]
    for width, y, note in rows:
        plate_w = width + 40
        plate_h = max(62, width * 724 / 2172 + 18)
        rounded_panel(c, 48, y, plate_w, plate_h, PAPER, 9)
        draw_logo(c, 68, y + 9, width)
        label(c, note, 74 + plate_w, y + plate_h / 2 - 1, STEEL)
    paragraph(c, "Below 180 px, use the name as live text until an approved symbol-only asset exists. Never crop the master mark as a shortcut.", 655, 140, 250, 11, 16, STEEL)
    footer_rule(c, True)


def page_08(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "02 / Logo", 8)
    label(c, "BACKGROUND CONTROL", 48, 447)
    title(c, "Contrast without compromise.", 48, 397, 43, INK)
    panels = [
        (48, 105, WHITE, True, "WHITE", "Primary"),
        (270, 105, PAPER, True, "PAPER", "Preferred neutral"),
        (492, 105, INK, False, "DARK", "Reverse asset required"),
        (714, 105, HexColor("#7C8997"), False, "BUSY IMAGE", "Use a light panel"),
    ]
    for x, y, fill, ok, head, note in panels:
        rounded_panel(c, x, y, 198, 218, fill, 14, MIST if ok else None)
        if ok:
            draw_logo(c, x + 20, y + 112, 158)
        else:
            c.setStrokeColor(Color(1, 1, 1, alpha=0.16))
            c.setLineWidth(1)
            for n in range(0, 210, 18):
                c.line(x, y + n, x + 198, y + n - 45)
            c.setStrokeColor(RED)
            c.setLineWidth(3)
            c.line(x + 36, y + 70, x + 162, y + 196)
        status_mark(c, x + 18, y + 27, ok)
        tracked_text(c, head, x + 44, y + 30, 10, INK if ok else PAPER, 0.5)
        tracked_text(c, note, x + 18, y - 22, 8, SLATE)
    footer_rule(c)


def page_09(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "02 / Logo", 9, True)
    label(c, "MISUSE", 48, 447, SIGNAL)
    title(c, "Do not dilute the idea.", 48, 397, 43, PAPER)
    items = [
        "Stretch or rotate",
        "Change brand colors",
        "Add glow or shadows",
        "Create extra glitch",
        "Place inside a badge",
        "Retype the wordmark",
    ]
    for i, item in enumerate(items):
        col, row = i % 3, i // 3
        x, y = 48 + col * 288, 238 - row * 133
        rounded_panel(c, x, y, 264, 106, INK_2, 12, INK_3)
        c.setStrokeColor(RED)
        c.setLineWidth(2)
        c.circle(x + 31, y + 53, 15, fill=0, stroke=1)
        c.line(x + 20, y + 42, x + 42, y + 64)
        tracked_text(c, f"0{i + 1}", x + 63, y + 66, 8, SIGNAL, 1)
        tracked_text(c, item, x + 63, y + 42, 13, PAPER)
        tracked_text(c, "Protect recognition and intent.", x + 63, y + 23, 8, STEEL)
    footer_rule(c, True)


def page_10(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "03 / Color", 10)
    label(c, "CORE PALETTE", 48, 447)
    title(c, "Color is signal.", 48, 397, 45, INK)
    swatches = [
        (INK, "CVFUZZ INK", "#0B0E12", "PRIMARY"),
        (SIGNAL, "SIGNAL LIME", "#D7FA03", "ACCENT"),
        (PAPER, "CVFUZZ PAPER", "#F7F9F2", "SURFACE"),
        (MIST, "MIST", "#E7ECE3", "STRUCTURE"),
        (SLATE, "SLATE", "#69737F", "SECONDARY"),
    ]
    widths = [250, 190, 160, 132, 132]
    x = 48
    for (color, name, hexcode, role), width in zip(swatches, widths):
        rounded_panel(c, x, 112, width - 12, 205, color, 12, MIST if color == PAPER else None)
        text_color = PAPER if color in (INK, SLATE) else INK
        label(c, role, x + 16, 286, text_color)
        tracked_text(c, name, x + 16, 157, 12, text_color)
        tracked_text(c, hexcode, x + 16, 134, 9, text_color, 1)
        x += width
    paragraph(c, "Use Signal Lime at 10% or less. Its power comes from scarcity: focus, boundary, selected object, or a short data highlight.", 50, 82, 730, 10.5, 15, SLATE)
    footer_rule(c)


def page_11(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "03 / Color", 11, True)
    label(c, "ACCESSIBILITY", 48, 447, SIGNAL)
    title(c, "Contrast with intent.", 48, 397, 43, PAPER)
    combos = [
        (PAPER, INK, "18.22:1", "AAA", "Ink on Paper"),
        (SIGNAL, INK, "16.18:1", "AAA", "Ink on Signal"),
        (WHITE, INK, "19.34:1", "AAA", "Ink on White"),
        (WHITE, SIGNAL, "1.20:1", "FAIL", "Signal on White"),
    ]
    for i, (bg, fg, ratio, grade, name) in enumerate(combos):
        x = 48 + i * 216
        rounded_panel(c, x, 136, 198, 190, bg, 14)
        tracked_text(c, "Aa", x + 20, 239, 49, fg, -1)
        tracked_text(c, ratio, x + 21, 198, 15, fg)
        tracked_text(c, grade, x + 21, 166, 8, fg, 1.3)
        tracked_text(c, name, x, 112, 9, STEEL)
    paragraph(c, "Never use Signal Lime as small text on white. Never make color the only carrier of state; pair it with a label, icon, shape, or pattern.", 48, 72, 720, 11, 16, STEEL)
    footer_rule(c, True)


def page_12(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "04 / Typography", 12)
    label(c, "PRIMARY TYPEFACE / GEIST SANS", 48, 447)
    tracked_text(c, "Precision", 45, 351, 88, INK, -2.4)
    tracked_text(c, "under pressure.", 47, 266, 88, INK, -2.4)
    c.setFillColor(SIGNAL)
    c.rect(52, 217, 210, 9, fill=1, stroke=0)
    paragraph(c, "Geist Sans is direct, compact, and contemporary. It carries brand headlines, interface language, reports, and long-form explanation.", 50, 172, 510, 14, 20, SLATE)
    label(c, "REGULAR / MEDIUM / SEMIBOLD", 666, 181, SLATE)
    tracked_text(c, "Aa 01", 670, 126, 42, INK)
    label(c, "SENTENCE CASE BY DEFAULT", 670, 93, SLATE)
    footer_rule(c)


def page_13(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "04 / Typography", 13, True)
    label(c, "TECHNICAL TYPEFACE / GEIST MONO", 48, 447, SIGNAL)
    title(c, "Evidence has a voice.", 48, 397, 43, PAPER)
    rounded_panel(c, 48, 155, 864, 170, INK_2, 14, INK_3)
    code_lines = [
        ("$ cvfuzz run yolo11n.pt street.mp4", PAPER),
        ("transform     motion_blur", STEEL),
        ("object        bicycle #04", STEEL),
        ("boundary      kernel_size = 11 px", SIGNAL),
        ("status        confidence_collapse", PAPER),
    ]
    y = 287
    for line, color in code_lines:
        tracked_text(c, line, 76, y, 13, color, 0.2, "Courier")
        y -= 27
    paragraph(c, "Use the mono channel for commands, model identifiers, parameters, seeds, thresholds, and reproducibility metadata. Never set narrative paragraphs entirely in monospace.", 48, 103, 760, 10.5, 15, STEEL)
    footer_rule(c, True)


def page_14(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "05 / Voice", 14)
    label(c, "VERBAL IDENTITY", 48, 447)
    title(c, "Say what happened.", 48, 397, 43, INK)
    title(c, "Then prove it.", 48, 350, 43, INK)
    rounded_panel(c, 48, 101, 534, 190, WHITE, 14, MIST)
    label(c, "PREFERRED PATTERN", 72, 258, SLATE)
    tracked_text(c, "Observation", 72, 218, 20, INK)
    tracked_text(c, "->", 202, 219, 18, SIGNAL)
    tracked_text(c, "Boundary", 245, 218, 20, INK)
    tracked_text(c, "->", 350, 219, 18, SIGNAL)
    tracked_text(c, "Reproduction", 393, 218, 20, INK)
    paragraph(c, "The bicycle detection fails at a motion-blur kernel of 11 px. Reproduce it with the saved configuration and seed.", 72, 174, 470, 12, 18, SLATE)
    rounded_panel(c, 610, 101, 302, 190, INK, 14)
    label(c, "USE", 636, 258, SIGNAL)
    paragraph(c, "Probe. Boundary. Evidence. Reproduce. Compare. Stability. Minimum breaking change.", 636, 224, 240, 14, 21, PAPER)
    label(c, "AVOID", 636, 150, RED)
    paragraph(c, "Unbreakable. AI-proof. Perfect. Guaranteed. Smartest.", 636, 128, 240, 10, 15, STEEL)
    footer_rule(c)


def page_15(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "06 / Graphic language", 15, True)
    label(c, "VISUAL GRAMMAR", 48, 447, SIGNAL)
    title(c, "One deliberate break.", 48, 397, 43, PAPER)
    c.setStrokeColor(Color(1, 1, 1, alpha=0.08))
    c.setLineWidth(0.6)
    for x in range(48, 913, 24):
        c.line(x, 85, x, 330)
    for y in range(90, 331, 24):
        c.line(48, y, 912, y)
    c.setStrokeColor(SIGNAL)
    c.setLineWidth(3)
    c.line(185, 165, 185, 285)
    c.line(185, 285, 510, 285)
    c.line(510, 285, 510, 198)
    c.line(510, 165, 392, 165)
    c.line(345, 165, 185, 165)
    for i in range(10):
        size = max(3, 10 - i * 0.65)
        c.setFillColor(SIGNAL)
        set_alpha(c, max(0.15, 1 - i * 0.08))
        c.rect(510 + i * 18, 165 - i * 7, size, size, fill=1, stroke=0)
    reset_alpha(c)
    tracked_text(c, "FRAME", 180, 128, 8, STEEL, 1.2)
    tracked_text(c, "BOUNDARY", 500, 128, 8, SIGNAL, 1.2)
    rounded_panel(c, 704, 145, 184, 148, INK_2, 12, INK_3)
    label(c, "SYSTEM RULE", 725, 261, SIGNAL)
    paragraph(c, "Keep the field orderly. Introduce one precise offset, fracture, scan, or trail. Never decorate with random glitch.", 725, 226, 143, 11, 16, PAPER)
    footer_rule(c, True)


def page_16(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "07 / Imagery", 16)
    label(c, "ART DIRECTION", 48, 447)
    title(c, "Evidence, made cinematic.", 48, 397, 43, INK)
    cover_image(c, COVER, 48, 107, 414, 220)
    cover_image(c, MOCKUP, 486, 107, 426, 220)
    label(c, "ABSTRACT BOUNDARY", 48, 87, SLATE)
    label(c, "PRODUCT IN CONTEXT", 486, 87, SLATE)
    paragraph(c, "Deep blacks, realistic transformation artifacts, authentic model outputs, restrained overlays, and a single signal-lime focal point.", 48, 63, 760, 10, 14, SLATE)
    footer_rule(c)


def page_17(c: canvas.Canvas) -> None:
    cover_image(c, MOCKUP)
    c.setFillColor(INK)
    set_alpha(c, 0.82)
    c.rect(0, 0, 383, H, fill=1, stroke=0)
    reset_alpha(c)
    label(c, "APPLICATION / PLATFORM", 48, 448, SIGNAL)
    title(c, "The interface\nis the evidence.", 48, 398, 42, PAPER)
    paragraph(c, "Frames, detections, parameter sweeps, and failure boundaries should carry the visual identity. The logo appears once; the work stays central.", 50, 276, 275, 13, 19, MIST)
    rounded_panel(c, 48, 112, 278, 78, PAPER, 9)
    draw_logo(c, 62, 125, 250)
    tracked_text(c, "CONCEPTUAL APPLICATION MOCKUP", 49, 81, 8, STEEL, 1.1)
    tracked_text(c, "17", 905, 32, 8, PAPER, 1.2)


def page_18(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "08 / Product system", 18)
    label(c, "BRAND -> DESIGN SYSTEM", 48, 447)
    title(c, "Build from stable DNA.", 48, 397, 43, INK)
    stages = [
        ("01", "Brand DNA", "Purpose\nLogo\nColor\nVoice"),
        ("02", "Tokens", "Type\nSpace\nSurface\nMotion"),
        ("03", "Components", "Controls\nNavigation\nData\nStates"),
        ("04", "Platform", "Runs\nReports\nCompare\nShare"),
    ]
    for i, (num, head, body) in enumerate(stages):
        x = 48 + i * 216
        rounded_panel(c, x, 128, 190, 202, WHITE if i < 3 else INK, 14, MIST if i < 3 else None)
        tracked_text(c, num, x + 18, 299, 8, SIGNAL, 1.1)
        tracked_text(c, head, x + 18, 265, 18, PAPER if i == 3 else INK)
        for line_index, line in enumerate(body.split("\n")):
            tracked_text(c, line, x + 18, 225 - line_index * 26, 11, STEEL if i == 3 else SLATE)
        if i < 3:
            tracked_text(c, "->", x + 194, 223, 18, SIGNAL)
    paragraph(c, "Semantic states and data colors remain independent from brand color. Signal Lime may guide focus, but it cannot mean success, warning, error, and information at the same time.", 48, 89, 790, 10.5, 15, SLATE)
    footer_rule(c)


def page_19(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "09 / Evolution", 19, True)
    label(c, "ASSET ROADMAP", 48, 447, SIGNAL)
    title(c, "Grow one system, not many.", 48, 397, 43, PAPER)
    phases = [
        ("NOW", "Foundation", "Master lockup\nBrand book\nCore palette\nVoice"),
        ("NEXT", "Production set", "Vector master\nReverse mark\nMonochrome\nSymbol + favicon"),
        ("LATER", "Product system", "UI tokens\nComponents\nData palette\nMotion language"),
    ]
    for i, (tag, head, body) in enumerate(phases):
        x = 48 + i * 288
        c.setStrokeColor(SIGNAL if i == 0 else INK_3)
        c.setLineWidth(2 if i == 0 else 1)
        c.line(x, 305, x + 240, 305)
        label(c, tag, x, 327, SIGNAL if i == 0 else STEEL)
        tracked_text(c, head, x, 266, 22, PAPER)
        for j, line in enumerate(body.split("\n")):
            tracked_text(c, f"0{j + 1}", x, 222 - j * 33, 8, SIGNAL, 1)
            tracked_text(c, line, x + 30, 221 - j * 33, 11, STEEL)
        if i < 2:
            tracked_text(c, "->", x + 252, 298, 16, SIGNAL)
    paragraph(c, "Do not auto-trace the PNG and call it final. Production variants must be redrawn cleanly and approved as one coordinated family.", 48, 69, 720, 10.5, 15, STEEL)
    footer_rule(c, True)


def page_20(c: canvas.Canvas) -> None:
    cover_image(c, COVER)
    c.setFillColor(INK)
    set_alpha(c, 0.42)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    reset_alpha(c)
    rounded_panel(c, 48, 374, 304, 86, PAPER, 10)
    draw_logo(c, 64, 389, 272)
    label(c, "BRAND ESSENCE", 49, 338, SIGNAL)
    title(c, "Controlled distortion.", 48, 292, 40, PAPER)
    title(c, "Clear evidence.", 48, 247, 40, PAPER)
    paragraph(c, "Find what breaks. Know exactly where. Make every result reproducible.", 50, 185, 320, 14, 21, MIST)
    tracked_text(c, "CVFUZZ BRAND GUIDELINES / VERSION 1.0 / AUGUST 2026", 49, 50, 8, STEEL, 1.1)


PAGES = [
    page_01,
    page_02,
    page_03,
    page_04,
    page_05,
    page_06,
    page_07,
    page_08,
    page_09,
    page_10,
    page_11,
    page_12,
    page_13,
    page_14,
    page_15,
    page_16,
    page_17,
    page_18,
    page_19,
    page_20,
]


def build() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=(W, H), pageCompression=1)
    c.setTitle("CVFuzz Brand Guidelines")
    c.setAuthor("CVFuzz")
    c.setSubject("Brand identity, logo, color, typography, voice, imagery, and product-system foundations")
    c.setCreator("CVFuzz Brand System")
    for page in PAGES:
        page(c)
        c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
