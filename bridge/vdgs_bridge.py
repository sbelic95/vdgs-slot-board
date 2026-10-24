"""VDGS Slot Board – bridge between Microsoft Flight Simulator (2020/2024) and the iPad.

Runs on the simulator PC. It
  * reads position, altitude, speed, heading, radios and transponder through SimConnect,
  * serves the VDGS app in your home network, e.g. http://192.168.1.20:8770 (open that on the iPad),
  * lets the iPad tune COM1 and set the squawk.

The app is downloaded from GitHub Pages at start (latest version) and kept in ./app as a fallback.

Setup (once):   py -m pip install SimConnect
Start:          py vdgs_bridge.py            (options: --port 8770  --app-url https://.../)

Only for flight simulation. Anyone in your home network can open the page and tune the radios.
"""
import argparse
import json
import math
import os
import socket
import sys
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP_URL = "https://sbelic95.github.io/vdgs-slot-board/"
APP_FILES = ["index.html", "airports.json", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-512.png"]
# next to the .exe when packaged (PyInstaller unpacks the script into a temporary folder)
HERE = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__))
APP_DIR = os.path.join(HERE, "app")

state = {"vdgsBridge": True, "sim": "MSFS", "connected": False, "error": "", "t": 0}
lock = threading.Lock()
sim = {"sm": None, "aq": None}


def update_app(url):
    """Fetch the current app from GitHub Pages; keep the old copy if offline."""
    os.makedirs(APP_DIR, exist_ok=True)
    for name in APP_FILES:
        try:
            with urllib.request.urlopen(url + name + "?bridge=" + str(int(time.time())), timeout=20) as r:
                data = r.read()
            with open(os.path.join(APP_DIR, name), "wb") as f:
                f.write(data)
        except Exception as e:
            print(f"  could not update {name}: {e} (using the saved copy)")
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
        if self.path.split("?")[0] == "/sim":
            with lock:
                return self._json(200, dict(state, age=round(time.time() - state["t"], 1) if state["t"] else None))
        return super().do_GET()

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
    args = ap.parse_args()
    global APP_DIR, TEST
    TEST = args.test

    if args.app_dir:
        APP_DIR = os.path.abspath(args.app_dir)
    else:
        print("VDGS bridge: loading the app …")
        update_app(args.app_url.rstrip("/") + "/")
    if TEST:
        state["sim"] = "TEST"
        print("Test mode: pretend aircraft, no simulator needed.")
    threading.Thread(target=test_loop if TEST else read_loop, daemon=True).start()
    try:
        srv = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    except OSError as e:
        print(f"Port {args.port} is busy ({e}). Is the bridge already running?")
        input("Press Enter to close.")
        sys.exit(1)
    print()
    print("  Open on the iPad (same Wi-Fi):  http://%s:%d" % (lan_ip(), args.port))
    print("  If Windows asks: allow access for private networks.")
    print("  Stop with Ctrl+C.")
    print()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
