// Beleg-Erkennung: liest Kassenbon- oder Rechnungsfotos (bzw. ein PDF) mit Claude aus
// und schlägt Kategorie, Gewerk und Raum vor. Der Nutzer prüft und bestätigt in der App.
//
// Geheimnis: ANTHROPIC_API_KEY (console.anthropic.com → API Keys)
// Optional:  BELEG_MODELL (Standard claude-opus-5-5; günstiger: claude-haiku-5-5)
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { betaJSONSchemaOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/beta/json-schema";

const MODELL = Deno.env.get("BELEG_MODELL") || "claude-opus-5-5";
const MAX_BILDER = 4;
const MAX_BYTES = 12 * 1024 * 1024; // Base64-Text gesamt
const BILDTYPEN = ["image/jpeg", "image/png", "image/webp", "image/gif"];

let client: Anthropic | null = null;
const anthropic = () => {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new BelegFehler("Beleg-Erkennung ist nicht eingerichtet: Secret ANTHROPIC_API_KEY fehlt (siehe ANLEITUNG.md).", 503);
  return (client = client || new Anthropic());
};

export class BelegFehler extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ist_beleg", "lieferant", "datum", "belegart", "belegnr", "waehrung", "gesamtbetrag", "bereits_bezahlt", "positionen", "kategorie", "gewerk", "raum", "beschreibung", "sicherheit", "hinweise"],
  properties: {
    ist_beleg: { type: "boolean", description: "false, wenn auf dem Bild kein Kassenbon / keine Rechnung zu sehen ist" },
    lieferant: { type: ["string", "null"], description: "Händler / Firma, kurz (z. B. „Leroy Merlin“, „Ferreteria Calaflores“)" },
    datum: { type: ["string", "null"], description: "Belegdatum als JJJJ-MM-TT" },
    belegart: { type: "string", enum: ["Kassenbon", "Rechnung", "Aufstellung", "Ohne Beleg"] },
    belegnr: { type: ["string", "null"], description: "Beleg- oder Rechnungsnummer" },
    waehrung: { type: "string", description: "ISO-Code, meist EUR" },
    gesamtbetrag: { type: ["number", "null"], description: "Endsumme brutto inkl. MwSt./IVA, die tatsächlich zu zahlen ist" },
    bereits_bezahlt: { type: "boolean", description: "Kassenbon/Kartenzahlung = true; Rechnung mit offener Zahlung/Fälligkeit = false" },
    positionen: {
      type: "array",
      description: "Einzelposten des Belegs (höchstens 40; bei sehr langen Belegen ähnliche zusammenfassen)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["bezeichnung", "bezeichnung_de", "betrag", "gewerk"],
        properties: {
          bezeichnung: { type: "string", description: "wie auf dem Beleg" },
          bezeichnung_de: { type: "string", description: "kurz auf Deutsch" },
          betrag: { type: "number", description: "Zeilensumme brutto" },
          gewerk: { type: ["string", "null"], description: "passendes Gewerk aus der Liste oder null" },
        },
      },
    },
    kategorie: { type: "string", description: "Hauptkategorie aus der Liste" },
    gewerk: { type: ["string", "null"], description: "nur bei Kategorie Renovierungen; das Gewerk mit dem größten Anteil" },
    raum: { type: ["string", "null"], description: "nur wenn auf dem Beleg erkennbar oder vom Händler eindeutig, sonst null" },
    beschreibung: { type: "string", description: "kurze deutsche Zusammenfassung, was gekauft wurde (max. 60 Zeichen)" },
    sicherheit: { type: "string", enum: ["hoch", "mittel", "niedrig"], description: "wie sicher Summe, Datum und Händler gelesen wurden" },
    hinweise: { type: "array", items: { type: "string" }, description: "kurze Hinweise für den Nutzer, z. B. unleserliche Stellen; leer, wenn alles klar ist" },
  },
} as const;

// deno-lint-ignore no-explicit-any
export async function belegLesen(body: any) {
  const bilder: { media_type: string; data: string }[] = Array.isArray(body?.bilder) ? body.bilder : [];
  const pdf: string | null = typeof body?.pdf === "string" ? body.pdf : null;
  if (!bilder.length && !pdf) throw new BelegFehler("Kein Bild und kein PDF übergeben");
  if (bilder.length > MAX_BILDER) throw new BelegFehler("Höchstens " + MAX_BILDER + " Fotos pro Beleg");
  let groesse = pdf ? pdf.length : 0;
  for (const b of bilder) {
    if (!BILDTYPEN.includes(b?.media_type) || typeof b?.data !== "string") throw new BelegFehler("Nur JPEG-, PNG-, WebP- oder GIF-Bilder");
    groesse += b.data.length;
  }
  if (groesse > MAX_BYTES) throw new BelegFehler("Dateien zu groß (max. ca. 9 MB)");

  const k = body?.kontext || {};
  const liste = (x: unknown, n = 60) => (Array.isArray(x) ? x.filter((s) => typeof s === "string").slice(0, n) : []);
  const bekannt = Array.isArray(k.bekannt) ? k.bekannt.slice(0, 40).map((b: Record<string, unknown>) => [b.lieferant, b.kategorie, b.gewerk, b.raum].filter(Boolean).join(" → ")) : [];

  const system = [
    "Du liest Kassenbons und Rechnungen für die Kostenübersicht einer Hausrenovierung in Spanien aus. Belege sind meist spanisch (IVA = MwSt., TOTAL = Endsumme, Efectivo/Tarjeta = bar/Karte).",
    "Gib die Endsumme brutto an, die tatsächlich bezahlt wird (nach Rabatten, inkl. IVA). Datum immer als JJJJ-MM-TT.",
    "Wähle Kategorie, Gewerk und Raum möglichst aus den vorhandenen Listen, mit exakt gleicher Schreibweise. Ein neues Gewerk nur, wenn wirklich keines passt.",
    "Gewerk nur bei der Kategorie „Renovierungen“. Werkzeug, Baumaterial und Installationsmaterial gehören zu Renovierungen; Haushaltswaren, Lebensmittel und Kleidung eher zu „Lebenshaltung“.",
    "Ist ein Händler unten als bekannt aufgeführt, übernimm dessen übliche Zuordnung, außer der Beleg zeigt klar etwas anderes.",
    "Erfinde nichts: Unleserliches als null angeben, sicherheit herabsetzen und einen Hinweis schreiben.",
  ].join("\n");
  const kontext = [
    "Hauptkategorien: " + liste(k.kategorien).join(", "),
    "Gewerke: " + liste(k.gewerke).join(", "),
    "Räume / Bereiche: " + liste(k.raeume).join(", "),
    bekannt.length ? "Bekannte Händler (Händler → Kategorie → Gewerk → Raum):\n" + bekannt.join("\n") : "",
  ].filter(Boolean).join("\n\n");

  // deno-lint-ignore no-explicit-any
  const inhalt: any[] = [];
  if (pdf) inhalt.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } });
  for (const b of bilder) inhalt.push({ type: "image", source: { type: "base64", media_type: b.media_type, data: b.data } });
  inhalt.push({ type: "text", text: kontext + "\n\n" + (bilder.length > 1 ? "Die Fotos zeigen zusammen EINEN Beleg (z. B. einen langen Kassenbon in Teilen). " : "") + "Lies den Beleg aus." });

  let antwort;
  try {
    antwort = await anthropic().beta.messages.parse({
      model: MODELL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: inhalt }],
      output_config: { format: betaJSONSchemaOutputFormat(SCHEMA) },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new BelegFehler("ANTHROPIC_API_KEY ist ungültig", 503);
    if (e instanceof Anthropic.RateLimitError) throw new BelegFehler("KI gerade ausgelastet – bitte in einer Minute nochmal", 429);
    if (e instanceof Anthropic.BadRequestError) throw new BelegFehler("Datei konnte nicht gelesen werden: " + e.message, 400);
    if (e instanceof Anthropic.APIError) throw new BelegFehler("KI-Fehler " + e.status, 502);
    throw e;
  }
  if (antwort.stop_reason === "refusal") throw new BelegFehler("Die KI hat diesen Beleg nicht verarbeitet – bitte von Hand erfassen", 422);
  if (antwort.stop_reason === "max_tokens") throw new BelegFehler("Beleg zu lang – bitte in weniger Fotos aufteilen", 422);
  const daten = antwort.parsed_output;
  if (!daten) throw new BelegFehler("Antwort der KI war unvollständig – bitte nochmal versuchen", 502);
  return { ...daten, modell: antwort.model, tokens: { ein: antwort.usage.input_tokens, aus: antwort.usage.output_tokens } };
}
