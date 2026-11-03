// Prüft die Haus-Kosten-Fassung 2026-11-03.2 vor dem Einspielen.
// Aufruf im Sites-Projekt:  node --test tests/update.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { belegLesen, anfragePruefen, BelegFehler } from "../lib/beleg-ki.mjs";

const require = createRequire(import.meta.url);
const C = require("./hk-core-neu.cjs");
const HTML = readFileSync(new URL("../web/Haus-Kosten.html", import.meta.url), "utf8");

test("HTML: alle eingebetteten Skripte sind gültig, nichts wird von außen geladen", () => {
  const skripte = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(skripte.length >= 6, "zu wenige Skripte: " + skripte.length);
  for (const s of skripte) new vm.Script(s); // wirft bei Syntaxfehlern
  assert.ok(!/<script\s+src=/i.test(HTML.replace(/<script>[\s\S]*?<\/script>/g, "")), "externes Skript gefunden");
  assert.match(HTML, /HK_APP_VERSION = "2026-11-03\.2"/);
  assert.match(HTML, /"hauskosten-v1"/, "lokaler Speicher-Schlüssel muss gleich bleiben");
  assert.match(HTML, /hauskaufAnzeigen/);
});

test("Excel-Import: Eigenleistungen fest 0 €, nicht Stunden × Satz", () => {
  const r = C.importiereZeilen([["ID", "Datum", "Hauptkategorie", "Lieferant / Empfänger", "Beginn", "Ende", "Std/Tag", "Beschreibung", "Gesamtkosten €", "Bezahlt €", "Status"],
    ["K-037", 46250, "Renovierungen", "Max ", 0.333333, 0.75, 0.416667, "Eigenleistung", 0, 0, "Bezahlt"]], []);
  assert.equal(r.arbeitszeit.length, 1);
  assert.equal(r.arbeitszeit[0].betrag, 0);
  assert.equal(C.arbeitskosten(r.arbeitszeit[0], { Max: 25 }), 0);
});

test("Import: nichts doppelt, Gelöschtes bleibt gelöscht, technische Felder bleiben, Baustunden-Tage werden ausgelassen", () => {
  const bestand = {
    kosten: {
      "xl-K-001": { id: "xl-K-001", nr: "K-001", datum: "2026-04-01", kategorie: "Sonstiges", beschreibung: "geändert", betrag: 1, bezahlt: 1, geloescht: false, _sitesVersion: 7, _excel: { zeile: 2 } },
      "xl-K-002": { id: "xl-K-002", nr: "K-002", datum: "2026-04-01", kategorie: "Sonstiges", betrag: 2, bezahlt: 2, geloescht: true, _sitesVersion: 3 },
    },
    arbeitszeit: { "bs-1": { id: "bs-1", datum: "2026-10-30", mitarbeiter: "Max", stunden: 9, betrag: 260, quelle: "baustunden", _baustundenId: "1", geloescht: false } },
  };
  const ergebnis = {
    kosten: [C.neueKosten({ id: "xl-K-001", nr: "K-001", datum: "2026-04-01", kategorie: "Endingen 2026", beschreibung: "Grundsteuer", betrag: 3000, bezahlt: 3000, quelle: "excel" }),
      C.neueKosten({ id: "xl-K-002", nr: "K-002", datum: "2026-04-01", kategorie: "Endingen 2026", betrag: 4050, bezahlt: 4050, quelle: "excel" }),
      C.neueKosten({ id: "xl-K-003", nr: "K-003", datum: "2026-04-01", kategorie: "Endingen 2026", betrag: 680, bezahlt: 680, quelle: "excel" })],
    arbeitszeit: [{ id: "xl-K-311", datum: "2026-10-30", mitarbeiter: "Max ", stunden: 10, betrag: 0, quelle: "excel", geloescht: false },
      { id: "xl-K-312", datum: "2026-10-30", mitarbeiter: "Lea", stunden: 8, betrag: 0, quelle: "excel", geloescht: false }],
  };
  const ohne = C.importZusammenfuehren(bestand, ergebnis, { ueberschreiben: false });
  assert.deepEqual(ohne.kosten.map((k) => k.id), ["xl-K-003"]);
  assert.equal(ohne.geloescht, 1);
  assert.deepEqual(ohne.externerTag.map((a) => a.id), ["xl-K-311"]);
  assert.deepEqual(ohne.arbeitszeit.map((a) => a.id), ["xl-K-312"]);

  const mit = C.importZusammenfuehren(bestand, ergebnis, { ueberschreiben: true });
  const k1 = mit.kosten.find((k) => k.id === "xl-K-001");
  assert.equal(k1.beschreibung, "Grundsteuer");
  assert.equal(k1._sitesVersion, 7, "Server-Version muss erhalten bleiben (sonst 409)");
  assert.deepEqual(k1._excel, { zeile: 2 });
  assert.ok(!mit.kosten.some((k) => k.id === "xl-K-002"), "gelöschter Posten darf nicht zurückkommen");
});

test("Arbeitszeit: Baustunden-Zeile ersetzt Excel-Stunden desselben Tages; Trinkgeld nicht doppelt", () => {
  const liste = [
    { id: "xl-K-311", datum: "2026-10-30", mitarbeiter: "Max ", stunden: 10, betrag: 0, quelle: "excel" },
    { id: "bs-1", datum: "2026-10-30", mitarbeiter: "Max", stunden: 9, betrag: 260, quelle: "baustunden", _baustundenId: "1", _baustundenTip: 20 },
  ];
  assert.deepEqual(C.wirksameArbeitszeit(liste).map((a) => a.id), ["bs-1"]);
  assert.equal(C.arbeitskosten(liste[1], { Max: 25 }), 260);
});

test("Statistik: Hauskauf lässt sich herausrechnen, bleibt aber gespeichert", () => {
  const daten = { kosten: [C.neueKosten({ datum: "2026-06-19", kategorie: "Immobilienkauf", betrag: 410000, bezahlt: 410000 }), C.neueKosten({ datum: "2026-10-01", kategorie: "Renovierungen", gewerk: "Elektrik", betrag: 100, bezahlt: 100 })], arbeitszeit: [], mitarbeiter: [] };
  const s = C.statistik(daten, { ohneHauskauf: true });
  assert.equal(s.gesamt, 100);
  assert.equal(s.hauskauf, 410000);
  assert.equal(s.gesamtInklHauskauf, 410100);
});

test("Nummern laufen über Kosten und Excel-Arbeitszeiten weiter", () => {
  assert.equal(C.naechsteNr([{ nr: "K-295" }, { id: "xl-K-316" }]), "K-317");
});

test("Beleg: Eingaben werden geprüft", () => {
  assert.throws(() => anfragePruefen({}), BelegFehler);
  assert.throws(() => anfragePruefen({ bilder: [{ media_type: "text/html", data: "x" }] }), /JPEG/);
  assert.throws(() => anfragePruefen({ bilder: Array(5).fill({ media_type: "image/jpeg", data: "x" }) }), /Höchstens 4/);
  assert.throws(() => anfragePruefen({ bilder: [{ media_type: "image/jpeg", data: "x" }], pdf: "x" }), /nicht beides/);
  const inhalt = anfragePruefen({ bilder: [{ media_type: "image/jpeg", data: "QUJD" }], kontext: { kategorien: ["Renovierungen"], bekannt: [{ lieferant: "Leroy Merlin", kategorie: "Renovierungen" }] } });
  assert.deepEqual(inhalt.map((c) => c.type), ["image", "text"]);
  assert.match(inhalt[1].text, /Leroy Merlin → Renovierungen/);
});

test("Beleg: Antwort, Ablehnung und fehlender Schlüssel", async () => {
  const body = { bilder: [{ media_type: "image/jpeg", data: "QUJD" }], kontext: {} };
  const daten = { ist_beleg: true, lieferant: "X", datum: "2026-11-03", belegart: "Kassenbon", belegnr: null, waehrung: "EUR", gesamtbetrag: 12.5, bereits_bezahlt: true, positionen: [], kategorie: "Renovierungen", gewerk: null, raum: null, beschreibung: "Test", sicherheit: "hoch", hinweise: [] };
  let anfrage;
  const client = (stop, out) => ({ beta: { messages: { parse: async (p) => { anfrage = p; return { stop_reason: stop, parsed_output: out, model: p.model, usage: { input_tokens: 1, output_tokens: 1 } }; } } } });
  const r = await belegLesen(body, { client: client("end_turn", daten) });
  assert.equal(r.gesamtbetrag, 12.5);
  assert.equal(anfrage.model, "claude-opus-5-5");
  assert.equal(anfrage.fallbacks, "default");
  await assert.rejects(belegLesen(body, { client: client("refusal", null) }), (e) => e instanceof BelegFehler && e.status === 422);
  await assert.rejects(belegLesen(body, {}), (e) => e instanceof BelegFehler && e.status === 503);
});
