"""Builds stand data (OpenStreetMap) for every airport, one JSON file per airport on the "stands" branch.

Instead of one Overpass query per airport (thousands, mostly timing out on the busy public servers), the world
is fetched in ~76 tiles: all numbered stands, all gates, terminals and named cargo / GA aprons per tile.
Several Overpass servers work in parallel, one request at a time each; a tile that fails on one server goes to
the next. Then every airport gets the elements within 4.5 km of its reference point and build() turns them into
stands, exactly as the app does for a single airport (buildStands() in index.html).

- Airports whose 4.5 km circle touches a tile that failed keep their previous file (the next run tries again).
- Airports with scheduled service (OurAirports) or on the busy list without numbered stands in OSM get [],
  so the app says "no stand data" right away instead of asking Overpass.
- _status.json: per tile the server, duration and element count, or the error; totals per run.

Output per airport: [{"ref", "lat", "lon", "gate", "c", "t", "cargo", "ga", "w"}, ...]
Usage: python stands.py <airports.json> <out_dir>
Env: STANDS_MINUTES (time budget for the tiles, default 60), OVERPASS_SERVERS (comma list),
     SCHEDULED_AIRPORTS (URL of runways.json from the ATC data job, empty = skip), TILES (test: "s,w,n,e;...")
"""
import json
import math
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

SERVERS = [s for s in os.environ.get("OVERPASS_SERVERS", ",".join([
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
])).split(",") if s]
REPO = os.environ.get("GITHUB_REPOSITORY", "sbelic95/vdgs-slot-board")
SCHEDULED = os.environ.get("SCHEDULED_AIRPORTS", f"https://raw.githubusercontent.com/{REPO}/atc/runways.json")
UA = {"User-Agent": f"vdgs-slot-board stand builder (GitHub Actions; github.com/{REPO})"}
RADIUS_KM = 4.5
# latitude bands x 30° of longitude = 84 tiles for the whole world
BANDS = [(-90, -30), (-30, 0), (0, 20), (20, 35), (35, 45), (45, 55), (55, 90)]

# GitHub runners have no IPv6 route; resolve IPv4 only ("Network is unreachable" otherwise)
import socket  # noqa: E402
_getaddrinfo = socket.getaddrinfo
socket.getaddrinfo = lambda *a, **kw: [x for x in _getaddrinfo(*a, **kw) if x[0] == socket.AF_INET] or _getaddrinfo(*a, **kw)

# Busy airports on VATSIM and in the real world: hubs, events, holiday traffic
AIRPORTS = """
EDDF EDDM EDDL EDDH EDDK EDDS EDDB EDDN EDDP EDDW EDDV EDDC EDLW EDDG EDFH EDJA
EGLL EGKK EGSS EGGW EGCC EGBB EGPH EGPF EGGD EGNX EGLC EGPD EGAA EGNT EGNM EGCN
LFPG LFPO LFMN LFLL LFML LFBO LFBD LFSB LFRS LFQQ LFST
EHAM EHEH EHRD EBBR EBCI EBLG ELLX LSZH LSGG LOWW LOWS LOWI
LEMD LEBL LEPA LEMG LEAL LEIB LEVC LEZL LEBB GCLP GCTS GCRR GCFV
LPPT LPPR LPFR LPMA LPPD
LIRF LIMC LIML LIPZ LIRN LICC LIBD LIPE LIRA LIMF LIEO LICJ
LGAV LGTS LGIR LGRP LGKR LGSR LGKO LGZA
LTFM LTFJ LTAI LTBA LTBJ LTAC
EKCH ENGM ENBR ENVA ENZV ESSA ESGG EFHK BIKF
EPWA EPKK EPGD EPKT LKPR LZIB LHBP LROP LBSF LDZA LDSP LDDU LJLJ LYBE LWSK LQSA LATI LCLK LMML
EIDW EINN EICK
UUEE UUDD UUWW ULLI UKBB
OMDB OMAA OMDW OTHH OERK OEJN OBBI OKKK OOMS OJAI OLBA LLBG HECA
FAOR FACT HKJK HAAB GMMN DNMM DTTA
VIDP VABB VOBL VOMM VECC VTBS VTBD WSSS WMKK WIII RPLL VHHH VMMC ZBAA ZBAD ZSPD ZSSS ZGGG ZGSZ RCTP RKSI RKSS RJTT RJAA RJBB RJCC RJFF
YSSY YMML YBBN YPPH NZAA NZCH
KJFK KEWR KLGA KBOS KPHL KIAD KDCA KBWI KATL KMIA KFLL KMCO KTPA KCLT KORD KMDW KDTW KMSP KSTL KDFW KIAH KAUS KDEN KPHX KLAS KLAX KSAN KSFO KSJC KOAK KSEA KPDX KSLC KHNL
CYYZ CYUL CYVR CYYC CYOW
MMMX MMUN SBGR SBGL SCEL SPJC SKBO SAEZ MPTO TNCM TJSJ
""".split()


def dist_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(h)))


def in_ring(pt, ring):  # pt = (lat, lon), ring = [(lon, lat), ...]
    x, y, inside = pt[1], pt[0], False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


GA_RE = re.compile("business|general aviation|executive|GAT|FBO|privat", re.I)
CARGO_RE = re.compile("cargo|fracht|fret|frêt|carga", re.I)


def term_name(t):
    """'T1 Satellite Concourse' (ref T1) and '一號客運大樓 Terminal 1' both become 'Terminal 1'."""
    name, ref = t.get("name", ""), t.get("ref", "")
    if ref and not CARGO_RE.search(name) and not GA_RE.search(name):
        return "Terminal " + re.sub(r"^T(?=\w)", "", ref)
    m = re.search(r"Terminal\s*([0-9A-Z]{1,3})\b", name)
    return "Terminal " + m.group(1) if m else name or ("Terminal " + ref if ref else "")


def build(d):
    """Same structure as buildStands() in index.html; keep both in step."""
    el = d["elements"]
    tags = lambda e: e.get("tags", {})
    pos = lambda e: (e.get("lat", e.get("center", {}).get("lat")), e.get("lon", e.get("center", {}).get("lon")))
    gate_nodes = [(re.split(r"[\s/]", tags(e).get("ref", ""))[0], pos(e)) for e in el if tags(e).get("aeroway") == "gate" and pos(e)[0] is not None]
    gate_refs = {r for r, _ in gate_nodes if r}
    terms = []
    for e in el:
        t = tags(e)
        if t.get("aeroway") == "terminal" and (t.get("name") or t.get("ref")) and e.get("center"):
            terms.append((term_name(t), (e["center"]["lat"], e["center"]["lon"]), bool(CARGO_RE.search(t.get("name", ""))), bool(GA_RE.search(t.get("name", "")))))
    aprons = [(bool(CARGO_RE.search(tags(e)["name"])), [(g["lon"], g["lat"]) for g in e["geometry"]])
              for e in el if tags(e).get("aeroway") == "apron" and e.get("geometry")]
    out = []
    for e in el:
        t = tags(e)
        if t.get("aeroway") != "parking_position" or not t.get("ref"):
            continue
        lat, lon = pos(e)
        if lat is None:
            continue
        ref = re.split(r"[\s/;]", t["ref"])[0]
        best, near = 1.5, None
        for x in terms:
            dd = dist_km((lat, lon), x[1])
            if dd < best:
                best, near = dd, x
        ap = next((a for a in aprons if in_ring((lat, lon), a[1])), None)
        cargo = bool(ap and ap[0]) or bool(near and near[2])
        ga = bool(ap and not ap[0]) or bool(near and near[3])
        contact = ref in gate_refs or any(dist_km((lat, lon), p) < 0.12 for _, p in gate_nodes)
        out.append({"ref": ref, "lat": round(lat, 6), "lon": round(lon, 6), "gate": ref in gate_refs, "c": contact,
                    "t": "" if (cargo or ga) else (near[0] if near else ""), "cargo": cargo, "ga": ga})
    # w: metres to the nearest other stand. Stands sit about one wingspan plus clearance apart: ~40-45 m for an A320,
    # ~70 m for a 777, ~85 m for an A380. Positions closer than 25 m are alternatives on the same spot (12L / 12R / 12,
    # or E71 / E72 / E73: one wide-body or two narrow-body stands), not neighbours, and are left out.
    base = lambda r: re.sub(r"(\d)[A-Z]+$", r"\1", r)
    for s in out:
        d = [x for x in (dist_km((s["lat"], s["lon"]), (o["lat"], o["lon"])) for o in out if base(o["ref"]) != base(s["ref"])) if x >= 0.025]
        if d:
            s["w"] = round(min(d) * 1000)
    return out


class Busy(Exception):
    """The server asks us to slow down (HTTP 429): not the tile's fault, try it again later."""


APRON_NAMES = "cargo|fracht|fret|frêt|carga|general aviation|^GA|GAT|business|executive"


def overpass_tile(url, tile):
    """Every numbered stand, every gate, terminals and named cargo / GA aprons in one tile."""
    s, w, n, e = tile
    q = (f'[out:json][timeout:300][bbox:{s},{w},{n},{e}];'
         '(node["aeroway"="parking_position"]["ref"];way["aeroway"="parking_position"]["ref"];node["aeroway"="gate"];);out tags center qt;'
         '(way["aeroway"="terminal"];relation["aeroway"="terminal"];);out tags center qt;'
         f'way["aeroway"="apron"]["name"~"{APRON_NAMES}",i];out tags geom qt;')
    req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=420) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise Busy("HTTP 429") from None
        raise
    # a busy server can answer 200 with a "runtime error" remark and only part of the data: never keep that
    remark = d.get("remark") or ""
    if not isinstance(d.get("elements"), list) or re.search(r"error|timed out|out of memory", remark, re.I):
        raise RuntimeError(remark.strip()[:140] or "no elements in the answer")
    return d["elements"]


def make_tiles():
    if os.environ.get("TILES"):  # tests
        return [tuple(float(x) for x in t.split(",")) for t in os.environ["TILES"].split(";")]
    return [(s, w, n, w + 30) for s, n in BANDS for w in range(-180, 180, 30)]


def tile_key(t):
    return "%g,%g,%g,%g" % t


def fetch_tiles(tiles, deadline, log):
    """One worker per server, one request at a time each; a tile that fails moves on to the next server.
    Returns {tile: elements} for the tiles that worked."""
    lock = threading.Lock()
    pending = [{"tile": t, "tried": set()} for t in tiles]
    live, inflight, got = set(SERVERS), [0], {}
    stats = {s: Counter() for s in SERVERS}
    host = lambda s: s.split("/")[2]

    def nap(sec):  # pauses never run past the time budget
        time.sleep(max(0, min(sec, deadline - time.time())))

    def take(srv):
        with lock:
            for k, it in enumerate(pending):
                if srv not in it["tried"]:
                    inflight[0] += 1
                    return pending.pop(k)
        return None

    def give_up(it, err):  # caller holds the lock
        log[tile_key(it["tile"])] = {"try": int(time.time()), "err": err[:160]}
        print(f"tile {tile_key(it['tile'])}  failed on every server: {err[:100]}", flush=True)

    def failed(it, srv, err, busy=False):
        with lock:
            inflight[0] -= 1
            if not busy:
                it["tried"].add(srv)
            if live - it["tried"]:
                pending.insert(0, it)  # keeps its place in the queue for the next server
            else:
                give_up(it, err)

    def worker(srv):
        streak = 0
        while time.time() < deadline:
            it = take(srv)
            if it is None:
                with lock:
                    idle = inflight[0] == 0
                if idle:
                    break  # whatever is left was already tried here
                time.sleep(3)  # another server may hand a tile back
                continue
            key, t0 = tile_key(it["tile"]), time.time()
            try:
                els = overpass_tile(srv, it["tile"])
            except Busy as e:
                stats[srv]["busy"] += 1
                streak += 1
                print(f"tile {key}  {host(srv)} rate limit, pausing this server", flush=True)
                failed(it, srv, f"{host(srv)}: {e}", busy=True)
                if streak >= 6:
                    break
                nap(60)
                continue
            except Exception as e:
                stats[srv]["fail"] += 1
                streak += 1
                print(f"tile {key}  {host(srv)}: {str(e)[:100]} ({time.time() - t0:.0f} s)", flush=True)
                failed(it, srv, f"{host(srv)}: {e}")
                if streak >= 4:
                    print(f"{host(srv)} failed {streak} times in a row, leaving it out for this run", flush=True)
                    break
                nap(min(20 * streak, 60))
                continue
            with lock:
                inflight[0] -= 1
                got[it["tile"]] = els
                log[key] = {"ok": int(time.time()), "n": len(els), "src": host(srv), "s": round(time.time() - t0)}
            stats[srv]["ok"] += 1
            streak = 0
            print(f"tile {key}  {len(els)} elements  {host(srv)}  {time.time() - t0:.0f} s", flush=True)
            nap(2)  # be gentle with the public Overpass servers
        with lock:
            live.discard(srv)
            for it in [x for x in pending if x["tried"] and not (live - x["tried"])]:
                pending.remove(it)
                give_up(it, "no server left: " + ", ".join(sorted(host(s) for s in it["tried"])))

    threads = [threading.Thread(target=worker, args=(s,), daemon=True) for s in SERVERS]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for s in SERVERS:
        print(f"{host(s)}: {stats[s]['ok']} tiles ok, {stats[s]['fail']} failed, {stats[s]['busy']} rate limits", flush=True)
    for it in pending:
        log.setdefault(tile_key(it["tile"]), {"try": int(time.time()), "err": "time budget used up"})
    return got


def scheduled_airports():
    """Every airport with scheduled passenger service (OurAirports, via the ATC data job)."""
    if not SCHEDULED:
        return set()
    try:
        with urllib.request.urlopen(urllib.request.Request(SCHEDULED, headers=UA), timeout=60) as r:
            return {i for i in json.load(r) if re.fullmatch(r"[A-Z]{4}", i)}
    except Exception as e:
        print(f"list of scheduled airports not available: {e}", flush=True)
        return set()


CELL = 0.1  # grid cell in degrees for the spatial index


def index_elements(got):
    """All elements once (tiles overlap at their edges), in a grid by the points they cover."""
    seen = {}
    for els in got.values():
        for e in els:
            seen[(e["type"], e["id"])] = e
    grid = {}
    for e in seen.values():
        if e.get("geometry"):  # apron outline
            pts = [(g["lat"], g["lon"]) for g in e["geometry"] if g]
        else:
            la, lo = e.get("lat", e.get("center", {}).get("lat")), e.get("lon", e.get("center", {}).get("lon"))
            pts = [(la, lo)] if la is not None else []
        for c in {(math.floor(la / CELL), math.floor(lo / CELL)) for la, lo in pts}:
            grid.setdefault(c, []).append((e, pts))
    return grid, len(seen)


def around(grid, lat, lon):
    """Elements within RADIUS_KM of the airport, like Overpass (around:4500) in the app."""
    dlat = RADIUS_KM / 111.2
    dlon = dlat / max(math.cos(math.radians(lat)), 0.01)
    found, ids = [], set()
    for ci in range(math.floor((lat - dlat) / CELL), math.floor((lat + dlat) / CELL) + 1):
        for cj in range(math.floor((lon - dlon) / CELL), math.floor((lon + dlon) / CELL) + 1):
            for e, pts in grid.get((ci, cj), ()):
                if id(e) not in ids and any(dist_km((lat, lon), p) <= RADIUS_KM for p in pts):
                    ids.add(id(e))
                    found.append(e)
    return found


def covered(tiles_ok, all_tiles, lat, lon):
    """True if the airport's circle lies in fetched tiles only (and touches at least one)."""
    dlat = RADIUS_KM / 111.2
    dlon = dlat / max(math.cos(math.radians(lat)), 0.01)
    touched = [t for t in all_tiles if lat - dlat < t[2] and lat + dlat > t[0] and lon - dlon < t[3] and lon + dlon > t[1]]
    return bool(touched) and all(t in tiles_ok for t in touched)


def main():
    apts = json.load(open(sys.argv[1], encoding="utf-8"))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    started = int(time.time())
    deadline = time.time() + float(os.environ.get("STANDS_MINUTES", "60")) * 60  # stop in time so the results get published
    tiles = make_tiles()
    log = {}
    # dense tiles first: they take longest
    weight = Counter()
    for k, v in apts.items():
        for t in tiles:
            if t[0] <= v[0] < t[2] and t[1] <= v[1] < t[3]:
                weight[t] += 1
    got = fetch_tiles(sorted(tiles, key=lambda t: -weight[t]), deadline, log)
    print(f"{len(got)} of {len(tiles)} tiles fetched", flush=True)

    grid, n_el = index_elements(got)
    keep_empty = scheduled_airports() | set(AIRPORTS)
    counts = Counter()
    for icao, v in apts.items():
        if not re.fullmatch(r"[A-Z]{4}", icao):
            continue
        path = os.path.join(out_dir, icao + ".json")
        if not covered(got, tiles, v[0], v[1]):
            counts["kept_old" if os.path.exists(path) else "not_covered"] += 1
            continue
        els = around(grid, v[0], v[1])
        stands = build({"elements": els}) if els else []
        if stands or icao in keep_empty or os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                json.dump(stands, f, ensure_ascii=False, separators=(",", ":"))
            counts["with_stands" if stands else "empty"] += 1
    status = {"run": started, "took_s": int(time.time()) - started, "elements": n_el, **counts, "tiles": dict(sorted(log.items()))}
    with open(os.path.join(out_dir, "_status.json"), "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=0, separators=(",", ":"))
    print("done: " + ", ".join(f"{k} {v}" for k, v in counts.items()), flush=True)


if __name__ == "__main__":
    main()
