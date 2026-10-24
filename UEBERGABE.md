# Übergabe: VDGS Slot Board

Projektübergabe für die Weiterentwicklung (z. B. mit ChatGPT oder einem anderen Entwickler).
Stand: 24.10.2026.

## 1. Was die App ist

Eine statische Web-App (HTML, CSS und JavaScript in einer Datei, ohne Build-Schritt und ohne Server-Code) als Dauerbildschirm fürs iPad. Sie zeigt einem VATSIM-Piloten seinen CDM-Slot (EOBT, TOBT, TSAT, TTOT, CTOT), Runway/SID, Status mit Countdown, SimBrief-OFP-Daten, VATSIM-Flugplan, ATIS, METAR, ATC online und eine Abflugtafel des Abflughafens.

- Sprache der Oberfläche: Deutsch, Luftfahrtbegriffe auf Englisch
- Design: dunkle Flughafen-Anzeige, Akzent Flughafen-Gelb `#ffcc00`, Schriften „Barlow Condensed“ (Überschriften), „B612“ / „B612 Mono“ (Text und Zahlen, Airbus-Cockpitschrift) von Google Fonts
- Läuft als PWA: „Zum Home-Bildschirm“ auf dem iPad, Vollbild, App-Icon
- Alle Daten kommen direkt im Browser von öffentlichen APIs (alle mit `Access-Control-Allow-Origin: *`), keine API-Schlüssel, keine Datenbank, kein Backend

## 2. Dateiliste

| Datei | Zweck |
|---|---|
| `index.html` | Die komplette App: Markup, CSS (im `<style>`), JavaScript (im `<script>`). Einzige Datei mit Logik. |
| `manifest.webmanifest` | PWA-Manifest (Name, Farben, Icons, `display: standalone`) |
| `sw.js` | Service Worker: cacht nur die App-Hülle (HTML, Manifest, Icons). API-Daten werden nie gecacht. |
| `icon.svg` | App-Icon als Vektor (Favicon, Manifest) |
| `icon-180.png` | Apple-Touch-Icon fürs iPad (180×180) |
| `icon-512.png` | Manifest-Icon (512×512) |
| `ANLEITUNG.md` | Bedienungsanleitung für den Piloten (Online stellen, iPad, Status) |
| `UEBERGABE.md` | Diese Datei |

Zum Hosten werden nur `index.html`, `manifest.webmanifest`, `sw.js` und die drei Icons gebraucht. Jeder statische Host funktioniert (GitHub Pages, Netlify, Cloudflare Pages). Wichtig: Die Seite muss über `https://` laufen (Service Worker, Wake Lock).

## 3. Externe Datenquellen (APIs)

| # | Endpoint | Liefert | Abfrage-Intervall |
|---|---|---|---|
| A | `https://viff-system.network/ifps/callsign?callsign=<CS>` | Ein Flug-Objekt mit CDM-Zeiten. Leere Antwort (0 Byte), wenn der Flug unbekannt ist. | 20 s |
| B | `https://viff-system.network/ifps/depAirport?airport=<ICAO>` | Array aller Abflüge eines Flughafens (gleiches Format wie A). Kann ein Callsign doppelt enthalten. | 45 s |
| C | `https://data.vatsim.net/v3/vatsim-data.json` | VATSIM-Live-Daten: `pilots`, `prefiles`, `controllers`, `atis` (mehrere MB) | 30 s |
| D | `https://www.simbrief.com/api/xml.fetcher.php?username=<NAME>&json=v2` (oder `userid=<ID>`) | Neuestes SimBrief-OFP | 5 min und per Button |
| E | `https://metar.vatsim.net/<ICAO>` | METAR als Klartext | 5 min |

### A/B: vIFF-CDM-Felder (verwendet)

```
callsign, cid, departure, arrival
eobt          "HHMM"   Flugplan-Off-Block
tobt          "HHMM"   (Fallback, wenn cdmData.tobt leer)
ctot          "HHMM"   (Fallback, wenn cdmData.ctot leer)
aobt          "HHMM"   tatsächliches Off-Block (unzuverlässig, siehe 6.)
atot          "HHMM"   tatsächlicher Take-off
eta           "HHMM"
taxi          Zahl     EXOT in Minuten
cdmSts        z. B. "COMPLY", "AIRB", "FLS-CDM"
atfcmStatus   z. B. "ATC_ACTIV", "SRM", "SLC", "DES", "FLS-CDM"
mostPenalizingAirspace
atfcmData.mostPenalisingRegulation, .mostPenalisingRegulationType, .excluded
cdmData.tobt  "HHMMSS"
cdmData.tsat  "HHMMSS"
cdmData.ttot  "HHMMSS"
cdmData.ctot  "HHMM"
cdmData.reason
cdmData.depInfo "RWY/SID", z. B. "22R/NEXEN2C"
cdmData.confirmed  bool
flightPlanning.aircraft_short (nur manchmal vorhanden)
```

Zeiten haben kein Datum. Die App nimmt den UTC-Tag (gestern, heute, morgen), der am nächsten an „jetzt“ liegt (`toTime()`).

### C: VATSIM-Feed (verwendet)

```
pilots[]:   cid, callsign, groundspeed, altitude, transponder,
            flight_plan { departure, arrival, alternate, aircraft_short, altitude,
                          cruise_tas, deptime "HHMM", route, assigned_transponder }
prefiles[]: cid, callsign, flight_plan { ... }
controllers[]: callsign, frequency, facility (2 DEL, 3 GND, 4 TWR, 5 APP)
atis[]:     callsign "<ICAO>_ATIS", atis_code, frequency, text_atis[]
```

### D: SimBrief OFP (verwendet, `json=v2`)

```
fetch.status                 "Success" oder "Error: Unknown UserID"
atc.callsign
general.icao_airline, .flight_number, .initial_altitude, .costindex, .route, .route_distance
origin.icao_code, .plan_rwy, .metar
destination.icao_code, .plan_rwy
alternate (Objekt oder Array) .icao_code
aircraft.icaocode, .reg
fuel.plan_ramp (Block), .enroute_burn (Trip), .plan_takeoff (TOF)
weights.est_zfw, .max_zfw, .est_tow, .max_tow, .pax_count_actual
times.sched_out, .sched_in, .est_on (ISO), .est_time_enroute "HH:MM:SS"
params.time_generated, params.units ("kgs"/"lbs")
files.directory + files.pdf.link       -> PDF-OFP
prefile.vatsim.link                     -> fertiger my.vatsim.net-Prefile-Link
```

## 4. Einstellungen und Bedienung

- Gespeichert im Browser unter `localStorage["vdgs.settings"]`:
  `{ simbrief, cid, callsign, chime, demo }`
- URL-Parameter (praktisch für iPad-Lesezeichen):
  `?simbrief=<Name>`, `?cid=<CID>`, `?cs=<Callsign>`, `?demo`
- **Welches Callsign gilt:** von Hand eingetragen > aktiver Pilot oder Prefile mit der CID im VATSIM-Feed > Callsign aus dem SimBrief-OFP (`updateCallsign()`)
- **Flughafen für ATIS/ATC/Tafel/METAR:** vIFF `departure` > VATSIM-Flugplan > SimBrief `origin` (`depApt()`)
- Buttons: „Wach“ (Screen Wake Lock API), Vollbild, „Flug“ (Einstellungen), „Prefile auf VATSIM“, „OFP (PDF)“, „TOBT setzen“ (→ https://vats.im/vdgs), „OFP neu laden“

## 5. Status-Logik (`phase()`)

Reihenfolge der Prüfung:

1. `atot` gesetzt oder Live-Groundspeed > 60 kt → **airborne** („Abgeflogen“)
2. Live-Groundspeed ≥ 3 kt → **offblock** („Off-Block · Rollen“)
3. `aobt` gesetzt und plausibel (nicht früher als TSAT − 5 min) und Flieger steht nicht nachweislich → **offblock**
4. TSAT vorhanden:
   - jetzt < TSAT − 5 min → **wait** (gelb, Countdown bis Fenster öffnet)
   - TSAT ± 5 min → **go** (grün, pulsiert, Gong einmalig)
   - danach → **late** (rot, „TSAT abgelaufen“)
5. nur TOBT oder CTOT → **pending** („Noch keine TSAT“)
6. sonst → **none** („Kein Slot gefunden“)

Zusätzlich: `setup` (nichts eingestellt) und `loading` (SimBrief oder Feed laden noch).
Die Live-Geschwindigkeit kommt nur für den eigenen Flug aus dem VATSIM-Feed. Die anderen Zeilen der Abflugtafel nutzen nur vIFF-Daten.

CTOT-Toleranz in der Anzeige: −5 / +10 min. Start-up-Fenster: TSAT ± 5 min (Konstante `TSAT_WINDOW`).

## 6. Bekannte Grenzen

- Slot-Daten nur aus dem vIFF-CDM-System (viele europäische vACCs). Das deutsche vACDM (`app.vacdm.net`) hat keine offene, öffentliche API und ist nicht eingebunden.
- Ohne aktiven DEL/GND/TWR am Flughafen gibt es meist keine TSAT.
- vIFF setzt `aobt` manchmal schon, während der Flieger noch am Gate steht. Darum die Plausibilitätsprüfung in Abschnitt 5.
- Die TOBT kann die App nicht selbst setzen, weil dafür ein VATSIM-Login (OAuth) auf vats.im/vdgs nötig ist.
- Mit VATSIM verbinden geht nur über die Pilot-Clients (vPilot, xPilot, swift). Die App liest nur mit.
- Wake Lock auf dem iPad braucht iPadOS 16.4 oder neuer. Sicherer ist „Automatische Sperre: Nie“.
- Kann nicht als Seite auf claude.ai laufen: Die Sicherheitsregeln dort blockieren Abrufe externer APIs.

## 7. Aufbau von `index.html` (JavaScript-Funktionen)

| Funktion | Aufgabe |
|---|---|
| `toTime(s)` | "HHMM"/"HHMMSS" → Zeitstempel (nächster UTC-Tag) |
| `norm(r)` | vIFF-Datensatz → einheitliches Flug-Objekt |
| `normOfp(d)` | SimBrief-JSON → einheitliches OFP-Objekt |
| `phase(f, now, live)` | Status (siehe 5.) |
| `pollFeed()` / `applyFeed()` | VATSIM-Feed laden, eigenen Piloten, ATIS und ATC finden |
| `pollFlight()` | eigenen CDM-Datensatz laden |
| `pollBoard()` | Abflugtafel laden, doppelte Callsigns zusammenführen |
| `pollSimbrief()` | OFP laden |
| `pollMetar()` | METAR laden (Fallback: METAR aus dem OFP) |
| `updateCallsign()` | Callsign nach Priorität bestimmen |
| `render()` | Gesamte Anzeige (läuft jede Sekunde für Uhr und Countdown) |
| `renderTimeline()`, `renderFlight()`, `renderWx()`, `renderBoard()` | Teilbereiche |
| `loadDemo()` | Beispieldaten für `?demo` (als „Demo-Daten“ markiert) |
| `chime()` | Gong über die Web Audio API |
| `start()` | Zustand zurücksetzen, Abfragen und Timer starten |

## 8. Ideen für später

- vACDM (Deutschland) einbinden, falls eine öffentliche API verfügbar wird
- Ankunfts-Ansicht (ETA, Ankunfts-ATIS) nach dem Start automatisch einblenden
- Mehrere Flüge oder ein ganzer Flughafen als reine FIDS-Tafel
- Push-Benachrichtigung aufs Handy, wenn das Start-up-Fenster öffnet (bräuchte ein kleines Backend)
- Hinweis zum Datenschutz: Die App speichert nur lokal im Browser und sendet nichts an eigene Server.

Nur für Flugsimulation, nicht für die echte Luftfahrt.
