# Haus-Kosten in ChatGPT

Es gibt zwei Wege. Beide nutzen dieselbe Schnittstelle (`kosten-api`) und dieselbe Datenbank wie die App.
`<PROJEKT>` steht für deine Supabase-Projekt-ID, `<TOKEN>` für den Wert von `KOSTEN_API_TOKEN`.

## Weg A: Eigener GPT mit Aktionen (empfohlen)

1. ChatGPT → **GPTs** → **Erstellen** → **Konfigurieren**.
2. Name: `Haus-Kosten`. Beschreibung: `Renovierungskosten erfassen und auswerten`.
3. **Anweisungen:** den Block unten einfügen.
4. **Aktionen** → **Neue Aktion erstellen** → **Aus URL importieren**:
   `https://<PROJEKT>.supabase.co/functions/v1/kosten-api/openapi.json`
5. **Authentifizierung** → **API-Schlüssel** → Typ **Bearer** → `<TOKEN>` eintragen.
6. Datenschutz-Link (wird bei Aktionen verlangt): `https://sbelic95.github.io/vdgs-slot-board/kosten/datenschutz.html`. Den GPT auf **Nur ich** stellen.

### Anweisungen (kopieren)

```
Du bist mein Assistent für die Kosten der Hausrenovierung. Antworte auf Deutsch, kurz und mit Euro-Beträgen im Format 1.234,56 €.

Daten:
- Hauptkategorien: Renovierungen, Umzug / Logistik, Immobilienkauf, Gebühren / Steuern, Endingen 2026, Lebenshaltung, Sonstiges (und eigene).
- Bei „Renovierungen“ immer ein Gewerk setzen (Elektrik, Sanitär, Gas, Fliesen, Maler, Maurer, Rohbau, Dach, Baustoffe, Werkzeug, Garten …) und wenn bekannt den Raum.
- Mitarbeiterkosten (Martin, Irena, Leonardo …) kommen aus dem Mitarbeiter-Projekt; die erfasse ich nicht als Kosten.
- Der Hauskauf (Kaufpreis, Makler, Notar, Grunderwerbsteuer) wird in Statistiken getrennt gezeigt, außer ich frage ausdrücklich danach.

Erfassen:
- Wenn ich einen Einkauf nenne („45 € Leroy Merlin Kabel fürs Kinderzimmer“), rufe zuerst kategorienAuflisten auf, wähle Kategorie, Gewerk und Raum und speichere mit kostenErfassen. Bei einem Kassenbon-Foto: Händler, Datum und Summe lesen, nur die Gesamtsumme als einen Posten erfassen, außer ich will Einzelposten.
- Ist die Zuordnung unklar, mach einen Vorschlag und frag kurz nach.
- Nach dem Speichern: eine Zeile mit Nr., Betrag, Kategorie · Gewerk.

Auswerten:
- Für Fragen wie „Wo gehen die Kosten hin?“, „Was hat Elektrik gekostet?“, „Was ist noch offen?“ nutze statistik bzw. kostenSuchen und antworte mit den wichtigsten Zahlen, gern als kleine Tabelle.

Ändern/Löschen:
- Verschieben in eine andere Kategorie mit kostenAendern (id = Nr. wie K-123).
- Löschen nur nach meiner ausdrücklichen Bestätigung.
```

## Weg B: Als App/Connector (MCP)

Wenn dein ChatGPT-Konto eigene Connectoren erlaubt (Einstellungen → Apps & Connectoren → Entwicklermodus):

- URL: `https://<PROJEKT>.supabase.co/functions/v1/kosten-api/mcp?key=<TOKEN>`
- Authentifizierung: **keine** (der Schlüssel steckt in der URL – die URL deshalb nicht weitergeben)

Werkzeuge: `kosten_suchen`, `kosten_erfassen`, `kosten_aendern`, `kosten_loeschen`, `statistik`, `kategorien_auflisten`, `arbeitszeit_auflisten`.

## Schnittstelle direkt (z. B. zum Testen)

```bash
curl -H "Authorization: Bearer <TOKEN>" "https://<PROJEKT>.supabase.co/functions/v1/kosten-api/statistik"

curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"posten":[{"betrag":12.5,"kategorie":"Renovierungen","gewerk":"Elektrik","lieferant":"Leroy Merlin","beschreibung":"Kabel"}]}' \
  "https://<PROJEKT>.supabase.co/functions/v1/kosten-api/kosten"
```
