# Übergabe: VDGS Slot Board

Projektübergabe für die Weiterentwicklung (z. B. mit ChatGPT oder einem anderen Entwickler).
Stand: 24.10.2026.

## 1. Was die App ist

Eine statische Web-App (HTML, CSS und JavaScript in einer Datei, ohne Build-Schritt und ohne Server-Code) als Dauerbildschirm fürs iPad. Oben in der Leiste schaltet man zwischen zwei Modi um:

- **Pilot:** CDM-Slot (EOBT, TOBT, TSAT, TTOT, CTOT), Runway/SID, Status mit Countdown, SimBrief-OFP-Daten, VATSIM-Flugplan, ATIS, METAR, ATC online und eine Abflugtafel des Abflughafens.
- **Passagier:** Wie ein echtes Bordunterhaltungssystem, mit drei Bereichen:
  - **Flugkarte:** Satellitenkarte mit Route, Track und Flugzeug; Geschwindigkeit in km/h, Höhe in m, Entfernung in km, Restflugzeit, Ankunft in Ortszeit, Kurs, Flugphase
  - **Anschlussflüge:** nächste Abflüge am Zielflughafen aus VATSIM und vIFF
  - **Zielort:** Ortszeit, Datum, Wetter in °C, km/h, km und hPa

  Nach dem Start schaltet die App einmal pro Flug automatisch in den Passagier-Modus.

Live-Adresse: https://sbelic95.github.io/vdgs-slot-board/ · Code: https://github.com/sbelic95/vdgs-slot-board

- Sprache der Oberfläche: Deutsch, Luftfahrtbegriffe auf Englisch
- Design: dunkle Flughafen-Anzeige, Akzent Flughafen-Gelb `#ffcc00`, Schriften „Barlow Condensed“ (Überschriften), „B612“ / „B612 Mono“ (Text und Zahlen, Airbus-Cockpitschrift) von Google Fonts
- Läuft als PWA: „Zum Home-Bildschirm“ auf dem iPad, Vollbild, App-Icon
- Alle Daten kommen direkt im Browser von öffentlichen APIs (alle mit `Access-Control-Allow-Origin: *`), keine API-Schlüssel, keine Datenbank, kein Backend

## 2. Dateiliste

| Datei | Zweck |
|---|---|
| `index.html` | Die komplette App: Markup, CSS (im `<style>`), JavaScript (im `<script>`). Einzige Datei mit Logik. Lädt Leaflet 1.9.4 (Karte) von cdnjs. |
| `airports.json` | Kompakte Flughafen-Datenbank (29.306 Flughäfen): `{"ICAO": [lat, lon, "Stadt", "Zeitzone"]}`. Erzeugt aus github.com/mwgg/Airports (MIT-Lizenz). Wird erst im Passagier-Modus geladen. |
| `manifest.webmanifest` | PWA-Manifest (Name, Farben, Icons, `display: standalone`) |
| `sw.js` | Service Worker: lädt immer zuerst vom Server (ohne HTTP-Cache) und nutzt den Speicher nur offline. API-Daten werden nie gecacht. Bei neuer Version lädt die Seite einmal automatisch neu. |
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
| C | `https://data.vatsim.net/v3/vatsim-data.json` | VATSIM-Live-Daten: `pilots`, `prefiles`, `controllers`, `atis` (mehrere MB) | 15 s |
| D | `https://www.simbrief.com/api/xml.fetcher.php?username=<NAME>&json=v2` (oder `userid=<ID>`) | Neuestes SimBrief-OFP inkl. `navlog` (Wegpunkte für die Karte) | 5 min und per Button |
| E | `https://metar.vatsim.net/<ICAO>` | METAR als Klartext (Abflughafen; im Passagier-Modus auch Zielflughafen) | 5 min |
| B2 | wie B, aber für den **Zielflughafen** | Anschlussflüge (nur im Passagier-Modus) | 60 s |
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

**Gespeicherte Ansicht:** `localStorage["vdgs.view"]` („slot“ = Pilot, „ife“ = Passagier) und `localStorage["vdgs.pane"]` („map“, „conn“, „dest“). Der automatische Wechsel nach dem Start passiert einmal pro Callsign (`localStorage["vdgs.autoIfe"]`).

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

## 8. Ideen für später

- vACDM (Deutschland) einbinden, falls eine öffentliche API verfügbar wird
- Passagier-Modus: automatischer Wechsel zwischen Karte, Anschlussflügen und Zielort (wie im echten Flugzeug)
- Ankunftstafel am Zielflughafen (wer landet gleichzeitig)
- Mehrere Flüge oder ein ganzer Flughafen als reine FIDS-Tafel
- Push-Benachrichtigung aufs Handy, wenn das Start-up-Fenster öffnet (bräuchte ein kleines Backend)
- Hinweis zum Datenschutz: Die App speichert nur lokal im Browser und sendet nichts an eigene Server.

Nur für Flugsimulation, nicht für die echte Luftfahrt.
