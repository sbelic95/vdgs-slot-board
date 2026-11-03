// Haus-Kosten – POST /api/beleg (Beleg per KI auslesen)
// Neue Route. Ändert KEINE Daten: Sie liest nur das Foto aus und gibt Vorschläge zurück.
// Gespeichert wird erst nach Bestätigung in der App, ganz normal über /api/sync (mit Audit-Eintrag).
//
// >>> ANPASSEN – genau drei Stellen, alle mit „ANPASSEN“ markiert. Vorbild ist jeweils app/api/sync/route.ts. <<<
import { belegLesen, BelegFehler } from "../../../lib/beleg-ki.mjs";

const MAX_BODY = 14_000_000; // Zeichen; Fotos werden in der App vorher auf max. 2000 px verkleinert

function antwort(daten: unknown, status = 200) {
  return new Response(JSON.stringify(daten), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  // ANPASSEN (1/3): dieselbe Origin-/Cross-Site-Prüfung wie in app/api/sync/route.ts aufrufen.
  //   Statt des Headers X-Haus-Kosten-Sync wird hier X-Haus-Kosten-Beleg: 1 erwartet (sendet die App).
  if (request.headers.get("x-haus-kosten-beleg") !== "1") return antwort({ fehler: "Ungültige Anfrage" }, 400);

  // ANPASSEN (2/3): dieselbe Sitzungsprüfung wie in app/api/sync/route.ts (Cookie __Host-hauskosten_session).
  //   Ohne gültige Sitzung: return antwort({ fehler: "Nicht angemeldet" }, 401);
  const angemeldet = false; // <- durch die vorhandene Sitzungsprüfung ersetzen
  if (!angemeldet) return antwort({ fehler: "Nicht angemeldet" }, 401);

  const text = await request.text();
  if (text.length > MAX_BODY) return antwort({ fehler: "Dateien zu groß" }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return antwort({ fehler: "Ungültige Anfrage" }, 400); }

  // ANPASSEN (3/3): Server-Secrets so lesen, wie es das Projekt schon für HAUS_KOSTEN_SYNC_SECRET macht.
  const apiKey = ""; // <- Secret ANTHROPIC_API_KEY
  const modell = ""; // <- optionales Secret BELEG_MODELL (leer = claude-opus-5-5)

  try {
    return antwort(await belegLesen(body, { apiKey, modell: modell || undefined }));
  } catch (e) {
    if (e instanceof BelegFehler) return antwort({ fehler: e.message }, e.status);
    console.error("beleg", e);
    return antwort({ fehler: "Beleg konnte nicht gelesen werden" }, 500);
  }
}
