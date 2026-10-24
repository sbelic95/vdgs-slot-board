# Übergabe: VDGS Slot Board

Projektübergabe für die Weiterentwicklung (z. B. mit ChatGPT oder einem anderen Entwickler).
Stand: 24.10.2026.

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
- Für ~250 große Flughäfen baut ein wöchentlicher GitHub-Job sie vor (`.github/workflows/stands.yml` und `.github/scripts/stands.py`). Ergebnis: eine Datei `<ICAO>.json` pro Flughafen im Branch `stands`.
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
- **Zeitplan:** `*/5 * * * *` (UK) und montags 03:17 UTC (Stand-Daten). Beide lassen sich unter „Actions“ von Hand starten („Run workflow“).
- **Speicher:** Jeder Lauf schreibt genau einen Commit in seinen Branch (Force-Push), der Branch wächst also nicht.
- **Hinweis:** GitHub kann zeitgesteuerte Jobs abschalten, wenn im Repository 60 Tage lang nichts passiert. Dann unter „Actions“ wieder einschalten.

## 5-L. Sprachen (`tr()`, `setLang()`)

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

## 8. Ideen für später

**Erledigt:** automatischer Rundlauf, Ankunftstafel am Ziel, FIDS-Tafel für jeden Flughafen, Push aufs Handy (über ntfy.sh statt eigenem Backend), CPDLC-Anzeige.

**Offen:**
- vACDM (Deutschland) einbinden, sobald eine öffentliche API verfügbar wird (`app.vacdm.net` war am 24.10.2026 von außen nicht erreichbar)
- Mehrere eigene Flüge gleichzeitig verfolgen
- Push auch bei geschlossener App: Dafür bräuchte es ein kleines Backend, das die Daten selbst abfragt.
- CPDLC-Antworten (WILCO/UNABLE) aus der App senden; bisher nur lesen
- **Datenschutz:** Die App speichert nur lokal im Browser. Daten gehen nur an die genannten Dienste (VATSIM, vIFF, SimBrief, Hoppie, ntfy, Esri).

Nur für Flugsimulation, nicht für die echte Luftfahrt.
