# VDGS Slot Board – Anleitung

Eine Web-App als Dauerbildschirm fürs iPad. Sie zeigt deinen CDM-Slot (EOBT, TOBT, TSAT, TTOT, CTOT), Runway/SID, ATIS, METAR, ATC online, deine SimBrief-OFP-Daten und eine Abflugtafel deines Flughafens.

## Datenquellen (alle öffentlich, ohne API-Schlüssel)

| Was | Quelle |
|---|---|
| Slot: TOBT, TSAT, TTOT, CTOT, RWY/SID, Regulierung | vIFF CDM `https://viff-system.network/ifps/callsign?callsign=…` |
| Abflugtafel des Flughafens | vIFF CDM `…/ifps/depAirport?airport=…` |
| Dein VATSIM-Flugplan, Verbindung, Squawk, GS, ATIS, ATC | VATSIM Data Feed `https://data.vatsim.net/v3/vatsim-data.json` |
| OFP: Fuel, Gewichte, STD/STA, Route, Alternate | SimBrief `https://www.simbrief.com/api/xml.fetcher.php?username=…&json=v2` |
| METAR | `https://metar.vatsim.net/<ICAO>` |

Die Zeiten kommen vom CDM-Plugin (vIFF), das viele europäische vACCs nutzen. Flughäfen, die nur das deutsche vACDM-System verwenden, liefern dort eventuell keine TSAT.

## So funktioniert die Verknüpfung

1. **SimBrief-Name** eintragen: Die App lädt dein neuestes OFP, alle 5 Minuten neu (oder per Button „OFP neu laden").
2. **VATSIM-CID** eintragen: Die App findet deinen Flugplan bei VATSIM, sobald du ihn aufgibst (Prefile) oder verbunden bist, und übernimmt Route, Flugzeug, FL und Abflugzeit.
3. Noch kein Flugplan bei VATSIM? Button **„Prefile auf VATSIM"** öffnet my.vatsim.net mit den Daten aus deinem SimBrief-OFP.
4. TOBT setzen geht auf **vats.im/vdgs** (Button „TOBT setzen"). Die App zeigt danach automatisch deine TSAT.

Reihenfolge beim Callsign: von Hand eingetragen > VATSIM (über CID) > SimBrief.

Mit VATSIM verbinden musst du dich weiterhin im Simulator über vPilot / xPilot / swift. Die App liest nur mit.

## Online stellen (kostenlos)

Die App ist eine statische Website. Alle Dateien in diesem Ordner hochladen:

**Netlify (am einfachsten)**
1. Kostenloses Konto auf netlify.com anlegen.
2. „Add new site" → „Deploy manually" → den ganzen Ordner `vdgs` ins Fenster ziehen.
3. Du bekommst eine Adresse wie `https://dein-name.netlify.app`.

**Alternativ:** GitHub Pages oder Cloudflare Pages, gleiche Dateien.

## Aufs iPad als App

1. Adresse in **Safari** öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm"**.
3. Die App startet dann ohne Browserleiste im Vollbild.
4. Dauerbildschirm: Button **„Wach"** antippen. Sicherer ist zusätzlich *Einstellungen → Anzeige & Helligkeit → Automatische Sperre → Nie* (und iPad am Strom).
5. Einmal irgendwo antippen, damit der Gong beim Öffnen des Start-up-Fensters abgespielt werden darf.

## Pilot und Passagier

Oben links schaltest du um:

- **Pilot:** Slot, TSAT-Countdown, **Frequenzen**, Flugplan, SimBrief, ATIS, ATC und Abflugtafel
  - **Frequenzen:** Oben rechts siehst du, mit wem du gerade sprichst (**Aktuell**) und zu welcher Frequenz du als nächstes wechseln musst (**Als nächstes**, mit „in ca. X min“). Kurz vor dem Wechsel blinkt es gelb: „Bald wechseln“. Darunter stehen alle weiteren Stationen bis zum Ziel. Ist niemand online, steht dort UNICOM 122.800.
- **Passagier:** wie das Bordunterhaltungssystem im echten Flieger
  - **Flugkarte:** Satellitenkarte mit deinem Flugzeug, Geschwindigkeit in km/h, Höhe in m, Entfernung und Restflugzeit, Ankunft in Ortszeit
  - **Anschlussflüge:** die nächsten Abflüge an deinem Zielflughafen (live aus VATSIM)
  - **Zielort:** Ortszeit und Wetter am Ziel
  - **Rundlauf:** wechselt die Bildschirme automatisch wie im Flugzeug
  - Außentemperatur und Wind sind Schätzwerte („ca.“), weil VATSIM sie nicht liefert

Nach dem Start schaltet die App einmal automatisch auf „Passagier“. Du kannst jederzeit zurück auf „Pilot“.

## Aktualisieren

Die App lädt alle Daten automatisch nach: VATSIM alle 15 s, Slot alle 20 s, Abflugtafel alle 45 s. Wenn das iPad aufwacht, lädt sie sofort alles neu. Oben steht, wie alt die Daten sind („Live · vor 8 s“). Wird der Punkt gelb, tippe auf **Aktualisieren**. Neue App-Versionen werden automatisch geladen.

## Praktische Links

- `…/?simbrief=DEINNAME` stellt SimBrief direkt ein
- `…/?cid=1234567` stellt die CID ein
- `…/?cs=DLH4AB` fixes Callsign
- `…/?demo` zeigt Beispieldaten

## Anzeige der Status

| Status | Bedeutung |
|---|---|
| Bitte warten (gelb) | Mehr als 5 min bis TSAT. Countdown bis das Fenster öffnet |
| Start-up-Fenster offen (grün) | TSAT ±5 min. Jetzt Start-up / Pushback anfragen |
| TSAT abgelaufen (rot) | Fenster verpasst. Neue TOBT setzen |
| Off-Block / Abgeflogen (blau) | Erkannt über Bodengeschwindigkeit aus dem VATSIM-Feed |

Nur für Flugsimulation, nicht für die echte Luftfahrt.
