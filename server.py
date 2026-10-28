#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10"]
# ///
"""Render the kindle-ai-usage /api/usage snapshot as a 600x800 grayscale PNG for a Kindle."""

import json
import math
import os
import time
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

PORT = int(os.environ.get("PORT", "8788"))
USAGE_URL = os.environ.get("USAGE_URL", "http://127.0.0.1:8787/api/usage")
TZ = ZoneInfo(os.environ.get("DISPLAY_TZ", "America/Sao_Paulo"))
FONT_DIR = os.environ.get("FONT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"))

W, H = 600, 800
S = 2  # supersampling factor, downscaled at the end for smooth e-ink edges


def font(size, bold=False):
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size * S)


F_TITLE, F_CLOCK = font(28, True), font(22, True)
F_CARD = font(26, True)
F_ROWLBL, F_ROWVAL = font(30, True), font(26, True)
F_SM, F_SMB = font(17), font(17, True)
F_MSG = font(20, True)

STATUS_MSG = {
    "not_authenticated": ("Não autenticado", "faça login no container kindle-ai-usage"),
    "auth_expired": ("Login expirado", "faça login de novo no container"),
    "unavailable": ("Serviço indisponível", "tentando novamente"),
}


def parse_ts(iso):
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def fetch_usage():
    with urllib.request.urlopen(USAGE_URL, timeout=10) as r:
        return json.loads(r.read())


# ---------- render ----------

DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


SEGMENTS = 10


def short_dur(seconds):
    """Compact countdown like the taskbar widget: 2h, 4d, 35m."""
    s = max(0, int(seconds))
    if s >= 86400:
        return f"{round(s / 86400)}d"
    if s >= 3600:
        return f"{round(s / 3600)}h"
    return f"{max(1, s // 60)}m"


def row(d, x0, x1, y, win, label):
    """Taskbar-widget style row: label, 10 segmented blocks filled by usage, "NN% · 2h", reset time below."""
    pct = max(0.0, min(100.0, float(win.get("usedPercent") or 0)))
    reset = parse_ts(win.get("resetsAt"))
    left = reset - time.time() if reset else None

    seg_h = 46 * S
    d.text((x0, y + seg_h / 2), label, font=F_ROWLBL, fill=0, anchor="lm")
    tail = f"{pct:.0f}% · {short_dur(left)}" if left is not None else f"{pct:.0f}%"
    d.text((x1, y + seg_h / 2), tail, font=F_ROWVAL, fill=0, anchor="rm")

    bx0 = x0 + 62 * S
    bx1 = x1 - d.textlength("100% · 99h", font=F_ROWVAL) - 14 * S
    gap = 6 * S
    seg_w = (bx1 - bx0 - gap * (SEGMENTS - 1)) / SEGMENTS
    filled = pct / 100 * SEGMENTS
    # Block-shaped mask so a partially filled block is cut straight but keeps its rounded corners.
    mask = Image.new("L", (math.ceil(seg_w), seg_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, mask.width - 1, seg_h - 1), 6 * S, fill=255)
    for i in range(SEGMENTS):
        sx = bx0 + i * (seg_w + gap)
        d.rounded_rectangle((sx, y, sx + seg_w, y + seg_h), 6 * S, fill=215)
        part = max(0.0, min(1.0, filled - i))
        if part > 0:
            # Anything above 0 shows at least a visible sliver.
            w = max(round(seg_w * part), 8 * S)
            d.bitmap((round(sx), y), mask.crop((0, 0, w, seg_h)), fill=0)

    if reset:
        dt = datetime.fromtimestamp(reset, TZ)
        days = (dt.date() - datetime.now(TZ).date()).days
        day = "hoje" if days == 0 else "amanhã" if days == 1 else DIAS[dt.weekday()]
        when = f"{day} {dt:%H:%M}"
        d.text((bx0, y + seg_h + 10 * S), f"reseta {when}", font=F_SM, fill=70)
        if pct >= 90:
            d.text((bx1, y + seg_h + 10 * S), "LIMITE PRÓXIMO", font=F_SMB, fill=0, anchor="ra")


def card(d, top, name, p):
    x0, x1 = 20 * S, (W - 20) * S
    bottom = top + 322 * S
    d.rounded_rectangle((x0, top, x1, bottom), 18 * S, outline=0, width=3 * S)
    d.text((x0 + 22 * S, top + 16 * S), name, font=F_CARD, fill=0)

    if not p or not p.get("available"):
        title, hint = STATUS_MSG.get((p or {}).get("status"), STATUS_MSG["unavailable"])
        mid = (x0 + x1) / 2
        d.text((mid, top + 150 * S), title, font=F_MSG, fill=0, anchor="mm")
        d.text((mid, top + 182 * S), hint, font=F_SM, fill=90, anchor="mm")
        return

    rx0, rx1 = x0 + 22 * S, x1 - 22 * S
    for i, (key, label) in enumerate((("fiveHour", "5h"), ("weekly", "7d"))):
        y = top + 82 * S + i * 116 * S
        win = p.get(key)
        if win:
            row(d, rx0, rx1, y, win, label)
        else:
            d.text((rx0, y), f"{label}: sem dados", font=F_ROWLBL, fill=120)


# (timestamp, level) samples since the Kindle was last unplugged, to estimate drain rate.
_battery = []


def battery_estimate(level, charging):
    """Hours left at the drain rate observed while unplugged; None until there's enough history."""
    now = time.time()
    if charging or (_battery and level > _battery[-1][1]):
        _battery.clear()
    if not charging:
        _battery.append((now, level))
        del _battery[:-500]
    if len(_battery) < 2:
        return None
    (t0, l0), (t1, l1) = _battery[0], _battery[-1]
    hours, drop = (t1 - t0) / 3600, l0 - l1
    if hours < 0.5 or drop < 2:
        return None
    return level / (drop / hours)


def draw_battery(d, x, y, level, charging):
    """Battery icon + "78%" (+ "carregando" or "~20h restantes") at the bottom-left."""
    bw, bh = 34 * S, 17 * S
    d.rounded_rectangle((x, y, x + bw, y + bh), 3 * S, outline=0, width=2 * S)
    d.rectangle((x + bw, y + 5 * S, x + bw + 3 * S, y + bh - 5 * S), fill=0)
    fill_w = (bw - 6 * S) * max(0, min(100, level)) / 100
    if fill_w > 0:
        d.rectangle((x + 3 * S, y + 3 * S, x + 3 * S + fill_w, y + bh - 3 * S), fill=0)
    if charging:
        cx, cy = x + bw / 2, y + bh / 2
        d.polygon([(cx + 2 * S, cy - 7 * S), (cx - 5 * S, cy + 1 * S), (cx, cy + 1 * S), (cx - 2 * S, cy + 7 * S),
                   (cx + 5 * S, cy - 1 * S), (cx, cy - 1 * S)], fill=255 if level > 55 else 0)
    label = f"{level}%"
    if charging:
        label += " · carregando"
    else:
        left = battery_estimate(level, charging)
        if left is not None:
            label += f" · ~{left:.0f}h restantes" if left >= 1 else " · <1h restante"
    d.text((x + bw + 10 * S, y + bh / 2), label, font=F_SMB if level <= 15 and not charging else F_SM, fill=0,
           anchor="lm")


def render(battery=None, charging=False):
    img = Image.new("L", (W * S, H * S), 255)
    d = ImageDraw.Draw(img)
    now = datetime.now(TZ)

    d.text((22 * S, 18 * S), "Limites de IA", font=F_TITLE, fill=0)
    d.text(((W - 22) * S, 22 * S), f"{DIAS[now.weekday()]} {now:%H:%M}", font=F_CLOCK, fill=0, anchor="ra")

    try:
        snap, err = fetch_usage(), None
    except Exception as e:
        snap, err = {}, str(e)
    card(d, 62 * S, "Claude", snap.get("claude"))
    card(d, 400 * S, "Codex", snap.get("codex"))

    if err:
        foot = "dashboard indisponível no Beelink"
    else:
        upd = parse_ts(snap.get("updatedAt"))
        foot = f"atualizado {datetime.fromtimestamp(upd, TZ):%H:%M}" if upd else ""
        if snap.get("stale"):
            foot = "DADOS ANTIGOS · " + foot
    if battery is not None:
        if charging:
            battery_estimate(battery, True)
        draw_battery(d, 24 * S, (H - 54) * S, battery, charging)
        d.text(((W - 24) * S, (H - 38) * S), foot, font=F_SMB if err or snap.get("stale") else F_SM, fill=0,
               anchor="rs")
    else:
        d.text((W * S // 2, (H - 38) * S), foot, font=F_SMB if err or snap.get("stale") else F_SM, fill=0,
               anchor="ms")
    d.text((W * S // 2, (H - 14) * S), "toque na tela para sair", font=F_SM, fill=120, anchor="ms")

    out = img.resize((W, H), Image.LANCZOS)
    buf = BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "monitor-ia.sh")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/log":
            # Remote log lines from the Kindle script, so problems can be diagnosed without USB.
            print(f"{datetime.now(TZ):%d/%m %H:%M:%S} KINDLE {parse_qs(url.query).get('m', [''])[0]}", flush=True)
            self.send_response(204)
            self.end_headers()
            return
        if url.path == "/monitor-ia.sh":
            # The Kindle script downloads its newest version from here on every start.
            try:
                body = open(SCRIPT, "rb").read()
            except OSError:
                self.send_error(404)
                return
            ctype = "text/x-shellscript"
        elif url.path in ("/", "/kindle.png"):
            q = parse_qs(url.query)
            try:
                battery = int(q["bat"][0])
            except (KeyError, ValueError):
                battery = None
            body = render(battery, q.get("chg", ["0"])[0] in ("1", "true"))
            ctype = "image/png"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"{datetime.now(TZ):%d/%m %H:%M:%S} {self.client_address[0]} {fmt % args}", flush=True)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--once":
        open(sys.argv[2] if len(sys.argv) > 2 else "kindle.png", "wb").write(render(78, False))
    else:
        ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
