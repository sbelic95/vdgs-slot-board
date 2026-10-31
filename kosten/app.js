/* Haus-Kosten – Oberfläche */
(() => {
  "use strict";
  const C = window.Core;
  const store = C.createStore(localStorage);
  const sync = C.createSync(store);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n, d) => C.fmtEUR(n, d);
  const eur0 = (n) => C.fmtEUR(n, Math.abs(n) >= 1000 ? 0 : 2);
  const inhalt = $("#inhalt");
  const dialog = $("#dialog");

  // ---------- Farben (feste Reihenfolge je Hauptkategorie, Farbe folgt der Kategorie, nie dem Rang) ----------
  const FARBEN_HELL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const FARBEN_DUNKEL = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
  const KAT_REIHENFOLGE = ["Renovierungen", "Umzug / Logistik", "Immobilienkauf", "Gebühren / Steuern", "Endingen 2026", "Lebenshaltung", "Sonstiges", C.KAT_MITARBEITER];
  const dunkel = () => document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  function katFarbe(kat, hell) {
    const pal = hell || !dunkel() ? FARBEN_HELL : FARBEN_DUNKEL;
    let i = KAT_REIHENFOLGE.indexOf(kat);
    if (i < 0) i = 6; // weitere eigene Kategorien laufen unter „Sonstiges“-Farbe, damit keine neue Farbe erfunden wird
    return pal[i];
  }

  // ---------- Listen (Standard + eigene + aus den Daten) ----------
  function listen() {
    const d = store.daten();
    const eigene = (typ) => d.listen.filter((l) => l.typ === typ).sort((a, b) => (a.sortierung || 0) - (b.sortierung || 0)).map((l) => l.name);
    const ausDaten = (feld) => {
      const zaehler = new Map();
      for (const k of d.kosten) if (!k.geloescht && k[feld]) zaehler.set(k[feld], (zaehler.get(k[feld]) || 0) + 1);
      return [...zaehler.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    };
    const vereint = (...ls) => [...new Set(ls.flat().filter(Boolean))];
    const ausgeblendet = new Set(d.listen.filter((l) => l.typ === "ausgeblendet").map((l) => l.name));
    const ohneAusgeblendete = (l) => l.filter((x) => !ausgeblendet.has(x));
    return {
      kategorien: ohneAusgeblendete(vereint(C.HAUPTKATEGORIEN, eigene("kategorie"), ausDaten("kategorie"))),
      gewerke: ohneAusgeblendete(vereint(ausDaten("gewerk"), C.GEWERKE, eigene("gewerk"))),
      raeume: ohneAusgeblendete(vereint(ausDaten("raum"), C.RAEUME, eigene("raum"))),
      lieferanten: ausDaten("lieferant"),
      belegarten: C.BELEGARTEN,
      mitarbeiter: vereint(d.mitarbeiter.filter((m) => m.aktiv !== false).map((m) => m.name), [...new Set(d.arbeitszeit.filter((a) => !a.geloescht).map((a) => a.mitarbeiter))]),
    };
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(text, aktion) {
    const t = $("#toast");
    t.innerHTML = "<span>" + esc(text) + "</span>" + (aktion ? '<button type="button">' + esc(aktion.text) + "</button>" : "");
    t.hidden = false;
    if (aktion) t.querySelector("button").onclick = () => { t.hidden = true; aktion.fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), aktion ? 6000 : 3000);
  }

  // ---------- Chips ----------
  const chips = (name, werte, gewaehlt, opts = {}) =>
    '<div class="chips' + (opts.scroll ? " scroll" : "") + '" data-chips="' + name + '" role="group">' +
    (opts.ohne ? '<button type="button" class="chip" data-wert="" aria-pressed="' + (gewaehlt === "" || gewaehlt === undefined) + '">' + esc(opts.ohne) + "</button>" : "") +
    werte.map((w) => '<button type="button" class="chip" data-wert="' + esc(w) + '" aria-pressed="' + (w === gewaehlt) + '">' +
      (opts.farbe ? '<i class="farbe" style="background:' + katFarbe(w) + '"></i>' : "") + esc(w) + "</button>").join("") +
    (opts.neu ? '<button type="button" class="chip neu" data-neu="' + name + '">+ Neu</button>' : "") + "</div>";

  function chipWert(el, name) { const b = el.querySelector('[data-chips="' + name + '"] .chip[aria-pressed="true"]'); return b ? b.dataset.wert : ""; }
  function chipsVerdrahten(el, beiAenderung) {
    el.addEventListener("click", (e) => {
      const neu = e.target.closest("[data-neu]");
      if (neu) {
        const typ = neu.dataset.neu;
        const name = prompt({ kategorie: "Neue Hauptkategorie", gewerk: "Neues Gewerk", raum: "Neuer Raum / Bereich", belegart: "Neue Belegart" }[typ] || "Neu");
        if (!name || !name.trim()) return;
        const w = name.trim();
        store.put("listen", { id: typ + ":" + w, typ, name: w, sortierung: Date.now() / 1000 | 0, geloescht: false });
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip"; b.dataset.wert = w; b.textContent = w;
        neu.before(b);
        waehle(neu.parentElement, b);
        beiAenderung && beiAenderung(typ, w, true);
        return;
      }
      const chip = e.target.closest(".chip[data-wert]");
      if (!chip || !el.contains(chip)) return;
      const gruppe = chip.parentElement;
      const war = chip.getAttribute("aria-pressed") === "true";
      if (war && !gruppe.querySelector('.chip[data-wert=""]') && gruppe.dataset.pflicht !== "1") { chip.setAttribute("aria-pressed", "false"); beiAenderung && beiAenderung(gruppe.dataset.chips, "", true); return; }
      waehle(gruppe, chip);
      beiAenderung && beiAenderung(gruppe.dataset.chips, chip.dataset.wert, true);
    });
  }
  function waehle(gruppe, chip) { gruppe.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip))); }
  function setzeChip(el, name, wert) {
    const g = el.querySelector('[data-chips="' + name + '"]');
    if (!g) return;
    let chip = [...g.querySelectorAll(".chip[data-wert]")].find((c) => c.dataset.wert === (wert || ""));
    if (!chip && wert) {
      chip = document.createElement("button"); chip.type = "button"; chip.className = "chip"; chip.dataset.wert = wert; chip.textContent = wert;
      const neu = g.querySelector("[data-neu]"); neu ? neu.before(chip) : g.appendChild(chip);
    }
    if (chip) waehle(g, chip); else g.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  }

  // ======================================================================
  // Erfassen (Handy: in Sekunden einen Einkauf aufnehmen)
  // ======================================================================
  const letzte = () => store.state.config.letzteAuswahl || { kategorie: "Renovierungen", gewerk: "", raum: "", belegart: "Kassenbon" };

  function renderErfassen() {
    const L = listen();
    const l = letzte();
    inhalt.innerHTML = `
      <form class="erfassen" id="erfassen" autocomplete="off">
        <div class="karte">
          <label class="versteckt" for="betrag">Betrag in Euro</label>
          <div class="betrag-feld"><input id="betrag" name="betrag" inputmode="decimal" placeholder="0,00" enterkeyhint="next" required><span class="eur">€</span></div>
          <div class="reihe klein leise" style="justify-content:center"><input type="date" name="datum" value="${C.heute()}" style="width:auto;min-height:36px;padding:4px 10px"></div>
        </div>
        <div class="karte">
          <h3>Wo gekauft / an wen?</h3>
          <input type="text" name="lieferant" list="lieferanten" placeholder="z. B. Leroy Merlin, Ferreteria …" enterkeyhint="next">
          <datalist id="lieferanten">${L.lieferanten.map((x) => '<option value="' + esc(x) + '">').join("")}</datalist>
          <div class="vorschlag" id="vorschlag"></div>
        </div>
        <div class="karte">
          <h3>Kategorie</h3>
          ${chips("kategorie", L.kategorien, l.kategorie, { farbe: true, neu: true })}
        </div>
        <div class="karte" id="gewerkKarte">
          <h3>Gewerk</h3>
          ${chips("gewerk", L.gewerke, l.gewerk, { neu: true })}
        </div>
        <div class="karte">
          <h3>Raum / Bereich <span class="leise" style="text-transform:none;letter-spacing:0">(optional)</span></h3>
          ${chips("raum", L.raeume, l.raum, { neu: true })}
        </div>
        <div class="karte">
          <input type="text" name="beschreibung" placeholder="Was? (z. B. Fliesenkleber, Kabel 3×2,5)" enterkeyhint="done">
          <details class="mehr-felder" style="margin-top:12px">
            <summary>Beleg &amp; Zahlung</summary>
            <div class="spalte" style="gap:12px">
              ${chips("belegart", L.belegarten, l.belegart)}
              <input type="text" name="belegnr" placeholder="Belegnummer (optional)">
              <label class="schalter">Schon bezahlt <input type="checkbox" name="bezahlt" checked></label>
              <input type="text" name="anmerkung" placeholder="Anmerkung (optional)">
            </div>
          </details>
        </div>
        <div class="speichern-leiste"><button class="knopf primaer gross" type="submit">Speichern</button></div>
        <div id="heute"></div>
      </form>`;
    const f = $("#erfassen");
    const gewerkSichtbar = () => { $("#gewerkKarte").style.display = chipWert(f, "kategorie") === "Renovierungen" ? "" : "none"; };
    let manuell = false;
    chipsVerdrahten(f, (name) => { if (name === "kategorie") gewerkSichtbar(); manuell = true; });
    gewerkSichtbar();

    const vorschlagAnzeigen = () => {
      const v = C.vorschlagFuer(store.daten().kosten, f.lieferant.value);
      const ziel = $("#vorschlag");
      if (!v) { ziel.textContent = ""; return; }
      const text = [v.kategorie, v.gewerk, v.raum].filter(Boolean).join(" · ");
      if (!manuell) { setzeChip(f, "kategorie", v.kategorie); setzeChip(f, "gewerk", v.gewerk); setzeChip(f, "raum", v.raum); gewerkSichtbar(); ziel.textContent = "✓ Wie letztes Mal: " + text; }
      else ziel.innerHTML = '<button type="button" class="knopf klein">Übernehmen: ' + esc(text) + "</button>";
      const b = ziel.querySelector("button");
      if (b) b.onclick = () => { setzeChip(f, "kategorie", v.kategorie); setzeChip(f, "gewerk", v.gewerk); setzeChip(f, "raum", v.raum); gewerkSichtbar(); ziel.textContent = "✓ " + text; };
    };
    f.lieferant.addEventListener("change", vorschlagAnzeigen);
    f.lieferant.addEventListener("blur", vorschlagAnzeigen);
    f.betrag.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); f.lieferant.focus(); } });
    f.lieferant.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); vorschlagAnzeigen(); f.beschreibung.focus(); } });

    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const betrag = C.parseBetrag(f.betrag.value);
      if (!(betrag > 0)) { f.betrag.focus(); toast("Bitte einen Betrag eingeben"); return; }
      const kategorie = chipWert(f, "kategorie") || "Sonstiges";
      const k = C.neueKosten({
        nr: C.naechsteNr(store.daten().kosten.concat(store.daten().arbeitszeit)), datum: f.datum.value || C.heute(), kategorie,
        gewerk: kategorie === "Renovierungen" ? chipWert(f, "gewerk") : "", raum: chipWert(f, "raum"),
        lieferant: f.lieferant.value.trim(), beschreibung: f.beschreibung.value.trim(), belegart: chipWert(f, "belegart"),
        belegnr: f.belegnr.value.trim(), anmerkung: f.anmerkung.value.trim(), betrag, bezahlt: f.bezahlt.checked ? betrag : 0, quelle: "handy",
      });
      store.put("kosten", k);
      store.setConfig({ letzteAuswahl: { kategorie, gewerk: chipWert(f, "gewerk"), raum: chipWert(f, "raum"), belegart: chipWert(f, "belegart") } });
      toast("Gespeichert: " + eur(betrag) + " · " + [kategorie, k.gewerk].filter(Boolean).join(" · "), { text: "Rückgängig", fn: () => { store.loeschen("kosten", k.id); toast("Entfernt"); } });
      f.betrag.value = ""; f.beschreibung.value = ""; f.belegnr.value = ""; f.anmerkung.value = ""; f.lieferant.value = ""; f.bezahlt.checked = true;
      $("#vorschlag").textContent = ""; manuell = false;
      f.betrag.focus();
      syncBald();
    });
    heuteZeigen();
    if (matchMedia("(pointer: coarse)").matches) setTimeout(() => f.betrag.focus(), 150);
  }

  function heuteZeigen() {
    const ziel = $("#heute");
    if (!ziel) return;
    const h = C.heute();
    const k = store.daten().kosten.filter((x) => !x.geloescht && x.datum === h).sort((a, b) => (b.nr || "").localeCompare(a.nr || ""));
    if (!k.length) { ziel.innerHTML = ""; return; }
    ziel.innerHTML = '<div class="tag-gruppe"><div class="tag-kopf"><span>Heute erfasst</span><span class="zahl">' + eur(k.reduce((s, x) => s + x.betrag, 0)) + "</span></div>" + k.map(postenZeile).join("") + "</div>";
  }

  function postenZeile(k, auswahl) {
    const o = C.offen(k);
    const unter = [k.kategorie, k.gewerk, k.raum].filter(Boolean).join(" · ");
    return '<div class="posten' + (auswahl && auswahl.has(k.id) ? " gewaehlt" : "") + '" data-id="' + esc(k.id) + '" role="button" tabindex="0">' +
      (auswahl ? '<input type="checkbox" tabindex="-1" ' + (auswahl.has(k.id) ? "checked" : "") + ' aria-label="Auswählen">' : "") +
      '<span class="balken" style="background:' + katFarbe(k.kategorie) + '"></span>' +
      '<span class="mitte"><span class="titel">' + esc(k.beschreibung || k.lieferant || "(ohne Beschreibung)") + (k.kategorie === "Renovierungen" && !k.gewerk ? '<span class="marke-klein warn">ohne Gewerk</span>' : "") + "</span>" +
      '<span class="unter">' + esc([k.lieferant && k.beschreibung ? k.lieferant : "", unter].filter(Boolean).join(" — ")) + "</span></span>" +
      '<span class="preis zahl">' + eur(k.betrag) + (o > 0 ? "<small>offen " + eur(o) + "</small>" : "") + "</span></div>";
  }

  // ======================================================================
  // Bearbeiten-Blatt
  // ======================================================================
  function oeffneKosten(k) {
    const L = listen();
    const istNeu = !k;
    k = k || C.neueKosten({ nr: C.naechsteNr(store.daten().kosten.concat(store.daten().arbeitszeit)) });
    dialog.innerHTML = `
      <form method="dialog" id="bearbeiten" autocomplete="off">
        <div class="blatt-kopf"><h2>${istNeu ? "Neuer Posten" : esc(k.nr || "Posten")}</h2><button type="button" class="knopf klein" data-schliessen>Schließen</button></div>
        <div class="blatt-inhalt">
          <div class="felder">
            <label class="feld">Betrag €<input name="betrag" inputmode="decimal" value="${k.betrag ? String(k.betrag).replace(".", ",") : ""}" required></label>
            <label class="feld">Davon bezahlt €<input name="bezahlt" inputmode="decimal" value="${String(k.bezahlt || 0).replace(".", ",")}"></label>
            <label class="feld">Datum<input type="date" name="datum" value="${esc(k.datum)}" required></label>
            <label class="feld">Lieferant / Empfänger<input name="lieferant" list="lieferantenB" value="${esc(k.lieferant)}"></label>
            <label class="feld voll">Beschreibung<input name="beschreibung" value="${esc(k.beschreibung)}"></label>
          </div>
          <datalist id="lieferantenB">${L.lieferanten.map((x) => '<option value="' + esc(x) + '">').join("")}</datalist>
          <div class="spalte"><span class="klein leise">Kategorie</span>${chips("kategorie", L.kategorien, k.kategorie, { farbe: true, neu: true })}</div>
          <div class="spalte"><span class="klein leise">Gewerk</span>${chips("gewerk", L.gewerke, k.gewerk || "", { ohne: "keins", neu: true })}</div>
          <div class="spalte"><span class="klein leise">Raum / Bereich</span>${chips("raum", L.raeume, k.raum || "", { ohne: "keiner", neu: true })}</div>
          <div class="spalte"><span class="klein leise">Belegart</span>${chips("belegart", L.belegarten, k.belegart || "", { ohne: "–" })}</div>
          <div class="felder">
            <label class="feld">Belegnummer<input name="belegnr" value="${esc(k.belegnr)}"></label>
            <label class="feld">Nr.<input name="nr" value="${esc(k.nr)}"></label>
            <label class="feld voll">Anmerkung<textarea name="anmerkung">${esc(k.anmerkung)}</textarea></label>
          </div>
          ${k.quelle ? '<p class="klein leise" style="margin:0">Quelle: ' + esc({ excel: "Excel-Import", handy: "Handy", app: "App", chatgpt: "ChatGPT" }[k.quelle] || k.quelle) + "</p>" : ""}
        </div>
        <div class="blatt-fuss">
          ${istNeu ? "" : '<button type="button" class="knopf gefahr" data-loeschen>Löschen</button>'}
          <button type="submit" class="knopf primaer">Speichern</button>
        </div>
      </form>`;
    const f = $("#bearbeiten");
    chipsVerdrahten(f);
    f.querySelector("[data-schliessen]").onclick = () => dialog.close();
    const lb = f.querySelector("[data-loeschen]");
    if (lb) lb.onclick = () => {
      dialog.close();
      store.loeschen("kosten", k.id);
      toast("Gelöscht: " + (k.beschreibung || k.lieferant || k.nr), { text: "Rückgängig", fn: () => store.put("kosten", Object.assign({}, k, { geloescht: false })) });
      syncBald();
    };
    const altBetrag = k.betrag;
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const betrag = C.parseBetrag(f.betrag.value);
      let bezahlt = C.parseBetrag(f.bezahlt.value);
      if (bezahlt === altBetrag && betrag !== altBetrag && altBetrag > 0) bezahlt = betrag; // war voll bezahlt -> bleibt voll bezahlt
      const neu = Object.assign({}, k, {
        betrag, bezahlt, datum: f.datum.value, lieferant: f.lieferant.value.trim(), beschreibung: f.beschreibung.value.trim(),
        kategorie: chipWert(f, "kategorie") || k.kategorie, gewerk: chipWert(f, "gewerk"), raum: chipWert(f, "raum"), belegart: chipWert(f, "belegart"),
        belegnr: f.belegnr.value.trim(), nr: f.nr.value.trim(), anmerkung: f.anmerkung.value.trim(), geloescht: false,
      });
      store.put("kosten", neu);
      dialog.close();
      toast("Gespeichert");
      syncBald();
    });
    dialog.showModal();
  }

  // Auswahl-Blatt: mehrere Posten auf einmal verschieben
  function verschiebenBlatt(ids, feld) {
    const L = listen();
    const titel = { kategorie: "Kategorie", gewerk: "Gewerk", raum: "Raum / Bereich" }[feld];
    const werte = { kategorie: L.kategorien, gewerk: L.gewerke, raum: L.raeume }[feld];
    dialog.innerHTML = `<div class="blatt-kopf"><h2>${ids.length} Posten → ${titel}</h2><button type="button" class="knopf klein" data-schliessen>Abbrechen</button></div>
      <div class="blatt-inhalt" id="verschieben">${chips(feld, werte, null, { farbe: feld === "kategorie", ohne: feld === "kategorie" ? "" : "entfernen", neu: true })}</div>`;
    dialog.querySelector("[data-schliessen]").onclick = () => dialog.close();
    const el = $("#verschieben");
    chipsVerdrahten(el, (name, wert) => {
      const vorher = ids.map((id) => Object.assign({}, store.state.kosten[id]));
      for (const id of ids) { const k = store.state.kosten[id]; if (k) store.put("kosten", Object.assign({}, k, { [feld]: wert })); }
      dialog.close();
      ui.liste.auswahl.clear(); ui.liste.auswahlModus = false;
      toast(ids.length + " Posten → " + (wert || "ohne " + titel), { text: "Rückgängig", fn: () => store.putViele("kosten", vorher) });
      syncBald();
    });
    dialog.showModal();
  }

  // ======================================================================
  // Liste
  // ======================================================================
  const ui = {
    liste: { suche: "", kategorie: "", gewerk: "", raum: "", nurOffen: false, nurOhneGewerk: false, auswahl: new Set(), auswahlModus: false, limit: 150 },
    filter: Object.assign({ zeitraum: "alles", von: "", bis: "", mitHauskauf: false, mitMitarbeiter: true }, store.state.config.filter || {}),
  };

  function gefilterteKosten() {
    const u = ui.liste;
    const q = u.suche.toLowerCase().trim();
    return store.daten().kosten.filter((k) => {
      if (k.geloescht) return false;
      if (u.kategorie && k.kategorie !== u.kategorie) return false;
      if (u.gewerk && (k.gewerk || C.OHNE) !== u.gewerk) return false;
      if (u.raum && (k.raum || C.OHNE) !== u.raum) return false;
      if (u.nurOffen && !(C.offen(k) > 0)) return false;
      if (u.nurOhneGewerk && !(k.kategorie === "Renovierungen" && !k.gewerk)) return false;
      if (q && ![k.nr, k.lieferant, k.beschreibung, k.kategorie, k.gewerk, k.raum, k.anmerkung, k.belegnr, String(k.betrag).replace(".", ",")].join(" ").toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (b.datum + (b.nr || "")).localeCompare(a.datum + (a.nr || "")));
  }

  function renderListe() {
    const L = listen();
    const u = ui.liste;
    const opt = (werte, w, alle) => '<option value="">' + alle + "</option>" + werte.map((x) => '<option ' + (x === w ? "selected" : "") + ">" + esc(x) + "</option>").join("");
    inhalt.innerHTML = `
      <div class="abschnitt"><h1>Alle Kosten</h1>
        <button class="knopf klein" id="auswahlKnopf">${u.auswahlModus ? "Fertig" : "Auswählen"}</button>
        <button class="knopf klein primaer" id="neuKnopf">+ Posten</button></div>
      <div class="werkzeug">
        <input type="search" id="suche" placeholder="Suchen: Händler, Artikel, Betrag …" value="${esc(u.suche)}">
        <select id="fKat" style="width:auto">${opt(L.kategorien, u.kategorie, "Alle Kategorien")}</select>
        <select id="fGew" style="width:auto">${opt([C.OHNE].concat(L.gewerke), u.gewerk, "Alle Gewerke")}</select>
        <select id="fRaum" style="width:auto">${opt([C.OHNE].concat(L.raeume), u.raum, "Alle Räume")}</select>
        <button class="chip" id="fOffen" aria-pressed="${u.nurOffen}">Nur offen</button>
        <button class="chip" id="fOhne" aria-pressed="${u.nurOhneGewerk}">Ohne Gewerk</button>
      </div>
      <div id="listeSumme" class="klein leise"></div>
      <div id="listeInhalt"></div>
      <div id="aktionen"></div>`;
    $("#suche").addEventListener("input", (e) => { u.suche = e.target.value; u.limit = 150; listeZeichnen(); });
    $("#fKat").onchange = (e) => { u.kategorie = e.target.value; listeZeichnen(); };
    $("#fGew").onchange = (e) => { u.gewerk = e.target.value; listeZeichnen(); };
    $("#fRaum").onchange = (e) => { u.raum = e.target.value; listeZeichnen(); };
    $("#fOffen").onclick = (e) => { u.nurOffen = !u.nurOffen; e.currentTarget.setAttribute("aria-pressed", u.nurOffen); listeZeichnen(); };
    $("#fOhne").onclick = (e) => { u.nurOhneGewerk = !u.nurOhneGewerk; e.currentTarget.setAttribute("aria-pressed", u.nurOhneGewerk); listeZeichnen(); };
    $("#auswahlKnopf").onclick = () => { u.auswahlModus = !u.auswahlModus; u.auswahl.clear(); renderListe(); };
    $("#neuKnopf").onclick = () => oeffneKosten(null);
    $("#listeInhalt").addEventListener("click", (e) => {
      const z = e.target.closest(".posten");
      if (z) postenGeklickt(z.dataset.id);
      if (e.target.id === "mehrLaden") { u.limit += 300; listeZeichnen(); }
    });
    $("#listeInhalt").addEventListener("keydown", (e) => { const z = e.target.closest(".posten"); if (z && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); postenGeklickt(z.dataset.id); } });
    listeZeichnen();
  }

  function postenGeklickt(id) {
    const u = ui.liste;
    if (u.auswahlModus) { u.auswahl.has(id) ? u.auswahl.delete(id) : u.auswahl.add(id); listeZeichnen(); return; }
    oeffneKosten(store.state.kosten[id]);
  }

  function listeZeichnen() {
    const ziel = $("#listeInhalt");
    if (!ziel) return;
    const u = ui.liste;
    const l = gefilterteKosten();
    const summe = l.reduce((s, k) => s + k.betrag, 0), off = l.reduce((s, k) => s + C.offen(k), 0);
    $("#listeSumme").innerHTML = l.length + " Posten · <b class='zahl'>" + eur(summe) + "</b>" + (off > 0 ? " · offen <span class='zahl'>" + eur(off) + "</span>" : "");
    if (!l.length) { ziel.innerHTML = '<div class="leer">' + (store.daten().kosten.length ? "Nichts gefunden." : 'Noch keine Kosten. <a href="#einstellungen">Excel importieren</a> oder <a href="#neu">ersten Posten erfassen</a>.') + "</div>"; $("#aktionen").innerHTML = ""; return; }
    const tage = new Map();
    for (const k of l.slice(0, u.limit)) { if (!tage.has(k.datum)) tage.set(k.datum, []); tage.get(k.datum).push(k); }
    ziel.innerHTML = [...tage.entries()].map(([d, ks]) => '<div class="tag-gruppe"><div class="tag-kopf"><span>' + wochentag(d) + ", " + C.fmtDatum(d) + '</span><span class="zahl">' + eur(ks.reduce((s, k) => s + k.betrag, 0)) + "</span></div>" +
      ks.map((k) => postenZeile(k, u.auswahlModus ? u.auswahl : null)).join("") + "</div>").join("") +
      (l.length > u.limit ? '<div class="leer"><button class="knopf" id="mehrLaden">Weitere ' + (l.length - u.limit) + " anzeigen</button></div>" : "");
    const a = $("#aktionen");
    if (u.auswahlModus) {
      a.innerHTML = '<div class="aktionsleiste"><b>' + u.auswahl.size + ' gewählt</b><button class="knopf klein" data-alle>Alle</button><span style="flex:1"></span>' +
        '<button class="knopf klein" data-feld="kategorie">Kategorie</button><button class="knopf klein" data-feld="gewerk">Gewerk</button><button class="knopf klein" data-feld="raum">Raum</button><button class="knopf klein gefahr" data-weg>Löschen</button></div>';
      a.querySelector("[data-alle]").onclick = () => { if (u.auswahl.size === l.length) u.auswahl.clear(); else l.forEach((k) => u.auswahl.add(k.id)); listeZeichnen(); };
      a.querySelectorAll("[data-feld]").forEach((b) => (b.onclick = () => { if (!u.auswahl.size) return toast("Erst Posten antippen"); verschiebenBlatt([...u.auswahl], b.dataset.feld); }));
      a.querySelector("[data-weg]").onclick = () => {
        if (!u.auswahl.size) return;
        if (!confirm(u.auswahl.size + " Posten löschen?")) return;
        const ids = [...u.auswahl];
        ids.forEach((id) => store.loeschen("kosten", id));
        u.auswahl.clear();
        toast(ids.length + " gelöscht", { text: "Rückgängig", fn: () => ids.forEach((id) => store.put("kosten", Object.assign({}, store.state.kosten[id], { geloescht: false }))) });
        syncBald();
      };
    } else a.innerHTML = "";
  }
  const wochentag = (d) => ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(d + "T12:00:00").getDay()];

  // ======================================================================
  // Zuordnen: Posten ohne Gewerk nacheinander antippen
  // ======================================================================
  function renderZuordnen() {
    const offenL = store.daten().kosten.filter((k) => !k.geloescht && k.kategorie === "Renovierungen" && !k.gewerk && !(ui.zuordnenUebersprungen || new Set()).has(k.id)).sort((a, b) => b.betrag - a.betrag);
    const gesamt = store.daten().kosten.filter((k) => !k.geloescht && k.kategorie === "Renovierungen").length;
    if (!offenL.length) {
      inhalt.innerHTML = '<div class="zuordnen"><div class="karte leer"><h2>Alles zugeordnet 🎉</h2><p>Jeder Renovierungsposten hat ein Gewerk.</p><a class="knopf primaer" href="#statistik">Zur Statistik</a></div></div>';
      ui.zuordnenUebersprungen = new Set();
      return;
    }
    const k = offenL[0];
    const L = listen();
    const v = C.vorschlagFuer(store.daten().kosten.filter((x) => x.gewerk), k.lieferant);
    inhalt.innerHTML = `<div class="zuordnen" id="zuordnen">
      <div class="abschnitt"><h1>Zuordnen</h1><span class="leise klein">noch ${offenL.length} ohne Gewerk</span></div>
      <div class="fortschritt"><i style="width:${Math.round(100 * (1 - offenL.length / Math.max(1, gesamt)))}%"></i></div>
      <div class="karte">
        <div class="gross-betrag">${eur(k.betrag)}</div>
        <div style="font-weight:650;margin-top:4px">${esc(k.beschreibung || "(ohne Beschreibung)")}</div>
        <div class="leise klein">${esc([k.lieferant, C.fmtDatum(k.datum), k.nr].filter(Boolean).join(" · "))}</div>
        ${v && v.gewerk ? '<p class="vorschlag">Vorschlag (gleicher Händler): <b>' + esc(v.gewerk) + "</b></p>" : ""}
      </div>
      <div class="karte"><h3 style="margin-bottom:10px">Gewerk</h3>${chips("gewerk", L.gewerke, "", { neu: true })}</div>
      <div class="karte"><h3 style="margin-bottom:10px">Raum (optional, vorher wählen)</h3>${chips("raum", L.raeume, k.raum, { neu: true })}</div>
      <div class="karte"><h3 style="margin-bottom:10px">Oder gehört nicht zur Renovierung:</h3>${chips("kategorie", L.kategorien.filter((x) => x !== "Renovierungen"), "", { farbe: true })}</div>
      <div class="reihe" style="margin-top:12px"><button class="knopf" id="ueberspringen">Überspringen</button><button class="knopf" id="bearbeitenK">Ganz bearbeiten</button></div>
    </div>`;
    const el = $("#zuordnen");
    chipsVerdrahten(el, (name, wert) => {
      if (name === "raum") return;
      const raum = chipWert(el, "raum");
      const neu = Object.assign({}, k, name === "gewerk" ? { gewerk: wert, raum } : { kategorie: wert, raum });
      if (name === "gewerk" && !wert) return;
      store.put("kosten", neu);
      toast(eur(k.betrag) + " → " + (neu.gewerk || neu.kategorie), { text: "Rückgängig", fn: () => store.put("kosten", k) });
      syncBald();
      renderZuordnen();
    });
    $("#ueberspringen").onclick = () => { (ui.zuordnenUebersprungen = ui.zuordnenUebersprungen || new Set()).add(k.id); renderZuordnen(); };
    $("#bearbeitenK").onclick = () => oeffneKosten(k);
  }

  // ======================================================================
  // Statistik
  // ======================================================================
  let diagramme = [];
  function zeitraum(f) {
    const h = new Date();
    const iso = C.isoDatum;
    switch (f.zeitraum) {
      case "monat": return { von: iso(new Date(h.getFullYear(), h.getMonth(), 1)), bis: "" };
      case "vormonat": return { von: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), bis: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
      case "30": return { von: iso(new Date(Date.now() - 29 * 864e5)), bis: "" };
      case "jahr": return { von: h.getFullYear() + "-01-01", bis: "" };
      case "eigen": return { von: f.von, bis: f.bis };
      default: return { von: "", bis: "" };
    }
  }
  const filterFuerStatistik = () => Object.assign(zeitraum(ui.filter), { ohneHauskauf: !ui.filter.mitHauskauf, mitMitarbeiter: ui.filter.mitMitarbeiter });
  const zeitraumText = () => {
    const z = zeitraum(ui.filter);
    if (!z.von && !z.bis) return "Gesamter Zeitraum";
    return (z.von ? C.fmtDatum(z.von) : "Beginn") + " – " + (z.bis ? C.fmtDatum(z.bis) : "heute");
  };

  function renderStatistik() {
    const daten = store.daten();
    if (!daten.kosten.length && !daten.arbeitszeit.length) {
      inhalt.innerHTML = '<div class="karte leer" style="max-width:560px;margin:24px auto"><h2>Willkommen</h2><p>Lade deine bestehende Excel-Liste, um loszulegen. Danach kannst du neue Einkäufe am Handy erfassen.</p>' +
        '<div class="reihe" style="justify-content:center"><label class="knopf primaer">Excel-Datei laden<input type="file" accept=".xlsx,.xls,.csv" id="ersterImport" hidden></label><a class="knopf" href="#neu">Ersten Posten erfassen</a></div></div>';
      $("#ersterImport").onchange = (e) => e.target.files[0] && excelImport(e.target.files[0]);
      return;
    }
    const f = ui.filter;
    const s = C.statistik(daten, filterFuerStatistik());
    const zr = [["alles", "Gesamt"], ["jahr", "Dieses Jahr"], ["monat", "Dieser Monat"], ["vormonat", "Letzter Monat"], ["30", "30 Tage"], ["eigen", "Zeitraum…"]];
    inhalt.innerHTML = `
      <div class="abschnitt"><h1>Übersicht</h1>
        <button class="knopf klein" id="exExcel">Excel</button><button class="knopf klein" id="exPdf">PDF</button></div>
      <div class="filterzeile">
        <div class="chips" id="zeitraum">${zr.map(([k, t]) => '<button class="chip" data-z="' + k + '" aria-pressed="' + (f.zeitraum === k) + '">' + t + "</button>").join("")}</div>
        ${f.zeitraum === "eigen" ? '<div class="reihe"><input type="date" id="von" value="' + esc(f.von) + '" style="width:auto;min-height:34px;padding:4px 8px"> – <input type="date" id="bis" value="' + esc(f.bis) + '" style="width:auto;min-height:34px;padding:4px 8px"></div>' : ""}
        <label class="schalter">Hauskauf einrechnen <input type="checkbox" id="mitHauskauf" ${f.mitHauskauf ? "checked" : ""}></label>
        <label class="schalter">Mitarbeiter einrechnen <input type="checkbox" id="mitMa" ${f.mitMitarbeiter ? "checked" : ""}></label>
      </div>
      <div class="kacheln">
        <div class="kachel haupt"><div class="name">${f.mitHauskauf ? "Gesamtkosten" : "Kosten ohne Hauskauf"}</div><div class="wert">${eur0(s.gesamt)}</div><div class="zusatz">${esc(zeitraumText())} · ${s.anzahl} Posten</div></div>
        <div class="kachel"><div class="name">Renovierung (Material &amp; Firmen)</div><div class="wert">${eur0(s.renovierung)}</div><div class="zusatz">${s.gesamt ? Math.round((100 * s.renovierung) / s.gesamt) : 0} % der Kosten</div></div>
        <div class="kachel"><div class="name">Mitarbeiter</div><div class="wert">${eur0(s.mitarbeiter)}</div><div class="zusatz">${s.stunden.toLocaleString("de-DE")} Std.${s.mitarbeiter === 0 && s.stunden > 0 ? ' · <a href="#team">Stundensatz eintragen</a>' : ""}</div></div>
        <div class="kachel offen"><div class="name">Noch offen</div><div class="wert">${eur0(s.offen)}</div><div class="zusatz">${s.offenePosten.length} Posten</div></div>
        <div class="kachel"><div class="name">Hauskauf inkl. Nebenkosten</div><div class="wert">${eur0(s.hauskauf)}</div><div class="zusatz">Alles zusammen: ${eur0(s.gesamtInklHauskauf)}</div></div>
      </div>
      ${s.ohneGewerk.length ? `<div class="karte aufruf" style="margin-bottom:12px"><div class="text"><b>${s.ohneGewerk.length} Renovierungsposten ohne Gewerk</b> (${eur(s.ohneGewerk.reduce((a, p) => a + p.betrag, 0))}). Zuordnen macht die Statistik genauer.</div><a class="knopf primaer klein" href="#zuordnen">Zuordnen</a></div>` : ""}
      <div class="raster zwei">
        <div class="karte"><h2>Wohin geht das Geld?<span class="rechts leise">nach Kategorie</span></h2><div class="diagramm" id="dKat"></div>${tabelle(s.nachKategorie, "Kategorie")}</div>
        <div class="karte"><h2>Verlauf pro Monat</h2><div class="legende" id="lMon"></div><div class="diagramm h-mittel"><canvas id="cMon"></canvas></div>${monatsTabelle(s)}</div>
        <div class="karte"><h2>Renovierung nach Gewerk</h2><div class="diagramm" id="dGew"></div>${tabelle(s.nachGewerk, "Gewerk")}</div>
        <div class="karte"><h2>Nach Raum / Bereich</h2>${s.nachRaum.length ? '<div class="diagramm" id="dRaum"></div>' + tabelle(s.nachRaum, "Raum") : '<p class="leise">Noch keine Räume zugeordnet.</p>'}</div>
        <div class="karte"><h2>Kosten aufsummiert</h2><div class="diagramm h-niedrig"><canvas id="cKum"></canvas></div></div>
        <div class="karte"><h2>Top-Lieferanten</h2><div class="diagramm" id="dLief"></div>${tabelle(s.nachLieferant.slice(0, 15), "Lieferant")}</div>
      </div>
      <div class="raster zwei" style="margin-top:12px">
        <div class="karte"><h2>Die teuersten Posten</h2><div class="tabellen-rahmen">${postenTabelle(s.teuerste)}</div></div>
        <div class="karte"><h2>Offene Posten<span class="rechts zahl">${eur(s.offen)}</span></h2>${s.offenePosten.length ? '<div class="tabellen-rahmen">' + postenTabelle(s.offenePosten, true) + "</div>" : '<p class="leise">Alles bezahlt.</p>'}</div>
      </div>
      ${s.proMitarbeiter.length ? `<div class="karte" style="margin-top:12px"><h2>Mitarbeiter<span class="rechts"><a href="#team">Details</a></span></h2><div class="tabellen-rahmen"><table class="daten"><thead><tr><th>Name</th><th class="betrag">Tage</th><th class="betrag">Stunden</th><th class="betrag">Kosten</th></tr></thead><tbody>${s.proMitarbeiter.map((m) => `<tr><td>${esc(m.name)}</td><td class="betrag">${m.tage}</td><td class="betrag">${m.stunden.toLocaleString("de-DE")}</td><td class="betrag">${eur(m.kosten)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;

    $("#zeitraum").onclick = (e) => { const b = e.target.closest("[data-z]"); if (!b) return; f.zeitraum = b.dataset.z; filterMerken(); renderStatistik(); };
    if ($("#von")) { $("#von").onchange = (e) => { f.von = e.target.value; filterMerken(); renderStatistik(); }; $("#bis").onchange = (e) => { f.bis = e.target.value; filterMerken(); renderStatistik(); }; }
    $("#mitHauskauf").onchange = (e) => { f.mitHauskauf = e.target.checked; filterMerken(); renderStatistik(); };
    $("#mitMa").onchange = (e) => { f.mitMitarbeiter = e.target.checked; filterMerken(); renderStatistik(); };
    $("#exExcel").onclick = () => exportExcel();
    $("#exPdf").onclick = () => exportPdf();
    inhalt.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => oeffneKosten(store.state.kosten[tr.dataset.id])));

    // Balken als HTML: scharf, gut lesbar am Handy, Werte direkt beschriftet
    balken($("#dKat"), s.nachKategorie, (n) => katFarbe(n), "kategorie");
    balken($("#dGew"), s.nachGewerk, () => katFarbe("Renovierungen"), "gewerk");
    if ($("#dRaum")) balken($("#dRaum"), s.nachRaum, () => katFarbe("Renovierungen"), "raum");
    balken($("#dLief"), s.nachLieferant.filter((x) => x.name !== C.OHNE).slice(0, 10), () => katFarbe("Renovierungen"));
    diagrammeZeichnen(s);
  }
  function filterMerken() { store.setConfig({ filter: ui.filter }); }

  function balken(el, werte, farbe, filterFeld) {
    if (!el) return;
    werte = werte.filter((w) => w.summe > 0);
    const max = Math.max(1, ...werte.map((w) => w.summe));
    const gesamt = werte.reduce((a, w) => a + w.summe, 0) || 1;
    el.innerHTML = '<div class="hbalken">' + werte.map((w) =>
      '<button type="button" class="hb-zeile"' + (filterFeld ? ' data-feld="' + filterFeld + '" data-wert="' + esc(w.name) + '"' : "") + ' title="' + esc(w.name) + ": " + eur(w.summe) + " · " + w.anzahl + ' Posten">' +
      '<span class="hb-name">' + esc(w.name) + '</span><span class="hb-wert zahl">' + eur0(w.summe) + ' <small>' + Math.round((100 * w.summe) / gesamt) + ' %</small></span>' +
      '<span class="hb-spur"><i style="width:' + Math.max(0.5, (100 * w.summe) / max) + "%;background:" + farbe(w.name) + '"></i></span></button>').join("") + "</div>";
    if (filterFeld) el.onclick = (e) => {
      const z = e.target.closest(".hb-zeile"); if (!z) return;
      const u = ui.liste;
      Object.assign(u, { kategorie: "", gewerk: "", raum: "", suche: "", nurOffen: false, nurOhneGewerk: false });
      if (z.dataset.wert === C.KAT_MITARBEITER || z.dataset.wert === "Arbeitsleistung") { location.hash = "#team"; return; }
      u[z.dataset.feld] = z.dataset.wert;
      if (z.dataset.feld === "gewerk" && z.dataset.wert === C.OHNE) { u.gewerk = ""; u.nurOhneGewerk = true; }
      location.hash = "#liste";
    };
  }

  function tabelle(werte, kopf) {
    return '<details class="tabelle"><summary>Als Tabelle</summary><table class="daten"><thead><tr><th>' + kopf + '</th><th class="betrag">Posten</th><th class="betrag">Summe</th></tr></thead><tbody>' +
      werte.map((w) => "<tr><td>" + esc(w.name) + '</td><td class="betrag">' + w.anzahl + '</td><td class="betrag">' + eur(w.summe) + "</td></tr>").join("") + "</tbody></table></details>";
  }
  function monatsTabelle(s) {
    return '<details class="tabelle"><summary>Als Tabelle</summary><table class="daten"><thead><tr><th>Monat</th><th class="betrag">Summe</th></tr></thead><tbody>' +
      s.monate.map((m) => "<tr><td>" + C.fmtMonat(m.monat) + '</td><td class="betrag">' + eur(m.summe) + "</td></tr>").join("") + "</tbody></table></details>";
  }
  function postenTabelle(liste, offenSpalte) {
    return '<table class="daten"><thead><tr><th>Datum</th><th>Was</th><th class="betrag">' + (offenSpalte ? "Offen" : "Betrag") + "</th></tr></thead><tbody>" +
      liste.map((p) => '<tr class="klickbar" data-id="' + esc(p.ref.id) + '"><td class="zahl">' + C.fmtDatum(p.datum) + "</td><td>" + esc(p.beschreibung || p.lieferant) + '<div class="klein leise">' + esc([p.lieferant, p.kategorie, p.gewerk].filter(Boolean).join(" · ")) + '</div></td><td class="betrag">' + eur(offenSpalte ? p.offen : p.betrag) + "</td></tr>").join("") + "</tbody></table>";
  }

  // Chart.js für Zeitverläufe
  function chartTheme(hell) {
    const cs = getComputedStyle(document.documentElement);
    return hell ? { text: "#52514e", grid: "#e8e6e0", flaeche: "#ffffff" } : { text: cs.getPropertyValue("--text-2").trim(), grid: cs.getPropertyValue("--linie").trim(), flaeche: cs.getPropertyValue("--flaeche").trim() };
  }
  function monatsChart(canvas, s, hell, statisch) {
    const th = chartTheme(hell);
    const kats = KAT_REIHENFOLGE.concat(s.nachKategorie.map((k) => k.name).filter((n) => !KAT_REIHENFOLGE.includes(n))).filter((k) => s.monate.some((m) => m.werte[k]));
    return new Chart(canvas, {
      type: "bar",
      data: {
        labels: s.monate.map((m) => C.fmtMonat(m.monat)),
        datasets: kats.map((k) => ({ label: k, data: s.monate.map((m) => m.werte[k] || 0), backgroundColor: katFarbe(k, hell), borderColor: th.flaeche, borderWidth: { top: 2 }, borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 44 })),
      },
      options: {
        responsive: !statisch, maintainAspectRatio: false, animation: statisch ? false : { duration: 300 }, devicePixelRatio: statisch ? 2 : undefined,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: !!statisch, position: "top", labels: { color: th.text, boxWidth: 10, boxHeight: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => c.raw ? " " + c.dataset.label + ": " + eur(c.raw) : null, footer: (items) => "Summe: " + eur(items.reduce((a, i) => a + i.raw, 0)) } } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { color: th.text } }, y: { stacked: true, grid: { color: th.grid }, border: { display: false }, ticks: { color: th.text, callback: (v) => kurzEUR(v) } } },
      },
    });
  }
  function kumChart(canvas, s, hell, statisch) {
    const th = chartTheme(hell);
    const farbe = katFarbe("Renovierungen", hell);
    return new Chart(canvas, {
      type: "line",
      data: { labels: s.kumuliert.map((p) => C.fmtDatum(p.datum).slice(0, 6)), datasets: [{ label: "Summe", data: s.kumuliert.map((p) => p.summe), borderColor: farbe, backgroundColor: farbe + "22", fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.15 }] },
      options: {
        responsive: !statisch, maintainAspectRatio: false, animation: statisch ? false : { duration: 300 }, devicePixelRatio: statisch ? 2 : undefined,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => C.fmtDatum(s.kumuliert[i[0].dataIndex].datum), label: (c) => " bis dahin: " + eur(c.raw) } } },
        scales: { x: { grid: { display: false }, ticks: { color: th.text, maxTicksLimit: statisch ? 10 : innerWidth < 600 ? 4 : 8, maxRotation: 0 } }, y: { grid: { color: th.grid }, border: { display: false }, ticks: { color: th.text, callback: (v) => kurzEUR(v) } } },
      },
    });
  }
  function balkenChart(canvas, werte, farbe, hell) { // nur für PDF
    const th = chartTheme(hell);
    werte = werte.filter((w) => w.summe > 0);
    return new Chart(canvas, {
      type: "bar",
      data: { labels: werte.map((w) => w.name), datasets: [{ data: werte.map((w) => w.summe), backgroundColor: werte.map((w) => farbe(w.name)), borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 }] },
      options: {
        indexAxis: "y", responsive: false, animation: false, devicePixelRatio: 2,
        layout: { padding: { right: 80 } },
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: th.grid }, border: { display: false }, ticks: { color: th.text, callback: (v) => kurzEUR(v) } }, y: { grid: { display: false }, ticks: { color: "#0b0b0b", font: { size: 12 } } } },
      },
      plugins: [{ id: "werte", afterDatasetsDraw(ch) { const ctx = ch.ctx; ctx.save(); ctx.fillStyle = "#0b0b0b"; ctx.font = "600 11px sans-serif"; ctx.textBaseline = "middle"; ch.getDatasetMeta(0).data.forEach((b, i) => ctx.fillText(eur0(werte[i].summe), b.x + 6, b.y)); ctx.restore(); } }],
    });
  }
  const kurzEUR = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Tsd." : v.toLocaleString("de-DE")) + " €";

  function diagrammeZeichnen(s) {
    diagramme.forEach((d) => d.destroy());
    diagramme = [];
    if (typeof Chart === "undefined") return;
    const kats = KAT_REIHENFOLGE.filter((k) => s.monate.some((m) => m.werte[k]));
    const lg = $("#lMon");
    if (lg) lg.innerHTML = kats.map((k) => '<span><i style="background:' + katFarbe(k) + '"></i>' + esc(k) + "</span>").join("");
    if ($("#cMon")) diagramme.push(monatsChart($("#cMon"), s));
    if ($("#cKum")) diagramme.push(kumChart($("#cKum"), s));
  }

  // ======================================================================
  // Mitarbeiter
  // ======================================================================
  function renderTeam() {
    const daten = store.daten();
    const s = C.statistik(daten, { mitMitarbeiter: true });
    const namen = listen().mitarbeiter;
    const saetze = Object.fromEntries(daten.mitarbeiter.map((m) => [m.name, m]));
    const az = C.wirksameArbeitszeit(daten.arbeitszeit.filter((a) => !a.geloescht)).sort((a, b) => (b.datum + b.mitarbeiter).localeCompare(a.datum + a.mitarbeiter));
    const cfg = store.state.config;
    const sMap = Object.fromEntries(s.proMitarbeiter.map((m) => [m.name, m]));
    inhalt.innerHTML = `
      <div class="abschnitt"><h1>Mitarbeiter</h1><button class="knopf klein primaer" id="neueZeit">+ Arbeitszeit</button></div>
      <div class="raster zwei">
        <div class="karte"><h2>Stundensätze &amp; Summen</h2>
          ${namen.length ? namen.map((n) => { const m = sMap[n] || { stunden: 0, kosten: 0, tage: 0 }; return `<div class="person"><div><div class="name">${esc(n)}</div><div class="klein leise">${m.tage} Tage · ${m.stunden.toLocaleString("de-DE")} Std. · <b class="zahl">${eur(m.kosten)}</b></div></div>
            <label class="satz klein leise"><input type="text" inputmode="decimal" data-satz="${esc(n)}" value="${saetze[n] && saetze[n].stundensatz ? String(saetze[n].stundensatz).replace(".", ",") : ""}" placeholder="0,00"> €/Std.</label></div>`; }).join("") : '<p class="leise">Noch keine Mitarbeiter.</p>'}
          <p class="klein leise" style="margin-bottom:0">Der Stundensatz gilt für Stunden ohne festen Betrag (z. B. aus der Excel-Liste). Beträge aus dem Mitarbeiter-Projekt werden direkt übernommen.</p>
        </div>
        <div class="karte"><h2>Verbindung zum Mitarbeiter-Projekt</h2>
          <p class="klein" style="margin-top:0">${cfg.mitarbeiterUrl ? "Quelle: <code>" + esc(cfg.mitarbeiterUrl) + "</code>" : "Noch keine Quelle eingetragen."} ${cfg.letzterSync ? "<br>Letzter Abgleich: " + new Date(cfg.letzterSync).toLocaleString("de-DE") : ""}</p>
          <p class="klein leise">Das andere Projekt kann Arbeitszeiten entweder direkt in die Datenbank schreiben (Schnittstelle <code>/arbeitszeit</code>) oder eine JSON-Liste bereitstellen, die diese App abholt. Einträge aus dem Projekt ersetzen die Excel-Stunden desselben Tages, damit nichts doppelt zählt.</p>
          <a class="knopf klein" href="#einstellungen">Einrichten</a>
        </div>
      </div>
      <div class="karte" style="margin-top:12px"><h2>Arbeitszeiten<span class="rechts leise">${az.length} Einträge</span></h2>
        <div class="tabellen-rahmen"><table class="daten"><thead><tr><th>Datum</th><th>Name</th><th>Zeit</th><th class="betrag">Std.</th><th class="betrag">Kosten</th></tr></thead><tbody>
        ${az.slice(0, ui.teamLimit || 120).map((a) => `<tr class="klickbar" data-az="${esc(a.id)}"><td class="zahl">${wochentag(a.datum)} ${C.fmtDatum(a.datum)}</td><td>${esc(a.mitarbeiter)}${a.quelle === "extern" ? '<span class="marke-klein">Projekt</span>' : ""}</td><td class="zahl klein">${esc(a.beginn && a.ende ? a.beginn + "–" + a.ende : "")}</td><td class="betrag">${(Number(a.stunden) || 0).toLocaleString("de-DE")}</td><td class="betrag">${eur(C.arbeitskosten(a, Object.fromEntries(daten.mitarbeiter.map((m) => [m.name, m.stundensatz]))))}</td></tr>`).join("")}
        </tbody></table></div>
        ${az.length > (ui.teamLimit || 120) ? '<div class="leer"><button class="knopf" id="mehrZeit">Alle anzeigen</button></div>' : ""}
      </div>`;
    inhalt.querySelectorAll("[data-satz]").forEach((inp) => (inp.onchange = () => {
      const name = inp.dataset.satz;
      store.put("mitarbeiter", Object.assign({ name, rolle: "", aktiv: true, geloescht: false }, saetze[name] || {}, { stundensatz: C.parseBetrag(inp.value) }));
      toast("Stundensatz " + name + ": " + eur(C.parseBetrag(inp.value)));
      syncBald(); renderTeam();
    }));
    inhalt.querySelectorAll("[data-az]").forEach((tr) => (tr.onclick = () => oeffneArbeitszeit(store.state.arbeitszeit[tr.dataset.az])));
    $("#neueZeit").onclick = () => oeffneArbeitszeit(null);
    const mz = $("#mehrZeit"); if (mz) mz.onclick = () => { ui.teamLimit = 100000; renderTeam(); };
  }

  function oeffneArbeitszeit(a) {
    const istNeu = !a;
    const L = listen();
    a = a || { id: C.uuid(), datum: C.heute(), mitarbeiter: L.mitarbeiter[0] || "", beginn: "08:00", ende: "16:00", stunden: 8, betrag: null, beschreibung: "Arbeitsleistung", kategorie: C.KAT_MITARBEITER, gewerk: "", raum: "", quelle: "app", extern_id: null, geloescht: false };
    dialog.innerHTML = `<form id="azForm" autocomplete="off">
      <div class="blatt-kopf"><h2>${istNeu ? "Arbeitszeit erfassen" : "Arbeitszeit"}</h2><button type="button" class="knopf klein" data-schliessen>Schließen</button></div>
      <div class="blatt-inhalt">
        <div class="spalte"><span class="klein leise">Mitarbeiter</span>${chips("mitarbeiter", L.mitarbeiter, a.mitarbeiter)}<input name="neuName" placeholder="oder neuer Name"></div>
        <div class="felder">
          <label class="feld">Datum<input type="date" name="datum" value="${esc(a.datum)}"></label>
          <label class="feld">Stunden<input name="stunden" inputmode="decimal" value="${String(a.stunden || "").replace(".", ",")}"></label>
          <label class="feld">Beginn<input type="time" name="beginn" value="${esc(a.beginn)}"></label>
          <label class="feld">Ende<input type="time" name="ende" value="${esc(a.ende)}"></label>
          <label class="feld voll">Fester Betrag € (leer = Stundensatz)<input name="betrag" inputmode="decimal" value="${a.betrag != null ? String(a.betrag).replace(".", ",") : ""}"></label>
          <label class="feld voll">Tätigkeit<input name="beschreibung" value="${esc(a.beschreibung)}"></label>
        </div>
        <div class="spalte"><span class="klein leise">Gewerk (optional)</span>${chips("gewerk", L.gewerke, a.gewerk || "", { ohne: "keins" })}</div>
        ${a.quelle === "extern" ? '<p class="hinweis klein">Kommt aus dem Mitarbeiter-Projekt. Änderungen hier werden beim nächsten Abgleich ggf. überschrieben.</p>' : ""}
      </div>
      <div class="blatt-fuss">${istNeu ? "" : '<button type="button" class="knopf gefahr" data-loeschen>Löschen</button>'}<button type="submit" class="knopf primaer">Speichern</button></div></form>`;
    const f = $("#azForm");
    chipsVerdrahten(f);
    const neuRechnen = () => { const b = C.excelStunden(f.beginn.value), e = C.excelStunden(f.ende.value); if (b && e > b) f.stunden.value = String(Math.round((e - b) * 100) / 100).replace(".", ","); };
    f.beginn.onchange = neuRechnen; f.ende.onchange = neuRechnen;
    f.querySelector("[data-schliessen]").onclick = () => dialog.close();
    const lb = f.querySelector("[data-loeschen]");
    if (lb) lb.onclick = () => { store.loeschen("arbeitszeit", a.id); dialog.close(); toast("Gelöscht"); syncBald(); renderTeam(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      const name = f.neuName.value.trim() || chipWert(f, "mitarbeiter");
      if (!name) return toast("Bitte Mitarbeiter wählen");
      if (!store.state.mitarbeiter[name]) store.put("mitarbeiter", { name, stundensatz: 0, rolle: "", aktiv: true, geloescht: false });
      store.put("arbeitszeit", Object.assign({}, a, {
        mitarbeiter: name, datum: f.datum.value, beginn: f.beginn.value, ende: f.ende.value, stunden: C.parseBetrag(f.stunden.value),
        betrag: f.betrag.value.trim() ? C.parseBetrag(f.betrag.value) : null, beschreibung: f.beschreibung.value.trim(), gewerk: chipWert(f, "gewerk"),
      }));
      dialog.close(); toast("Gespeichert"); syncBald(); renderTeam();
    };
    dialog.showModal();
  }

  // ======================================================================
  // Einstellungen: Datenbank, Import, Mitarbeiter-Quelle, Listen
  // ======================================================================
  function renderEinstellungen() {
    const cfg = store.state.config;
    const auth = store.state.auth;
    const d = store.daten();
    const eigene = d.listen.filter((l) => ["kategorie", "gewerk", "raum"].includes(l.typ));
    inhalt.innerHTML = `
      <div class="abschnitt"><h1>Einstellungen</h1></div>
      <div class="raster zwei">
        <div class="karte"><h2>Datenbank (Supabase)</h2>
          <p class="klein leise" style="margin-top:0">Damit Handy, Computer und ChatGPT dieselben Daten sehen. Ohne Datenbank bleibt alles nur auf diesem Gerät.</p>
          <form id="dbForm" class="spalte" style="gap:10px">
            <label class="feld">Projekt-URL<input type="url" name="url" placeholder="https://xxxx.supabase.co" value="${esc(cfg.supabaseUrl || "")}"></label>
            <label class="feld">Öffentlicher Schlüssel (anon / publishable)<input type="text" name="key" placeholder="sb_publishable_… oder eyJ…" value="${esc(cfg.supabaseKey || "")}"></label>
            ${auth ? `<p class="hinweis klein">Angemeldet als <b>${esc(auth.email || "?")}</b></p>` : `
            <label class="feld">E-Mail<input type="email" name="email" autocomplete="username" value="${esc(cfg.email || "")}"></label>
            <label class="feld">Passwort<input type="password" name="passwort" autocomplete="current-password"></label>`}
            <div class="reihe">
              ${auth ? '<button type="button" class="knopf" id="abmelden">Abmelden</button><button type="button" class="knopf primaer" id="jetztSync">Jetzt abgleichen</button>' : '<button class="knopf primaer" type="submit">Verbinden &amp; anmelden</button>'}
            </div>
            <p class="klein leise" style="margin:0">${cfg.letzterSync ? "Letzter Abgleich: " + new Date(cfg.letzterSync).toLocaleString("de-DE") : ""} ${store.anzahlPending() ? "· " + store.anzahlPending() + " Änderungen warten" : ""}</p>
            ${cfg.letzterFehler ? '<p class="hinweis fehler klein">' + esc(cfg.letzterFehler) + "</p>" : ""}
          </form>
        </div>
        <div class="karte"><h2>Excel importieren</h2>
          <p class="klein leise" style="margin-top:0">Liest deine Aufstellung (Spalten wie „Datum“, „Hauptkategorie“, „Gewerk“, „Gesamtkosten €“ …). Zeilen mit Stunden und 0 € werden als Mitarbeiter-Arbeitszeit übernommen.</p>
          <label class="knopf primaer">Excel-Datei wählen<input type="file" accept=".xlsx,.xls,.csv" id="importDatei" hidden></label>
          <div id="importErgebnis"></div>
        </div>
        <div class="karte"><h2>Mitarbeiter-Projekt</h2>
          <p class="klein leise" style="margin-top:0">Optional: Adresse, unter der das andere Projekt die Arbeitszeiten als JSON liefert. Die App holt sie bei jedem Abgleich.</p>
          <form id="maForm" class="spalte" style="gap:10px">
            <label class="feld">JSON-Adresse<input type="url" name="url" placeholder="https://…/arbeitszeiten.json" value="${esc(cfg.mitarbeiterUrl || "")}"></label>
            <label class="feld">Token (optional)<input type="password" name="token" value="${esc(cfg.mitarbeiterToken || "")}"></label>
            <div class="reihe"><button class="knopf" type="submit">Speichern &amp; abholen</button></div>
            <p class="klein leise" style="margin:0">Format: <code>[{"id":"…","datum":"2026-10-31","mitarbeiter":"Martin","stunden":10,"betrag":250}]</code> – „betrag“ ist optional.</p>
          </form>
        </div>
        <div class="karte"><h2>Eigene Kategorien</h2>
          ${eigene.length ? '<div class="chips">' + eigene.map((l) => '<button class="chip" data-listeweg="' + esc(l.id) + '" title="Entfernen">' + esc(l.name) + ' <span class="leise">(' + { kategorie: "Kategorie", gewerk: "Gewerk", raum: "Raum" }[l.typ] + ") ✕</span></button>").join("") + "</div>" : '<p class="leise klein" style="margin-top:0">Neue Kategorien, Gewerke und Räume legst du beim Erfassen mit „+ Neu“ an.</p>'}
        </div>
        <div class="karte"><h2>Sicherung</h2>
          <div class="reihe"><button class="knopf" id="exExcel2">Excel exportieren</button><button class="knopf" id="exPdf2">PDF-Bericht</button><button class="knopf" id="jsonSich">Sicherung (JSON)</button>
          <label class="knopf">Sicherung laden<input type="file" accept=".json" id="jsonLaden" hidden></label></div>
          <p class="klein leise">${d.kosten.filter((k) => !k.geloescht).length} Kostenposten · ${d.arbeitszeit.filter((a) => !a.geloescht).length} Arbeitszeiten auf diesem Gerät</p>
          <button class="knopf gefahr klein" id="allesWeg">Daten auf diesem Gerät löschen</button>
        </div>
        <div class="karte"><h2>Darstellung</h2>
          <div class="chips" id="thema">${[["", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]].map(([k, t]) => '<button class="chip" data-thema="' + k + '" aria-pressed="' + ((cfg.thema || "") === k) + '">' + t + "</button>").join("")}</div>
        </div>
      </div>`;

    $("#dbForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      store.setConfig({ supabaseUrl: f.url.value.trim(), supabaseKey: f.key.value.trim(), email: f.email ? f.email.value.trim() : cfg.email });
      if (!f.email) return;
      try {
        await sync.anmelden(f.email.value.trim(), f.passwort.value);
        toast("Angemeldet – gleiche ab …");
        await syncJetzt();
      } catch (err) { store.setConfig({ letzterFehler: err.message }); }
      renderEinstellungen();
    };
    const ab = $("#abmelden"); if (ab) ab.onclick = () => { sync.abmelden(); renderEinstellungen(); syncAnzeige(); };
    const js = $("#jetztSync"); if (js) js.onclick = async () => { await syncJetzt(); renderEinstellungen(); };
    $("#maForm").onsubmit = async (e) => {
      e.preventDefault();
      store.setConfig({ mitarbeiterUrl: e.target.url.value.trim(), mitarbeiterToken: e.target.token.value.trim() });
      await syncJetzt(); renderEinstellungen();
    };
    $("#importDatei").onchange = (e) => e.target.files[0] && excelImport(e.target.files[0]);
    $("#exExcel2").onclick = () => exportExcel();
    $("#exPdf2").onclick = () => exportPdf();
    $("#jsonSich").onclick = () => {
      const d2 = store.daten();
      herunterladen(new Blob([JSON.stringify({ version: 1, erstellt: new Date().toISOString(), kosten: d2.kosten, arbeitszeit: d2.arbeitszeit, mitarbeiter: d2.mitarbeiter, listen: d2.listen }, null, 1)], { type: "application/json" }), "Haus-Kosten-Sicherung_" + C.heute() + ".json");
    };
    $("#jsonLaden").onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const j = JSON.parse(await file.text());
        if (!confirm("Sicherung mit " + (j.kosten || []).length + " Posten laden? Gleiche Einträge werden überschrieben.")) return;
        for (const t of ["kosten", "arbeitszeit", "mitarbeiter", "listen"]) if (Array.isArray(j[t])) store.putViele(t, j[t]);
        toast("Sicherung geladen"); syncBald(); renderEinstellungen();
      } catch (err) { alert("Datei nicht lesbar: " + err.message); }
    };
    $("#allesWeg").onclick = () => {
      if (!confirm("Alle Daten auf diesem Gerät löschen? (Die Datenbank bleibt unverändert.)")) return;
      store.zuruecksetzen(); toast("Gerät geleert"); renderEinstellungen();
    };
    inhalt.querySelectorAll("[data-listeweg]").forEach((b) => (b.onclick = () => { store.loeschen("listen", b.dataset.listeweg); syncBald(); renderEinstellungen(); }));
    $("#thema").onclick = (e) => { const b = e.target.closest("[data-thema]"); if (!b) return; store.setConfig({ thema: b.dataset.thema }); themaSetzen(); renderEinstellungen(); };
  }

  // ======================================================================
  // Excel-Import
  // ======================================================================
  let xlsxLaden;
  const ladeSkript = (src) => new Promise((ok, fehl) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => fehl(new Error("Konnte " + src + " nicht laden")); document.head.appendChild(s); });
  const ladeXLSX = () => (xlsxLaden = xlsxLaden || ladeSkript("vendor/xlsx.mini.min.js"));
  let pdfLaden;
  const ladePDF = () => (pdfLaden = pdfLaden || ladeSkript("vendor/jspdf.umd.min.js").then(() => ladeSkript("vendor/jspdf.plugin.autotable.min.js")));

  async function excelImport(file) {
    try {
      await ladeXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames.find((n) => /kosten|tabelle1/i.test(n)) || wb.SheetNames[0]];
      const zeilen = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      const r = C.importiereZeilen(zeilen, listen().mitarbeiter);
      const vorhanden = r.kosten.filter((k) => store.state.kosten[k.id]).length + r.arbeitszeit.filter((a) => store.state.arbeitszeit[a.id]).length;
      const neu = r.kosten.length + r.arbeitszeit.length - vorhanden;
      dialog.innerHTML = `<div class="blatt-kopf"><h2>Excel-Import</h2><button type="button" class="knopf klein" data-schliessen>Abbrechen</button></div>
        <div class="blatt-inhalt">
          <p style="margin:0"><b>${r.kosten.length}</b> Kostenposten (${eur(r.kosten.reduce((s, k) => s + k.betrag, 0))}) und <b>${r.arbeitszeit.length}</b> Arbeitszeiten (${r.arbeitszeit.reduce((s, a) => s + a.stunden, 0).toLocaleString("de-DE")} Std.) gefunden.</p>
          <p class="leise" style="margin:0">${neu} neu${vorhanden ? ", " + vorhanden + " schon vorhanden" : ""}.</p>
          ${vorhanden ? '<label class="schalter">Vorhandene mit Excel-Stand überschreiben <input type="checkbox" id="ueberschreiben"></label>' : ""}
          ${r.hinweise.length ? '<div class="hinweis warn klein"><b>Bitte prüfen:</b><ul style="margin:6px 0 0;padding-left:18px">' + r.hinweise.map((h) => "<li>" + esc(h) + "</li>").join("") + "</ul></div>" : ""}
        </div>
        <div class="blatt-fuss"><button class="knopf primaer" id="importLos">Übernehmen</button></div>`;
      dialog.querySelector("[data-schliessen]").onclick = () => dialog.close();
      $("#importLos").onclick = () => {
        const ueber = $("#ueberschreiben") && $("#ueberschreiben").checked;
        const k = r.kosten.filter((x) => ueber || !store.state.kosten[x.id]);
        const a = r.arbeitszeit.filter((x) => ueber || !store.state.arbeitszeit[x.id]);
        store.putViele("kosten", k);
        store.putViele("arbeitszeit", a);
        for (const name of new Set(a.map((x) => x.mitarbeiter))) if (!store.state.mitarbeiter[name]) store.put("mitarbeiter", { name, stundensatz: 0, rolle: "", aktiv: true, geloescht: false });
        dialog.close();
        toast(k.length + " Posten und " + a.length + " Arbeitszeiten übernommen");
        syncBald();
        location.hash = "#statistik"; route();
      };
      dialog.showModal();
    } catch (err) { console.error(err); alert("Import fehlgeschlagen: " + err.message); }
  }

  // ======================================================================
  // Export Excel
  // ======================================================================
  function herunterladen(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function exportExcel() {
    try {
      await ladeXLSX();
      const daten = store.daten();
      const f = filterFuerStatistik();
      const s = C.statistik(daten, f);
      const saetze = Object.fromEntries(daten.mitarbeiter.map((m) => [m.name, m.stundensatz]));
      const imZ = (d) => (!f.von || d >= f.von) && (!f.bis || d <= f.bis);
      const wb = XLSX.utils.book_new();
      const EUR = '#,##0.00 "€"';
      const blatt = (zeilen, breiten, geldSpalten, name) => {
        const ws = XLSX.utils.aoa_to_sheet(zeilen);
        ws["!cols"] = breiten.map((w) => ({ wch: w }));
        const range = XLSX.utils.decode_range(ws["!ref"]);
        for (let r = 1; r <= range.e.r; r++) for (const c of geldSpalten) { const z = ws[XLSX.utils.encode_cell({ r, c })]; if (z && typeof z.v === "number") z.z = EUR; }
        ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: range.e.c } }) };
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      // Blatt 1 im gleichen Aufbau wie die bisherige Aufstellung (lässt sich wieder importieren)
      const kosten = daten.kosten.filter((k) => !k.geloescht && imZ(k.datum)).sort((a, b) => (a.datum + a.nr).localeCompare(b.datum + b.nr));
      const kopf = ["ID", "Datum", "Hauptkategorie", "Gewerk / Unterkategorie", "Raum / Bereich", "Lieferant / Empfänger", "Beschreibung", "Belegart", "Belegnummer", "Gesamtkosten €", "Bezahlt €", "Noch offen €", "Status", "Anmerkung", "Quelle"];
      const datum = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
      blatt([kopf].concat(kosten.map((k) => [k.nr, datum(k.datum), k.kategorie, k.gewerk, k.raum, k.lieferant, k.beschreibung, k.belegart, k.belegnr, k.betrag, k.bezahlt, C.offen(k), C.statusVon(k), k.anmerkung, k.quelle])),
        [8, 11, 18, 18, 15, 24, 34, 12, 14, 14, 12, 12, 9, 30, 8], [9, 10, 11], "Kosten");
      const az = C.wirksameArbeitszeit(daten.arbeitszeit.filter((a) => !a.geloescht && imZ(a.datum))).sort((a, b) => (a.datum + a.mitarbeiter).localeCompare(b.datum + b.mitarbeiter));
      blatt([["Datum", "Mitarbeiter", "Beginn", "Ende", "Stunden", "Stundensatz €", "Kosten €", "Tätigkeit", "Gewerk", "Quelle"]].concat(az.map((a) => [datum(a.datum), a.mitarbeiter, a.beginn, a.ende, Number(a.stunden) || 0, a.betrag != null ? "" : saetze[a.mitarbeiter] || 0, C.arbeitskosten(a, saetze), a.beschreibung, a.gewerk || "", a.quelle === "extern" ? "Mitarbeiter-Projekt" : a.quelle])),
        [11, 14, 8, 8, 9, 13, 12, 24, 14, 18], [5, 6], "Arbeitszeit");
      const sum = (liste, name) => {
        blatt([[name, "Posten", "Summe €", "Anteil"]].concat(liste.map((w) => [w.name, w.anzahl, w.summe, s.gesamt ? w.summe / s.gesamt : 0])), [28, 8, 14, 9], [2], name.slice(0, 31));
        const ws = wb.Sheets[name.slice(0, 31)];
        for (let r = 1; r <= liste.length; r++) { const z = ws[XLSX.utils.encode_cell({ r, c: 3 })]; if (z) z.z = "0.0 %"; }
      };
      sum(s.nachKategorie, "Kategorie"); sum(s.nachGewerk, "Gewerk"); sum(s.nachRaum, "Raum"); sum(s.nachLieferant, "Lieferant");
      const kats = s.nachKategorie.map((k) => k.name);
      blatt([["Monat"].concat(kats, ["Summe"])].concat(s.monate.map((m) => [C.fmtMonat(m.monat)].concat(kats.map((k) => m.werte[k] || 0), [m.summe]))), [10].concat(kats.map(() => 16), [14]), kats.map((_, i) => i + 1).concat([kats.length + 1]), "Monate");
      blatt([["Mitarbeiter", "Tage", "Stunden", "Kosten €"]].concat(s.proMitarbeiter.map((m) => [m.name, m.tage, m.stunden, m.kosten])), [16, 8, 10, 14], [3], "Mitarbeiter");
      blatt([["Kennzahl", "Wert"], ["Zeitraum", zeitraumText()], ["Hauskauf eingerechnet", f.ohneHauskauf ? "nein" : "ja"], ["Kosten im Zeitraum", s.gesamt], ["Renovierung", s.renovierung], ["Mitarbeiter", s.mitarbeiter], ["Stunden", s.stunden], ["Noch offen", s.offen], ["Hauskauf inkl. Nebenkosten", s.hauskauf], ["Alles zusammen", s.gesamtInklHauskauf], ["Stand", new Date().toLocaleString("de-DE")]], [28, 18], [1], "Übersicht");
      wb.SheetNames.unshift(wb.SheetNames.pop()); // Übersicht nach vorn
      XLSX.writeFile(wb, "Haus-Kosten_" + C.heute() + ".xlsx", { compression: true });
      toast("Excel erstellt");
    } catch (err) { console.error(err); alert("Excel-Export fehlgeschlagen: " + err.message); }
  }

  // ======================================================================
  // Export PDF (Bericht mit Diagrammen und Tabellen)
  // ======================================================================
  async function exportPdf() {
    try {
      toast("PDF wird erstellt …");
      await ladePDF();
      const { jsPDF } = window.jspdf;
      const daten = store.daten();
      const f = filterFuerStatistik();
      const s = C.statistik(daten, f);
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const B = 210, R = 14;
      let y = 18;
      const blau = [28, 92, 171];
      doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Haus-Kosten – Bericht", R, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
      y += 7; doc.text(zeitraumText() + (f.ohneHauskauf ? " · ohne Hauskauf" : " · inkl. Hauskauf") + (f.mitMitarbeiter ? "" : " · ohne Mitarbeiter") + " · Stand " + new Date().toLocaleString("de-DE"), R, y);
      doc.setTextColor(0);
      y += 8;
      const kacheln = [[f.ohneHauskauf ? "Kosten ohne Hauskauf" : "Gesamtkosten", eur(s.gesamt)], ["Renovierung", eur(s.renovierung)], ["Mitarbeiter", eur(s.mitarbeiter) + " (" + s.stunden.toLocaleString("de-DE") + " Std.)"], ["Noch offen", eur(s.offen)], ["Hauskauf inkl. Nebenkosten", eur(s.hauskauf)], ["Alles zusammen", eur(s.gesamtInklHauskauf)]];
      const kw = (B - 2 * R - 8) / 3;
      kacheln.forEach(([n, w], i) => {
        const x = R + (i % 3) * (kw + 4), yy = y + Math.floor(i / 3) * 20;
        doc.setDrawColor(226, 224, 218); doc.setFillColor(248, 247, 244); doc.roundedRect(x, yy, kw, 17, 2, 2, "FD");
        doc.setFontSize(8); doc.setTextColor(90); doc.text(n, x + 3, yy + 6);
        doc.setFontSize(12); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text(w, x + 3, yy + 13); doc.setFont("helvetica", "normal");
      });
      y += 44;

      const bild = (erzeugen, breitePx, hoehePx, mmB) => {
        const c = document.createElement("canvas");
        c.width = breitePx; c.height = hoehePx; c.style.width = breitePx + "px"; c.style.height = hoehePx + "px";
        const wrap = document.createElement("div"); wrap.style.cssText = "position:fixed;left:-10000px;top:0;width:" + breitePx + "px;height:" + hoehePx + "px";
        wrap.appendChild(c); document.body.appendChild(wrap);
        const ch = erzeugen(c);
        const url = ch.toBase64Image("image/png", 1);
        ch.destroy(); wrap.remove();
        const mmH = (mmB * hoehePx) / breitePx;
        return { url, mmH };
      };
      const ueberschrift = (t) => { if (y > 270) { doc.addPage(); y = 18; } doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(t, R, y); doc.setFont("helvetica", "normal"); y += 4; };
      const diagramm = (titel, erzeugen, hPx) => {
        const b = bild(erzeugen, 900, hPx, B - 2 * R);
        if (y + b.mmH + 8 > 285) { doc.addPage(); y = 18; }
        ueberschrift(titel);
        doc.addImage(b.url, "PNG", R, y, B - 2 * R, b.mmH); y += b.mmH + 8;
      };
      const hell = true;
      diagramm("Wohin geht das Geld? (nach Kategorie)", (c) => balkenChart(c, s.nachKategorie, (n) => katFarbe(n, hell), hell), Math.max(160, 40 + 34 * s.nachKategorie.length));
      if (s.monate.length) diagramm("Verlauf pro Monat", (c) => monatsChart(c, s, hell, true), 380);
      diagramm("Renovierung nach Gewerk", (c) => balkenChart(c, s.nachGewerk, () => katFarbe("Renovierungen", hell), hell), Math.max(160, 40 + 30 * s.nachGewerk.length));
      if (s.nachRaum.length) diagramm("Nach Raum / Bereich", (c) => balkenChart(c, s.nachRaum, () => katFarbe("Renovierungen", hell), hell), Math.max(140, 40 + 30 * s.nachRaum.length));
      if (s.kumuliert.length > 1) diagramm("Kosten aufsummiert", (c) => kumChart(c, s, hell, true), 300);

      const tab = (titel, head, body, geldSpalten, opts) => {
        if (y > 250) { doc.addPage(); y = 18; }
        ueberschrift(titel);
        doc.autoTable(Object.assign({
          startY: y, head: [head], body, margin: { left: R, right: R }, styles: { fontSize: 8.5, cellPadding: 1.6, overflow: "linebreak" },
          headStyles: { fillColor: blau, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [247, 246, 243] },
          columnStyles: Object.fromEntries(geldSpalten.map((c) => [c, { halign: "right", cellWidth: 26 }])),
        }, opts || {}));
        y = doc.lastAutoTable.finalY + 10;
      };
      const proz = (w) => (s.gesamt ? Math.round((1000 * w) / s.gesamt) / 10 + " %" : "");
      tab("Summen nach Kategorie", ["Kategorie", "Posten", "Anteil", "Summe"], s.nachKategorie.map((w) => [w.name, w.anzahl, proz(w.summe), eur(w.summe)]), [1, 2, 3]);
      tab("Summen nach Gewerk", ["Gewerk", "Posten", "Summe"], s.nachGewerk.map((w) => [w.name, w.anzahl, eur(w.summe)]), [1, 2]);
      tab("Top-Lieferanten", ["Lieferant", "Posten", "Summe"], s.nachLieferant.slice(0, 15).map((w) => [w.name, w.anzahl, eur(w.summe)]), [1, 2]);
      if (s.proMitarbeiter.length) tab("Mitarbeiter", ["Name", "Tage", "Stunden", "Kosten"], s.proMitarbeiter.map((m) => [m.name, m.tage, m.stunden.toLocaleString("de-DE"), eur(m.kosten)]), [1, 2, 3]);
      if (s.offenePosten.length) tab("Offene Posten", ["Datum", "Was", "Kategorie", "Offen"], s.offenePosten.map((p) => [C.fmtDatum(p.datum), [p.beschreibung, p.lieferant].filter(Boolean).join(" – "), p.kategorie, eur(p.offen)]), [3]);
      const alle = C.posten(daten, f).filter((p) => p.art === "kosten").sort((a, b) => (a.datum + (a.ref.nr || "")).localeCompare(b.datum + (b.ref.nr || "")));
      tab("Alle Posten (" + alle.length + ")", ["Datum", "Nr.", "Kategorie / Gewerk", "Lieferant", "Beschreibung", "Betrag"], alle.map((p) => [C.fmtDatum(p.datum), p.ref.nr || "", [p.kategorie, p.gewerk, p.raum].filter(Boolean).join(" · "), p.lieferant, p.beschreibung, eur(p.betrag)]), [5],
        { styles: { fontSize: 7.5, cellPadding: 1.2 }, columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 12 }, 2: { cellWidth: 38 }, 3: { cellWidth: 32 }, 5: { halign: "right", cellWidth: 22 } }, foot: [["", "", "", "", "Summe", eur(alle.reduce((a, p) => a + p.betrag, 0))]], footStyles: { fillColor: [240, 239, 236], textColor: 0, fontStyle: "bold", halign: "right" } });
      const seiten = doc.getNumberOfPages();
      for (let i = 1; i <= seiten; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text("Haus-Kosten · Seite " + i + " von " + seiten, B - R, 291, { align: "right" }); }
      doc.save("Haus-Kosten-Bericht_" + C.heute() + ".pdf");
      toast("PDF erstellt");
    } catch (err) { console.error(err); alert("PDF-Export fehlgeschlagen: " + err.message); }
  }

  // ======================================================================
  // Sync
  // ======================================================================
  let syncTimer;
  function syncBald() { syncAnzeige(); clearTimeout(syncTimer); syncTimer = setTimeout(syncJetzt, 1500); }
  async function syncJetzt() {
    if (!sync.bereit() && !store.state.config.mitarbeiterUrl) { syncAnzeige(); return; }
    if (!navigator.onLine) { syncAnzeige(); return; }
    $("#syncKnopf").className = "sync laeuft"; $("#syncText").textContent = "Abgleich …";
    const r = await sync.sync();
    syncAnzeige();
    if (r.fehler) console.warn("Sync:", r.fehler);
    else if (r.runter || r.mitarbeiter) { if (!["neu"].includes(aktuelleAnsicht())) route(true); else heuteZeigen(); }
    return r;
  }
  function syncAnzeige() {
    const k = $("#syncKnopf"), t = $("#syncText");
    const p = store.anzahlPending();
    const cfg = store.state.config;
    if (!sync.bereit()) { k.className = "sync"; t.textContent = "Nur lokal"; k.title = "Keine Datenbank verbunden – Einstellungen öffnen"; return; }
    if (!navigator.onLine) { k.className = "sync wartet"; t.textContent = "Offline" + (p ? " · " + p : ""); return; }
    if (cfg.letzterFehler) { k.className = "sync fehler"; t.textContent = "Fehler"; k.title = cfg.letzterFehler; return; }
    if (p) { k.className = "sync wartet"; t.textContent = p + " ausstehend"; return; }
    k.className = "sync ok"; t.textContent = "Synchron"; k.title = cfg.letzterSync ? "Letzter Abgleich " + new Date(cfg.letzterSync).toLocaleString("de-DE") : "";
  }
  $("#syncKnopf").onclick = () => { if (!sync.bereit()) location.hash = "#einstellungen"; else syncJetzt(); };
  addEventListener("online", syncJetzt);
  addEventListener("offline", syncAnzeige);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncJetzt(); });
  setInterval(() => { if (document.visibilityState === "visible") syncJetzt(); }, 60000);

  // ======================================================================
  // Navigation
  // ======================================================================
  const ANSICHTEN = { neu: renderErfassen, liste: renderListe, statistik: renderStatistik, team: renderTeam, einstellungen: renderEinstellungen, zuordnen: renderZuordnen };
  const standard = () => (matchMedia("(max-width: 899px)").matches ? "neu" : "statistik");
  const aktuelleAnsicht = () => { const h = location.hash.replace("#", ""); return ANSICHTEN[h] ? h : standard(); };
  function route(still) {
    const a = aktuelleAnsicht();
    $$("[data-tab]").forEach((el) => el.classList.toggle("aktiv", el.dataset.tab === a || (a === "zuordnen" && el.dataset.tab === "liste")));
    if (a !== "statistik") { diagramme.forEach((d) => d.destroy()); diagramme = []; }
    const scroll = scrollY;
    ANSICHTEN[a]();
    if (still) scrollTo(0, scroll); else scrollTo(0, 0);
  }
  addEventListener("hashchange", () => { if (dialog.open) dialog.close(); route(); });

  // Bei Datenänderungen die aktuelle Ansicht auffrischen (außer im Erfassen-Formular, das würde Eingaben löschen)
  let auffrischen;
  store.on(() => {
    syncAnzeige();
    clearTimeout(auffrischen);
    auffrischen = setTimeout(() => {
      if (dialog.open) return;
      const a = aktuelleAnsicht();
      if (a === "neu") heuteZeigen();
      else if (a === "liste") listeZeichnen();
      else if (a === "statistik" || a === "team") route(true);
    }, 120);
  });
  dialog.addEventListener("close", () => { const a = aktuelleAnsicht(); if (a === "liste") listeZeichnen(); else if (a !== "neu" && a !== "einstellungen") route(true); else if (a === "neu") heuteZeigen(); });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  function themaSetzen() {
    const t = store.state.config.thema || "";
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => aktuelleAnsicht() === "statistik" && route(true));

  themaSetzen();
  route();
  syncAnzeige();
  syncJetzt();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.HausKosten = { store, sync, exportExcel, exportPdf, excelImport }; // für Tests / Konsole
})();
