"""VDGS Slot Board – bridge between Microsoft Flight Simulator (2020/2024) and the iPad.

Runs on the simulator PC. It
  * reads position, altitude, speed, heading, radios and transponder through SimConnect,
  * serves the VDGS app in your home network, e.g. http://192.168.1.20:8770 (open that on the iPad),
  * lets the iPad tune COM1 and set the squawk,
  * reads GSX Pro (ground services) and can call them from the ASL Pad,
  * sees the Fenix A320 (its EFB and data on port 8083),
  * serves the ASL Pad at http://<this PC>:8770/pad/ - the pad then shows all of this live.

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
# the ASL Pad (crew tablet) served at /pad/: from GitHub Pages, with a copy for offline use
PAD_URL = "https://sbelic95.github.io/asl-pad/"
PAD_DIR = None
PAD_CACHE = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "VDGS-Bridge", "pad")
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
            for key, var, k in (("fuelKg", "FUEL_TOTAL_QUANTITY_WEIGHT", 0.45359237), ("weightKg", "TOTAL_WEIGHT", 0.45359237)):
                try:
                    v = g(var)
                    snap[key] = round(v * k) if v is not None else None  # pounds in SimConnect
                except Exception:
                    snap[key] = None
            atc = g("ATC_ID")
            snap["atcId"] = atc.decode(errors="ignore") if isinstance(atc, bytes) else str(atc or "")
            # parking brake and pushback: the passenger screen starts the safety video when the push begins
            for key, var in (("parkingBrake", "BRAKE_PARKING_POSITION"), ("pushback", "PUSHBACK_STATE")):
                try:
                    v = g(var)
                except Exception:  # not offered by every simulator version
                    v = None
                snap[key] = None if v is None else (bool(v) if key == "parkingBrake" else int(v) != 3)  # state 3 = no pushback
            gsx, fenix = read_gsx(), read_fenix()
            with lock:
                state.update(snap, gsx=gsx, fenix=fenix, connected=True, error="", t=time.time())
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
            state.update(lat=lat, lon=lon, alt=35000, gs=450, ias=270, hdg=round(hdg), vs=0, onGround=False, fuelKg=6200, weightKg=64100,
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


def test_ground_loop():
    """--test-gsx: an A320 at a Belgrade gate with GSX: services can be called from the pad and run by themselves."""
    with lock:
        state.update(com1=121.700, com1sb=118.100, squawk="2000", title="Test A320 (GSX turnaround)", atcId="ASL328", fenix=read_fenix())
    while True:
        test_gsx_tick()
        pushing = state["gsx"]["services"].get("pushback") == 5
        with lock:
            state.update(lat=44.8195, lon=20.2921, alt=335, gs=3 if pushing else 0, ias=0, hdg=120, vs=0, onGround=True,
                         parkingBrake=not pushing, pushback=pushing, fuelKg=2400 + 300 * test_gsx.get("_fuel", 0),
                         weightKg=46000 + 85 * test_gsx["paxBoarded"], connected=True, error="", t=time.time())
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


# ---------- GSX Pro (FSDreamTeam): ground services, read and called through its L: variables ----------
# Since MSFS SU12 SimConnect reads L: variables directly. Names, states and menu numbers as used by the open-source
# Fenix2GSX (github.com/Fragtality/Fenix2GSX). Service state: 1 callable, 2 not available, 3 bypassed, 4 requested,
# 5 active, 6 completed, 7 completing. GSX writes its current menu as text into html_ui\...\FSDT_GSX_Panel\menu.
GSX_STATES = {"deboarding": "FSDT_GSX_DEBOARDING_STATE", "catering": "FSDT_GSX_CATERING_STATE", "refuel": "FSDT_GSX_REFUELING_STATE",
              "boarding": "FSDT_GSX_BOARDING_STATE", "pushback": "FSDT_GSX_DEPARTURE_STATE", "jetway": "FSDT_GSX_JETWAY",
              "stairs": "FSDT_GSX_STAIRS", "gpu": "FSDT_GSX_GPU_STATE", "deice": "FSDT_GSX_DEICE_STATE",
              "lavatory": "FSDT_GSX_LAVATORY_STATE", "water": "FSDT_GSX_WATER_STATE", "cleaning": "FSDT_GSX_CLEANING_STATE"}
GSX_VALUES = {"running": "FSDT_GSX_COUATL_STARTED", "paxTarget": "FSDT_GSX_NUMPASSENGERS", "paxBoarded": "FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL",
              "paxDeboarded": "FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL", "cargoBoard": "FSDT_GSX_BOARDING_CARGO_PERCENT",
              "cargoDeboard": "FSDT_GSX_DEBOARDING_CARGO_PERCENT", "fuelHose": "FSDT_GSX_FUELHOSE_CONNECTED",
              "pushStatus": "FSDT_GSX_PUSHBACK_STATUS", "menuOpen": "FSDT_GSX_MENU_OPEN"}
# main GSX menu ("Activate Services at …") and the sub menu 8 "Activate Ground Services"
GSX_MENU = {"deboarding": [1], "catering": [2], "refuel": [3], "boarding": [4], "pushback": [5], "jetway": [6], "stairs": [7],
            "gpu": [8, 1], "deice": [8, 2], "lavatory": [8, 3], "water": [8, 4], "cleaning": [8, 5]}
lvars = {}


def lvar(name, settable=False):
    """A SimConnect request for an L: variable (cached per connection)."""
    r = lvars.get(name)
    if r is None or r.sm is not sim["sm"]:
        from SimConnect.RequestList import Request
        r = lvars[name] = Request((("L:" + name).encode(), b"Number"), sim["sm"], _time=400, _settable=True)
    return r


def gsx_menu_file():
    """GSX writes the menu on screen into this text file (root folder from the registry, as Fenix2GSX does)."""
    root = r"C:\Program Files (x86)\Addon Manager"
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"SOFTWARE\FSDreamTeam") as k:
            root = winreg.QueryValueEx(k, "root")[0] or root
    except Exception:
        pass
    return os.path.join(root, "MSFS", "fsdreamteam-gsx-pro", "html_ui", "InGamePanels", "FSDT_GSX_Panel", "menu")


def gsx_menu_lines():
    try:
        with open(gsx_menu_file(), encoding="utf-8", errors="ignore") as f:
            return [x.strip() for x in f.read().splitlines() if x.strip()][:16]
    except OSError:
        return []


def read_gsx():
    """GSX state for the pad; {"running": False} when GSX (Couatl) is not running."""
    try:
        running = lvar(GSX_VALUES["running"]).value
    except Exception:
        running = None
    if not running:
        return {"running": False}
    out = {"running": True, "services": {}}
    for k, v in GSX_STATES.items():
        try:
            out["services"][k] = int(lvar(v).value or 0)
        except Exception:
            out["services"][k] = 0
    for k, v in GSX_VALUES.items():
        if k == "running":
            continue
        try:
            out[k] = round(lvar(v).value or 0)
        except Exception:
            out[k] = None
    out["menu"] = gsx_menu_lines() if out.get("menuOpen") else []
    return out


def gsx_choose(steps):
    """Open the GSX menu and pick the entries in `steps` (1-based, like the menu shows them)."""
    if TEST:
        return test_gsx_call(steps)
    if sim["sm"] is None:
        raise RuntimeError("simulator not connected")
    lvar(GSX_VALUES["menuOpen"]).value = 1
    time.sleep(1.2)
    for n in steps:
        lvar("FSDT_GSX_MENU_CHOICE").value = int(n) - 1
        time.sleep(1.2)


# ---------- Fenix A320/A319/A321: the Fenix app on this PC serves its EFB and a GraphQL API on port 8083 ----------
# The EFB itself can be opened on the tablet (http://<this PC>:8083). Data: query { dataRef(name: "...") { value } }
# (used by Fenix2GSX). Fenix does not publish the names; the pad asks for the ones listed in FENIX_REFS and shows what answers.
FENIX = "http://localhost:8083"
FENIX_REFS = ["fenix.efb.simbriefPlanImported"]
fenix_cache = {"t": 0, "data": {"running": False}}


def fenix_query(names):
    q = " ".join(f'r{i}: dataRef(name: \\"{n}\\") {{ value }}' for i, n in enumerate(names))
    body = ('{"query":"query { ' + q + ' }","variables":{}}').encode()
    req = urllib.request.Request(FENIX + "/graphql", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=2) as r:
        d = json.loads(r.read() or b"{}").get("data") or {}
    return {n: (d.get(f"r{i}") or {}).get("value") for i, n in enumerate(names)}


def read_fenix():
    if TEST:
        return {"running": True, "efb": True, "refs": {"fenix.efb.simbriefPlanImported": True}, "test": True}
    if time.time() - fenix_cache["t"] < 3:
        return fenix_cache["data"]
    data = {"running": False}
    try:
        with urllib.request.urlopen(FENIX + "/", timeout=1.5) as r:
            data = {"running": True, "efb": r.status == 200}
        try:
            data["refs"] = fenix_query(FENIX_REFS)
        except Exception as e:
            data["refsError"] = str(e)[:120]
    except Exception:
        pass
    fenix_cache.update(t=time.time(), data=data)
    return data


# ---------- --test: GSX turnaround that runs by itself, so the pad can be tried without MSFS ----------
test_gsx = {"running": True, "services": {k: 1 for k in GSX_STATES}, "paxTarget": 132, "paxBoarded": 0, "paxDeboarded": 0,
            "cargoBoard": 0, "cargoDeboard": 0, "fuelHose": 0, "pushStatus": 0, "menuOpen": 0, "menu": []}
test_gsx["services"].update(deice=2, stairs=2)
TEST_ORDER = ["refuel", "catering", "boarding", "pushback"]


def test_gsx_call(steps):
    name = next((k for k, v in GSX_MENU.items() if v == list(steps)), None)
    with lock:
        if name and test_gsx["services"].get(name) == 1:
            test_gsx["services"][name] = 4
    return True


def test_gsx_tick():
    """Every second: requested services start, run a while and complete; boarding counts passengers."""
    with lock:
        s = test_gsx["services"]
        for k, v in s.items():
            if v == 4:
                s[k] = 5
            elif v == 5:
                if k == "boarding":
                    test_gsx["paxBoarded"] = min(test_gsx["paxTarget"], test_gsx["paxBoarded"] + 6)
                    test_gsx["cargoBoard"] = min(100, test_gsx["cargoBoard"] + 5)
                    if test_gsx["paxBoarded"] >= test_gsx["paxTarget"]:
                        s[k] = 6
                elif k == "refuel":
                    test_gsx["fuelHose"] = 1
                    test_gsx["_fuel"] = test_gsx.get("_fuel", 0) + 1
                    if test_gsx["_fuel"] > 15:
                        s[k], test_gsx["fuelHose"] = 6, 0
                else:
                    test_gsx["_t" + k] = test_gsx.get("_t" + k, 0) + 1
                    if test_gsx["_t" + k] > 10:
                        s[k] = 6
        state["gsx"] = {k: v for k, v in test_gsx.items() if not k.startswith("_")}


TEST = False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    def log_message(self, *a):  # keep the console quiet
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        if self.path.split("?")[0] in ("/sim", "/gsx/call", "/gsx/menu", "/fenix"):
            self.send_header("Access-Control-Allow-Origin", "*")  # the pad may also run from another address in the home network
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

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
        if path == "/fenix":
            return self._json(200, read_fenix())
        if path == "/pad" or path.startswith("/pad/"):
            return self._pad(path[len("/pad"):] or "/")
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

    def _pad(self, sub):
        """The ASL Pad, served from this PC so it can reach the bridge in the home network (a https page may not).
        From --pad-dir when given (testing), otherwise fetched from GitHub Pages and kept as an offline copy."""
        if sub == "/":
            sub = "/index.html"
        rel = os.path.normpath(urllib.parse.unquote(sub).lstrip("/"))
        if rel.startswith("..") or os.path.isabs(rel):
            return self._json(404, {"ok": False})
        data = None
        if PAD_DIR:
            fp = os.path.join(PAD_DIR, rel)
            if os.path.isfile(fp):
                with open(fp, "rb") as f:
                    data = f.read()
        else:
            cache = os.path.join(PAD_CACHE, rel)
            try:
                with urllib.request.urlopen(PAD_URL + rel.replace(os.sep, "/") + "?bridge=" + str(int(time.time() // 300)), timeout=8) as r:
                    data = r.read()
                os.makedirs(os.path.dirname(cache), exist_ok=True)
                with open(cache, "wb") as f:
                    f.write(data)
            except Exception:
                if os.path.isfile(cache):
                    with open(cache, "rb") as f:
                        data = f.read()
        if data is None:
            return self._json(404, {"ok": False, "error": "not found"})
        types = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
                 ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"}
        self.send_response(200)
        self.send_header("Content-Type", types.get(os.path.splitext(rel)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

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
            if path == "/gsx/call":  # call a ground service: {"service": "boarding"}
                steps = GSX_MENU.get(str(data.get("service")))
                if not steps:
                    return self._json(400, {"ok": False, "error": "unknown service"})
                threading.Thread(target=gsx_choose, args=(steps,), daemon=True).start()
                return self._json(200, {"ok": True})
            if path == "/gsx/menu":  # answer the open GSX menu: {"choice": 2} (1-based) or {"open": true}
                if data.get("open"):
                    threading.Thread(target=gsx_choose, args=([],), daemon=True).start()
                elif str(data.get("choice", "")).isdigit() and not TEST:
                    lvar("FSDT_GSX_MENU_CHOICE").value = int(data["choice"]) - 1
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
    ap.add_argument("--test-gsx", action="store_true", help="no simulator: an A320 at the gate with GSX services you can call from the ASL Pad")
    ap.add_argument("--pad-dir", help="serve the ASL Pad from this folder instead of GitHub Pages (testing)")
    ap.add_argument("--no-browser", action="store_true", help="do not open the connect page (QR code) on start")
    ap.add_argument("--media", help="folder with your videos for the passenger screen (default: Videos\\VDGS)")
    ap.add_argument("--open-media", action="store_true", help="open the video folder in Explorer and exit")
    args = ap.parse_args()
    global APP_DIR, TEST, MEDIA_DIR, PAD_DIR
    TEST = args.test or args.test_push or args.test_gsx
    if args.pad_dir:
        PAD_DIR = os.path.abspath(args.pad_dir)
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
    threading.Thread(target=test_ground_loop if args.test_gsx else test_push_loop if args.test_push else test_loop if TEST else read_loop, daemon=True).start()
    try:
        srv = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    except OSError as e:
        print(f"Port {args.port} is busy ({e}). Is the bridge already running?")
        input("Press Enter to close.")
        sys.exit(1)
    print()
    print("  Open on the iPad (same Wi-Fi):  http://%s:%d" % (lan_ip(), args.port))
    print("  QR code to scan:                http://localhost:%d/connect" % args.port)
    print("  ASL Pad with live data:         http://%s:%d/pad/" % (lan_ip(), args.port))
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
