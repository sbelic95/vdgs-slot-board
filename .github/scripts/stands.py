"""Builds stand data (OpenStreetMap) for the app, one JSON file per airport on the "stands" branch.

Which airports, in this order:
  1. airports without a file yet: destinations of flights on VATSIM right now (most inbound flights first),
     then the fixed list of busy airports (AIRPORTS)
  2. files older than REFRESH_DAYS, oldest first (only airports on the list or flown to right now)
Several Overpass servers work in parallel, one request at a time each. An airport that fails on one server
goes to the next one; if it fails on all of them it waits longer each time (30 min, 1 h, 2 h ... 24 h).
_status.json keeps the last result per airport, so failures move to the back instead of blocking the run.

Output per airport, same as buildStands() in index.html: [{"ref", "lat", "lon", "gate", "c", "t", "cargo", "ga"}, ...]
An empty list means OpenStreetMap has no numbered stands there; the app then shows "no stand data" right away.
Usage: python stands.py <airports.json> <out_dir>
Env: STANDS_MINUTES (time budget, default 40), OVERPASS_SERVERS (comma list), VATSIM_FEED (URL, empty = skip)
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
VATSIM_FEED = os.environ.get("VATSIM_FEED", "https://data.vatsim.net/v3/vatsim-data.json")
REFRESH_DAYS = 14
UA = {"User-Agent": "vdgs-slot-board stand builder (GitHub Actions; github.com/%s)" % os.environ.get("GITHUB_REPOSITORY", "sbelic95/vdgs-slot-board")}

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
    return out


class Busy(Exception):
    """The server asks us to slow down (HTTP 429): not the airport's fault, try it again later."""


def overpass(url, lat, lon):
    a = f"(around:4500,{lat},{lon})"
    q = (f'[out:json][timeout:90];(node{a}["aeroway"~"^(parking_position|gate)$"];way{a}["aeroway"="parking_position"];);out tags center;'
         f'(way{a}["aeroway"="terminal"];relation{a}["aeroway"="terminal"];);out tags center;'
         f'way{a}["aeroway"="apron"]["name"~"cargo|fracht|fret|frêt|carga|general aviation|^GA|GAT|business|executive",i];out tags geom;')
    req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise Busy("HTTP 429") from None
        raise
    # a busy server can answer 200 with a "runtime error" remark and only part of the data: never keep that
    remark = d.get("remark") or ""
    if not isinstance(d.get("elements"), list) or re.search(r"error|timed out|out of memory", remark, re.I):
        raise RuntimeError(remark.strip()[:140] or "no elements in the answer")
    return d


def vatsim_destinations():
    """Arrival airports of all flights on VATSIM right now (airborne and pre-filed), with the number of flights."""
    if not VATSIM_FEED:
        return Counter()
    try:
        with urllib.request.urlopen(urllib.request.Request(VATSIM_FEED, headers=UA), timeout=60) as r:
            feed = json.load(r)
    except Exception as e:  # no feed: the fixed list still gets done
        print(f"VATSIM feed not available: {e}", flush=True)
        return Counter()
    arr = Counter()
    for p in feed.get("pilots", []) + feed.get("prefiles", []):
        a = ((p.get("flight_plan") or {}).get("arrival") or "").strip().upper()
        if re.fullmatch(r"[A-Z0-9]{4}", a):
            arr[a] += 1
    return arr


def plan(apts, out_dir, status, now):
    """Airports to do in this run, best first."""
    have = lambda i: os.path.exists(os.path.join(out_dir, i + ".json"))
    # files from before _status.json existed: age unknown, count them as a few days old
    for f in os.listdir(out_dir):
        if re.fullmatch(r"[A-Z0-9]{4}\.json", f):
            status.setdefault(f[:4], {}).setdefault("ok", now - 3 * 86400)
    inbound = vatsim_destinations()
    wanted = [i for i in dict.fromkeys([i for i, _ in inbound.most_common()] + AIRPORTS) if i in apts]

    def due(st):  # after failing on every server: wait 30 min, 1 h, 2 h ... at most 24 h
        f = st.get("fails", 0)
        return not f or now - st.get("try", 0) >= min(1800 * 2 ** (f - 1), 86400)
    new = [i for i in wanted if not have(i) and due(status.get(i, {}))]
    old = sorted((i for i in wanted if have(i) and now - status[i]["ok"] > REFRESH_DAYS * 86400 and due(status[i])),
                 key=lambda i: status[i]["ok"])
    print(f"VATSIM: {sum(inbound.values())} flights to {len(inbound)} airports. "
          f"Due now: {len(new)} without data, {len(old)} to refresh. Servers: {len(SERVERS)}", flush=True)
    return new + old


def run(todo, apts, out_dir, status, deadline):
    """One worker per server, one request at a time each; an airport that fails moves on to the next server."""
    lock = threading.Lock()
    pending = [{"icao": i, "tried": set()} for i in todo]
    live, inflight = set(SERVERS), [0]
    stats = {s: Counter() for s in SERVERS}
    host = lambda s: s.split("/")[2]

    def take(srv):
        with lock:
            for k, it in enumerate(pending):
                if srv not in it["tried"]:
                    inflight[0] += 1
                    return pending.pop(k)
        return None

    def failed(it, srv, err, busy=False):
        with lock:
            inflight[0] -= 1
            if not busy:
                it["tried"].add(srv)
            if live - it["tried"]:
                pending.insert(0, it)  # keeps its place in the queue for the next server
            else:
                give_up(it, err)

    def give_up(it, err):  # caller holds the lock
        st = status.setdefault(it["icao"], {})
        st["try"], st["fails"], st["err"] = int(time.time()), st.get("fails", 0) + 1, err[:160]
        print(f"{it['icao']}  failed on every server, next try later: {err[:100]}", flush=True)

    def nap(sec):  # pauses never run past the time budget
        time.sleep(max(0, min(sec, deadline - time.time())))

    def worker(srv):
        streak = 0
        while time.time() < deadline:
            it = take(srv)
            if it is None:
                with lock:
                    idle = inflight[0] == 0
                if idle:
                    break  # whatever is left was already tried here
                time.sleep(3)  # another server may hand an airport back
                continue
            icao = it["icao"]
            t0 = time.time()
            try:
                d = overpass(srv, apts[icao][0], apts[icao][1])
            except Busy as e:
                stats[srv]["busy"] += 1
                streak += 1
                print(f"{icao}  {host(srv)} rate limit, pausing this server", flush=True)
                failed(it, srv, f"{host(srv)}: {e}", busy=True)
                if streak >= 6:
                    break
                nap(60)
                continue
            except Exception as e:
                stats[srv]["fail"] += 1
                streak += 1
                print(f"{icao}  {host(srv)}: {str(e)[:100]} ({time.time() - t0:.0f} s)", flush=True)
                failed(it, srv, f"{host(srv)}: {e}")
                if streak >= 6:
                    print(f"{host(srv)} failed {streak} times in a row, leaving it out for this run", flush=True)
                    break
                nap(min(10 * streak, 60))
                continue
            stands = build(d)
            with open(os.path.join(out_dir, icao + ".json"), "w", encoding="utf-8") as f:
                json.dump(stands, f, ensure_ascii=False, separators=(",", ":"))
            with lock:
                inflight[0] -= 1
                status[icao] = {"ok": int(time.time()), "n": len(stands), "src": host(srv)}
            stats[srv]["ok"] += 1
            streak = 0
            print(f"{icao}  {len(stands)} stands  {host(srv)}  {time.time() - t0:.0f} s", flush=True)
            nap(2)  # be gentle with the public Overpass servers
        with lock:
            live.discard(srv)
            # airports that now have no server left to try count as failed
            for it in [x for x in pending if x["tried"] and not (live - x["tried"])]:
                pending.remove(it)
                give_up(it, "no server left: " + ", ".join(sorted(host(s) for s in it["tried"])))

    threads = [threading.Thread(target=worker, args=(s,), daemon=True) for s in SERVERS]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for s in SERVERS:
        print(f"{host(s)}: {stats[s]['ok']} ok, {stats[s]['fail']} failed, {stats[s]['busy']} rate limits", flush=True)
    if pending:
        why = "time budget used up" if time.time() >= deadline else "no working server left"
        print(f"{why}: {len(pending)} airports wait for the next run", flush=True)


def main():
    apts = json.load(open(sys.argv[1], encoding="utf-8"))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    status_path = os.path.join(out_dir, "_status.json")
    try:
        status = json.load(open(status_path, encoding="utf-8"))
    except (OSError, ValueError):
        status = {}
    now = int(time.time())
    deadline = time.time() + float(os.environ.get("STANDS_MINUTES", "40")) * 60  # stop in time so the results get published
    try:
        run(plan(apts, out_dir, status, now), apts, out_dir, status, deadline)
    finally:
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(dict(sorted(status.items())), f, ensure_ascii=False, separators=(",", ":"))
    ok = sum(1 for f in os.listdir(out_dir) if re.fullmatch(r"[A-Z0-9]{4}\.json", f))
    print(f"done: {ok} airports with stand data", flush=True)


if __name__ == "__main__":
    main()
