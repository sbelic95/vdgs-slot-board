# Haus-Kosten – Anleitung

Eine App für Computer und Handy, um die Renovierungskosten zu erfassen, zuzuordnen und auszuwerten.

**Adresse:** https://sbelic95.github.io/vdgs-slot-board/kosten/

| Bereich | Wofür |
|---|---|
| **Erfassen** (+) | Einkauf in Sekunden aufnehmen: Betrag → Händler → Kategorie antippen → Speichern. Kennt die App den Händler, setzt sie Kategorie, Gewerk und Raum automatisch wie beim letzten Mal. |
| **Liste** | Alle Posten mit Suche und Filtern. Antippen = bearbeiten. „Auswählen“ = mehrere Posten auf einmal in eine andere Kategorie, ein Gewerk oder einen Raum verschieben. |
| **Zuordnen** | Renovierungsposten ohne Gewerk nacheinander per Fingertipp einordnen (Aufruf über die Statistik). |
| **Statistik** | Wohin geht das Geld (Kategorie, Gewerk, Raum, Lieferant), Verlauf pro Monat, aufsummiert, teuerste und offene Posten, Mitarbeiter. Zeitraum wählbar, Hauskauf ein-/ausblendbar. Export als **Excel** und **PDF**. |
| **Mitarbeiter** | Stunden und Kosten pro Person, Stundensätze, Verbindung zum Mitarbeiter-Projekt. |
| **Einstellungen** | Datenbank, Excel-Import, Mitarbeiter-Quelle, Sicherung. |

## 1. Erster Start: Excel übernehmen

Statistik öffnen → **Excel-Datei laden** → deine `Aufstellung_Kosten….xlsx` wählen → **Übernehmen**.

Was dabei passiert:
- Zeilen mit Betrag werden Kostenposten (Nummern K-001 … bleiben erhalten).
- Zeilen mit Stunden und 0 € (Martin, Irena, Leonardo …) werden **Arbeitszeiten** im Bereich Mitarbeiter.
- Tippfehler werden vereinheitlicht („Eelektrik“ → Elektrik, „Dachterasse“ → Dachterrasse).
- Posten mit Status „Offen“ (Grundsteuer Q4, Versicherung und Strom/Wasser Okt–Dez) werden als **noch nicht bezahlt** übernommen.
- Leere Spalten (Fälligkeit, Zahlungsdatum, Zahlungsart, Finanzierungsquelle) werden weggelassen.
- Ein zweiter Import derselben Datei legt nichts doppelt an.

## 2. Als App installieren (Computer und Handy)

- **Windows / Mac mit Edge oder Chrome:** Adresse öffnen → oben rechts **App installieren** (oder in der Adressleiste das Symbol „Bildschirm mit Pfeil“). Danach hat Haus-Kosten ein eigenes Fenster und ein Symbol im Startmenü/Dock und in der Taskleiste.
- **Mac mit Safari:** Ablage → **Zum Dock hinzufügen**.
- **iPhone:** Adresse in Safari öffnen → Teilen → **Zum Home-Bildschirm**.
- **Android:** In Chrome öffnen → Menü → **App installieren**.

Am Computer startet die App mit der Übersicht, am Handy direkt mit „Erfassen“. Sie funktioniert auch ohne Netz; die Einträge werden später abgeglichen.

**Am Computer** gibt es zusätzlich:
- Erfassen in zwei Spalten, ganz ohne Maus: Betrag → <kbd>Enter</kbd> → Händler → <kbd>Enter</kbd> → Beschreibung → <kbd>Strg</kbd>+<kbd>Enter</kbd> speichert.
- Die Liste als Tabelle wie in Excel, Spalten per Klick sortierbar (z. B. nach Betrag).
- Tastenkürzel: <kbd>N</kbd> neu, <kbd>L</kbd> Liste, <kbd>S</kbd> Statistik, <kbd>M</kbd> Mitarbeiter, <kbd>Z</kbd> zuordnen, <kbd>/</kbd> suchen, <kbd>?</kbd> Hilfe.

**Auf ChatGPT Sites:** Die ganze App gibt es als eine Datei, `dist/Haus-Kosten.html`. Wie du sie dort veröffentlichst, steht in [`chatgpt/CHATGPT-SITES.md`](chatgpt/CHATGPT-SITES.md).

## 3. Datenbank einrichten (Abgleich Handy ↔ Computer ↔ ChatGPT)

Ohne Datenbank bleiben die Daten nur auf dem jeweiligen Gerät. Einmalig:

1. [supabase.com](https://supabase.com) → dein Projekt öffnen (oder neu anlegen, Region Frankfurt/EU).
2. **SQL Editor** → Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen → **Run**.
   Danach noch einmal ausführen, mit deiner E-Mail:
   ```sql
   insert into public.kosten_zugang (email) values ('deine@email.de');
   ```
3. **Authentication → Users → Add user**: deine E-Mail + Passwort anlegen („Auto confirm“ an).
   Empfehlung: unter **Authentication → Sign In / Providers** „Allow new users to sign up“ ausschalten.
4. **Project Settings → API**: „Project URL“ und den „anon / publishable“-Schlüssel kopieren.
5. In der App: **Einstellungen → Datenbank** → URL, Schlüssel, E-Mail, Passwort → **Verbinden & anmelden**.
   Auf jedem Gerät einmal anmelden. Oben rechts zeigt der Punkt den Stand: grün = synchron.

Sicherheit: Der öffentliche Schlüssel allein gibt keinen Zugriff. Lesen und Schreiben darf nur, wer angemeldet **und** in `kosten_zugang` eingetragen ist.

## 4. ChatGPT anbinden

1. **Edge Function anlegen:** Im Supabase-Dashboard → **Edge Functions → Deploy a new function → Via Editor**, Name `kosten-api`,
   die Dateien [`supabase/functions/kosten-api/index.ts`](supabase/functions/kosten-api/index.ts) und `core.js` einfügen, „Verify JWT“ **aus**.
   (Mit der Supabase-CLI: `supabase functions deploy kosten-api --no-verify-jwt`.)
2. **Edge Functions → Secrets:** `KOSTEN_API_TOKEN` = ein langes Zufallswort (z. B. 40 Zeichen aus einem Passwortgenerator).
3. Dann den GPT einrichten: siehe [`chatgpt/GPT-ANWEISUNGEN.md`](chatgpt/GPT-ANWEISUNGEN.md).

Danach kannst du in ChatGPT z. B. schreiben: „45,90 € bei Leroy Merlin, Kabel und Dosen fürs Kinderzimmer“ oder „Was hat die Elektrik bisher gekostet?“ – die App zeigt es beim nächsten Abgleich.

## 5. Mitarbeiter-Projekt verbinden

Die Arbeitszeiten aus dem anderen Projekt kommen auf einem von zwei Wegen herein:

**a) Das Projekt schickt sie (empfohlen).** Es ruft nach jeder Änderung auf:

```
POST https://<PROJEKT>.supabase.co/functions/v1/kosten-api/arbeitszeit
Authorization: Bearer <MITARBEITER_API_TOKEN>
Content-Type: application/json

[
  { "id": "4711", "datum": "2026-10-31", "mitarbeiter": "Martin", "beginn": "08:00", "ende": "18:00", "stunden": 10, "betrag": 250, "beschreibung": "Fliesen verlegen", "gewerk": "Fliesen" }
]
```

- `id` = die ID im Mitarbeiter-Projekt; erneutes Senden aktualisiert statt zu verdoppeln.
- `betrag` ist optional. Fehlt er, rechnet die App Stunden × Stundensatz (im Bereich Mitarbeiter einstellbar).
- `MITARBEITER_API_TOKEN` als eigenes Secret anlegen – dieser Schlüssel darf nur Arbeitszeiten schreiben, sonst nichts.

**b) Die App holt sie.** Stellt das Projekt eine JSON-Liste im selben Format bereit, die Adresse unter **Einstellungen → Mitarbeiter-Projekt** eintragen.

Damit nichts doppelt zählt: Gibt es für eine Person an einem Tag Einträge aus dem Projekt, ersetzen diese die Excel-Stunden desselben Tages.

## 6. Export

- **Excel:** Übersicht, alle Kosten (gleicher Aufbau wie deine bisherige Liste, wieder importierbar), Arbeitszeit, Summen nach Kategorie/Gewerk/Raum/Lieferant, Monate, Mitarbeiter.
- **PDF-Bericht:** Kennzahlen, Diagramme, Summentabellen, offene Posten und alle Posten.

Beide richten sich nach dem gewählten Zeitraum und den Schaltern „Hauskauf“ / „Mitarbeiter“ in der Statistik.

## Technik (kurz)

- Reines HTML/JS ohne Build, liegt in `kosten/`. Bibliotheken lokal in `vendor/`: Chart.js 4.4.7, SheetJS 0.18.5 (mini), jsPDF 2.5.2, jspdf-autotable 3.8.4 (alle MIT bzw. Apache-2.0).
- `core.js`: Datenmodell, Import, Statistik, Abgleich – wird von App und Edge Function gemeinsam genutzt. Nach Änderungen `core.js` nach `supabase/functions/kosten-api/core.js` kopieren.
- Abgleich: jede Zeile hat `geaendert_am` (setzt die Datenbank). Das Gerät lädt eigene Änderungen hoch und holt alles Neuere. Gelöscht wird „weich“ (`geloescht = true`), damit alle Geräte es mitbekommen.
- Die Kostendaten liegen **nicht** in diesem öffentlichen Repository, sondern nur auf deinen Geräten und in deiner Datenbank.
