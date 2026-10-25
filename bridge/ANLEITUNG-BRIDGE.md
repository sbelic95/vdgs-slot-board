# Simulator-Bridge (MSFS 2020 / 2024)

Mit der Bridge zeigt die App deine Position, Höhe und Geschwindigkeit direkt aus dem Simulator an, auch wenn du **nicht mit VATSIM verbunden** bist. Außerdem kannst du vom iPad aus **COM1 einstellen** und den **Squawk setzen**.

## Am einfachsten: VDGS-Setup.exe installieren

1. `VDGS-Setup.exe` starten. Windows warnt eventuell („Der Computer wurde durch Windows geschützt“), weil das Setup nicht signiert ist: **„Weitere Informationen“ → „Trotzdem ausführen“**.
2. Sprache wählen, Hinweise lesen, **„Zugriff aus dem Heimnetz erlauben“** angehakt lassen (legt eine Firewall-Regel nur für private Netzwerke an).
3. Nach der Installation startet die Bridge. Am PC öffnet sich eine Seite mit **QR-Code**: mit Tablet oder Handy im selben WLAN scannen, fertig.
4. Im Startmenü unter „VDGS Bridge“: Bridge, Testmodus ohne Simulator, Anleitung, Datenschutz/Lizenzen, Web-Version.
5. Mehrere Geräte gleichzeitig (iPad, Handy, zweites Tablet) gehen, alle mit derselben Adresse.

Python oder SimConnect musst du nicht installieren, beides ist enthalten. Deinstallieren über Windows-Einstellungen → Apps; das entfernt auch die Firewall-Regel.

### Selbst bauen (für Entwickler)

```bash
py -m pip install SimConnect qrcode pyinstaller
```

Zuerst einmal `py vdgs_bridge.py --test` starten (lädt die App in den Ordner `app`), dann:

```bash
py -m PyInstaller --onefile --console --name VDGS-Bridge --icon installer/icon.ico --collect-all SimConnect --hidden-import qrcode.image.svg --add-data "app;app" vdgs_bridge.py
```

`dist/VDGS-Bridge.exe` nach `installer/` kopieren und mit Inno Setup 6 bauen:

```bash
ISCC.exe installer/VDGS-Setup.iss
```

Ergebnis: `installer/Output/VDGS-Setup.exe`.

## Alternativ als Python-Skript (auf dem Simulator-PC)

1. **Python** installieren, die 64-Bit-Version: https://www.python.org/downloads/ (bei der Installation „Add python.exe to PATH“ anhaken).
2. Eingabeaufforderung öffnen (Windows-Taste, `cmd`, Enter) und eingeben:

```bash
py -m pip install SimConnect qrcode
```

3. Die Datei `vdgs_bridge.py` in einen Ordner legen, z. B. `C:\VDGS`.

## Jedes Mal

1. MSFS starten (oder schon laufen lassen).
2. Eingabeaufforderung öffnen und eingeben:

```bash
py C:\VDGS\vdgs_bridge.py
```

3. Es erscheint eine Adresse, z. B. `Open on the iPad (same Wi-Fi):  http://192.168.1.20:8770`, und am PC öffnet sich die Seite mit dem QR-Code (abschalten mit `--no-browser`; wieder aufrufen unter `http://localhost:8770/connect`).
4. QR-Code scannen oder die Adresse auf dem **iPad in Safari** öffnen. iPad und PC müssen im **selben WLAN/Netzwerk** sein.
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

## Videos im Bordprogramm (Sitzdisplay)

Fliegst du mit einem Callsign einer Airline, die ein eigenes Sitzdisplay hat (zurzeit **Air Serbia**, `ASL…`), sieht die Passagier-Ansicht aus wie der Bildschirm im Sitz: Willkommensseite mit START, Kachel-Menü, Filme, Flugkarte, Zielort.

- MP4-Videos in den Ordner **`Videos\VDGS`** auf dem PC legen (Startmenü → „Videos für das Bordprogramm“ öffnet ihn). Die Bridge zeigt sie unter „Filme“.
- Ein Video mit **„Safety“** im Namen ist das Sicherheitsvideo: Es startet bei **jedem** Pushback automatisch, sobald im Simulator die Parkbremse gelöst wird und das Flugzeug zurückgeschoben wird. Parkst du wieder (Parkbremse an), startet es beim nächsten Pushback erneut. Ausprobieren ohne Simulator: `VDGS-Bridge.exe --test-push`.
- Auf dem iPad einmal **START** antippen: Erst dann darf das iPad das Sicherheitsvideo später von selbst mit Ton starten.
- Die Videos bleiben auf deinem PC und in deinem Heimnetz. Ohne Bridge (GitHub-Version) kannst du unter „Filme“ Videos direkt vom iPad hinzufügen; sie bleiben im Browser des iPads.

## Ausprobieren ohne Simulator

```bash
py C:\VDGS\vdgs_bridge.py --test
```

Dann fliegt ein Test-Flugzeug über Süddeutschland, und die COM1/Squawk-Knöpfe ändern die Testwerte.

## Gut zu wissen

- **Neueste Version:** Die Bridge lädt beim Start immer die aktuelle App von GitHub und speichert sie (Skript: Unterordner `app`; installierte exe: `%LOCALAPPDATA%\VDGS-Bridge\app`). Ohne Internet nimmt sie die gespeicherte Version, beim allerersten Start die in der exe mitgelieferte.
- **Datenschutz:** Deine Eingaben (SimBrief, VATSIM-CID, Hoppie, ntfy) bleiben im Browser des Tablets. Die Bridge speichert davon nichts und schickt nichts ins Internet. Details: `LIZENZEN.md`.
- **Unterschiede zur GitHub-Adresse:** Über die Bridge-Adresse (`http://…`) gibt es keinen „Wach“-Knopf und keine Offline-Funktion, weil Safari diese Funktionen nur auf `https`-Seiten erlaubt. Stell auf dem iPad *Einstellungen → Anzeige & Helligkeit → Automatische Sperre → Nie* ein.
- **Warum nicht über die GitHub-Adresse?** Safari verbietet einer `https`-Seite den Zugriff auf `http`-Geräte im Heimnetz. Deshalb liefert die Bridge die App selbst aus.
- **Sicherheit:** Jeder im selben Netzwerk kann die Seite öffnen und COM1/Squawk verstellen. Zu Hause ist das in Ordnung, in öffentlichen WLANs nicht verwenden.
- **Anderer Port:** `py vdgs_bridge.py --port 8080`
- **MSFS 2024:** Die SimConnect-Bibliothek ist für MSFS 2020 gebaut. MSFS 2024 nimmt solche Programme normalerweise an, getestet ist das aber noch nicht.

Nur für Flugsimulation.
