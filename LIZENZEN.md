# Datenschutz und Lizenzen

## Datenschutz

- Alles, was du in der App einträgst (SimBrief-Name, VATSIM-CID, Callsign, Hoppie-Code, ntfy-Thema, Sprache), bleibt **nur auf deinem Gerät** im Browser-Speicher (localStorage). Es gibt kein Konto, keine Anmeldung und keinen eigenen Server, der Daten sammelt.
- Die App fragt öffentliche Dienste **direkt vom Gerät aus** ab. Dabei sehen diese Dienste – wie bei jeder Webseite – deine IP-Adresse:
  - VATSIM Data Feed und METAR (data.vatsim.net, metar.vatsim.net)
  - vIFF CDM (viff-system.network) mit deinem Callsign bzw. Abflughafen
  - SimBrief (www.simbrief.com) mit deinem SimBrief-Namen
  - Hoppie ACARS (www.hoppie.nl) mit deinem Logon-Code, nur wenn eingetragen
  - ntfy.sh, nur wenn ein Thema eingetragen ist
  - Kartenkacheln von Esri (server.arcgisonline.com)
  - Airline-Logos von pics.avs.io (ohne Referrer)
  - OpenStreetMap Overpass (Gate-Positionen, nur wenn keine vorbereiteten Daten da sind)
  - raw.githubusercontent.com (vorbereitete Daten: Stands, Anflugbereiche, Pisten)
- Schriften und Kartenbibliothek liegen in der App selbst (Ordner `vendor/`), es gehen keine Anfragen an Google Fonts oder CDNs.
- **Videos im Bordprogramm** (Filme, Sicherheitsvideo) sind deine eigenen Dateien: entweder im Ordner `Videos\VDGS` auf dem PC (über die Bridge) oder auf dem Gerät gespeichert (IndexedDB im Browser). Sie sind nicht Teil der App, liegen nicht auf GitHub und werden nicht weitergegeben. Airline-Videos gehören der Airline; nur privat verwenden.
- Die VDGS-Bridge (Windows) läuft nur in deinem Heimnetz (Port 8770). Sie liest Daten aus dem Simulator und stellt COM1/Squawk nur auf Befehl vom Tablet. Sie sendet nichts ins Internet, außer beim Start die App-Dateien von GitHub Pages zu aktualisieren.

## Lizenzen der enthaltenen Teile

| Teil | Quelle | Lizenz |
|---|---|---|
| Schrift B612 / B612 Mono | Airbus / PolarSys | SIL Open Font License 1.1 |
| Schrift Barlow Condensed | Jeremy Tribby | SIL Open Font License 1.1 |
| Schrift Roboto / Roboto Condensed (Airline-Sitzdisplay) | Google | Apache License 2.0 |
| Symbole im Sitzdisplay (Material Icons) | Google | Apache License 2.0 |
| Leaflet 1.9.4 | leafletjs.com | BSD-2-Clause |
| Flughafendaten | github.com/mwgg/Airports | MIT |
| Pisten | OurAirports | Public Domain |
| Gate-/Stand-Positionen | © OpenStreetMap-Mitwirkende | ODbL 1.0 |
| Echte UK-Stands | VATSIM UK (UKCP) | öffentliche API |
| FIR-/Anflugbereiche | VATSpy, SimAware TRACON Project | jeweilige Projektlizenz |
| Kartenbild | © Esri, Maxar, Earthstar Geographics | Esri-Nutzungsbedingungen |

Airline-Namen, Farben und Logos gehören ihren Inhabern. Die App ist inoffiziell und nicht mit einer Airline, VATSIM, vIFF, SimBrief, Hoppie oder Microsoft verbunden. Nur für Flugsimulation – nicht für echte Luftfahrt.
