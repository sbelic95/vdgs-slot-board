# VDGS Slot Board

Live-CDM-Slot (TOBT, TSAT, TTOT, CTOT) für VATSIM-Piloten, als Dauerbildschirm fürs iPad. Verknüpft SimBrief-OFP, VATSIM-Flugplan, ATIS, METAR, ATC online und die Abflugtafel des Flughafens.

Im Pilot-Modus zeigt ein Frequenz-Führer, welche Funkfrequenz gerade gilt und wann zu welcher gewechselt wird, dazu CPDLC (Hoppie), Ziel-ATIS, aktive Landebahn und das voraussichtliche Gate. Dazu ein Passagier-Modus wie ein echtes Bordunterhaltungssystem, im Look der Airline (inoffiziell): Flugkarte (km/h, Meter, Außentemperatur, Ankunft in Ortszeit), Anschlussflüge am Ziel, Wetter am Zielort und automatischer Rundlauf.

Zwei Wege:

- **Im Browser (GitHub Pages):** https://sbelic95.github.io/vdgs-slot-board/ – mit VATSIM, ohne Installation.
- **Mit dem Simulator (Windows):** `VDGS-Setup.exe` installieren. Die Bridge liest MSFS 2020/2024, zeigt die App im Heim-WLAN (QR-Code scannen) und stellt COM1/Squawk vom Tablet. Siehe [bridge/ANLEITUNG-BRIDGE.md](bridge/ANLEITUNG-BRIDGE.md).

Deine Eingaben (SimBrief, VATSIM-CID, Hoppie-Code) bleiben nur auf deinem Gerät. Kein Konto, kein eigener Server. Details und Lizenzen: [LIZENZEN.md](LIZENZEN.md).

- Bedienung, iPad-Einrichtung: [ANLEITUNG.md](ANLEITUNG.md)
- Technische Übergabe (Dateien, APIs, Logik): [UEBERGABE.md](UEBERGABE.md)
- Demo mit Beispieldaten: https://sbelic95.github.io/vdgs-slot-board/?demo

Inoffiziell, nicht mit VATSIM, vIFF, SimBrief, Hoppie, Microsoft oder einer Airline verbunden. Nur für Flugsimulation, nicht für die echte Luftfahrt.
