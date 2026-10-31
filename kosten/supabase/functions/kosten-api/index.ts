// Haus-Kosten API – für ChatGPT (GPT-Aktionen und MCP-Connector) und das Mitarbeiter-Projekt.
// Läuft als Supabase Edge Function „kosten-api“ (verify_jwt = false, eigene Token-Prüfung).
//
// Geheimnisse (Supabase → Edge Functions → Secrets):
//   KOSTEN_API_TOKEN        Zugang für ChatGPT (lang und zufällig)
//   MITARBEITER_API_TOKEN   optional: eigener Zugang nur für das Mitarbeiter-Projekt (darf nur /arbeitszeit schreiben)
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
import { createClient } from "npm:@supabase/supabase-js@2";
import "./core.js"; // gleiche Statistik-Logik wie die App (Kopie von kosten/core.js)

// deno-lint-ignore no-explicit-any
const Core = (globalThis as any).Core;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TOKEN = Deno.env.get("KOSTEN_API_TOKEN") || "";
const MA_TOKEN = Deno.env.get("MITARBEITER_API_TOKEN") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-api-key, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 1), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const fehler = (msg: string, status = 400) => json({ fehler: msg }, status);

function gleich(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function rolle(req: Request, url: URL): "voll" | "mitarbeiter" | null {
  const h = req.headers.get("authorization") || "";
  const t = (h.startsWith("Bearer ") ? h.slice(7) : "") || req.headers.get("x-api-key") || url.searchParams.get("key") || "";
  if (TOKEN && gleich(t, TOKEN)) return "voll";
  if (MA_TOKEN && gleich(t, MA_TOKEN)) return "mitarbeiter";
  return null;
}

// ---------- Daten ----------
async function alle(tabelle: string) {
  const out: Record<string, unknown>[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db.from(tabelle).select("*").eq("geloescht", false).range(von, von + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out.map((z) => {
    for (const k of ["betrag", "bezahlt", "stunden", "stundensatz"]) if (z[k] != null) z[k] = Number(z[k]);
    if (z.datum) z.datum = String(z.datum).slice(0, 10);
    return z;
  });
}
async function datenLaden() {
  const [kosten, arbeitszeit, mitarbeiter, listen] = await Promise.all([alle("kosten"), alle("arbeitszeit"), alle("mitarbeiter"), alle("listen")]);
  return { kosten, arbeitszeit, mitarbeiter, listen };
}

const KOSTEN_FELDER = ["datum", "kategorie", "gewerk", "raum", "lieferant", "beschreibung", "belegart", "belegnr", "betrag", "bezahlt", "anmerkung", "nr"];

// deno-lint-ignore no-explicit-any
function kostenKurz(k: any) {
  return { id: k.id, nr: k.nr, datum: k.datum, kategorie: k.kategorie, gewerk: k.gewerk || null, raum: k.raum || null, lieferant: k.lieferant || null, beschreibung: k.beschreibung || null, betrag: Number(k.betrag), bezahlt: Number(k.bezahlt), offen: Core.offen(k), status: Core.statusVon(k), belegart: k.belegart || null, anmerkung: k.anmerkung || null, quelle: k.quelle };
}

// deno-lint-ignore no-explicit-any
async function kostenSuchen(p: any) {
  let q = db.from("kosten").select("*").eq("geloescht", false).order("datum", { ascending: false }).limit(Math.min(Number(p.limit) || 50, 500));
  if (p.von) q = q.gte("datum", p.von);
  if (p.bis) q = q.lte("datum", p.bis);
  if (p.kategorie) q = q.ilike("kategorie", p.kategorie);
  if (p.gewerk) q = p.gewerk === "keins" ? q.or("gewerk.is.null,gewerk.eq.") : q.ilike("gewerk", p.gewerk);
  if (p.raum) q = q.ilike("raum", p.raum);
  if (p.lieferant) q = q.ilike("lieferant", "%" + p.lieferant + "%");
  if (p.suche) {
    const s = String(p.suche).replace(/[,()%]/g, " ").trim();
    q = q.or(`beschreibung.ilike.%${s}%,lieferant.ilike.%${s}%,anmerkung.ilike.%${s}%,nr.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let liste = (data || []).map((k) => { k.betrag = Number(k.betrag); k.bezahlt = Number(k.bezahlt); return kostenKurz(k); });
  if (p.nur_offen === true || p.nur_offen === "true") liste = liste.filter((k) => k.offen > 0);
  const summe = Core.r2(liste.reduce((s: number, k: { betrag: number }) => s + k.betrag, 0));
  return { anzahl: liste.length, summe, summe_text: Core.fmtEUR(summe), posten: liste };
}

async function naechsteNr() {
  const [{ data: k }, { data: a }] = await Promise.all([
    db.from("kosten").select("nr").like("nr", "K-%").limit(10000),
    db.from("arbeitszeit").select("id").like("id", "xl-K-%").limit(10000),
  ]);
  return Core.naechsteNr([...(k || []), ...(a || [])]);
}

// deno-lint-ignore no-explicit-any
async function kostenErfassen(p: any) {
  const liste = Array.isArray(p) ? p : Array.isArray(p.posten) ? p.posten : [p];
  const neu = [];
  let nr = await naechsteNr();
  for (const e of liste) {
    const betrag = Core.parseBetrag(e.betrag);
    if (!(betrag > 0)) throw new Error("betrag fehlt oder ist 0");
    const bezahlt = e.bezahlt === false ? 0 : e.bezahlt === true || e.bezahlt == null ? betrag : Core.parseBetrag(e.bezahlt);
    const k = Core.neueKosten({
      nr, datum: Core.excelDatum(e.datum) || Core.heute(), kategorie: Core.txt(e.kategorie) || "Renovierungen", gewerk: Core.txt(e.gewerk), raum: Core.txt(e.raum),
      lieferant: Core.txt(e.lieferant), beschreibung: Core.txt(e.beschreibung), belegart: Core.txt(e.belegart), belegnr: Core.txt(e.belegnr),
      anmerkung: Core.txt(e.anmerkung), betrag, bezahlt, quelle: "chatgpt",
    });
    neu.push(k);
    nr = "K-" + String(Number(nr.slice(2)) + 1).padStart(3, "0");
  }
  const { error } = await db.from("kosten").insert(neu.map(zeileFuerDb));
  if (error) throw new Error(error.message);
  return { gespeichert: neu.length, posten: neu.map(kostenKurz) };
}
// deno-lint-ignore no-explicit-any
function zeileFuerDb(k: any) { const o: Record<string, unknown> = {}; for (const s of Core.SPALTEN.kosten) o[s] = k[s] ?? null; o.status = Core.statusVon(k); o.geloescht = !!k.geloescht; return o; }

async function findeKosten(idOderNr: string) {
  if (!/^[\w.-]+$/.test(idOderNr)) throw new Error("Ungültige ID");
  const { data, error } = await db.from("kosten").select("*").or(`id.eq.${idOderNr},nr.eq.${idOderNr}`).limit(1);
  if (error) throw new Error(error.message);
  if (!data || !data[0]) throw new Error("Posten " + idOderNr + " nicht gefunden");
  const k = data[0]; k.betrag = Number(k.betrag); k.bezahlt = Number(k.bezahlt);
  return k;
}
// deno-lint-ignore no-explicit-any
async function kostenAendern(idOderNr: string, p: any) {
  const k = await findeKosten(idOderNr);
  const warVoll = Core.offen(k) === 0;
  for (const f of KOSTEN_FELDER) if (p[f] !== undefined) k[f] = f === "betrag" ? Core.parseBetrag(p[f]) : f === "bezahlt" ? (p[f] === true ? null : p[f] === false ? 0 : Core.parseBetrag(p[f])) : f === "datum" ? Core.excelDatum(p[f]) : Core.txt(p[f]);
  if (k.bezahlt == null || (warVoll && p.betrag !== undefined && p.bezahlt === undefined)) k.bezahlt = k.betrag;
  const { error } = await db.from("kosten").update(zeileFuerDb(k)).eq("id", k.id);
  if (error) throw new Error(error.message);
  return { geaendert: kostenKurz(k) };
}
async function kostenLoeschen(idOderNr: string) {
  const k = await findeKosten(idOderNr);
  const { error } = await db.from("kosten").update({ geloescht: true }).eq("id", k.id);
  if (error) throw new Error(error.message);
  return { geloescht: kostenKurz(k) };
}

// deno-lint-ignore no-explicit-any
async function statistik(p: any) {
  const daten = await datenLaden();
  const mitHauskauf = p.mit_hauskauf === true || p.mit_hauskauf === "true";
  const s = Core.statistik(daten, { von: p.von || "", bis: p.bis || "", ohneHauskauf: !mitHauskauf, mitMitarbeiter: p.mit_mitarbeiter !== false && p.mit_mitarbeiter !== "false" });
  const kurz = (l: { name: string; summe: number; anzahl: number }[]) => l.map((w) => ({ name: w.name, summe: w.summe, posten: w.anzahl, anteil_prozent: s.gesamt ? Math.round((1000 * w.summe) / s.gesamt) / 10 : 0 }));
  return {
    zeitraum: { von: p.von || "Beginn", bis: p.bis || "heute" }, hauskauf_eingerechnet: mitHauskauf,
    summen: { gesamt: s.gesamt, renovierung: s.renovierung, mitarbeiter: s.mitarbeiter, mitarbeiter_stunden: s.stunden, noch_offen: s.offen, hauskauf_inkl_nebenkosten: s.hauskauf, alles_zusammen: s.gesamtInklHauskauf, letzte_30_tage: s.letzte30 },
    nach_kategorie: kurz(s.nachKategorie), nach_gewerk: kurz(s.nachGewerk), nach_raum: kurz(s.nachRaum), top_lieferanten: kurz(s.nachLieferant.slice(0, 15)),
    pro_monat: s.monate.map((m: { monat: string; summe: number; werte: Record<string, number> }) => ({ monat: m.monat, summe: m.summe, nach_kategorie: m.werte })),
    teuerste_posten: s.teuerste.map((x: { ref: unknown }) => kostenKurz(x.ref)), offene_posten: s.offenePosten.map((x: { ref: unknown }) => kostenKurz(x.ref)),
    ohne_gewerk: { anzahl: s.ohneGewerk.length, summe: Core.r2(s.ohneGewerk.reduce((a: number, x: { betrag: number }) => a + x.betrag, 0)) },
    mitarbeiter: s.proMitarbeiter,
  };
}

async function kategorien() {
  const d = await datenLaden();
  const zaehle = (feld: string) => [...new Set(d.kosten.map((k) => k[feld]).filter(Boolean))];
  const eigene = (typ: string) => d.listen.filter((l) => l.typ === typ).map((l) => l.name);
  const v = (...l: unknown[][]) => [...new Set(l.flat())];
  return {
    hauptkategorien: v(Core.HAUPTKATEGORIEN, eigene("kategorie"), zaehle("kategorie")),
    gewerke: v(zaehle("gewerk"), Core.GEWERKE, eigene("gewerk")),
    raeume: v(zaehle("raum"), Core.RAEUME, eigene("raum")),
    lieferanten: zaehle("lieferant"),
    mitarbeiter: d.mitarbeiter.map((m) => ({ name: m.name, stundensatz: m.stundensatz })),
    hinweis: "Gewerk nur bei Hauptkategorie „Renovierungen“ setzen.",
  };
}

// deno-lint-ignore no-explicit-any
async function arbeitszeitListe(p: any) {
  const d = await datenLaden();
  const saetze: Record<string, number> = {};
  for (const m of d.mitarbeiter) saetze[m.name as string] = Number(m.stundensatz) || 0;
  // deno-lint-ignore no-explicit-any
  let l = Core.wirksameArbeitszeit(d.arbeitszeit) as any[];
  if (p.von) l = l.filter((a) => a.datum >= p.von);
  if (p.bis) l = l.filter((a) => a.datum <= p.bis);
  if (p.mitarbeiter) l = l.filter((a) => a.mitarbeiter.toLowerCase() === String(p.mitarbeiter).toLowerCase());
  l.sort((a, b) => b.datum.localeCompare(a.datum));
  const zeilen = l.map((a) => ({ datum: a.datum, mitarbeiter: a.mitarbeiter, beginn: a.beginn, ende: a.ende, stunden: a.stunden, kosten: Core.arbeitskosten(a, saetze), taetigkeit: a.beschreibung, quelle: a.quelle }));
  return { anzahl: zeilen.length, stunden: Core.r2(zeilen.reduce((s, a) => s + a.stunden, 0)), kosten: Core.r2(zeilen.reduce((s, a) => s + a.kosten, 0)), eintraege: zeilen.slice(0, Number(p.limit) || 200) };
}

// Mitarbeiter-Projekt schreibt Arbeitszeiten (Upsert über seine eigene ID)
// deno-lint-ignore no-explicit-any
async function arbeitszeitSchreiben(p: any) {
  const liste = (Array.isArray(p) ? p : p.eintraege || p.arbeitszeiten || [p]).map(Core.externeArbeitszeit).filter(Boolean);
  if (!liste.length) throw new Error("Keine gültigen Einträge (benötigt: datum, mitarbeiter, stunden)");
  // deno-lint-ignore no-explicit-any
  const zeilen = liste.map((a: any) => { const o: Record<string, unknown> = {}; for (const s of Core.SPALTEN.arbeitszeit) o[s] = a[s] ?? null; o.geloescht = !!a.geloescht; return o; });
  const { error } = await db.from("arbeitszeit").upsert(zeilen, { onConflict: "id" });
  if (error) throw new Error(error.message);
  const namen = [...new Set(liste.map((a: { mitarbeiter: string }) => a.mitarbeiter))];
  await db.from("mitarbeiter").upsert(namen.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
  return { gespeichert: zeilen.length };
}

// ---------- MCP (ChatGPT-Connector / Apps) ----------
const TOOLS = [
  { name: "kosten_suchen", title: "Kosten suchen", description: "Sucht Kostenposten der Hausrenovierung. Ohne Filter: die neuesten 50.", annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { von: { type: "string", description: "Datum JJJJ-MM-TT" }, bis: { type: "string" }, kategorie: { type: "string" }, gewerk: { type: "string", description: "\"keins\" = ohne Gewerk" }, raum: { type: "string" }, lieferant: { type: "string" }, suche: { type: "string" }, nur_offen: { type: "boolean" }, limit: { type: "number" } } } },
  { name: "kosten_erfassen", title: "Kosten erfassen", description: "Speichert einen oder mehrere neue Kostenposten. Vorher mit kategorien_auflisten die passenden Namen holen. Betrag in Euro.",
    inputSchema: { type: "object", properties: { posten: { type: "array", items: { type: "object", required: ["betrag"], properties: { betrag: { type: "number" }, datum: { type: "string", description: "JJJJ-MM-TT, Standard heute" }, kategorie: { type: "string" }, gewerk: { type: "string" }, raum: { type: "string" }, lieferant: { type: "string" }, beschreibung: { type: "string" }, belegart: { type: "string", enum: ["Kassenbon", "Rechnung", "Aufstellung", "Ohne Beleg"] }, bezahlt: { type: "boolean", description: "Standard: true" }, anmerkung: { type: "string" } } } } }, required: ["posten"] } },
  { name: "kosten_aendern", title: "Kosten ändern", description: "Ändert einen Posten (z. B. in andere Kategorie/Gewerk verschieben). id = Nr. wie K-123 oder die ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, kategorie: { type: "string" }, gewerk: { type: "string" }, raum: { type: "string" }, lieferant: { type: "string" }, beschreibung: { type: "string" }, betrag: { type: "number" }, bezahlt: { type: ["number", "boolean"] }, datum: { type: "string" }, anmerkung: { type: "string" } } } },
  { name: "kosten_loeschen", title: "Kosten löschen", description: "Löscht einen Posten (wiederherstellbar). Nur nach Bestätigung durch den Nutzer.", annotations: { destructiveHint: true },
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "statistik", title: "Kosten-Statistik", description: "Summen nach Kategorie, Gewerk, Raum, Lieferant, Monat, offene und teuerste Posten, Mitarbeiterkosten.", annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { von: { type: "string" }, bis: { type: "string" }, mit_hauskauf: { type: "boolean", description: "Standard false: Hauskauf (Kaufpreis, Makler, Notar, Steuer) wird separat ausgewiesen" }, mit_mitarbeiter: { type: "boolean" } } } },
  { name: "kategorien_auflisten", title: "Kategorien", description: "Hauptkategorien, Gewerke, Räume, bekannte Lieferanten und Mitarbeiter.", annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: {} } },
  { name: "arbeitszeit_auflisten", title: "Arbeitszeiten", description: "Arbeitsstunden und Kosten der Mitarbeiter.", annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { von: { type: "string" }, bis: { type: "string" }, mitarbeiter: { type: "string" }, limit: { type: "number" } } } },
];
// deno-lint-ignore no-explicit-any
async function toolAusfuehren(name: string, a: any) {
  switch (name) {
    case "kosten_suchen": return kostenSuchen(a || {});
    case "kosten_erfassen": return kostenErfassen(a || {});
    case "kosten_aendern": return kostenAendern(String(a.id), a);
    case "kosten_loeschen": return kostenLoeschen(String(a.id));
    case "statistik": return statistik(a || {});
    case "kategorien_auflisten": return kategorien();
    case "arbeitszeit_auflisten": return arbeitszeitListe(a || {});
  }
  throw new Error("Unbekanntes Werkzeug " + name);
}
const MCP_HINWEIS = "Haus-Kosten: Renovierungskosten eines Hauses. Beträge in Euro. Hauptkategorien u. a. Renovierungen, Umzug / Logistik, Immobilienkauf, Gebühren / Steuern, Sonstiges. Bei Renovierungen zusätzlich ein Gewerk (Elektrik, Sanitär, Fliesen …). Vor dem Erfassen kategorien_auflisten aufrufen; vor dem Löschen nachfragen.";

// deno-lint-ignore no-explicit-any
async function mcp(nachricht: any) {
  const { id, method, params } = nachricht || {};
  const antwort = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  if (method === "initialize") return antwort({ protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "haus-kosten", title: "Haus-Kosten", version: "1.0.0" }, instructions: MCP_HINWEIS });
  if (method === "ping") return antwort({});
  if (method === "tools/list") return antwort({ tools: TOOLS });
  if (method === "tools/call") {
    try {
      const ergebnis = await toolAusfuehren(params?.name, params?.arguments || {});
      return antwort({ content: [{ type: "text", text: JSON.stringify(ergebnis) }], structuredContent: ergebnis });
    } catch (e) {
      return antwort({ content: [{ type: "text", text: "Fehler: " + (e as Error).message }], isError: true });
    }
  }
  if (method && method.startsWith("notifications/")) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Methode nicht unterstützt: " + method } };
}

// ---------- OpenAPI für GPT-Aktionen ----------
function openapi(basis: string) {
  const q = (name: string, beschreibung: string, typ = "string") => ({ name, in: "query", required: false, description: beschreibung, schema: { type: typ } });
  const posten = { type: "object", properties: { betrag: { type: "number" }, datum: { type: "string", description: "JJJJ-MM-TT" }, kategorie: { type: "string" }, gewerk: { type: "string" }, raum: { type: "string" }, lieferant: { type: "string" }, beschreibung: { type: "string" }, belegart: { type: "string" }, bezahlt: { type: "boolean" }, anmerkung: { type: "string" } }, required: ["betrag"] };
  const ok = { "200": { description: "OK", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } } };
  return {
    openapi: "3.1.0",
    info: { title: "Haus-Kosten", version: "1.0.0", description: MCP_HINWEIS },
    servers: [{ url: basis }],
    components: { securitySchemes: { token: { type: "http", scheme: "bearer" } }, schemas: {} },
    security: [{ token: [] }],
    paths: {
      "/kosten": {
        get: { operationId: "kostenSuchen", summary: "Kostenposten suchen", parameters: [q("von", "ab Datum JJJJ-MM-TT"), q("bis", "bis Datum"), q("kategorie", "Hauptkategorie"), q("gewerk", "Gewerk, 'keins' = ohne"), q("raum", "Raum"), q("lieferant", "Lieferant (Teiltext)"), q("suche", "Freitext"), q("nur_offen", "nur unbezahlte", "boolean"), q("limit", "max. Anzahl (Standard 50)", "integer")], responses: ok },
        post: { operationId: "kostenErfassen", summary: "Neue Kostenposten speichern", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { posten: { type: "array", items: posten } }, required: ["posten"] } } } }, responses: ok },
      },
      "/kosten/{id}": {
        patch: { operationId: "kostenAendern", summary: "Posten ändern oder verschieben (id = K-123 oder ID)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { ...posten.properties, bezahlt: { type: "number", description: "bezahlter Betrag" } } } } } }, responses: ok },
        delete: { operationId: "kostenLoeschen", summary: "Posten löschen (nur nach Bestätigung)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: ok },
      },
      "/statistik": { get: { operationId: "statistik", summary: "Auswertung nach Kategorie, Gewerk, Raum, Lieferant, Monat", parameters: [q("von", "ab Datum"), q("bis", "bis Datum"), q("mit_hauskauf", "Hauskauf einrechnen (Standard nein)", "boolean"), q("mit_mitarbeiter", "Mitarbeiter einrechnen (Standard ja)", "boolean")], responses: ok } },
      "/kategorien": { get: { operationId: "kategorienAuflisten", summary: "Gültige Kategorien, Gewerke, Räume, Lieferanten", responses: ok } },
      "/arbeitszeit": { get: { operationId: "arbeitszeitAuflisten", summary: "Arbeitszeiten der Mitarbeiter", parameters: [q("von", "ab Datum"), q("bis", "bis Datum"), q("mitarbeiter", "Name")], responses: ok } },
    },
  };
}

// ---------- Router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^.*?\/kosten-api/, "").replace(/\/+$/, "") || "/";
  const basis = (Deno.env.get("SUPABASE_URL") || url.origin) + "/functions/v1/kosten-api";
  try {
    if (pfad === "/openapi.json" || pfad === "/") return json(openapi(basis));
    const r = rolle(req, url);
    if (!r) return fehler("Nicht berechtigt", 401);
    const body = ["POST", "PATCH"].includes(req.method) ? await req.json().catch(() => ({})) : {};
    const params = Object.fromEntries(url.searchParams);
    delete params.key;

    if (pfad === "/arbeitszeit" && req.method === "POST") return json(await arbeitszeitSchreiben(body));
    if (r !== "voll") return fehler("Dieser Zugang darf nur Arbeitszeiten schreiben", 403);

    if (pfad === "/mcp") {
      if (req.method !== "POST") return new Response(null, { status: 405, headers: CORS });
      if (Array.isArray(body)) { const out = (await Promise.all(body.map(mcp))).filter(Boolean); return out.length ? json(out) : new Response(null, { status: 202, headers: CORS }); }
      const out = await mcp(body);
      return out ? json(out) : new Response(null, { status: 202, headers: CORS });
    }
    if (pfad === "/kosten" && req.method === "GET") return json(await kostenSuchen(params));
    if (pfad === "/kosten" && req.method === "POST") return json(await kostenErfassen(body), 201);
    const m = pfad.match(/^\/kosten\/([^/]+)$/);
    if (m && req.method === "PATCH") return json(await kostenAendern(decodeURIComponent(m[1]), body));
    if (m && req.method === "DELETE") return json(await kostenLoeschen(decodeURIComponent(m[1])));
    if (pfad === "/statistik") return json(await statistik(params));
    if (pfad === "/kategorien") return json(await kategorien());
    if (pfad === "/arbeitszeit" && req.method === "GET") return json(await arbeitszeitListe(params));
    return fehler("Unbekannter Pfad " + pfad, 404);
  } catch (e) {
    const msg = (e as Error).message;
    return fehler(msg, /nicht gefunden/.test(msg) ? 404 : /fehlt|Ungültig|Keine gültigen/.test(msg) ? 400 : 500);
  }
});
