# Text für flightsim.to

Titel: VDGS Slot Board – VATSIM CDM, Frequency Guide & Cabin IFE for your Tablet
Kategorie: Tools / Utilities
Tags: VATSIM, CDM, TOBT, TSAT, SimBrief, Tablet, iPad, EFB, IFE, SimConnect, Frequencies, CPDLC

---

## Kurzbeschreibung (English)

Your tablet as VDGS, frequency guide and cabin IFE: live VATSIM slots (TOBT/TSAT/CTOT), next frequency, landing runway, gate, and a passenger map – with or without VATSIM.

## Kurzbeschreibung (Deutsch)

Dein Tablet als VDGS, Frequenz-Führer und Bordunterhaltung: VATSIM-Slots (TOBT/TSAT/CTOT), nächste Frequenz, Landebahn, Gate und Passagierkarte – mit oder ohne VATSIM.

---

## ENGLISH

**VDGS Slot Board** turns your iPad, tablet or phone into a second screen for your flight: slot board at the gate, frequency guide in the air and an in-flight entertainment screen for your "passengers".

### Features

**Pilot view**
- Live CDM slot from vIFF: EOBT, TOBT, TSAT, TTOT, CTOT, runway/SID, status with countdown and a chime when your start-up window opens
- Flight data loaded automatically from SimBrief (latest OFP) and your VATSIM flight plan
- Frequency guide: current and next station with frequency and time/distance to the handover, all the way to your destination (DEL, GND, TWR, APP, CTR, top-down rule, UNICOM when nobody is online). Covers big events with split sectors.
- After departure: next radar frequency, destination ATIS, the active landing runway (from ATIS, otherwise from the wind), predicted gate/stand 30 min before arrival, arrival time in UTC and German time
- CPDLC: shows your Hoppie messages (read only, e.g. "CONTACT … 127.925")
- Optional push to your phone via ntfy (start-up window, new TSAT, frequency change, CPDLC, gate)

**Passenger view (IFE)**
- Moving map with speed in km/h, altitude in metres, outside temperature, distance, time to go and arrival in local time
- Connecting flights and arrivals at your destination (VATSIM data)
- Destination weather and local time
- Airline look for many airlines (e.g. Swiss, Emirates, Lufthansa) – unofficial
- Auto-cycle between the screens, like on a real aircraft

**More**
- Airport board (FIDS) for any airport
- Languages: English, German, Serbian

### Two ways to use it

1. **In the browser, no install (VATSIM):** open https://sbelic95.github.io/vdgs-slot-board/ on your tablet and add it to the home screen.
2. **With the simulator (this download):** install the VDGS Bridge on your sim PC. It reads Microsoft Flight Simulator via SimConnect, so the app also works **without VATSIM**, and you can **set COM1 and the squawk from your tablet**.

### Installation

1. Run `VDGS-Setup.exe` and follow the steps. Leave "Allow access from the home network" ticked.
2. Windows SmartScreen may warn because the installer is not signed: click "More info" → "Run anyway".
3. Start "VDGS Bridge". A page with a QR code opens on your PC.
4. Scan the QR code with your tablet or phone on the same Wi-Fi.
5. In the app, enter your SimBrief username and/or VATSIM CID. Done.

Try it without the simulator: Start menu → "VDGS Bridge (test mode, no simulator)".

### Requirements

- Windows 10/11 (64-bit), Microsoft Flight Simulator 2020 (MSFS 2024 should work, not fully tested yet)
- Tablet or phone with a current browser, in the same home network as the PC
- Internet connection; VATSIM, SimBrief and Hoppie accounts are optional

### Privacy

Everything you enter (SimBrief name, VATSIM CID, Hoppie code, ntfy topic) stays **only on your own device**. No account, no server collecting data. The app talks directly to the public services (VATSIM, vIFF, SimBrief, Hoppie, weather, map). The bridge only works inside your home network.

### Disclaimer

Unofficial, freeware. Not affiliated with VATSIM, vIFF, SimBrief, Hoppie, Microsoft or any airline. Airline names and logos belong to their owners. For flight simulation only – not for real-world aviation.

Credits: Leaflet (BSD), fonts B612 and Barlow Condensed (OFL), OpenStreetMap contributors (ODbL), OurAirports, mwgg/Airports (MIT), VATSpy, SimAware TRACON Project, VATSIM UK, map © Esri.

---

## DEUTSCH

**VDGS Slot Board** macht dein iPad, Tablet oder Handy zum zweiten Bildschirm für deinen Flug: Slot-Anzeige am Gate, Frequenz-Führer in der Luft und Bordunterhaltung für deine „Passagiere“.

### Funktionen

**Pilot-Ansicht**
- Live-CDM-Slot von vIFF: EOBT, TOBT, TSAT, TTOT, CTOT, Piste/SID, Status mit Countdown und Gong, wenn dein Start-up-Fenster öffnet
- Flugdaten automatisch aus SimBrief (neuestes OFP) und deinem VATSIM-Flugplan
- Frequenz-Führer: aktuelle und nächste Station mit Frequenz und Zeit/Entfernung bis zum Wechsel, bis zum Ziel (DEL, GND, TWR, APP, CTR, Top-down-Regel, UNICOM, wenn niemand online ist). Auch bei großen Events mit aufgeteilten Sektoren.
- Nach dem Start: nächste Radar-Frequenz, Ziel-ATIS, aktive Landebahn (aus der ATIS, sonst aus dem Wind), voraussichtliches Gate 30 min vor der Ankunft, Ankunftszeit in UTC und deutscher Zeit
- CPDLC: zeigt deine Hoppie-Nachrichten (nur lesen, z. B. „CONTACT … 127.925“)
- Optional Push aufs Handy über ntfy (Start-up-Fenster, neue TSAT, Frequenzwechsel, CPDLC, Gate)

**Passagier-Ansicht (Bordunterhaltung)**
- Flugkarte mit Geschwindigkeit in km/h, Höhe in Metern, Außentemperatur, Entfernung, Restflugzeit und Ankunft in Ortszeit
- Anschlussflüge und Ankünfte am Zielflughafen (VATSIM-Daten)
- Wetter und Ortszeit am Ziel
- Airline-Look für viele Airlines (z. B. Swiss, Emirates, Lufthansa) – inoffiziell
- Automatischer Rundlauf durch die Bildschirme wie im echten Flugzeug

**Außerdem**
- Flughafen-Tafel (FIDS) für jeden Flughafen
- Sprachen: Deutsch, Englisch, Serbisch

### Zwei Wege

1. **Im Browser, ohne Installation (VATSIM):** https://sbelic95.github.io/vdgs-slot-board/ auf dem Tablet öffnen und zum Home-Bildschirm hinzufügen.
2. **Mit dem Simulator (dieser Download):** die VDGS Bridge auf dem Simulator-PC installieren. Sie liest Microsoft Flight Simulator über SimConnect. So funktioniert die App auch **ohne VATSIM**, und du kannst **COM1 und den Squawk vom Tablet aus setzen**.

### Installation

1. `VDGS-Setup.exe` starten und den Schritten folgen. „Zugriff aus dem Heimnetz erlauben“ angehakt lassen.
2. Windows SmartScreen kann warnen, weil das Setup nicht signiert ist: „Weitere Informationen“ → „Trotzdem ausführen“.
3. „VDGS Bridge“ starten. Am PC öffnet sich eine Seite mit QR-Code.
4. QR-Code mit Tablet oder Handy im selben WLAN scannen.
5. In der App SimBrief-Namen und/oder VATSIM-CID eintragen. Fertig.

Ohne Simulator ausprobieren: Startmenü → „VDGS Bridge (Testmodus ohne Simulator)“.

### Voraussetzungen

- Windows 10/11 (64 Bit), Microsoft Flight Simulator 2020 (MSFS 2024 sollte funktionieren, noch nicht vollständig getestet)
- Tablet oder Handy mit aktuellem Browser im selben Heimnetz wie der PC
- Internetverbindung; VATSIM-, SimBrief- und Hoppie-Konto sind optional

### Datenschutz

Alles, was du einträgst (SimBrief-Name, VATSIM-CID, Hoppie-Code, ntfy-Thema), bleibt **nur auf deinem eigenen Gerät**. Kein Konto, kein Server, der Daten sammelt. Die App fragt direkt die öffentlichen Dienste ab (VATSIM, vIFF, SimBrief, Hoppie, Wetter, Karte). Die Bridge arbeitet nur in deinem Heimnetz.

### Hinweis

Inoffiziell, Freeware. Nicht mit VATSIM, vIFF, SimBrief, Hoppie, Microsoft oder einer Airline verbunden. Airline-Namen und Logos gehören ihren Inhabern. Nur für Flugsimulation – nicht für die echte Luftfahrt.

Danke an: Leaflet (BSD), Schriften B612 und Barlow Condensed (OFL), OpenStreetMap-Mitwirkende (ODbL), OurAirports, mwgg/Airports (MIT), VATSpy, SimAware TRACON Project, VATSIM UK, Karte © Esri.
