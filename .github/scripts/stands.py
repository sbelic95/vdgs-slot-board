"""Builds stand data (OpenStreetMap) for the busiest airports, one JSON file per airport.

Output format matches what index.html expects from loadStands():
  [{"ref", "lat", "lon", "gate", "t", "cargo", "ga"}, ...]
Usage: python stands.py <airports.json> <out_dir>
Airports that fail keep their previous file (the workflow copies the old files in first).
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

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


def overpass(lat, lon):
    a = f"(around:4500,{lat},{lon})"
    q = (f'[out:json][timeout:60];(node{a}["aeroway"~"^(parking_position|gate)$"];way{a}["aeroway"="parking_position"];);out tags center;'
         f'(way{a}["aeroway"="terminal"];relation{a}["aeroway"="terminal"];);out tags center;'
         f'way{a}["aeroway"="apron"]["name"~"cargo|fracht|fret|frêt|carga|general aviation|^GA|GAT|business|executive",i];out tags geom;')
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(3):
        url = SERVERS[attempt % len(SERVERS)]
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "vdgs-slot-board stand builder (GitHub Actions)"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # busy or timeout: short pause, then the other server; the next weekly run retries
            print(f"  {url.split('/')[2]}: {e}", flush=True)
            time.sleep(10 * (attempt + 1))
    return None


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


def main():
    apts = json.load(open(sys.argv[1], encoding="utf-8"))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    ok = fail = 0
    deadline = time.time() + float(os.environ.get("STANDS_MINUTES", "150")) * 60  # stop in time so the results get published
    for icao in AIRPORTS:
        if icao not in apts:
            continue
        if time.time() > deadline:
            print("time budget used up; the remaining airports keep their old files")
            break
        lat, lon = apts[icao][0], apts[icao][1]
        print(icao, flush=True)
        d = overpass(lat, lon)
        if d is None:
            fail += 1
            continue
        stands = build(d)
        if stands:
            with open(os.path.join(out_dir, icao + ".json"), "w", encoding="utf-8") as f:
                json.dump(stands, f, ensure_ascii=False, separators=(",", ":"))
            ok += 1
        time.sleep(3)  # be gentle with the public Overpass servers
    print(f"done: {ok} airports written, {fail} failed")


if __name__ == "__main__":
    main()
