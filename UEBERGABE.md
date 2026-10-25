# Übergabe: VDGS Slot Board

Projektübergabe für die Weiterentwicklung (z. B. mit ChatGPT oder einem anderen Entwickler).
Stand: 25.10.2026.

## 1. Was die App ist

Eine statische Web-App (HTML, CSS und JavaScript in einer Datei, ohne Build-Schritt und ohne Server-Code) als Dauerbildschirm fürs iPad. Oben in der Leiste schaltet man zwischen drei Modi um:

- **Pilot:**
  - CDM-Slot (EOBT, TOBT, TSAT, TTOT, CTOT), Runway/SID, Status mit Countdown
  - **Frequenz-Führer:** aktuelle und nächste Funkstation mit Frequenz und Zeit bis zum Wechsel
  - **CPDLC (Hoppie):** mitgelesene Nachrichten, z. B. „CONTACT … 127.925“
  - SimBrief-OFP, VATSIM-Flugplan, ATIS, METAR, ATC online, Abflugtafel des Abflughafens
- **Passagier:** wie ein echtes Bordunterhaltungssystem
  - **Flugkarte:** Satellitenkarte mit Route, Track und Flugzeug; Geschwindigkeit in km/h, Höhe in m, Außentemperatur, Wind, Entfernung in km, Restflugzeit, Ankunft in Ortszeit, Wetter am Ziel, Kurs, Flugphase
  - **Anschlussflüge:** die nächsten Abflüge am Zielflughafen
  - **Ankünfte:** wer gleichzeitig am Ziel landet
  - **Zielort:** Ortszeit, Datum, Wetter in °C, km/h, km und hPa
  - **Rundlauf:** wechselt die Bildschirme automatisch

  Zwischen Pilot und Passagier wird nur von Hand umgeschaltet.
- **Tafel:** reine Flughafen-Anzeige (FIDS) mit Abflügen und Ankünften für einen beliebigen Flughafen (ICAO eingeben oder `?fids=EDDF`). Funktioniert auch ohne eigenen Flug.

**Push aufs Handy** über ntfy.sh: bei Start-up-Fenster offen, neuer TSAT, bevorstehendem Frequenzwechsel und neuen CPDLC-Nachrichten.

Live-Adresse: https://sbelic95.github.io/vdgs-slot-board/ · Code: https://github.com/sbelic95/vdgs-slot-board

- Sprache der Oberfläche: Deutsch, Luftfahrtbegriffe auf Englisch
- Design: dunkle Flughafen-Anzeige, Akzent Flughafen-Gelb `#ffcc00`, Schriften „Barlow Condensed“ (Überschriften), „B612“ / „B612 Mono“ (Text und Zahlen, Airbus-Cockpitschrift) ; liegen als woff2 in `vendor/fonts/` (keine Anfragen an Google Fonts, Datenschutz)
- Läuft als PWA: „Zum Home-Bildschirm“ auf dem iPad, Vollbild, App-Icon
- Alle Daten kommen direkt im Browser von öffentlichen APIs (alle mit `Access-Control-Allow-Origin: *`), keine API-Schlüssel, keine Datenbank, kein Backend

## 2. Dateiliste

| Datei | Zweck |
|---|---|
| `index.html` | Die komplette App: Markup, CSS (im `<style>`), JavaScript (im `<script>`). Einzige Datei mit Logik. Lädt Leaflet 1.9.4 und die Schriften aus `vendor/`. |
| `airports.json` | Kompakte Flughafen-Datenbank (29.306 Flughäfen): `{"ICAO": [lat, lon, "Stadt", "Zeitzone"]}`. Erzeugt aus github.com/mwgg/Airports (MIT-Lizenz). Wird erst im Passagier-Modus geladen. |
| `manifest.webmanifest` | PWA-Manifest (Name, Farben, Icons, `display: standalone`) |
| `sw.js` | Service Worker: lädt immer zuerst vom Server (ohne HTTP-Cache) und nutzt den Speicher nur offline. API-Daten werden nie gecacht. Bei neuer Version lädt die Seite einmal automatisch neu. |
| `icon.svg` | App-Icon als Vektor (Favicon, Manifest) |
| `icon-180.png` | Apple-Touch-Icon fürs iPad (180×180) |
| `icon-512.png` | Manifest-Icon (512×512) |
| `vendor/` | Leaflet 1.9.4 (`leaflet.js`, `leaflet.css`), `fonts.css` und `fonts/*.woff2` (B612, B612 Mono, Barlow Condensed; OFL). Alles lokal, damit keine IP-Adresse an Google/CDNs geht. |
| `LIZENZEN.md` | Datenschutz-Hinweis und Lizenzen aller enthaltenen Teile |
| `bridge/vdgs_bridge.py`, `bridge/ANLEITUNG-BRIDGE.md`, `bridge/requirements.txt` | Simulator-Bridge für MSFS (Python) und ihre Anleitung |
| `bridge/installer/VDGS-Setup.iss`, `info-de.txt`, `info-en.txt`, `icon.ico` | Inno-Setup-Skript für `VDGS-Setup.exe` (flightsim.to) |
| `.github/workflows/ukcp-stands.yml`, `.github/workflows/stands.yml`, `.github/scripts/stands.py` | GitHub-Jobs: VATSIM-UK-Stands (5 min, Zweig `data`), Stand-Daten (täglich, Zweig `stands`) |
| `.github/workflows/atc-data.yml` | GitHub-Job täglich: Anflugbereiche (`tracons.json`, SimAware TRACON Project) und Pisten (`runways.json`, OurAirports), Zweig `atc` |
| `ANLEITUNG.md` | Bedienungsanleitung für den Piloten (Online stellen, iPad, Status) |
| `UEBERGABE.md` | Diese Datei |

Zum Hosten werden `index.html`, `airports.json`, `manifest.webmanifest`, `sw.js`, die drei Icons und der Ordner `vendor/` gebraucht. Jeder statische Host funktioniert (GitHub Pages, Netlify, Cloudflare Pages). Wichtig: Die Seite muss über `https://` laufen (Service Worker, Wake Lock).

## 3. Externe Datenquellen (APIs)

| # | Endpoint | Liefert | Abfrage-Intervall |
|---|---|---|---|
| A | `https://viff-system.network/ifps/callsign?callsign=<CS>` | Ein Flug-Objekt mit CDM-Zeiten. Leere Antwort (0 Byte), wenn der Flug unbekannt ist. | 20 s |
| B | `https://viff-system.network/ifps/depAirport?airport=<ICAO>` | Array aller Abflüge eines Flughafens (gleiches Format wie A). Kann ein Callsign doppelt enthalten. | 45 s |
| C | `https://data.vatsim.net/v3/vatsim-data.json` | VATSIM-Live-Daten: `pilots`, `prefiles`, `controllers`, `atis` (mehrere MB) | 15 s |
| D | `https://www.simbrief.com/api/xml.fetcher.php?username=<NAME>&json=v2` (oder `userid=<ID>`) | Neuestes SimBrief-OFP inkl. `navlog` (Wegpunkte für die Karte) | 5 min und per Button |
| E | `https://metar.vatsim.net/<ICAO>` | METAR als Klartext (Abflughafen; im Passagier-Modus auch Zielflughafen) | 5 min |
| B2 | wie B, aber für den **Zielflughafen** | Anschlussflüge (nur im Passagier-Modus) | 60 s |
| G | `https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson` und `…/VATSpy.dat` | Luftraumgrenzen (FIR, 1.219 Flächen) und Zuordnung Center-Rufzeichen → FIR/UIR. Dieselben Daten wie die VATSIM-Karten. | einmal beim Start (ca. 3 MB) |
| H | `https://www.hoppie.nl/acars/system/connect.html` (POST: `logon`, `from` = Callsign, `to=SERVER`, `type=peek`) | CPDLC- und Telex-Nachrichten des eigenen Callsigns. **peek** liest nur und markiert nichts als abgeholt; das ACARS im Flugzeug bekommt weiterhin alles. CORS ist offen. | 60 s |
| I | `https://ntfy.sh/` (POST JSON `{topic, title, message, tags, priority}`) | Push-Nachricht aufs Handy (ntfy-App, Thema abonnieren) | bei Ereignissen |
| F | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` und `…/Reference/World_Boundaries_and_Places/…` | Kartenkacheln (Satellit, Grenzen, Ortsnamen), ohne Schlüssel. Hinweis: CARTO-Kacheln verlangen inzwischen einen API-Schlüssel. | beim Zoomen |

**Aktualisierung:**
- Jede Quelle hat einen eigenen Zeitplan. Ein Sekundentakt startet alles, was überfällig ist, und eine Abfrage läuft nie doppelt (`guard()`).
- Wenn das iPad aufwacht oder die App wieder in den Vordergrund kommt (`visibilitychange`, `pageshow`, `focus`, `online`), wird sofort alles neu geladen.
- Jede Anfrage hat `cache: "no-store"` und einen `_=<Zeit>`-Parameter gegen iOS-Caching.
- Der Knopf „Aktualisieren“ lädt alles sofort und prüft auf eine neue App-Version.
- Die Live-Anzeige oben zeigt das Alter der Daten („Live · vor 8 s“) und wird gelb, wenn die Daten älter als 75 s sind.

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

## 5-IF. Pilot-Modus im Flug (`renderEnroute()`, `renderPilotArr()`)

Sobald der eigene Flug in der Luft ist (VATSIM-Groundspeed über 60 kt oder ATOT), zeigt der Pilot-Modus keine Slot-Daten mehr, sondern eine Im-Flug-Ansicht. Sie bleibt bis zum Gate am Ziel (unter 15 km vom Ziel). Mit dem Knopf „Slot“ geht es zurück zur Slot-Ansicht, mit „Im-Flug-Ansicht“ wieder hin (`S.forceSlot`).

**Ankunftszeit**, groß, in UTC, deutscher Zeit (Europe/Berlin, `fmtDE()`) und Ortszeit am Ziel. Ist das Ziel in Deutschland, steht an dritter Stelle die Restflugzeit.
- In der Luft: jetzt + Restentfernung ÷ Groundspeed
- Sonst Plan: Abflugzeit (ATOT, TTOT oder SimBrief) + geplante Flugzeit, sonst ETA aus vIFF oder SimBrief

**Weitere Inhalte:**
- **Nächste Frequenz** (groß): aus dem Frequenz-Führer; eine CPDLC-Anweisung („CONTACT/MONITOR“) hat Vorrang. Darunter die aktuelle Station.
- **Flugdaten:** Höhe (FL/ft und m, Steig- und Sinkrate), Groundspeed (kt und km/h), Entfernung zum Ziel (nm und km)
- **ATIS des Zielflughafens:** Buchstabe, Frequenz, kompletter Text; dazu das METAR in Kurzform (Wind, Sicht, QNH, Temperatur, Wetterlage) und als Rohtext
- **CPDLC:** die letzten drei Nachrichten
- **Statt der Abflugtafel:** Ankünfte am Ziel mit der eigenen Position („Du bist #3 von 9 Ankünften“)
- **Seitenkarten:** Wetter/ATIS und ATC online zeigen jetzt den Zielflughafen.

**Oben in der Leiste:** UTC und deutsche Uhrzeit (Europe/Berlin), immer sichtbar.

## 5-G. Gate / Stand am Ziel (`loadStands()`, `buildStands()`, `predictStand()`, `gateInfo()`, `announceGate()`)

**Quellen, in dieser Reihenfolge:**
1. **Echte Zuteilung von VATSIM UK** für britische Flughäfen. Die Daten stehen im Branch `data` als Datei `ukcp.json`.
   - Ein GitHub-Job (`.github/workflows/ukcp-stands.yml`) holt sie alle 5 Minuten von `ukcp.vatsim.uk/api/stand/assignment` und `/stand/dependency`.
   - Die App liest sie über `raw.githubusercontent.com` (CORS offen) alle 2 min, sobald das Ziel mit „EG“ beginnt.
   - Angezeigt wird die Zuteilung sofort, gekennzeichnet als „von VATSIM UK zugeteilt“.
2. **Prognose** für alle anderen Flughäfen.

**Stand-Daten** (Stands, Gates, Terminals, Fracht- und GA-Vorfelder aus OpenStreetMap):
- Für ~250 große Flughäfen baut ein täglicher GitHub-Job sie vor (fehlende Flughäfen zuerst) (`.github/workflows/stands.yml` und `.github/scripts/stands.py`). Ergebnis: eine Datei `<ICAO>.json` pro Flughafen im Branch `stands`.
- Für andere Flughäfen fragt die App live bei Overpass an: zuerst `overpass-api.de`, sonst `maps.mail.ru`. Zwischen Fehlversuchen wartet sie doppelt so lange, höchstens 5 min.
- Zwischenspeicher: 7 Tage in `localStorage["vdgs.stands4.<ICAO>"]`.
- **Felder pro Stand:**
  - `ref`, `lat`, `lon`
  - `gate`: Gate mit gleicher Nummer
  - `c`: Kontaktstand, d. h. Gate gleichen Namens oder Gate unter 120 m entfernt
  - `t`: nächstes Terminal bis 1,5 km, Name vereinheitlicht zu „Terminal 1“
  - `cargo`, `ga`: Lage in einem benannten Fracht- oder GA-Vorfeld oder neben einem Fracht- bzw. Business-Aviation-Terminal
- `buildStands()` (JavaScript) und `build()` (Python) müssen gleich bleiben.

**Prognose** (`predictStand()`), Ebenen in dieser Reihenfolge:
1. **Art des Flugs:**
   - Fracht (Callsign-Präfix in `CARGO`) → Fracht-Vorfeld
   - Privat/GA (Callsign ohne Airline-Code, z. B. DEHBH, N123AB) → GA-Vorfeld
   - sonst Außenpositionen
2. **Feste Flughafen-Regeln** (`GATE_RULES`): nach Airline, Allianz und Schengen, entweder über Stand-Präfix (`pre`) oder OSM-Terminalnamen (`tn`).

   | Flughafen | Regel |
   |---|---|
   | EDDF | A / B,C (Terminal 1, Star) · D / E (Terminal 2) |
   | EGLL | 5xx BA · 2xx Star · 3xx oneworld u. a. · 4xx Rest |
   | OMDB | Emirates A/B/C · flydubai F/G · Rest D |
   | LSZH | Schengen A/B · Non-Schengen E/D |
   | EHAM | Low-Cost M · Schengen B/C/D · Non-Schengen E/F/G/D |
   | EDDM | Star → Terminal 2 · Rest → Terminal 1 |
   | LEMD | oneworld, Iberia Express, Air Europa, Vueling → T4 · Rest → T1–3 |
   | LIRF | SkyTeam/ITA Schengen → T1 · Rest → T3 |
   | LPPT | Low-Cost → T2 · Rest → T1 |
   | EIDW | Aer Lingus und Langstrecke → T2 · Rest → T1 |
   | LEBL | easyJet → T2 · Rest → T1 |
   | EBBR | Schengen → Pier A · Non-Schengen → Pier B |
   | LFPG | SkyTeam → 2E/2F/2G · Star → T1 · Low-Cost → 2B/2D/3 · Rest → 2A/2C/1 |

3. **Allgemeine Regeln für alle Flughäfen:**
   - Heimat-Airline (`HUBS`) → Kontaktstände im Hauptterminal (das Terminal mit den meisten Kontaktständen)
   - Low-Cost und Turboprops (`PROP`), außer Großraumflugzeugen (`WIDE`) → Außenpositionen
   - andere Airlines → Kontaktstände in den übrigen Terminals
   - sonst beliebige Kontaktstände
4. **Belegung:** Stands mit einem VATSIM-Flugzeug am Boden (< 5 kt, < 60 m) werden übersprungen.
5. **Wahl:** fest pro Callsign (Hash) und bei der Bekanntgabe eingefroren.

**Ablauf:**
- Bekanntgabe ca. 30 min vor Ankunft mit Gong, gelbem Blinken und Push (`settings.pushGate`).
- Echte VATSIM-UK-Zuteilungen erscheinen, sobald sie da sind; Gong und Push kommen auch hier erst 30 min vor Ankunft.
- Nach dem Parken zeigt die App den tatsächlichen Stand.

**Navigraph:** Für Webseiten verlangt Navigraph eine Partnerschaft (Entwickler-Zugang beantragen), einen eigenen Server und ein Abo der Nutzer. Nicht eingebunden.

**GitHub-Jobs:**
- **Zeitplan:** `*/5 * * * *` (UK) und täglich 03:17 UTC (Stand-Daten). Beide lassen sich unter „Actions“ von Hand starten („Run workflow“).
- **Speicher:** Jeder Lauf schreibt genau einen Commit in seinen Branch (Force-Push), der Branch wächst also nicht.
- **Hinweis:** GitHub kann zeitgesteuerte Jobs abschalten, wenn im Repository 60 Tage lang nichts passiert. Dann unter „Actions“ wieder einschalten.

## 5-S. Simulator-Bridge (`bridge/vdgs_bridge.py`, in der App `pollSim()`, `simPilot()`, `tuneBtn()`)

**Zweck:** Daten direkt aus MSFS 2020/2024 (SimConnect), auch ohne VATSIM-Verbindung, und Steuerung vom Tablet (COM1, Squawk).

**Bridge (Python, läuft auf dem Simulator-PC):**
- Liest per `SimConnect` (PyPI-Paket `SimConnect`) jede Sekunde:
  - Position, Höhe, Groundspeed, IAS
  - Kurs (die Bibliothek liefert Bogenmaß; wird in Grad umgerechnet)
  - Vertikalgeschwindigkeit (ft/min), am Boden ja/nein
  - COM1 aktiv und Standby (MHz), Transponder (BCD → „7000“), TITLE, ATC_ID
- Liefert die App selbst aus, weil Safari einer `https`-Seite den Zugriff auf `http`-Geräte im Heimnetz verbietet: `http://<PC-IP>:8770/`.
  - Die App-Dateien lädt sie beim Start von GitHub Pages nach `bridge/app/`.
  - `--app-dir` nimmt stattdessen einen lokalen Ordner.
- **Schnittstelle:**
  - `GET /sim` → JSON mit `vdgsBridge: true`, `connected`, `lat`, `lon`, `alt`, `gs`, `ias`, `hdg`, `vs`, `onGround`, `com1`, `com1sb`, `squawk`, `title`, `atcId`, `age`
  - `POST /sim/com1` `{mhz, target: "standby"|"active"}` → MSFS-Events `COM_STBY_RADIO_SET_HZ` / `COM_RADIO_SET_HZ` (Hz, auch 8,33 kHz). Erlaubt sind 118,000 bis 136,990 MHz.
  - `POST /sim/squawk` `{code: "2341"}` → `XPNDR_SET` (BCD), nur Ziffern 0–7
- `--test`: Test-Flugzeug ohne Simulator; die Befehle ändern dann nur die Testwerte.
- Ist MSFS nicht gestartet, versucht die Bridge alle 4 s eine neue Verbindung, und `/sim` meldet `connected: false`.

**App:**
- Unter `http:` fragt die App jede Sekunde `sim` ab.
- Findet sie den eigenen Flug nicht im VATSIM-Feed, baut sie aus den Simulator-Daten einen Ersatz-Piloten (`simPilot()`, `S.pilotSrc = "sim"`). So funktionieren Karte, Phase, ETA, Frequenz-Führer, Gate und Passagier-Ansicht.
- Die Vertikalgeschwindigkeit kommt dann direkt aus dem Simulator. Der Status-Chip zeigt „Simulator (MSFS)“.
- **Knöpfe:** „COM1 STBY“ / „COM1 AKTIV“ bei der nächsten Frequenz und bei der CPDLC-Anweisung. Darunter steht, was im Simulator in COM1 eingestellt ist (grün = passt). „Squawk XXXX setzen“ erscheint, wenn VATSIM einen Squawk zugeteilt hat und der Simulator anders steht.
- **Grenzen:** Die Bridge wurde nur im Testmodus geprüft, nicht mit laufendem MSFS. MSFS 2024 ist nicht getestet. Wake Lock und Service Worker gibt es unter `http` nicht.

### Installer und Heimnetz (seit 25.10.2026)

- `VDGS-Setup.exe` (Inno Setup, `bridge/installer/VDGS-Setup.iss`): installiert `VDGS-Bridge.exe` nach `Programme\VDGS Bridge`, legt Startmenü-Einträge an (Bridge, Testmodus, Anleitung, Lizenzen, Web-Version), optional Desktop-Symbol, und eine Firewall-Regel nur für **private** Netzwerke (`netsh advfirewall`, beim Deinstallieren entfernt). Admin-Rechte nötig. Nicht signiert.
- Die installierte exe speichert die geladene App in `%LOCALAPPDATA%\VDGS-Bridge\app` (Programme ist schreibgeschützt). In der exe steckt zusätzlich eine Kopie der App für den ersten Start ohne Internet.
- Beim Start öffnet sich `http://localhost:8770/connect`: QR-Code (Paket `qrcode`, SVG) mit der Heimnetz-Adresse. Abschalten mit `--no-browser`. Beliebig viele Geräte können gleichzeitig zusehen.

## 5-L. Sprachen

Fünf Sprachen: Deutsch (Quelltext), Englisch, Serbisch (lateinisch), Russisch, Chinesisch (vereinfacht). `TX`/`TXP` liefern Englisch und Serbisch für alles; `TX2`/`TXP2` liefern Russisch und Chinesisch für alles, was Passagiere sehen (Sitzdisplay, Karte, Zielort, Tafeln, Status, Wetter). Pilotentexte erscheinen in Russisch/Chinesisch auf Englisch.
 (`tr()`, `setLang()`)

Oben rechts gibt es die Auswahl **DE / EN / SR** (Serbisch in lateinischer Schrift), gespeichert in `localStorage["vdgs.lang"]`.

- Die App erzeugt alle Texte auf Deutsch. Ein `MutationObserver` übersetzt jeden neuen oder geänderten Text im DOM sowie die Attribute `placeholder`, `title` und `aria-label`.
- **Reihenfolge:**
  1. ganzer Text in der Tabelle `TX` (Deutsch → [Englisch, Serbisch])
  2. sonst jedes Stück getrennt an „ · “
  3. sonst Muster in `TXP` (reguläre Ausdrücke mit `$1`, z. B. „in ca. 12 min“ → „in approx. 12 min“)
- Der deutsche Ursprungstext wird pro Textknoten gemerkt (`WeakMap`), damit das Umschalten in jede Richtung funktioniert.
- **Nicht übersetzt:** ATIS-, METAR-, CPDLC-Texte, Routen und Callsigns (Klassen `.txt`, `.en-raw`, `.metar`, `.rte`, `.tx`, `.raw`, `.letter`, `.cs`, `.cs3`).
- **Formate:** Zahlen und Datum über `LOC()` (de-DE, en-GB, sr-Latn-RS); Himmelsrichtungen über `compass()`.
- **Neue Texte:** Einen deutschen Text im Code hinzufügen und in `TX` (fester Text) oder `TXP` (Text mit Zahlen/Namen) eintragen.

## 5a. Frequenz-Führer (Pilot-Modus, `freqPlan()`, `renderFreq()`)

Die Karte zeigt **Aktuell** (Station und Frequenz), **Als nächstes** (mit Auslöser, Minuten und km) und darunter alle weiteren Stationen bis zum Ziel.

- **Flughafen-Stationen:** Lotsen, deren Rufzeichen mit `<ICAO>_` beginnt (in den USA auch ohne „K“, z. B. `JFK_`). Zuordnung über `facility`: 2 DEL, 3 GND, 4 TWR, 5 APP (`_DEP` = Departure).
- **Center:** Der Rufzeichen-Präfix eines Lotsen (z. B. `EDGG_CH` aus `EDGG_CH_CTR`) wird in `VATSpy.dat` gesucht, zuerst `[FIRs]`, dann `[UIRs]`. So bekommt man die Grenzflächen-IDs, die die Station abdeckt (`ctrIndex()`). Eine Position liegt in einer FIR, wenn der Punkt im Polygon liegt (`firsAt()`). Die eigene FIR hat Vorrang vor der UIR darüber.
- **Top-down (VATSIM-Regel):** Ist eine Station offline, übernimmt die nächsthöhere: DEL → GND → TWR → APP/DEP → CTR (`td()`). Ist niemand online, zeigt die App **UNICOM 122.800**.
- **Ablauf:**
  - Am Boden: Streckenfreigabe → Pushback & Rollen → Start (Rollhalt) → Abflug (nach dem Start)
  - Danach jedes Center entlang der Route (`ctrSequence()`: Route in 15-km-Schritten abgetastet, SimBrief-Navlog oder Großkreis) mit Entfernung bis zur Luftraumgrenze
  - Zum Schluss Anflug (ca. 100 km vor dem Ziel), Landung (ca. 20 km vorher) und Rollen zum Gate

  Aufeinanderfolgende Schritte bei derselben Station werden zusammengefasst.
- **Bald wechseln:** gelb pulsierend, wenn der nächste Wechsel in höchstens 3 min oder 25 km kommt.
- **ATIS:** 300 km vor dem Ziel erscheint der Hinweis, die Ziel-ATIS (Buchstabe und Frequenz) zu hören.
- **Alle Stationen (seit 25.10.2026, nach einem Event mit fehlenden Frequenzen):** `aptStations()` findet Flughafen-Lotsen über
  1. den ICAO-Präfix (`EDDM_`, `EDDM_N_APP`), in den USA auch ohne „K“,
  2. IATA/LID-Kürzel aus `VATSpy.dat` `[Airports]` (z. B. `AD_APP` für YPAD),
  3. die Anflugbereiche des SimAware TRACON Project (`tracons.json` auf dem Zweig `atc`, `pollTracon()`): Präfixe und Suffix eines Bereichs, der den Flughafen enthält (z. B. `IST_W_APP`, `NY_CAM_APP`).

  4. Center: zuerst das Rufzeichen-Präfix aus `VATSpy.dat`, sonst der FIR-Code selbst (`LECB_CTR`, `LECM_CTR`: VATSpy führt dafür LEBL / LEMD; betrifft 156 FIRs).

  Mehrere Stationen derselben Art (z. B. EDDM_N_APP und EDDM_S_APP) werden alle gezeigt („auch: …“, `altLine()`), ebenso parallele Center (`ctrAt()` liefert `alts`). Lotsen ohne Frequenz (199.998, `onAir()`) werden übersprungen. Die ATC-Karte im Pilot-Modus listet alle Stationen des Flughafens plus das Center darüber. Live-Prüfung: alle 102 Stationen eines Abends zugeordnet.
- **Grenzen:** Sektoren innerhalb einer FIR (z. B. mehrere `EDGG_…_CTR`) unterscheidet die App nicht genau, weil VATSIM keine Sektorgrenzen veröffentlicht. Sie nimmt die erste passende Station. Die Übergabe-Entfernungen für Anflug und Tower sind Schätzwerte.

## 5b. Passagier-Modus (Bordunterhaltungssystem)

**Flugkarte**
- **Position:** `latitude`, `longitude`, `heading`, `groundspeed` und `altitude` des eigenen Piloten aus dem VATSIM-Feed. Zwischen den Meldungen rechnet die App die Position mit Kurs und Geschwindigkeit sekündlich weiter (`livePos()`, max. 60 s).
- **Umrechnung:** km/h = kt × 1,852 · m = ft × 0,3048 · Entfernungen als Großkreis (`distKm()`).
- **Flughäfen:** Koordinaten aus dem SimBrief-OFP, sonst aus `airports.json`. Stadt und Zeitzone aus `airports.json`. Fallback: Zeitzonen-Offset aus dem OFP, sonst UTC.
- **Route:** SimBrief-Navlog-Wegpunkte, wenn das OFP passt, sonst Großkreis (gestrichelt).
- **Track:** gelbe Linie in `localStorage["vdgs.track"]`, pro Callsign; verfällt nach 6 h ohne neue Punkte, max. 3000 Punkte.
- **Ankunftszeit (ETA):**
  1. In der Luft (GS > 100 kt): jetzt + Restentfernung ÷ Geschwindigkeit
  2. Sonst TTOT oder geplanter Abflug + geplante Flugzeit aus SimBrief
  3. Sonst ETA aus vIFF, sonst `est_on` aus SimBrief

  Angezeigt wird die Ortszeit am Ziel.
- **Flugphase:** Am Gate, Rollen, Steigflug, Reiseflug, Sinkflug, Landeanflug, Gelandet, Angekommen. Steig- und Sinkflug gelten ab ±400 ft/min aus den letzten zwei Track-Punkten.
- **Außentemperatur:** VATSIM liefert keine. Die App schätzt sie aus der Standardatmosphäre (15 °C − 1,98 °C je 1000 ft, ab 36.089 ft konstant −56,5 °C) und zeigt am Boden den METAR-Wert des Abflughafens.
- **Wind:** nur im Reiseflug, geschätzt als Groundspeed minus geplante TAS aus dem Flugplan (Rücken- oder Gegenwind, „ca.“).
- **Wetter am Ziel:** Temperatur und Wetterlage aus dem METAR des Zielflughafens.
- **Ortszeiten:** für Abflug- und Zielort im Routen-Kopf.
- **Flugzeug im Klartext:** Typcode → Name (`AC_NAMES`, z. B. B38M → Boeing 737 MAX 8). Angezeigt oben rechts neben dem Callsign.
- **Kabinen-Meldungen:** „Willkommen an Bord · Flug … nach … · Flugzeit ca. …“ am Gate, „Willkommen in … · Ortszeit · Wetter“ nach der Landung.
- **Rundlauf:** Der Knopf „Rundlauf“ wechselt automatisch zwischen Flugkarte (40 s), Zielort und Anschlussflügen (je 20 s), wie im Flugzeug (`localStorage["vdgs.auto"]`).

**Anschlussflüge** (`buildConn()`)
- **Quellen:** Alle VATSIM-Piloten und Prefiles mit `departure` = Zielflughafen, ergänzt um die vIFF-CDM-Daten dieses Flughafens.
- **Zeit:** TSAT, sonst TOBT, sonst EOBT, sonst `deptime`, in Ortszeit am Ziel.
- **Status:**

  | Status | Bedingung |
  |---|---|
  | Gestartet | ATOT vor höchstens 20 min, oder in der Luft und unter 40 km vom Flughafen |
  | Rollt | GS ≥ 3 kt |
  | Gate geschlossen | TSAT-Fenster offen |
  | Boarding | verbunden, höchstens 40 min bis zur Abflugzeit |
  | Planmäßig | alle anderen |
  | Verspätet | nur Prefile und mehr als 15 min über der Zeit |

- Angezeigt werden Abflüge zwischen −90 min und +12 h. Flüge, die vor der eigenen Ankunft abfliegen, sind ausgegraut.

**Zielort** (`renderDest()`, `decodeMetar()`)
- Ortszeit, Datum und Zeitzone über `Intl.DateTimeFormat`
- METAR des Zielflughafens übersetzt in Temperatur (°C), Wetterlage (Gewitter, Schnee, Regen, Nebel, bewölkt, klar …), Wind (km/h, Himmelsrichtung, Böen), Sicht (km), Luftdruck (hPa), Taupunkt, Wolkenuntergrenze (m) und Luftfeuchte (Magnus-Formel)

**Ankünfte** (`buildArrs()`, `renderArr()`)

Alle VATSIM-Flüge mit `arrival` = Zielflughafen:

| Status | Zeit | Bedingung |
|---|---|---|
| Unterwegs / Im Anflug | jetzt + Entfernung ÷ Groundspeed | in der Luft; „Im Anflug“ unter 100 km |
| Geplant | `deptime` + `enroute_time` aus dem Flugplan | noch am Boden woanders, oder Prefile |
| Gelandet | — | rollt (GS 3–50 kt) unter 15 km vom Ziel |
| Am Gate | — | steht (GS < 3 kt) unter 15 km vom Ziel; ans Ende sortiert, höchstens 6 |

Der eigene Flug ist gelb markiert („Ihr Flug“).

**Gespeicherte Ansicht:** `localStorage["vdgs.view"]` („slot“ = Pilot, „ife“ = Passagier, „fids“ = Tafel) und `localStorage["vdgs.pane"]` („map“, „conn“, „arr“, „dest“).

## 5b-A. Airline-Look (`AIRLINES`, `brandOf()`, `renderBrand()`)

- Tabelle `AIRLINES`: ICAO-Code → IATA, Name, zwei Farben, Schriftfarbe (ca. 50 Airlines, z. B. SWR, UAE, DLH, AUA, QTR, THY).
- Passt der Callsign-Präfix, bekommt die Passagier-Ansicht die Klasse `branded` und die CSS-Variablen `--air-1`, `--air-2`, `--air-ink`. Kopfleiste, Flugzeug und Track auf der Karte und die Begrüßung nehmen die Airline-Farben.
- Logo: `https://pics.avs.io/240/80/<IATA>.png`, zur Laufzeit geladen (nicht im Code enthalten), `referrerpolicy="no-referrer"`. Fehlt es, bleibt nur der Name.
- Hinweis immer sichtbar: „Inoffiziell · nicht mit der Airline verbunden · Logo © Inhaber“.

## 5b-R. Landebahn am Ziel (`atisRunways()`, `landingRunway()`, `rwyHtml()`)

Reihenfolge der Quellen:
1. **ATIS des Zielflughafens** (Arrival-ATIS zuerst): Pisten nach „RWY/RUNWAY/RY“, auch „30 RIGHT“ → 30R, „RWY 25R AND 25L“, „ILS APPROACH RWY 07“. Die Wörter davor entscheiden Landung (ARR, LANDING, APPROACH, ILS, EXPECT …) oder Start (DEP, TAKEOFF …).
2. **Wind aus dem METAR** (ab ca. 5 kt): Piste mit dem größten Gegenwind aus `runways.json` (OurAirports, Zweig `atc`); bei Gleichstand die längste.
3. **SimBrief-Plan** (`arrRwy`).

Angezeigt im Pilot-Modus im Flug neben dem Gate (`#enRwy`) und im Passagier-Zielort („Landebahn“). Live-Prüfung: 110 von 124 ATIS lieferten eine Landebahn; die übrigen nennen nur Startbahnen oder sind geschlossen.

## 5b-S. Sitzdisplay einer Airline (`SEAT_SKINS`, `renderSeat()`, `loadMedia()`, `playVideo()`, `safetyCheck()`)

- **Aktiv:** wenn das Callsign zu einer Airline in `SEAT_SKINS` gehört (zurzeit `JU` = Air Serbia, Callsign `ASL…`). Die Passagier-Ansicht bekommt die Klasse `seat`: heller Bildschirm mit Ornament-Muster, Abzeichen mit Flugnummer oben links, Logo oben rechts, blaue Leiste unten (Zurück, Start, Sprache, Hilfe, Flugkarte; rechts Zeit/Entfernung zum Ziel und Außentemperatur).
- **Design nach Air Serbia Brand Guidelines 2025:** Schrift Roboto / Roboto Condensed (lokal in `vendor/fonts`, Apache 2.0), Farben Stratosphere Blue `#002E5D`, Sky Blue `#0059C2`, Beacon Red `#E3001F`, Airstream Silver `#75787B`, Lunar Silver `#A7A8AA`, Cloudline White `#FFFFFF`. Logo wie bisher zur Laufzeit von pics.avs.io (nicht im Code).
- **Seiten (Panes):** `welcome` (Willkommen an Bord + START), `home` (Kacheln: Filme, Flugkarte, Zielort, Anschlussflüge, Ankünfte, Sicherheit an Bord), `movies`, dazu die bekannten `map`, `dest`, `conn`, `arr` im hellen Look. Nach 3 min ohne Berührung zurück zur Flugkarte.
- **Videos:** nie im Repository. Quellen: Bridge `GET media/list` + `GET media/<name>` (Byte-Range, nötig für Safari) aus `Videos\VDGS` auf dem PC; oder auf dem Gerät per Datei-Auswahl, gespeichert in IndexedDB `vdgs-media`. Vorschaubilder macht der Browser selbst (Canvas, nicht schwarzes Bild).
- **Sicherheitsvideo:** Dateiname enthält „Safety“ (oder sigurnost/Sicherheit). Startet bei **jedem** Pushback am Abflughafen (`SAFE`): scharf, solange das Flugzeug steht (mit Bridge: Parkbremse gesetzt, `BRAKE_PARKING_POSITION`; über VATSIM: 30 s Stillstand); Start, sobald die Bremse gelöst ist und sich das Flugzeug bewegt (Bridge: `PUSHBACK_STATE` ≠ 3 oder ≥ 1 kt; VATSIM: ≥ 2 kt). Wieder geparkt = beim nächsten Push wieder. Test: `VDGS-Bridge.exe --test-push` (alle 80 s ein Pushback).
- **iPad-Regel:** Video mit Ton nur nach einem Tippen. Der START-Knopf spielt einmal einen 0,4-s-Stummclip im selben `<video>`-Element ab; danach darf es später von selbst starten. Klappt es nicht, erscheint „zum Starten auf ▶ tippen“.
- **Air-Serbia-Ausgabe:** `airserbia/index.html` lädt `../index.html`, setzt `<base href="../">` und `window.VDGS_EDITION = "ASL"` und schreibt die Seite neu (immer die aktuelle App, keine Kopie). `FORCE_AIRLINE` (auch `?airline=ASL`) zeigt dann für jedes Callsign das Air-Serbia-Sitzdisplay; nichts davon wird gespeichert. Eigenes Manifest `airserbia/manifest.webmanifest` für das Home-Bildschirm-Symbol.
- **Demo:** `?demo=ASL500` (Willkommensseite), `?demo=ASL500,inflight` (im Reiseflug), `?demo=ASL500,push` (Pushback in Frankfurt: Sicherheitsvideo startet).

## 5c. Tafel (FIDS, `renderFids()`, `pollFids()`)

- Flughafen per Eingabefeld oder `?fids=ICAO`, gespeichert in `localStorage["vdgs.fids"]`.
- Abflüge: dieselbe Logik wie die Anschlussflüge (`buildDeps()`), mit vIFF-CDM des Flughafens alle 60 s.
- Ankünfte: `buildArrs()` (siehe oben).
- Alle Zeiten in Ortszeit des Flughafens. Die Tafel braucht keinen eigenen Flug.

## 5d. Push aufs Handy (`notifyPhone()`)

- Dienst: ntfy.sh, kostenlos, ohne eigenen Server und ohne Konto. Das Handy abonniert in der ntfy-App ein **Thema**. Der Knopf „Neu“ erzeugt ein zufälliges Thema (`vdgs-xxxxxxxxxx`).
- Gesendet wird vom iPad, solange die App dort offen ist.
- **Ereignisse:**
  - Start-up-Fenster offen (einmal pro TSAT)
  - neue TSAT während des Wartens
  - Frequenzwechsel „bald“ (einmal pro Station)
  - neue CPDLC-Nachricht

  Jedes Ereignis lässt sich in den Einstellungen einzeln abschalten.
- **Datenschutz:** Wer den Themennamen kennt, kann mitlesen. Gesendet werden nur Callsign, Zeiten und Frequenzen.

## 5e. CPDLC (`pollCpdlc()`, `renderCpdlc()`)

- Der Hoppie-Logon-Code wird in den Einstellungen eingetragen und nur im Browser gespeichert (`localStorage["vdgs.settings"].hoppie`).
- Die Antwort sieht so aus: `ok {id from type {packet}} …`. CPDLC-Pakete haben die Form `/data2/<min>/<mrn>/<antwort>/<text>`; das `@` als Markierung wird entfernt.
- Eine „CONTACT“- oder „MONITOR“-Anweisung mit Frequenz erscheint 15 min lang ganz oben im Frequenz-Führer.
- Ist der Code falsch, zeigt die App „Hoppie-Logon-Code ungültig“.
- **Ungetestet:** der Empfang echter Nachrichten (es gab keinen echten Logon-Code zum Testen). Getestet sind die Anfrage, der Fehlerfall und das Auslesen der Antwort mit Beispieldaten.

## 6. Bekannte Grenzen

- Slot-Daten nur aus dem vIFF-CDM-System (viele europäische vACCs). Das deutsche vACDM (`app.vacdm.net`) hat keine offene, öffentliche API und ist nicht eingebunden.
- Push funktioniert nur, solange die App auf dem iPad offen ist (das iPad sendet).
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
| `loadDemo()` | Beispieldaten für `?demo` (als „Demo-Daten“ markiert). `?demo=SWR1VG` nimmt dieses Callsign (Airline-Look), `?demo=SWR1VG,inflight` startet im Reiseflug (Pilot-Ansicht im Flug). |
| `chime()` | Gong über die Web Audio API |
| `guard()`, `refreshAll()` | Abfragen ohne Überschneidung; alles sofort neu laden |
| `start()` | Zustand zurücksetzen, Abfragen starten |
| `setView()`, `setPane()` | Pilot/Passagier umschalten; Flugkarte/Anschlussflüge/Zielort |
| `renderIfe()`, `ensureMap()` | Flugkarte: Kacheln, Fortschritt, Leaflet-Karte |
| `pollConn()`, `buildConn()`, `renderConn()` | Anschlussflüge laden, zusammenführen, anzeigen |
| `pollArrWx()`, `decodeMetar()`, `renderDest()` | Wetter am Ziel laden, übersetzen, Zielort anzeigen |
| `livePos()`, `recordTrack()`, `vSpeed()` | Position weiterrechnen, Track speichern, Steig-/Sinkrate |
| `distKm()`, `greatCircle()`, `movePoint()` | Geo-Rechnungen (Großkreis) |
| `loadAirports()`, `aptInfo()`, `fmtAt()` | Flughafen-Daten, Ortszeit |
| `checkAppUpdate()` | Neue App-Version beim Server abfragen |
| `pollFir()`, `ctrIndex()`, `firsAt()`, `ctrAt()` | Luftraumgrenzen laden; welches Center deckt welche Position ab |
| `ctrSequence()` | Centers entlang der restlichen Route mit Entfernung |
| `aptStations()`, `td()`, `stn()` | Flughafen-Lotsen, Top-down-Regel, Anzeigename |
| `freqPlan()`, `renderFreq()` | Frequenz-Führer: aktuell, als nächstes, weitere |
| `acName()` | Flugzeugtyp im Klartext |
| `buildDeps()`, `buildArrs()`, `boardRows()` | Abflüge / Ankünfte eines Flughafens, Tabellenzeilen |
| `renderArr()` | Passagier: Ankünfte am Ziel |
| `pollFids()`, `renderFids()` | Tafel (FIDS) |
| `notifyPhone()` | Push über ntfy.sh |
| `pollCpdlc()`, `renderCpdlc()` | CPDLC über Hoppie (peek) |
| `renderEnroute()`, `renderPilotArr()` | Pilot-Modus im Flug: Ankunftszeit, nächste Frequenz, Ziel-ATIS, CPDLC, Ankünfte |
| `fmtDE()` | Uhrzeit in deutscher Zeit (Europe/Berlin) |
| `loadStands()`, `pollStands()`, `predictStand()`, `gateInfo()`, `gateHtml()`, `announceGate()` | Gate / Stand am Ziel |
| `tr()`, `trTree()`, `setLang()`, `compass()` | Sprachen |
| `pollSim()`, `simPilot()`, `simReady()`, `tuneBtn()` | Simulator-Bridge, COM1/Squawk vom Tablet |
| `pollTracon()`, `onAir()`, `altLine()` | Anflugbereiche, Lotsen mit Frequenz, weitere Stationen |
| `brandOf()`, `renderBrand()` | Airline-Look in der Passagier-Ansicht |
| `pollRunways()`, `atisRunways()`, `landingRunway()`, `rwyHtml()` | Landebahn am Ziel |

## 8. Ideen für später

**Erledigt:** Installer `VDGS-Setup.exe` mit QR-Verbindungsseite, Airline-Look, Landebahn am Ziel, alle Frequenzen bei Events, automatischer Rundlauf, Ankunftstafel am Ziel, FIDS-Tafel für jeden Flughafen, Push aufs Handy (über ntfy.sh statt eigenem Backend), CPDLC-Anzeige.

**Offen:**
- vACDM (Deutschland) einbinden, sobald eine öffentliche API verfügbar wird (`app.vacdm.net` war am 24.10.2026 von außen nicht erreichbar)
- Mehrere eigene Flüge gleichzeitig verfolgen
- Push auch bei geschlossener App: Dafür bräuchte es ein kleines Backend, das die Daten selbst abfragt.
- CPDLC-Antworten (WILCO/UNABLE) aus der App senden; bisher nur lesen
- **Datenschutz:** Die App speichert nur lokal im Browser. Daten gehen nur an die genannten Dienste (siehe `LIZENZEN.md`).
- Setup mit einem Code-Signing-Zertifikat signieren, damit SmartScreen nicht warnt.

Nur für Flugsimulation, nicht für die echte Luftfahrt.
