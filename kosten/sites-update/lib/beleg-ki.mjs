// Haus-Kosten – Beleg-Erkennung für ChatGPT Sites (Cloudflare Workers).
// Liest Kassenbon-/Rechnungsfotos (bzw. ein PDF) mit Claude aus und liefert ein festes JSON,
// das die Prüfansicht der App („Beleg prüfen“) direkt anzeigt. Schreibt NICHTS in die Datenbank:
// gespeichert wird erst, wenn der Nutzer bestätigt – dann ganz normal über /api/sync (mit Audit).
//
// Abhängigkeit: npm install @anthropic-ai/sdk@1.3.0
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";

export const STANDARD_MODELL = "claude-opus-5-5";
const MAX_BILDER = 4;
const MAX_ZEICHEN = 12 * 1024 * 1024; // Base64-Text gesamt
const BILDTYPEN = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export class BelegFehler extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ist_beleg", "lieferant", "datum", "belegart", "belegnr", "waehrung", "gesamtbetrag", "bereits_bezahlt", "positionen", "kategorie", "gewerk", "raum", "beschreibung", "sicherheit", "hinweise"],
  properties: {
    ist_beleg: { type: "boolean", description: "false, wenn auf dem Bild kein Kassenbon / keine Rechnung zu sehen ist" },
    lieferant: { type: ["string", "null"], description: "Händler / Firma, kurz" },
    datum: { type: ["string", "null"], description: "Belegdatum als JJJJ-MM-TT" },
    belegart: { type: "string", enum: ["Kassenbon", "Rechnung", "Aufstellung", "Ohne Beleg"] },
    belegnr: { type: ["string", "null"], description: "Beleg- oder Rechnungsnummer" },
    waehrung: { type: "string", description: "ISO-Code, meist EUR" },
    gesamtbetrag: { type: ["number", "null"], description: "Endsumme brutto inkl. MwSt./IVA, die tatsächlich zu zahlen ist" },
    bereits_bezahlt: { type: "boolean", description: "Kassenbon/Kartenzahlung = true; Rechnung mit offener Zahlung/Fälligkeit = false" },
    positionen: {
      type: "array",
      description: "Einzelposten (höchstens 40; bei sehr langen Belegen ähnliche zusammenfassen)",
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
    gewerk: { type: ["string", "null"], description: "nur bei Kategorie Renovierungen" },
    raum: { type: ["string", "null"], description: "nur wenn eindeutig erkennbar, sonst null" },
    beschreibung: { type: "string", description: "kurze deutsche Zusammenfassung (max. 60 Zeichen)" },
    sicherheit: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
    hinweise: { type: "array", items: { type: "string" }, description: "kurze Hinweise, z. B. unleserliche Stellen; leer, wenn alles klar ist" },
  },
};

const SYSTEM = [
  "Du liest Kassenbons und Rechnungen für die Kostenübersicht einer Hausrenovierung in Spanien aus. Belege sind meist spanisch (IVA = MwSt., TOTAL = Endsumme, Efectivo/Tarjeta = bar/Karte).",
  "Gib die Endsumme brutto an, die tatsächlich bezahlt wird (nach Rabatten, inkl. IVA). Datum immer als JJJJ-MM-TT.",
  "Wähle Kategorie, Gewerk und Raum NUR aus den vorhandenen Listen, mit exakt gleicher Schreibweise. Passt nichts, gib null (bzw. bei der Kategorie die naheliegendste vorhandene) und schreib einen Hinweis.",
  "Gewerk nur bei der Kategorie „Renovierungen“. Werkzeug, Baumaterial und Installationsmaterial gehören zu Renovierungen; Haushaltswaren, Lebensmittel und Kleidung eher zu „Lebenshaltung“.",
  "Ist ein Händler unten als bekannt aufgeführt, übernimm dessen übliche Zuordnung, außer der Beleg zeigt klar etwas anderes.",
  "Erfinde nichts: Unleserliches als null angeben, sicherheit herabsetzen und einen Hinweis schreiben.",
].join("\n");

/** Prüft die Anfrage der App und baut die Nachricht für Claude. Wirft BelegFehler bei ungültiger Eingabe. */
export function anfragePruefen(body) {
  const bilder = Array.isArray(body?.bilder) ? body.bilder : [];
  const pdf = typeof body?.pdf === "string" ? body.pdf : null;
  if (!bilder.length && !pdf) throw new BelegFehler("Kein Bild und kein PDF übergeben");
  if (bilder.length && pdf) throw new BelegFehler("Entweder Fotos oder ein PDF, nicht beides");
  if (bilder.length > MAX_BILDER) throw new BelegFehler("Höchstens " + MAX_BILDER + " Fotos pro Beleg");
  let zeichen = pdf ? pdf.length : 0;
  for (const b of bilder) {
    if (!BILDTYPEN.includes(b?.media_type) || typeof b?.data !== "string") throw new BelegFehler("Nur JPEG-, PNG-, WebP- oder GIF-Bilder");
    zeichen += b.data.length;
  }
  if (zeichen > MAX_ZEICHEN) throw new BelegFehler("Dateien zu groß (max. ca. 9 MB)", 413);

  const k = body?.kontext || {};
  const liste = (x, n = 80) => (Array.isArray(x) ? x.filter((s) => typeof s === "string").slice(0, n) : []);
  const bekannt = Array.isArray(k.bekannt) ? k.bekannt.slice(0, 40).map((b) => [b?.lieferant, b?.kategorie, b?.gewerk, b?.raum].filter((v) => typeof v === "string" && v).join(" → ")).filter(Boolean) : [];
  const kontext = [
    "Hauptkategorien: " + liste(k.kategorien).join(", "),
    "Gewerke: " + liste(k.gewerke).join(", "),
    "Räume / Bereiche: " + liste(k.raeume).join(", "),
    bekannt.length ? "Bekannte Händler (Händler → Kategorie → Gewerk → Raum):\n" + bekannt.join("\n") : "",
  ].filter(Boolean).join("\n\n");

  const inhalt = [];
  if (pdf) inhalt.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } });
  for (const b of bilder) inhalt.push({ type: "image", source: { type: "base64", media_type: b.media_type, data: b.data } });
  inhalt.push({ type: "text", text: kontext + "\n\n" + (bilder.length > 1 ? "Die Fotos zeigen zusammen EINEN Beleg (z. B. einen langen Kassenbon in Teilen). " : "") + "Lies den Beleg aus." });
  return inhalt;
}

/**
 * @param body    JSON der App: { bilder?: [{media_type, data}], pdf?: string, kontext: {...} }
 * @param optionen { apiKey: string, modell?: string, client?: Anthropic (nur für Tests) }
 */
export async function belegLesen(body, optionen = {}) {
  const inhalt = anfragePruefen(body);
  if (!optionen.client && !optionen.apiKey) throw new BelegFehler("Beleg-Erkennung ist nicht eingerichtet: Secret ANTHROPIC_API_KEY fehlt.", 503);
  const client = optionen.client || new Anthropic({ apiKey: optionen.apiKey });
  let antwort;
  try {
    antwort = await client.beta.messages.parse({
      model: optionen.modell || STANDARD_MODELL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: inhalt }],
      output_config: { format: betaJSONSchemaOutputFormat(SCHEMA) },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new BelegFehler("ANTHROPIC_API_KEY ist ungültig", 503);
    if (e instanceof Anthropic.RateLimitError) throw new BelegFehler("KI gerade ausgelastet – bitte in einer Minute nochmal", 429);
    if (e instanceof Anthropic.BadRequestError) throw new BelegFehler("Datei konnte nicht gelesen werden", 400);
    if (e instanceof Anthropic.APIError) throw new BelegFehler("KI-Fehler " + e.status, 502);
    throw e;
  }
  if (antwort.stop_reason === "refusal") throw new BelegFehler("Die KI hat diesen Beleg nicht verarbeitet – bitte von Hand erfassen", 422);
  if (antwort.stop_reason === "max_tokens") throw new BelegFehler("Beleg zu lang – bitte in weniger Fotos aufteilen", 422);
  const daten = antwort.parsed_output;
  if (!daten) throw new BelegFehler("Antwort der KI war unvollständig – bitte nochmal versuchen", 502);
  return { ...daten, modell: antwort.model };
}
