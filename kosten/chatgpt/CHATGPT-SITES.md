# Haus-Kosten auf ChatGPT Sites

Die ganze App steckt in **einer Datei**: `dist/Haus-Kosten.html` (ca. 1 MB, alles enthalten, keine weiteren Dateien nötig).

## So geht's

1. In ChatGPT den Work-Modus öffnen und **@Sites** wählen.
2. Die Datei `Haus-Kosten.html` anhängen.
3. Diesen Text dazuschreiben:

```
Veröffentliche die angehängte Datei Haus-Kosten.html genau so als Website.
Bitte nichts umbauen, kürzen oder neu schreiben – die Datei ist eine fertige App
(alle Skripte und Bibliotheken sind bereits enthalten). Titel: Haus-Kosten.
```

4. Die Adresse, die ChatGPT zurückgibt, am Handy und am Computer öffnen und wie gewohnt als App installieren (siehe ANLEITUNG.md, Abschnitt 2).

## Gut zu wissen

- **Daten:** Jede Website-Adresse hat ihren eigenen Gerätespeicher. Was du unter der ChatGPT-Sites-Adresse erfasst, siehst du nicht automatisch unter einer anderen Adresse (z. B. GitHub Pages) – außer beide sind mit derselben Datenbank verbunden (Einstellungen → Datenbank). Mit Datenbank ist es egal, wo die App läuft.
- **Erster Start:** Statistik → „Excel-Datei laden“ → deine Aufstellung wählen.
- **Ändert ChatGPT die Datei trotzdem**, fehlen oft Diagramme oder Export. Dann die Datei woanders ablegen, z. B. per Drag & Drop auf [app.netlify.com/drop](https://app.netlify.com/drop), oder die GitHub-Pages-Adresse nutzen.
- **ChatGPT soll Kosten eintragen oder auswerten?** Dafür ist nicht die Website da, sondern der GPT bzw. Connector – siehe [GPT-ANWEISUNGEN.md](GPT-ANWEISUNGEN.md). Beide arbeiten über dieselbe Datenbank.

## Datei neu erzeugen (nach Änderungen am Code)

```bash
python3 kosten/tools/einzeldatei.py
```
