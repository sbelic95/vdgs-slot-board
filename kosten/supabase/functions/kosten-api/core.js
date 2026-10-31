/* Haus-Kosten – Datenmodell, Excel-Import, Statistik und Datenbank-Sync.
   Ohne Oberfläche, damit es im Browser und in Node (Tests) läuft. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- Stammlisten ----------
  const HAUPTKATEGORIEN = ["Renovierungen", "Umzug / Logistik", "Immobilienkauf", "Gebühren / Steuern", "Endingen 2026", "Lebenshaltung", "Sonstiges"];
  const KAT_MITARBEITER = "Mitarbeiter";
  const KAT_HAUSKAUF = "Immobilienkauf";
  const GEWERKE = ["Elektrik", "Sanitär", "Gas", "Fliesen", "Maler", "Maurer", "Rohbau", "Dach", "Baustoffe", "Werkzeug", "Garten", "Mietgeräte", "Spedition", "Transport", "Versicherung", "Haus", "Möbel / Ausstattung"];
  const RAEUME = ["Haus", "Sommerküche", "Außenanlagen", "Dachterrasse", "Kinderzimmer", "Gästezimmer", "Schlafzimmer", "Kellerräume", "Bad", "Küche", "Wohnzimmer"];
  const BELEGARTEN = ["Kassenbon", "Rechnung", "Aufstellung", "Ohne Beleg"];
  const OHNE = "Nicht zugeordnet";

  // Tippfehler aus der Excel-Liste vereinheitlichen
  const KORREKTUR = {
    gewerk: { "eelektrik": "Elektrik", "elektro": "Elektrik" },
    raum: { "dachterasse": "Dachterrasse", "elektrik": "" },
  };

  const TABELLEN = { kosten: "id", arbeitszeit: "id", mitarbeiter: "name", listen: "id" };
  // Spalten, die in die Datenbank gehen (gleich wie supabase/schema.sql)
  const SPALTEN = {
    kosten: ["id", "nr", "datum", "kategorie", "gewerk", "raum", "lieferant", "beschreibung", "belegart", "belegnr", "betrag", "bezahlt", "status", "anmerkung", "quelle", "geloescht"],
    arbeitszeit: ["id", "datum", "mitarbeiter", "beginn", "ende", "stunden", "betrag", "beschreibung", "kategorie", "gewerk", "raum", "quelle", "extern_id", "geloescht"],
    mitarbeiter: ["name", "stundensatz", "rolle", "aktiv", "geloescht"],
    listen: ["id", "typ", "name", "sortierung", "geloescht"],
  };

  // ---------- Hilfen ----------
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const txt = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
  const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
  const heute = () => isoDatum(new Date());
  function isoDatum(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  const fmtEUR = (() => {
    let f = null;
    return (n, dez = 2) => {
      if (!f || f.d !== dez) { f = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: dez, maximumFractionDigits: dez }); f.d = dez; }
      return f.format(Number(n) || 0);
    };
  })();
  const fmtDatum = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "");
  const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const fmtMonat = (ym) => MONATE[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(2, 4);

  function parseBetrag(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return r2(v);
    let s = String(v).replace(/[€\s]/g, "");
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    return r2(parseFloat(s));
  }

  // Excel-Seriennummer oder Text -> "YYYY-MM-DD"
  function excelDatum(v) {
    if (v == null || v === "") return "";
    if (typeof v === "number") {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
      return d.toISOString().slice(0, 10);
    }
    if (v instanceof Date) return isoDatum(v);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return "";
  }
  // Excel-Uhrzeit (Bruchteil eines Tages) oder "8:30" -> Stunden als Zahl
  function excelStunden(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v < 1.0001 ? Math.round(v * 24 * 100) / 100 : v;
    const m = String(v).match(/^(\d{1,2}):(\d{2})/);
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    return parseFloat(String(v).replace(",", ".")) || 0;
  }
  const stundenText = (h) => { const m = Math.round(h * 60); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  const uhrzeit = (v) => (v == null || v === "" ? "" : stundenText(excelStunden(v)));

  function korrigiere(feld, wert) {
    const w = txt(wert);
    const k = KORREKTUR[feld] && KORREKTUR[feld][w.toLowerCase()];
    return k !== undefined ? k : w;
  }

  // ---------- Datensätze ----------
  const offen = (k) => Math.max(0, r2((Number(k.betrag) || 0) - (Number(k.bezahlt) || 0)));
  const statusVon = (k) => (offen(k) > 0.004 ? "Offen" : "Bezahlt");

  function neueKosten(felder) {
    const k = Object.assign({
      id: uuid(), nr: "", datum: heute(), kategorie: "Renovierungen", gewerk: "", raum: "", lieferant: "",
      beschreibung: "", belegart: "", belegnr: "", betrag: 0, bezahlt: 0, anmerkung: "", quelle: "app", geloescht: false,
    }, felder || {});
    k.betrag = r2(k.betrag); k.bezahlt = r2(k.bezahlt); k.status = statusVon(k);
    return k;
  }

  // berücksichtigt auch die Nummern der aus Excel übernommenen Arbeitszeit-Zeilen (id "xl-K-…")
  function naechsteNr(kostenListe) {
    let max = 0;
    for (const k of kostenListe) { const m = /^(?:xl-)?K-(\d+)$/.exec(k.nr || k.id || ""); if (m) max = Math.max(max, Number(m[1])); }
    return "K-" + String(max + 1).padStart(3, "0");
  }

  // ---------- Excel-Import ----------
  // zeilen: Array von Arrays (erste Zeile = Überschriften), Werte roh (Datum als Seriennummer)
  function importiereZeilen(zeilen, bekannteMitarbeiter) {
    const kosten = [], arbeitszeit = [], hinweise = [];
    if (!zeilen || !zeilen.length) return { kosten, arbeitszeit, hinweise: ["Leere Tabelle"] };
    let kopfIndex = zeilen.findIndex((z) => z && z.some((c) => /hauptkategorie|gesamtkosten|betrag/i.test(String(c || ""))));
    if (kopfIndex < 0) kopfIndex = 0;
    const kopf = zeilen[kopfIndex].map((h) => txt(h).toLowerCase());
    const spalte = (...muster) => kopf.findIndex((h) => muster.some((m) => (m instanceof RegExp ? m.test(h) : h === m)));
    const S = {
      nr: spalte("id", "nr", "nr.", /^beleg-?id/), datum: spalte(/^datum/), kategorie: spalte(/hauptkategorie|^kategorie/),
      gewerk: spalte(/gewerk|unterkategorie/), raum: spalte(/raum|bereich/), lieferant: spalte(/lieferant|empfänger|händler/),
      beginn: spalte(/^beginn/), ende: spalte(/^ende/), stunden: spalte(/^std|stunden/), beschreibung: spalte(/beschreibung|artikel/),
      belegart: spalte(/belegart/), belegnr: spalte(/belegnummer|beleg-?nr/), betrag: spalte(/gesamtkosten|^betrag/),
      bezahlt: spalte(/^bezahlt/), offen: spalte(/noch offen|^offen/), status: spalte(/^status/), anmerkung: spalte(/anmerkung|notiz/),
    };
    if (S.betrag < 0 || S.datum < 0) return { kosten, arbeitszeit, hinweise: ["Spalten „Datum“ und „Gesamtkosten €“ nicht gefunden."] };
    const mitarbeiter = new Set((bekannteMitarbeiter || []).map((n) => n.toLowerCase()));
    const get = (z, i) => (i >= 0 ? z[i] : undefined);

    for (let i = kopfIndex + 1; i < zeilen.length; i++) {
      const z = zeilen[i];
      if (!z || !z.some((c) => c != null && c !== "")) continue;
      const datum = excelDatum(get(z, S.datum));
      const betrag = parseBetrag(get(z, S.betrag));
      const stunden = excelStunden(get(z, S.stunden));
      const nr = txt(get(z, S.nr)) || "Z-" + (i + 1);
      const lieferant = txt(get(z, S.lieferant));
      const beschreibung = txt(get(z, S.beschreibung));
      if (!datum) { hinweise.push(nr + ": kein Datum – übersprungen"); continue; }

      const istArbeit = (stunden > 0 && betrag === 0) || (mitarbeiter.has(lieferant.toLowerCase()) && betrag === 0) || (/eigenleistung/i.test(beschreibung) && betrag === 0);
      if (istArbeit) {
        arbeitszeit.push({
          id: "xl-" + nr, datum, mitarbeiter: lieferant || "Unbekannt", beginn: uhrzeit(get(z, S.beginn)), ende: uhrzeit(get(z, S.ende)),
          stunden: Math.round(stunden * 100) / 100, betrag: null, beschreibung: beschreibung || "Arbeitsleistung",
          kategorie: txt(get(z, S.kategorie)) || "Renovierungen", quelle: "excel", extern_id: null, geloescht: false,
        });
        continue;
      }
      let bezahlt = S.bezahlt >= 0 ? parseBetrag(get(z, S.bezahlt)) : betrag;
      const status = txt(get(z, S.status)).toLowerCase();
      // In der Liste steht bei künftigen Posten „Offen“, obwohl „Bezahlt €“ ausgefüllt ist -> als offen übernehmen
      if (status === "offen" && bezahlt >= betrag) { bezahlt = 0; hinweise.push(nr + " „" + beschreibung + "“: Status Offen -> als noch nicht bezahlt übernommen"); }
      const k = neueKosten({
        id: "xl-" + nr, nr, datum, kategorie: txt(get(z, S.kategorie)) || "Sonstiges",
        gewerk: korrigiere("gewerk", get(z, S.gewerk)), raum: korrigiere("raum", get(z, S.raum)), lieferant, beschreibung,
        belegart: txt(get(z, S.belegart)), belegnr: txt(get(z, S.belegnr)).replace(/\.$/, ""), betrag, bezahlt,
        anmerkung: txt(get(z, S.anmerkung)), quelle: "excel",
      });
      if (/nicht bezahlt/i.test(k.anmerkung) && k.status === "Bezahlt") hinweise.push(nr + ": Anmerkung „" + k.anmerkung + "“, aber als bezahlt erfasst – bitte prüfen");
      kosten.push(k);
    }
    return { kosten, arbeitszeit, hinweise };
  }

  // ---------- Statistik ----------
  function arbeitskosten(a, saetze) {
    if (a.betrag != null && a.betrag !== "") return r2(a.betrag);
    return r2((Number(a.stunden) || 0) * (Number(saetze[a.mitarbeiter]) || 0));
  }

  // Doppelte Stunden vermeiden: kommen Einträge aus dem Mitarbeiter-Projekt, ersetzen sie die Excel-Stunden desselben Tages
  function wirksameArbeitszeit(liste) {
    const extern = new Set();
    for (const a of liste) if (a.quelle === "extern") extern.add(a.mitarbeiter.toLowerCase() + "|" + a.datum);
    return liste.filter((a) => a.quelle === "extern" || !extern.has(a.mitarbeiter.toLowerCase() + "|" + a.datum));
  }

  function imZeitraum(datum, f) { return (!f.von || datum >= f.von) && (!f.bis || datum <= f.bis); }

  // Alle Posten (Kosten + Arbeitsleistung) als einheitliche Liste
  function posten(daten, f) {
    f = f || {};
    const saetze = {};
    for (const m of daten.mitarbeiter) saetze[m.name] = m.stundensatz;
    const out = [];
    for (const k of daten.kosten) {
      if (k.geloescht || !imZeitraum(k.datum, f)) continue;
      if (f.ohneHauskauf && k.kategorie === KAT_HAUSKAUF) continue;
      out.push({ art: "kosten", ref: k, datum: k.datum, kategorie: k.kategorie, gewerk: k.gewerk || "", raum: k.raum || "", lieferant: k.lieferant || "", beschreibung: k.beschreibung, betrag: k.betrag, offen: offen(k) });
    }
    if (f.mitMitarbeiter !== false) {
      for (const a of wirksameArbeitszeit(daten.arbeitszeit.filter((a) => !a.geloescht))) {
        if (!imZeitraum(a.datum, f)) continue;
        out.push({ art: "arbeit", ref: a, datum: a.datum, kategorie: KAT_MITARBEITER, gewerk: a.gewerk || "Arbeitsleistung", raum: a.raum || "", lieferant: a.mitarbeiter, beschreibung: a.beschreibung, betrag: arbeitskosten(a, saetze), stunden: Number(a.stunden) || 0, offen: 0 });
      }
    }
    return out;
  }

  function summiereNach(liste, feld) {
    const m = new Map();
    for (const p of liste) {
      const key = p[feld] || OHNE;
      const e = m.get(key) || { name: key, summe: 0, anzahl: 0 };
      e.summe += p.betrag; e.anzahl++;
      m.set(key, e);
    }
    return [...m.values()].map((e) => ((e.summe = r2(e.summe)), e)).sort((a, b) => b.summe - a.summe);
  }

  function statistik(daten, f) {
    f = f || {};
    const alle = posten(daten, Object.assign({}, f, { ohneHauskauf: false }));
    const liste = f.ohneHauskauf ? alle.filter((p) => p.kategorie !== KAT_HAUSKAUF) : alle;
    const sum = (l) => r2(l.reduce((s, p) => s + p.betrag, 0));
    const kosten = liste.filter((p) => p.art === "kosten");
    const arbeit = liste.filter((p) => p.art === "arbeit");

    const monate = new Map();
    for (const p of liste) {
      const ym = p.datum.slice(0, 7);
      const m = monate.get(ym) || {};
      m[p.kategorie] = r2((m[p.kategorie] || 0) + p.betrag);
      monate.set(ym, m);
    }
    const tage = new Map();
    for (const p of liste) tage.set(p.datum, (tage.get(p.datum) || 0) + p.betrag);
    let lauf = 0;
    const kumuliert = [...tage.keys()].sort().map((d) => ({ datum: d, summe: r2((lauf += tage.get(d))) }));

    const proMitarbeiter = new Map();
    for (const p of arbeit) {
      const e = proMitarbeiter.get(p.lieferant) || { name: p.lieferant, stunden: 0, kosten: 0, tage: new Set() };
      e.stunden += p.stunden; e.kosten += p.betrag; e.tage.add(p.datum);
      proMitarbeiter.set(p.lieferant, e);
    }

    const reno = liste.filter((p) => p.kategorie === "Renovierungen");
    return {
      gesamt: sum(liste),
      gesamtInklHauskauf: sum(alle),
      hauskauf: sum(alle.filter((p) => p.kategorie === KAT_HAUSKAUF)),
      renovierung: sum(reno),
      mitarbeiter: sum(arbeit),
      stunden: Math.round(arbeit.reduce((s, p) => s + p.stunden, 0) * 10) / 10,
      offen: r2(kosten.reduce((s, p) => s + p.offen, 0)),
      offenePosten: kosten.filter((p) => p.offen > 0.004).sort((a, b) => b.offen - a.offen),
      anzahl: kosten.length,
      nachKategorie: summiereNach(liste, "kategorie"),
      nachGewerk: summiereNach(reno.concat(arbeit), "gewerk"),
      nachRaum: summiereNach(liste.filter((p) => p.raum), "raum"),
      nachLieferant: summiereNach(kosten, "lieferant"),
      ohneGewerk: kosten.filter((p) => p.kategorie === "Renovierungen" && !p.gewerk),
      monate: [...monate.keys()].sort().map((ym) => ({ monat: ym, werte: monate.get(ym), summe: r2(Object.values(monate.get(ym)).reduce((a, b) => a + b, 0)) })),
      kumuliert,
      teuerste: kosten.slice().sort((a, b) => b.betrag - a.betrag).slice(0, 10),
      proMitarbeiter: [...proMitarbeiter.values()].map((e) => ({ name: e.name, stunden: Math.round(e.stunden * 10) / 10, kosten: r2(e.kosten), tage: e.tage.size })).sort((a, b) => b.stunden - a.stunden),
      letzte30: sum(liste.filter((p) => p.datum >= isoDatum(new Date(Date.now() - 30 * 864e5)))),
    };
  }

  // Vorschläge: welcher Händler gehört meistens zu welcher Kategorie / welchem Gewerk
  function vorschlagFuer(kostenListe, lieferant) {
    const l = txt(lieferant).toLowerCase();
    if (!l) return null;
    const zaehler = new Map();
    for (const k of kostenListe) {
      if (k.geloescht || (k.lieferant || "").toLowerCase() !== l) continue;
      const key = k.kategorie + "|" + (k.gewerk || "") + "|" + (k.raum || "");
      zaehler.set(key, (zaehler.get(key) || 0) + 1);
    }
    let best = null, n = 0;
    for (const [key, c] of zaehler) if (c > n) { n = c; best = key; }
    if (!best) return null;
    const [kategorie, gewerk, raum] = best.split("|");
    return { kategorie, gewerk, raum };
  }

  // ---------- Lokaler Speicher ----------
  function createStore(storage, schluessel) {
    schluessel = schluessel || "hauskosten-v1";
    const leer = () => ({ kosten: {}, arbeitszeit: {}, mitarbeiter: {}, listen: {}, pending: {}, lastPull: {}, config: {}, auth: null });
    let s;
    try { s = Object.assign(leer(), JSON.parse(storage.getItem(schluessel) || "null") || {}); } catch (e) { s = leer(); }
    const hoerer = new Set();
    let timer = null;
    const speichern = () => { clearTimeout(timer); timer = setTimeout(sofort, 50); };
    const sofort = () => { clearTimeout(timer); try { storage.setItem(schluessel, JSON.stringify(s)); } catch (e) { console.error("Speichern fehlgeschlagen", e); } };
    const melden = () => hoerer.forEach((h) => h());

    const api = {
      get state() { return s; },
      daten() {
        return {
          kosten: Object.values(s.kosten), arbeitszeit: Object.values(s.arbeitszeit),
          mitarbeiter: Object.values(s.mitarbeiter).filter((m) => !m.geloescht), listen: Object.values(s.listen).filter((l) => !l.geloescht),
        };
      },
      put(tabelle, zeile, ohnePending) {
        const pk = TABELLEN[tabelle];
        zeile = Object.assign({}, zeile);
        if (tabelle === "kosten") { zeile.betrag = r2(zeile.betrag); zeile.bezahlt = r2(zeile.bezahlt); zeile.status = statusVon(zeile); }
        s[tabelle][zeile[pk]] = zeile;
        if (!ohnePending) s.pending[tabelle + "|" + zeile[pk]] = 1;
        speichern(); melden();
        return zeile;
      },
      putViele(tabelle, zeilen, ohnePending) {
        const pk = TABELLEN[tabelle];
        for (let z of zeilen) {
          z = Object.assign({}, z);
          if (tabelle === "kosten") z.status = statusVon(z);
          s[tabelle][z[pk]] = z;
          if (!ohnePending) s.pending[tabelle + "|" + z[pk]] = 1;
        }
        speichern(); melden();
      },
      loeschen(tabelle, key) {
        const z = s[tabelle][key];
        if (!z) return;
        api.put(tabelle, Object.assign({}, z, { geloescht: true }));
      },
      setConfig(c) { s.config = Object.assign({}, s.config, c); sofort(); melden(); },
      setAuth(a) { s.auth = a; sofort(); },
      on(h) { hoerer.add(h); return () => hoerer.delete(h); },
      melden,
      speichernSofort: sofort,
      zuruecksetzen() { const cfg = s.config, auth = s.auth; s = leer(); s.config = cfg; s.auth = auth; sofort(); melden(); },
      anzahlPending: () => Object.keys(s.pending).length,
    };
    return api;
  }

  // ---------- Supabase-Sync (REST, ohne Bibliothek) ----------
  function createSync(store, fetchFn) {
    fetchFn = fetchFn || ((...a) => fetch(...a));
    let laeuft = null;
    const cfg = () => store.state.config || {};
    const basis = () => (cfg().supabaseUrl || "").replace(/\/+$/, "");
    const bereit = () => !!(basis() && cfg().supabaseKey && store.state.auth && store.state.auth.refresh_token);

    async function anfrage(pfad, opts, nochmal) {
      const auth = store.state.auth;
      const res = await fetchFn(basis() + pfad, Object.assign({}, opts, {
        headers: Object.assign({ apikey: cfg().supabaseKey, Authorization: "Bearer " + (auth && auth.access_token ? auth.access_token : cfg().supabaseKey), "Content-Type": "application/json" }, (opts && opts.headers) || {}),
      }));
      if (res.status === 401 && !nochmal && auth && auth.refresh_token) { await erneuern(); return anfrage(pfad, opts, true); }
      if (!res.ok) { let t = ""; try { t = await res.text(); } catch (e) {} throw new Error("Datenbank " + res.status + ": " + t.slice(0, 200)); }
      return res;
    }

    async function authAnfrage(grant, body) {
      const res = await fetchFn(basis() + "/auth/v1/token?grant_type=" + grant, { method: "POST", headers: { apikey: cfg().supabaseKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error_description || j.msg || j.message || "Anmeldung fehlgeschlagen (" + res.status + ")");
      store.setAuth({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, email: j.user && j.user.email });
      return j;
    }
    const anmelden = (email, passwort) => authAnfrage("password", { email, password: passwort });
    async function erneuern() {
      try { await authAnfrage("refresh_token", { refresh_token: store.state.auth.refresh_token }); }
      catch (e) { store.setAuth(null); throw new Error("Bitte neu anmelden: " + e.message); }
    }
    const abmelden = () => store.setAuth(null);

    function fuerDb(tabelle, z) {
      const o = {};
      const std = { quelle: "app", geloescht: false, kategorie: tabelle === "arbeitszeit" ? KAT_MITARBEITER : "Sonstiges", stunden: 0, bezahlt: 0, stundensatz: 0, aktiv: true, sortierung: 0 };
      if (tabelle === "kosten") std.betrag = 0;
      for (const k of SPALTEN[tabelle]) {
        let v = z[k] === undefined || (z[k] === "" && (k === "betrag" || k === "stunden")) ? null : z[k];
        if (v == null && k in std) v = std[k];
        o[k] = v;
      }
      if (tabelle === "kosten") { o.status = statusVon(z); o.betrag = r2(z.betrag); o.bezahlt = r2(z.bezahlt); }
      if ("geloescht" in o) o.geloescht = !!o.geloescht;
      if (tabelle === "mitarbeiter") { o.stundensatz = Number(z.stundensatz) || 0; o.aktiv = z.aktiv !== false; }
      return o;
    }

    async function hochladen() {
      const pending = Object.keys(store.state.pending);
      const proTabelle = {};
      for (const p of pending) { const [t, key] = p.split(/\|(.*)/s); (proTabelle[t] = proTabelle[t] || []).push(key); }
      let n = 0;
      for (const t of Object.keys(proTabelle)) {
        const keys = proTabelle[t].filter((k) => store.state[t] && store.state[t][k]);
        for (let i = 0; i < keys.length; i += 400) {
          const teil = keys.slice(i, i + 400);
          await anfrage("/rest/v1/" + t + "?on_conflict=" + TABELLEN[t], {
            method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(teil.map((k) => fuerDb(t, store.state[t][k]))),
          });
          for (const k of teil) delete store.state.pending[t + "|" + k];
          n += teil.length;
        }
        for (const k of proTabelle[t]) if (!store.state[t] || !store.state[t][k]) delete store.state.pending[t + "|" + k];
      }
      store.speichernSofort();
      return n;
    }

    async function herunterladen() {
      let n = 0;
      for (const t of Object.keys(TABELLEN)) {
        let seit = store.state.lastPull[t] || "1970-01-01T00:00:00Z";
        // kleine Überlappung, damit gleichzeitig gespeicherte Zeilen nicht verloren gehen
        let abfrage = new Date(new Date(seit).getTime() - 120000).toISOString();
        for (let runde = 0; runde < 50; runde++) {
          const res = await anfrage("/rest/v1/" + t + "?select=*&geaendert_am=gt." + encodeURIComponent(abfrage) + "&order=geaendert_am.asc&limit=1000", { method: "GET" });
          const zeilen = await res.json();
          const pk = TABELLEN[t];
          for (const z of zeilen) {
            if (store.state.pending[t + "|" + z[pk]]) continue; // lokale Änderung noch nicht hochgeladen -> lokal gewinnt
            if (z.betrag != null) z.betrag = Number(z.betrag);
            if (z.bezahlt != null) z.bezahlt = Number(z.bezahlt);
            if (z.stunden != null) z.stunden = Number(z.stunden);
            if (z.stundensatz != null) z.stundensatz = Number(z.stundensatz);
            store.state[t][z[pk]] = z;
            if (z.geaendert_am > seit) seit = z.geaendert_am;
            n++;
          }
          store.state.lastPull[t] = seit;
          if (zeilen.length < 1000) break;
          abfrage = seit;
        }
      }
      store.speichernSofort(); store.melden();
      return n;
    }

    async function mitarbeiterQuelle() {
      const c = cfg();
      if (!c.mitarbeiterUrl) return 0;
      const res = await fetchFn(c.mitarbeiterUrl, { headers: c.mitarbeiterToken ? { Authorization: "Bearer " + c.mitarbeiterToken } : {} });
      if (!res.ok) throw new Error("Mitarbeiter-Quelle " + res.status);
      let j = await res.json();
      if (!Array.isArray(j)) j = j.eintraege || j.arbeitszeiten || j.data || [];
      const zeilen = j.map(externeArbeitszeit).filter(Boolean);
      store.putViele("arbeitszeit", zeilen);
      return zeilen.length;
    }

    async function sync() {
      if (laeuft) return laeuft;
      laeuft = (async () => {
        const ergebnis = { hoch: 0, runter: 0, mitarbeiter: 0, fehler: null };
        try {
          if (cfg().mitarbeiterUrl) { try { ergebnis.mitarbeiter = await mitarbeiterQuelle(); } catch (e) { ergebnis.fehler = e.message; } }
          if (bereit()) {
            const a = store.state.auth;
            if (!a.access_token || (a.expires_at && a.expires_at < Date.now() + 60000)) await erneuern();
            ergebnis.hoch = await hochladen();
            ergebnis.runter = await herunterladen();
          }
          store.setConfig({ letzterSync: new Date().toISOString(), letzterFehler: ergebnis.fehler || "" });
        } catch (e) {
          ergebnis.fehler = e.message;
          store.setConfig({ letzterFehler: e.message });
        } finally { laeuft = null; }
        return ergebnis;
      })();
      return laeuft;
    }

    return { anmelden, abmelden, sync, bereit, hochladen, herunterladen };
  }

  // Ein Eintrag aus dem Mitarbeiter-Projekt -> Arbeitszeit-Zeile
  function externeArbeitszeit(e) {
    if (!e) return null;
    const name = txt(e.mitarbeiter || e.name || e.mitarbeiterName);
    const datum = excelDatum(e.datum || e.date || e.tag);
    if (!name || !datum) return null;
    const ext = txt(e.id || e.extern_id) || name.toLowerCase() + "|" + datum;
    return {
      id: "ext-" + ext.replace(/[^a-z0-9|_-]/gi, "_"), extern_id: ext, datum, mitarbeiter: name,
      beginn: txt(e.beginn || e.start), ende: txt(e.ende || e.end), stunden: Number(e.stunden != null ? e.stunden : e.hours) || 0,
      betrag: e.betrag != null ? r2(e.betrag) : e.kosten != null ? r2(e.kosten) : null,
      beschreibung: txt(e.beschreibung || e.taetigkeit || e.notiz) || "Arbeitsleistung", gewerk: txt(e.gewerk), raum: txt(e.raum),
      kategorie: KAT_MITARBEITER, quelle: "extern", geloescht: false,
    };
  }

  return {
    HAUPTKATEGORIEN, KAT_MITARBEITER, KAT_HAUSKAUF, GEWERKE, RAEUME, BELEGARTEN, OHNE, TABELLEN, SPALTEN,
    r2, txt, uuid, heute, isoDatum, fmtEUR, fmtDatum, fmtMonat, parseBetrag, excelDatum, excelStunden, stundenText,
    offen, statusVon, neueKosten, naechsteNr, importiereZeilen, arbeitskosten, wirksameArbeitszeit, posten, statistik,
    vorschlagFuer, createStore, createSync, externeArbeitszeit,
  };
});
