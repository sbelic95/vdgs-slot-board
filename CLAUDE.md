# VDGS Slot Board – Hinweise für Claude

iPad-Dauerbildschirm für den MSFS 2024 mit VATSIM: Pilot-Modus (CDM-Slot, Frequenzen, CPDLC), Passagier-Modus
(Bordunterhaltung, Air-Serbia-Ausgabe unter `/airserbia/`), Tafel (FIDS). Der Nutzer (sbelic95) schreibt Deutsch; antworte auf Deutsch.

- Live: `https://sbelic95.github.io/vdgs-slot-board/` (GitHub Pages aus `main`)
- **Zuerst [UEBERGABE.md](UEBERGABE.md) lesen**: Funktionen, Datenquellen, alle JavaScript-Funktionen von `index.html`, Gate-Logik,
  Bridge, bekannte Grenzen. Bedienung für Piloten: [ANLEITUNG.md](ANLEITUNG.md).
- Schwesterprojekt: `sbelic95/asl-pad` (Crew-Pad für Air-Serbia-Flüge). Es liest die Daten-Branches dieses Repos und
  enthält eine Kopie der Stand-Prognose (`js/stands.js`, aus `GATE_RULES`, `predictStand()` usw. hier). Änderungen an der Gate-Logik dort nachziehen.

## Aufbau in Kürze

- Die ganze App steckt in `index.html` (Markup, CSS, JavaScript), kein Build. Bibliotheken und Schriften nur aus `vendor/`, keine CDNs.
- Daten-Branches, von GitHub Actions gefüllt (nie von Hand ändern):
  - `stands` – Stände/Gates aller Flughäfen aus OpenStreetMap (`.github/workflows/stands.yml`, `.github/scripts/stands.py`, zweimal täglich, `_status.json` mit Kacheln und Verdachtsfällen)
  - `atc` – `runways.json` (OurAirports) und `tracons.json` (`atc-data.yml`, täglich)
  - `data` – VATSIM-UK-Standzuweisungen (`ukcp-stands.yml`, alle 5 min)
- Alle drei Workflows pushen mit Wiederholung (GitHub antwortet manchmal „Internal Server Error“). Logs der Actions sind aus
  der Agenten-Umgebung oft nicht abrufbar; den Status dann aus `_status.json` im jeweiligen Branch lesen.
- Branch `kosten-app` gehört nicht zum VDGS (eigene Haus-Kosten-App), nicht anfassen.
- `bridge/` ist die Simulator-Bridge (Python, Windows-Installer); Videos und gebaute `.exe` gehören nie ins Repo.

## Arbeitsweise

- Nach jeder Änderung an Funktionen oder Datenquellen `UEBERGABE.md` mitpflegen (Abschnitt und Stand-Datum).
- Testen: Seite lokal ausliefern (`python3 -m http.server`) und mit Playwright im iPad-Format öffnen. SimBrief, VATSIM und Overpass sind
  aus Testumgebungen meist nicht erreichbar – externe Antworten im Test nachbilden. Screenshots vor dem Zeigen selbst ansehen.
- Commits als `sbelic95 <119758002+sbelic95@users.noreply.github.com>`. Größere Änderungen auf einem Branch `fix/…` und dann nach `main`.
  Nach dem Push prüfen, dass „pages-build-deployment“ mit dem neuen Commit gelaufen ist.
