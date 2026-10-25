"""VDGS Slot Board – bridge between Microsoft Flight Simulator (2020/2024) and the iPad.

Runs on the simulator PC. It
  * reads position, altitude, speed, heading, radios and transponder through SimConnect,
  * serves the VDGS app in your home network, e.g. http://192.168.1.20:8770 (open that on the iPad),
  * lets the iPad tune COM1 and set the squawk.

The app is downloaded from GitHub Pages at start (latest version) and kept in ./app as a fallback
(installed .exe: %LOCALAPPDATA%\\VDGS-Bridge\\app). At start a page with a QR code opens on the PC:
scan it with the tablet or phone to open the app there.

Setup (once):   py -m pip install SimConnect qrcode
Start:          py vdgs_bridge.py            (options: --port 8770  --app-url https://.../  --no-browser  --test)

Only for flight simulation. Anyone in your home network can open the page and tune the radios.
"""
import argparse
import json
import math
import os
import re
import socket
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP_URL = "https://sbelic95.github.io/vdgs-slot-board/"
# the font files come from the url(...) entries in vendor/fonts.css (see update_app)
APP_FILES = ["index.html", "airports.json", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-512.png",
             "vendor/fonts.css", "vendor/leaflet.css", "vendor/leaflet.js"]
FROZEN = getattr(sys, "frozen", False)
# installed under Program Files (read-only): keep the downloaded app in the user's local app data
if FROZEN:
    APP_DIR = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "VDGS-Bridge", "app")
else:
    APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
# a copy of the app packed into the .exe, used when the first start has no internet
BUNDLED = os.path.join(getattr(sys, "_MEIPASS", ""), "app") if FROZEN else None
# the user's own videos for the passenger screen (films, safety video); they never leave this PC and home network
MEDIA_DIR = os.path.join(os.path.expanduser("~"), "Videos", "VDGS")
VIDEO_EXT = (".mp4", ".m4v", ".mov", ".webm")

state = {"vdgsBridge": True, "sim": "MSFS", "connected": False, "error": "", "t": 0}
lock = threading.Lock()
sim = {"sm": None, "aq": None}


def update_app(url):
    """Fetch the current app from GitHub Pages; keep the old (or packed) copy if offline."""
    files = list(APP_FILES)
    for name in files:
        dest = os.path.join(APP_DIR, *name.split("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            with urllib.request.urlopen(url + name + "?bridge=" + str(int(time.time())), timeout=20) as r:
                data = r.read()
        except Exception as e:
            packed = os.path.join(BUNDLED, *name.split("/")) if BUNDLED else ""
            if not os.path.exists(dest) and packed and os.path.exists(packed):
                with open(packed, "rb") as f:
                    data = f.read()
                print(f"  {name}: offline, using the copy in the program")
            else:
                print(f"  could not update {name}: {e} (using the saved copy)")
                data = None
        if data is not None:
            with open(dest, "wb") as f:
                f.write(data)
        if name == "vendor/fonts.css" and os.path.exists(dest):  # then every font file it names
            with open(dest, encoding="utf-8") as f:
                files += ["vendor/" + u for u in sorted(set(re.findall(r"url\((fonts/[^)]+\.woff2)\)", f.read())))]
    if not os.path.exists(os.path.join(APP_DIR, "index.html")):
        print("No app files. Check the internet connection and start again.")
        input("Press Enter to close.")  # keep the window open when started by double-click
        sys.exit(1)


def connect():
    """Connect to the simulator; retries until MSFS is running."""
    from SimConnect import AircraftRequests, SimConnect  # imported here so the server starts even without it
    sm = SimConnect()
    sim["sm"], sim["aq"] = sm, AircraftRequests(sm, _time=200)


def read_loop():
    """Read the aircraft once a second into `state`."""
    while True:
        try:
            if sim["sm"] is None:
                connect()
                print("SimConnect: connected to Microsoft Flight Simulator")
            aq = sim["aq"]
            g = lambda k: aq.get(k)
            lat, lon = g("PLANE_LATITUDE"), g("PLANE_LONGITUDE")
            if lat is None or lon is None:
                raise RuntimeError("no data (main menu?)")
            hdg = g("PLANE_HEADING_DEGREES_TRUE")  # radians
            sq = g("TRANSPONDER_CODE:1")             # BCD, e.g. 0x7000
            title = g("TITLE")
            snap = {
                "lat": lat, "lon": lon,
                "alt": round(g("PLANE_ALTITUDE") or 0),
                "gs": round(g("GROUND_VELOCITY") or 0),
                "ias": round(g("AIRSPEED_INDICATED") or 0),
                "hdg": round(math.degrees(hdg) % 360) if hdg is not None else 0,
                "vs": round(g("VERTICAL_SPEED") or 0),
                "onGround": bool(g("SIM_ON_GROUND")),
                "com1": round(g("COM_ACTIVE_FREQUENCY:1") or 0, 3),
                "com1sb": round(g("COM_STANDBY_FREQUENCY:1") or 0, 3),
                "squawk": format(int(sq), "04x") if sq is not None else "",
                "title": title.decode(errors="ignore") if isinstance(title, bytes) else str(title or ""),
            }
            atc = g("ATC_ID")
            snap["atcId"] = atc.decode(errors="ignore") if isinstance(atc, bytes) else str(atc or "")
            # parking brake and pushback: the passenger screen starts the safety video when the push begins
            for key, var in (("parkingBrake", "BRAKE_PARKING_POSITION"), ("pushback", "PUSHBACK_STATE")):
                try:
                    v = g(var)
                except Exception:  # not offered by every simulator version
                    v = None
                snap[key] = None if v is None else (bool(v) if key == "parkingBrake" else int(v) != 3)  # state 3 = no pushback
            with lock:
                state.update(snap, connected=True, error="", t=time.time())
        except Exception as e:
            with lock:
                if state["connected"] or state["error"] != str(e):
                    print("SimConnect:", e, "– retrying")
                state.update(connected=False, error=str(e))
            if sim["sm"] is not None:
                try:
                    sim["sm"].exit()
                except Exception:
                    pass
            sim["sm"] = sim["aq"] = None
            time.sleep(4)
            continue
        time.sleep(1)


def test_loop():
    """--test: a pretend aircraft cruising towards Frankfurt, so the setup can be tried without MSFS."""
    lat, lon, hdg = 48.40, 11.05, 315.0
    with lock:
        state.update(com1=124.725, com1sb=121.800, squawk="1000", title="Test aircraft (no simulator)", atcId="TEST123")
    while True:
        d = 450 * 1.852 / 3600 / 111.2  # degrees per second at 450 kt
        lat += d * math.cos(math.radians(hdg))
        lon += d * math.sin(math.radians(hdg)) / math.cos(math.radians(lat))
        with lock:
            state.update(lat=lat, lon=lon, alt=35000, gs=450, ias=270, hdg=round(hdg), vs=0, onGround=False,
                         connected=True, error="", t=time.time())
        time.sleep(1)


def test_push_loop():
    """--test-push: at a Frankfurt gate, again and again: parked 40 s (brake set), then brake off and 40 s pushback."""
    with lock:
        state.update(com1=121.900, com1sb=121.955, squawk="2341", title="Test aircraft (pushback)", atcId="TEST123")
    lat0, lon0 = 50.0505, 8.5718
    while True:
        t = time.time() % 80
        push = t >= 40
        d = (t - 40) * 1.5 * 0.000005 if push else 0  # creeping backwards
        with lock:
            state.update(lat=lat0 - d, lon=lon0, alt=364, gs=2 if push else 0, ias=0, hdg=160, vs=0, onGround=True,
                         parkingBrake=not push, pushback=push, connected=True, error="", t=time.time())
        time.sleep(1)


def send_event(name, value):
    if TEST:  # pretend: change the values the app reads back
        with lock:
            if name == "COM_STBY_RADIO_SET_HZ":
                state["com1sb"] = value / 1e6
            elif name == "COM_RADIO_SET_HZ":
                state["com1"] = value / 1e6
            elif name == "XPNDR_SET":
                state["squawk"] = format(value, "04x")
        return
    from SimConnect import Event
    if sim["sm"] is None:
        raise RuntimeError("simulator not connected")
    Event(name.encode(), sim["sm"])(value)


TEST = False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    def log_message(self, *a):  # keep the console quiet
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/sim":
            with lock:
                return self._json(200, dict(state, age=round(time.time() - state["t"], 1) if state["t"] else None))
        if path == "/media/list":
            return self._json(200, {"files": media_files()})
        if path.startswith("/media/"):
            return self._media(urllib.parse.unquote(path[len("/media/"):]))
        if path == "/connect":
            body = connect_page("http://%s:%d/" % (lan_ip(), self.server.server_address[1])).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        return super().do_GET()

    def _media(self, name):
        """One video from MEDIA_DIR, with byte ranges (Safari on the iPad only plays videos served that way)."""
        if name != os.path.basename(name) or name not in media_files(names_only=True):
            return self._json(404, {"ok": False, "error": "no such video"})
        fp = os.path.join(MEDIA_DIR, name)
        size = os.path.getsize(fp)
        start, end = 0, size - 1
        rng = self.headers.get("Range", "")
        if rng.startswith("bytes="):
            a, _, b = rng[6:].split(",")[0].partition("-")
            try:
                if a:
                    start, end = int(a), int(b) if b else size - 1
                else:  # suffix range: the last N bytes
                    start = max(0, size - int(b))
            except ValueError:
                pass
            end = min(end, size - 1)
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        ext = os.path.splitext(name)[1].lower()
        self.send_header("Content-Type", {".webm": "video/webm", ".mov": "video/quicktime"}.get(ext, "video/mp4"))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        try:
            with open(fp, "rb") as f:
                f.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = f.read(min(256 * 1024, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (ConnectionError, OSError):  # the player often stops reading mid-file; that is normal
            pass

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(n) or b"{}")
            path = self.path.split("?")[0]
            if path == "/sim/com1":
                hz = int(round(float(data["mhz"]) * 1e6))
                if not 118_000_000 <= hz <= 136_990_000:
                    return self._json(400, {"ok": False, "error": "frequency out of range"})
                send_event("COM_RADIO_SET_HZ" if data.get("target") == "active" else "COM_STBY_RADIO_SET_HZ", hz)
                return self._json(200, {"ok": True})
            if path == "/sim/squawk":
                code = str(data["code"])
                if len(code) != 4 or any(c not in "01234567" for c in code):
                    return self._json(400, {"ok": False, "error": "squawk must be 4 digits 0-7"})
                send_event("XPNDR_SET", int(code, 16))  # BCD
                return self._json(200, {"ok": True})
            return self._json(404, {"ok": False, "error": "unknown"})
        except Exception as e:
            return self._json(500, {"ok": False, "error": str(e)})


def media_files(names_only=False):
    try:
        names = sorted(n for n in os.listdir(MEDIA_DIR) if n.lower().endswith(VIDEO_EXT) and os.path.isfile(os.path.join(MEDIA_DIR, n)))
    except OSError:
        names = []
    return names if names_only else [{"name": n, "size": os.path.getsize(os.path.join(MEDIA_DIR, n))} for n in names]


def qr_svg(text):
    """The address as a QR code (SVG), or "" if the qrcode package is missing."""
    try:
        import qrcode
        import qrcode.image.svg
    except ImportError:
        return ""
    img = qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=12, border=2)
    return img.to_string(encoding="unicode")


def connect_page(url):
    """Page shown on the PC at start: scan the code with the tablet or phone to open the app."""
    with lock:
        sim_line = ("Simulator connected" if state["connected"] else "Simulator not connected yet – start MSFS, the bridge keeps trying")
    return f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>VDGS Bridge</title>
<style>
body{{margin:0;background:#0b0f17;color:#e9eef7;font:16px/1.5 "Segoe UI",system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}}
.box{{max-width:560px;padding:32px;text-align:center}}
h1{{font-size:22px;letter-spacing:.08em;margin:0 0 4px;color:#ffd400}}
.qr{{background:#fff;border-radius:14px;padding:14px;display:inline-block;margin:18px 0}}
.qr svg{{width:280px;height:280px;display:block}}
.url{{font:600 26px/1.2 Consolas,monospace;color:#fff;word-break:break-all}}
p{{color:#aab4c3;margin:10px 0}} .s{{font-size:13px}}
a{{color:#7cc4ff}}
</style></head><body><div class="box">
<h1>VDGS BRIDGE</h1>
<p>Mit dem Tablet oder Handy im selben WLAN scannen · Scan with your tablet or phone on the same Wi-Fi</p>
<div class="qr">{qr_svg(url) or ""}</div>
<div class="url">{url}</div>
<p>Oder die Adresse im Browser eintippen. Auf dem iPad: Teilen → „Zum Home-Bildschirm“.<br>
Or type the address into the browser. On the iPad: Share → “Add to Home Screen”.</p>
<p class="s">{sim_line}. Dieses Fenster darf zu bleiben, die Bridge läuft im Konsolenfenster weiter.<br>
Funktioniert nicht? Windows-Firewall: Zugriff für private Netzwerke erlauben.</p>
<p class="s"><a href="/">App hier auf dem PC öffnen</a></p>
</div></body></html>"""


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.168.0.1", 9))  # no packet is sent; only picks the network interface
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--app-url", default=APP_URL)
    ap.add_argument("--app-dir", help="serve the app from this folder instead of downloading it")
    ap.add_argument("--test", action="store_true", help="no simulator: a pretend aircraft, to try the setup")
    ap.add_argument("--test-push", action="store_true", help="no simulator: an aircraft at the gate that pushes back every 80 s")
    ap.add_argument("--no-browser", action="store_true", help="do not open the connect page (QR code) on start")
    ap.add_argument("--media", help="folder with your videos for the passenger screen (default: Videos\\VDGS)")
    ap.add_argument("--open-media", action="store_true", help="open the video folder in Explorer and exit")
    args = ap.parse_args()
    global APP_DIR, TEST, MEDIA_DIR
    TEST = args.test or args.test_push
    if args.media:
        MEDIA_DIR = os.path.abspath(args.media)
    os.makedirs(MEDIA_DIR, exist_ok=True)
    if args.open_media:
        os.startfile(MEDIA_DIR)
        return

    if args.app_dir:
        APP_DIR = os.path.abspath(args.app_dir)
    else:
        print("VDGS bridge: loading the app …")
        update_app(args.app_url.rstrip("/") + "/")
    if TEST:
        state["sim"] = "TEST"
        print("Test mode: pretend aircraft, no simulator needed.")
    threading.Thread(target=test_push_loop if args.test_push else test_loop if TEST else read_loop, daemon=True).start()
    try:
        srv = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    except OSError as e:
        print(f"Port {args.port} is busy ({e}). Is the bridge already running?")
        input("Press Enter to close.")
        sys.exit(1)
    print()
    print("  Open on the iPad (same Wi-Fi):  http://%s:%d" % (lan_ip(), args.port))
    print("  QR code to scan:                http://localhost:%d/connect" % args.port)
    print("  Videos for the passenger screen: %s (%d files)" % (MEDIA_DIR, len(media_files(names_only=True))))
    print("  If Windows asks: allow access for private networks.")
    print("  Stop with Ctrl+C or close this window.")
    print()
    if not args.no_browser:
        webbrowser.open("http://localhost:%d/connect" % args.port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
