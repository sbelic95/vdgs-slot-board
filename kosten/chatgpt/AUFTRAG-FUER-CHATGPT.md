# Auftrag an ChatGPT: „Haus-Kosten“ auf ChatGPT Sites mit eigener Datenbank

> Diesen Text zusammen mit `Haus-Kosten-Quellcode.zip` (oder `Haus-Kosten.html`) und meiner Excel-Aufstellung an ChatGPT geben.

## 1. Worum es geht

Ich renoviere ein Haus in Spanien und erfasse alle Kosten. Die App „Haus-Kosten“ ist **fertig und getestet** (Web, Handy, Desktop). Sie lief bisher mit Supabase als Datenbank. Ich will sie jetzt **auf ChatGPT Sites betreiben und die Datenbank von ChatGPT Sites nutzen**.

**Deine Aufgabe:** Die bestehende App übernehmen und **nur die Datenschicht** von Supabase auf die Sites-Datenbank (plus Sites-Serverfunktionen und „Mit ChatGPT anmelden“) umstellen. **Nicht neu schreiben, nicht vereinfachen, keine Funktionen weglassen.**

Bevor du anfängst: Sag mir kurz, was ChatGPT Sites bei dir konkret kann (Datenbank-Art, Serverfunktionen/API-Routen, Geheimnisse/Umgebungsvariablen, Anmeldung, Datei-Speicher, eingebaute KI). Wo etwas unten Beschriebenes nicht geht, schlag die nächstbeste Lösung vor, statt still etwas wegzulassen.

## 2. Was die App kann (muss alles erhalten bleiben)

- **Erfassen (Handy zuerst):** Betrag → Händler → Kategorie antippen → Speichern. Bekannter Händler setzt Kategorie/Gewerk/Raum automatisch wie zuletzt. Offline-fähig.
- **Beleg per KI:** Kassenbon/Rechnung fotografieren oder PDF wählen → KI liest Händler, Datum, Endsumme, Belegnr., Positionen (spanisch → deutsch) und schlägt Kategorie/Gewerk/Raum vor → **Prüfansicht**, der Nutzer bestätigt. Warnung bei möglicher Doppelerfassung, optional nach Gewerk aufteilen.
- **Liste:** Suche, Filter, Bearbeiten, Mehrfachauswahl → in andere Kategorie/Gewerk/Raum verschieben; am Computer als sortierbare Tabelle.
- **Zuordnen:** Renovierungsposten ohne Gewerk nacheinander per Fingertipp einordnen.
- **Statistik:** Kacheln, Kategorie/Gewerk/Raum/Lieferant, Monatsverlauf, aufsummiert, teuerste und offene Posten, Mitarbeiter. Zeitraumfilter, Schalter „Hauskauf einrechnen“ (Standard **aus**) und „Mitarbeiter einrechnen“.
- **Export:** Excel (mehrere Blätter, Kosten-Blatt wieder importierbar) und PDF-Bericht mit Diagrammen.
- **Excel-Import** meiner bisherigen Aufstellung, JSON-Sicherung/-Wiederherstellung.
- **Mitarbeiter:** Arbeitszeiten, Stundensätze; Daten kommen auch aus einem **anderen Projekt** (Schnittstelle unten).
- **Desktop/Handy-App:** installierbar (PWA), Tastenkürzel am Computer, heller/dunkler Modus.

## 3. Aufbau des Codes

| Datei | Inhalt | Was du tun sollst |
|---|---|---|
| `core.js` | Datenmodell, Excel-Import, **Statistik**, lokaler Speicher (`createStore`), Abgleich (`createSync`) | Statistik/Import/Modell **unverändert lassen**. Nur `createSync` ersetzen (siehe 4). |
| `app.js` | Oberfläche, Export, Beleg-Scan, Einstellungen | Nur die Stellen anpassen, die Supabase betreffen (Einstellungen → Datenbank-Karte, Anmelden). |
| `app.css`, `index.html` | Gestaltung, Grundgerüst | unverändert |
| `vendor/` | Chart.js, SheetJS, jsPDF (+autotable), lokal eingebunden | unverändert, **keine anderen Versionen/CDNs** |
| `supabase/schema.sql` | bisherige Tabellen + Zugriffsregeln | als Vorlage für die Sites-Datenbank |
| `supabase/functions/kosten-api/index.ts`, `beleg.ts` | bisherige Server-API: ChatGPT-Aktionen, MCP, `/arbeitszeit`, `/beleg` | Logik als Vorlage für Sites-Serverfunktionen |
| `tools/einzeldatei.py` | baut `dist/Haus-Kosten.html` (alles in einer Datei) | nach Änderungen neu bauen, falls du mit einer Datei arbeitest |

## 4. Was du ändern sollst

### 4.1 Datenbank (statt Supabase)

Tabellen wie in `supabase/schema.sql`, für SQLite/D1 o. Ä. übersetzt:

- `kosten` (id TEXT PK, nr, datum TEXT JJJJ-MM-TT, kategorie, gewerk, raum, lieferant, beschreibung, belegart, belegnr, betrag, bezahlt, status, anmerkung, quelle, geloescht 0/1, erstellt_am, geaendert_am)
- `arbeitszeit` (id TEXT PK, datum, mitarbeiter, beginn, ende, stunden, betrag NULL = Stunden × Stundensatz, beschreibung, kategorie, gewerk, raum, quelle, extern_id UNIQUE, geloescht, geaendert_am)
- `mitarbeiter` (name PK, stundensatz, rolle, aktiv, geloescht, geaendert_am)
- `listen` (id = "typ:name" PK, typ, name, sortierung, geloescht, geaendert_am)

Wichtig:
- **`geaendert_am` setzt immer der Server** bei jedem Insert/Update (ISO-Zeit mit Millisekunden, streng steigend). Darauf beruht der Abgleich.
- **Nie hart löschen**, nur `geloescht = 1` – sonst merken die anderen Geräte das Löschen nicht.
- Beträge auf 2 Nachkommastellen runden (oder in Cent speichern und in der API umrechnen).
- Die **IDs werden auf dem Gerät erzeugt** (UUID, bzw. `xl-K-001` beim Excel-Import). Upsert über die ID.

### 4.2 Abgleich (`createSync` in `core.js`)

Die App arbeitet **lokal zuerst** (`localStorage`) und gleicht ab. Ersetze nur die Supabase-Aufrufe, die Schnittstelle von `createSync` bleibt gleich: `anmelden`, `abmelden`, `bereit()`, `sync()`, `funktion(pfad, body)`.

Serverfunktionen, die du dafür brauchst:
- `GET  /api/sync?tabelle=kosten&seit=<ISO>` → Zeilen mit `geaendert_am > seit`, aufsteigend sortiert, max. 1000 pro Abruf (die App fragt mit 2 Min. Überlappung, doppelte Zeilen sind harmlos).
- `POST /api/sync?tabelle=kosten` → Liste von Zeilen, Upsert über den Schlüssel (`id`, bzw. `name` bei `mitarbeiter`).
- Lokale, noch nicht hochgeladene Änderungen gewinnen beim Herunterladen (so ist es schon programmiert).

Wenn Sites selbst den Speicher im Browser ersetzt oder Echtzeit-Abgleich bietet: gern nutzen, aber **Offline-Erfassen am Handy muss weiter gehen**.

### 4.3 Anmeldung und Zugriff

- Statt Supabase-E-Mail/Passwort: **„Mit ChatGPT anmelden“** (oder was Sites anbietet).
- **Nur ich** (und von mir freigegebene Konten) dürfen Daten sehen/ändern. Freigabe-Liste wie `kosten_zugang` in `schema.sql`. Jede Serverfunktion prüft das.
- Die Einstellungen-Karte „Datenbank (Supabase)“ in `app.js` durch „Angemeldet als … / Abmelden / Jetzt abgleichen“ ersetzen.

### 4.4 Beleg-Erkennung (`/beleg`)

Vorlage: `supabase/functions/kosten-api/beleg.ts` (Eingabe: bis 4 JPEG-Bilder base64 **oder** 1 PDF base64 + Kontext mit Kategorien/Gewerken/Räumen/bekannten Händlern; Ausgabe: festes JSON-Schema mit `ist_beleg, lieferant, datum, belegart, belegnr, waehrung, gesamtbetrag, bereits_bezahlt, positionen[{bezeichnung, bezeichnung_de, betrag, gewerk}], kategorie, gewerk, raum, beschreibung, sicherheit, hinweise[]`).

- Wenn Sites eine **eingebaute KI mit Bildeingabe** hat: diese nehmen, **gleiches Ausgabe-Schema** einhalten (strukturierte Ausgabe/JSON-Schema), gleiche Anweisungen (Endsumme brutto inkl. IVA, Datum JJJJ-MM-TT, nichts erfinden, Unsicheres als null + Hinweis).
- Sonst: Serverfunktion, die die bisherige Logik nutzt; API-Schlüssel als **Geheimnis auf dem Server**, nie im Browser-Code.
- Die Prüfansicht in `app.js` (`belegPruefen`) bleibt unverändert – sie erwartet genau dieses JSON.
- Fotos nur zum Auslesen schicken. Optional: Belegfoto im Sites-Dateispeicher ablegen und am Posten verlinken (Feld `beleg_datei`) – nur wenn einfach machbar.

### 4.5 Schnittstelle für das Mitarbeiter-Projekt

`POST /api/arbeitszeit` mit eigenem geheimen Token (darf **nur** Arbeitszeiten schreiben). Body: Liste von `{ id, datum, mitarbeiter, beginn?, ende?, stunden, betrag?, beschreibung?, gewerk? }`. Upsert über `extern_id = id`. Logik: `Core.externeArbeitszeit` in `core.js` und `arbeitszeitSchreiben` in `index.ts`.
**Regel:** Gibt es für eine Person an einem Tag Einträge aus dem Projekt (`quelle = "extern"`), ersetzen sie die Excel-Stunden desselben Tages (`Core.wirksameArbeitszeit`) – nichts doppelt zählen.

### 4.6 ChatGPT soll Kosten eintragen und auswerten können

Wenn die Site in ChatGPT als App/Connector oder als GPT-Aktion nutzbar ist: Funktionen wie in `index.ts` anbieten – `kosten_suchen`, `kosten_erfassen`, `kosten_aendern`, `kosten_loeschen` (nur nach Rückfrage), `statistik`, `kategorien_auflisten`, `arbeitszeit_auflisten`. Statistik **mit `Core.statistik` aus `core.js`** berechnen, damit App und ChatGPT dieselben Zahlen liefern.

## 5. Fachliche Regeln (bitte genau so beibehalten)

1. **Hauskauf getrennt:** Kategorie „Immobilienkauf“ (Kaufpreis, Makler, Notar, Grunderwerbsteuer) ist so groß, dass sie alles andere verdeckt. In der Statistik standardmäßig **ausgeblendet**, aber als eigene Kachel und in „Alles zusammen“ sichtbar.
2. **Offen/Bezahlt** ergibt sich aus `betrag − bezahlt` (> 0 = offen), nicht aus einem frei getippten Status.
3. **Gewerk nur bei „Renovierungen“.** Fehlt es dort, erscheint der Posten unter „Zuordnen“.
4. **Mitarbeiter-Zeilen** aus der Excel (Stunden, 0 €) sind **Arbeitszeiten**, keine Kosten. Kosten = fester Betrag oder Stunden × Stundensatz.
5. **Nummern** `K-001 …` fortlaufend; neue Nummer = höchste vorhandene + 1, auch über Arbeitszeit-IDs `xl-K-…` hinweg.
6. **Excel-Import** erkennt die Spalten über die Überschriften, korrigiert Tippfehler („Eelektrik“ → Elektrik, „Dachterasse“ → Dachterrasse) und importiert dieselbe Datei nicht doppelt (IDs `xl-<Nr>`).
7. **Deutsch** überall: 1.234,56 €, Datum TT.MM.JJJJ in der Anzeige, JJJJ-MM-TT in den Daten.
8. **Farben** der Kategorien sind fest (eine Kategorie behält immer ihre Farbe); keine neuen Zufallsfarben.

## 6. Datenschutz

- Die Site muss **privat** sein (nur ich / freigegebene Konten).
- **Keine echten Kostendaten in den Quellcode** schreiben. Daten kommen nur über den Excel-Import bzw. die Datenbank.
- Belegfotos und Beträge nicht an Dritte außer dem KI-Dienst zum Auslesen.

## 7. Abnahme – bitte am Ende selbst prüfen und mir berichten

- [ ] Excel-Import meiner Aufstellung: Anzahl der Kostenposten und Arbeitszeiten und die Summe stimmen mit der Excel überein.
- [ ] Posten am Handy erfassen → erscheint am Computer nach dem Abgleich; Löschen ebenso.
- [ ] Am Handy **offline** erfassen → wird später automatisch hochgeladen.
- [ ] Beleg-Foto → Prüfansicht vorausgefüllt → Bestätigen → Posten gespeichert (mit `quelle = "ki-beleg"`).
- [ ] Mehrere Posten auswählen und in anderes Gewerk verschieben.
- [ ] Statistik mit/ohne Hauskauf, Excel- und PDF-Export funktionieren.
- [ ] `/api/arbeitszeit` mit Token: zweimal gleiche ID senden → kein Duplikat; Excel-Stunden desselben Tages zählen nicht doppelt.
- [ ] Ohne Anmeldung / mit fremdem Konto: keine Daten sichtbar, Schreiben abgelehnt.
- [ ] Am Handy (390 px breit) kein seitliches Scrollen; Desktop-Tabelle und Tastenkürzel gehen.

Wenn etwas davon auf Sites nicht möglich ist, sag es mir mit Begründung und Alternative.
