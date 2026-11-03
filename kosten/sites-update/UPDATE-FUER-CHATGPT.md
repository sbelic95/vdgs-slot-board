# Haus-Kosten – Update 2026-11-03.2 für die bestehende ChatGPT-Site

Dieses Paket aktualisiert die **laufende** Site (gleiches Projekt, gleiche D1-Datenbank). Es ist so gebaut, dass du **nur wenige, genau benannte Stellen** ändern musst.

## 0. Was dieses Update macht – und was nicht

**Neu bzw. geändert:**
1. `web/Haus-Kosten.html` – neue Fassung der Oberfläche (Liste der Änderungen in Abschnitt 6).
2. `lib/beleg-ki.mjs` + `app/api/beleg/route.ts` – neue Route **POST /api/beleg**: Kassenbon/Rechnung per KI (Claude) auslesen.
3. `tests/update.test.mjs` + `tests/hk-core-neu.cjs` – Tests für dieses Update.

**Unverändert bleiben (bitte nicht anfassen):**
D1-Schema und alle Migrationen · `/api/sync` · `/api/auth` · `/api/audit` · `/protokoll` · Anmeldung, Sitzungen, Login-Sperre · Audit Trail und seine Trigger · Baustunden-Brücke und `HAUS_KOSTEN_SYNC_SECRET` · `public/sites-sync.js` · `public/eingabehilfe.js` · `public/eingabehilfe-ui.js` · `public/session.js` · `.openai/hosting.json` (project_id, `d1: "DB"`).

**Keine Datenbankänderung, keine Migration, keine Seed-Daten.** Die neue Route liest nur das Foto aus und schreibt nichts. Was der Nutzer bestätigt, wird wie jeder andere Posten über `/api/sync` gespeichert, also mit Version, Konfliktprüfung und Audit-Eintrag (`quelle: "ki-beleg"`).

Die neue Oberfläche benutzt **denselben Browser-Speicher** (`hauskosten-v1`), **dieselbe Schnittstelle** zu `Core.createSync` (`bereit`, `sync`, `anmelden`, `abmelden`) und **dieselbe Einstellung** `config.hauskaufAnzeigen` wie bisher. Ausstehende Änderungen auf den Geräten bleiben beim Update erhalten.

## 1. Vorher sichern (Pflicht, in dieser Reihenfolge)

1. Auf **jedem** Gerät (iPhone, Computer) die App öffnen und warten, bis die Anzeige grün/synchron ist und nichts mehr aussteht.
2. In der App: **Einstellungen → Sicherung (JSON)** herunterladen. Die Zahl „… Kostenposten · … Arbeitszeiten auf diesem Gerät“ notieren.
3. **D1 vollständig exportieren**: alle Tabellen `haus_kosten_*` (Datensätze, Konten, Sitzungen, Login-Sperren, Audit, Quellstände). Die JSON-Sicherung allein reicht nicht.
4. Die aktuelle Code-Version der Site notieren, damit du zurückkehren kannst.
5. **Basis prüfen:** SHA-256 der heutigen `web/Haus-Kosten.html` berechnen und mit `PRUEFSUMMEN.txt` vergleichen.
   - Stimmt sie mit einer der dort genannten früheren Fassungen überein: weiter mit Abschnitt 2.
   - Stimmt sie **nicht** überein, wurde die HTML im Projekt selbst verändert. Dann **nicht einfach ersetzen**: die Unterschiede zur nächstliegenden Fassung auflisten und dem Nutzer zeigen.

## 2. Dateien einspielen

| Datei aus diesem Paket | Ziel im Sites-Projekt | Aktion |
|---|---|---|
| `web/Haus-Kosten.html` | `web/Haus-Kosten.html` | ersetzen |
| `lib/beleg-ki.mjs` | `lib/beleg-ki.mjs` | neu |
| `app/api/beleg/route.ts` | `app/api/beleg/route.ts` | neu, dann 3 Stellen anpassen (siehe 3c) |
| `tests/update.test.mjs`, `tests/hk-core-neu.cjs` | `tests/` | neu |

Abhängigkeit hinzufügen: `npm install @anthropic-ai/sdk@1.3.0` (genau diese Version).

## 3. Genau diese Änderungen an bestehenden Dateien

### 3a. Hauskauf-Anpassung beim Ausliefern abschalten (`app/route.ts`)

Die neue HTML blendet den Hauskauf **selbst** aus. Sie nutzt dieselben Regeln und dieselbe Einstellung (`hauskaufAnzeigen`, Standard aus, nur `true` blendet ein):
- Übersicht ohne Hauskauf-Kachel und ohne Summe „inkl. Hauskauf“.
- Die Standardliste zeigt den Hauskauf nur, wenn die Kategorie Immobilienkauf ausdrücklich gewählt ist.
- Normale PDF- und Excel-Berichte rechnen ohne Hauskauf.
- Die JSON-Sicherung bleibt vollständig.
- Der Schalter liegt unter Einstellungen → Darstellung → „Hauskauf anzeigen“ (`id="hauskaufAnzeigen"`).

Deshalb:
- In `app/route.ts` den Aufruf von `lib/house-visibility.mjs` auf die HTML **entfernen**. Die Datei selbst vorerst liegen lassen. Die Textersetzung würde auf der neuen HTML ihre Fundstellen-Prüfung nicht bestehen bzw. doppelt ausblenden.
- Falls ein Sites-Skript (z. B. `sites-sync.js` oder `session.js`) einen **eigenen** „Hauskauf anzeigen“-Schalter einfügt: nur dieses Einfügen entfernen, damit es genau einen Schalter gibt. Die gespeicherte Einstellung bleibt dieselbe.

### 3b. Plattform-Haken setzen (`app/route.ts`)

**Vor** den bisher injizierten Skripten (also vor `sites-sync.js`) dieses Inline-Skript einfügen. Die Reihenfolge der übrigen Skripte bleibt unverändert.

```html
<script>window.HK_PLATTFORM = { belegUrl: "/api/beleg", eingabehilfeExtern: true };</script>
```

- `belegUrl`: Die App schickt Belegfotos an `/api/beleg` auf derselben Adresse, mit dem Sitzungs-Cookie und dem Header `X-Haus-Kosten-Beleg: 1`. Supabase wird dafür nicht benutzt.
- `eingabehilfeExtern`: Schaltet die alte automatische Händler-Zuordnung der App vollständig ab. So bleibt nur die bewusst zu bestätigende Eingabehilfe aus Version 2 aktiv. Falls `eingabehilfe-ui.js` die alte Zuordnung bisher auf anderem Weg unterdrückt hat, darf das bleiben. Es schadet nicht doppelt.

### 3c. Neue Route vervollständigen (`app/api/beleg/route.ts`)

Es gibt genau drei Stellen mit `ANPASSEN`. Vorbild ist jeweils `app/api/sync/route.ts`:
1. **Origin-/Cross-Site-Prüfung:** dieselbe wie bei `/api/sync`. Der erwartete Header ist hier `X-Haus-Kosten-Beleg: 1`.
2. **Sitzungsprüfung:** dieselbe wie bei `/api/sync`. Ohne gültige Sitzung antwortet die Route mit 401.
3. **Secrets lesen:** so, wie das Projekt `HAUS_KOSTEN_SYNC_SECRET` liest:
   - `ANTHROPIC_API_KEY` (neu, Pflicht für die Beleg-KI)
   - `BELEG_MODELL` (optional; leer = `claude-opus-5-5`, günstiger `claude-haiku-5-5`)

Die Route muss Anfragen bis ca. 14 MB annehmen, weil Fotos als Base64 kommen. Gibt es eine globale Body-Grenze, diese nur für `/api/beleg` erhöhen. `/api/sync` behält seine 500.000 Zeichen.
Ohne `ANTHROPIC_API_KEY` antwortet die Route mit 503 und einer verständlichen Meldung. Alles andere funktioniert normal weiter.

Optional: einen Audit-Eintrag „Beleg gelesen“ **ohne** Bilddaten schreiben. Das ist nicht nötig, weil die gespeicherten Posten ohnehin protokolliert werden.

## 4. Nach dem Einspielen prüfen

1. `node --test tests/update.test.mjs` und die vorhandenen Tests (`tests/auth-audit.test.mjs`, `tests/sync.test.mjs`, `tests/eingabehilfe.test.mjs`). Alle müssen bestehen.
2. Im Browser (Computer **und** iPhone):
   - [ ] Anmeldung mit admin, Synchron-Anzeige grün.
   - [ ] Einstellungen → Sicherung: dieselbe Anzahl Kostenposten und Arbeitszeiten wie vor dem Update (Abschnitt 1.2).
   - [ ] Übersicht ohne Hauskauf; Schalter „Hauskauf anzeigen“ ein → Kachel und Summen erscheinen; aus → wieder weg. Es gibt genau **einen** Schalter.
   - [ ] Liste: Hauskauf nur bei gewählter Kategorie Immobilienkauf.
   - [ ] Excel- und PDF-Export öffnen sich; ohne Hauskauf, solange er ausgeblendet ist.
   - [ ] Erfassen: Beim Tippen eines Händlers setzt die App **nicht** von selbst Kategorie/Gewerk; die Eingabehilfe aus Version 2 funktioniert wie bisher.
   - [ ] Beleg fotografieren → „Beleg prüfen“ ist vorausgefüllt → Bestätigen → Posten erscheint, Synchron-Anzeige grün, Protokoll zeigt das Anlegen.
   - [ ] Vorschläge der KI, die es in den Listen nicht gibt, werden **nicht** angelegt. Die App zeigt einen Hinweis und verlangt eine bewusste Auswahl.
   - [ ] Baustunden-Arbeitszeiten: Quellfelder weiter gesperrt, Trinkgeld nicht doppelt, Stundensatz-Änderung geht an Baustunden.
   - [ ] Abmelden funktioniert; mit ausstehenden Änderungen wird die Abmeldung wie bisher angehalten.
3. Ergebnis dem Nutzer melden. Bei einer Abweichung **nicht** Daten „reparieren“, sondern melden.

## 5. Rückweg

Die Site auf die notierte Code-Version zurücksetzen. Die Datenbank wird von diesem Update nicht verändert, deshalb braucht es keinen Daten-Rückweg. Per Beleg erfasste Posten sind normale Posten und bleiben gültig.

## 6. Was sich in der Oberfläche geändert hat (gegenüber der Fassung vom 31.10.)

- **Beleg per KI:** Unter „Erfassen“ oben die Knöpfe „Beleg fotografieren“ und „Foto / PDF wählen“. Bis zu 4 Fotos oder 1 PDF. Bilder werden im Browser auf max. 2000 px verkleinert (JPEG).
- **Prüfansicht** „Beleg prüfen“:
  - Felder sind vorausgefüllt; ein Hinweis zeigt, wie sicher die KI gelesen hat.
  - Warnung bei möglicher Doppelerfassung (gleicher Tag, gleicher Betrag).
  - Positionen mit Gewerk; optional „nach Gewerk aufteilen“ in mehrere Posten mit derselben Belegnummer.
  - Ohne bewusst gewählte Kategorie wird nicht gespeichert.
- **Hauskauf-Ausblendung** ist eingebaut (3a).
- **Excel-Import ist abgesichert:**
  - Eigenleistungen kommen fest mit 0 € hinein.
  - Gelöschte Posten werden nie wiederbelebt.
  - Beim Überschreiben bleiben `_sitesVersion`, `_excel` und alle anderen `_…`-Felder erhalten (kein 409).
  - Arbeitszeiten werden nie überschrieben.
  - Excel-Stunden an Tagen mit Baustunden-Einträgen werden ausgelassen und im Dialog genannt.
  - Als Baustunden gilt: `quelle` enthält „baustunden“ oder „extern“, oder `_baustundenId` ist gesetzt.
- **Doppelzählung:** In der Statistik werden Baustunden-Zeilen genauso erkannt; Excel-Stunden desselben Tages zählen dann nicht.
- **Eingabefelder** ohne `type`-Attribut haben jetzt das normale Aussehen.
- Kennungen für Plattform-Skripte: `window.HK_APP_VERSION = "2026-11-03.2"`, `window.HK_FAEHIGKEITEN = ["hauskauf-ausblenden", "beleg-ki", "beleg-plattform-api", "import-schutz"]`.
- **Unverändert:**
  - alle IDs und Formular-Namen, an die sich Sites-Skripte hängen (`#erfassen`, `[name=lieferant]`, `#vorschlag`, `[data-chips=…]`, `#azForm`, `#dbForm`, …)
  - Statistik-Regeln, Nummernvergabe (`K-…`), Datumsformat und Rundung

## 7. Offene Punkte – melden, nicht still lösen

- Posten K-259 (Leerrohre): Anmerkung sagt „noch nicht bezahlt“, erfasst ist er als bezahlt. Nur nach Rückfrage beim Nutzer ändern.
- Wenn die Basis-Prüfsumme (1.5) nicht passt oder eine der drei Anpassungen nicht wie beschrieben möglich ist: anhalten und dem Nutzer erklären.
