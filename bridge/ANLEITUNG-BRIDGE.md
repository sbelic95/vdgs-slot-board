# Simulator-Bridge (MSFS 2020 / 2024)

Mit der Bridge zeigt die App deine Position, Höhe und Geschwindigkeit direkt aus dem Simulator an, auch wenn du **nicht mit VATSIM verbunden** bist. Außerdem kannst du vom iPad aus **COM1 einstellen** und den **Squawk setzen**.

## Am einfachsten: VDGS-Bridge.exe

1. `VDGS-Bridge.exe` in einen festen Ordner legen, z. B. `C:\VDGS`. Daneben legt sie beim Start den Unterordner `app` an.
2. **Doppelklick.** Python oder SimConnect musst du nicht installieren, beides ist enthalten.
3. Beim ersten Start warnt Windows eventuell („Der Computer wurde durch Windows geschützt“), weil die Datei nicht signiert ist: **„Weitere Informationen“ → „Trotzdem ausführen“**. Fragt die Firewall, **private Netzwerke erlauben**.
4. Im Fenster erscheint die Adresse für das iPad, z. B. `http://192.168.178.22:8770`.
5. Testmodus ohne Simulator: Eingabeaufforderung im Ordner öffnen und `VDGS-Bridge.exe --test` eingeben.

Die exe wird mit PyInstaller aus `vdgs_bridge.py` gebaut:

```bash
py -m pip install SimConnect pyinstaller
```

```bash
py -m PyInstaller --onefile --console --name VDGS-Bridge --collect-all SimConnect vdgs_bridge.py
```

## Alternativ als Python-Skript (auf dem Simulator-PC)

1. **Python** installieren, die 64-Bit-Version: https://www.python.org/downloads/ (bei der Installation „Add python.exe to PATH“ anhaken).
2. Eingabeaufforderung öffnen (Windows-Taste, `cmd`, Enter) und eingeben:

```bash
py -m pip install SimConnect
```

3. Die Datei `vdgs_bridge.py` in einen Ordner legen, z. B. `C:\VDGS`.

## Jedes Mal

1. MSFS starten (oder schon laufen lassen).
2. Eingabeaufforderung öffnen und eingeben:

```bash
py C:\VDGS\vdgs_bridge.py
```

3. Es erscheint eine Adresse, z. B. `Open on the iPad (same Wi-Fi):  http://192.168.1.20:8770`.
4. Diese Adresse auf dem **iPad in Safari** öffnen. iPad und PC müssen im **selben WLAN/Netzwerk** sein.
5. Fragt Windows nach der Firewall: **„Private Netzwerke“ erlauben**.

Tipp: In Safari auf Teilen → „Zum Home-Bildschirm“ tippen, dann hast du ein eigenes Symbol für die Bridge-Version.

## Was du dann siehst

- Oben bei „Flugplan“: **Simulator (MSFS)**, wenn die Daten aus dem Simulator kommen.
  - Bist du zusätzlich mit VATSIM verbunden, nimmt die App die VATSIM-Daten (dann auch mit zugeteiltem Squawk).
  - Sonst nimmt sie die Simulator-Daten.
- **Im Flug:** Bei der nächsten Frequenz gibt es die Knöpfe **„COM1 STBY“** (in das Standby-Fenster) und **„COM1 AKTIV“** (direkt aktiv). Darunter steht, was im Simulator gerade in COM1 eingestellt ist; grün heißt, es passt.
- **Squawk:** Hat dir VATSIM einen Squawk zugeteilt und der Transponder im Simulator steht anders, erscheint im Flugplan-Kasten der Knopf **„Squawk XXXX setzen“**.
- Karte, Flugphase, Ankunftszeit, Frequenz-Führer, Gate und Passagier-Ansicht funktionieren auch ohne VATSIM.
- Slot (TOBT/TSAT) und CPDLC brauchen weiterhin VATSIM bzw. Hoppie.

## Ausprobieren ohne Simulator

```bash
py C:\VDGS\vdgs_bridge.py --test
```

Dann fliegt ein Test-Flugzeug über Süddeutschland, und die COM1/Squawk-Knöpfe ändern die Testwerte.

## Gut zu wissen

- **Neueste Version:** Die Bridge lädt beim Start immer die aktuelle App von GitHub und speichert sie im Unterordner `app`. Ohne Internet nimmt sie die gespeicherte Version.
- **Unterschiede zur GitHub-Adresse:** Über die Bridge-Adresse (`http://…`) gibt es keinen „Wach“-Knopf und keine Offline-Funktion, weil Safari diese Funktionen nur auf `https`-Seiten erlaubt. Stell auf dem iPad *Einstellungen → Anzeige & Helligkeit → Automatische Sperre → Nie* ein.
- **Warum nicht über die GitHub-Adresse?** Safari verbietet einer `https`-Seite den Zugriff auf `http`-Geräte im Heimnetz. Deshalb liefert die Bridge die App selbst aus.
- **Sicherheit:** Jeder im selben Netzwerk kann die Seite öffnen und COM1/Squawk verstellen. Zu Hause ist das in Ordnung, in öffentlichen WLANs nicht verwenden.
- **Anderer Port:** `py vdgs_bridge.py --port 8080`
- **MSFS 2024:** Die SimConnect-Bibliothek ist für MSFS 2020 gebaut. MSFS 2024 nimmt solche Programme normalerweise an, getestet ist das aber noch nicht.

Nur für Flugsimulation.
