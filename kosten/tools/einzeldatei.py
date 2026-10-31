#!/usr/bin/env python3
"""Baut kosten/dist/Haus-Kosten.html: die ganze App in EINER Datei (CSS, JS, Bibliotheken, Symbol).
Für ChatGPT Sites oder jeden anderen Webspace: Datei hochladen, fertig. Funktioniert auch per Doppelklick ohne Server.
Aufruf: python3 kosten/tools/einzeldatei.py"""
import base64, pathlib

ORDNER = pathlib.Path(__file__).resolve().parent.parent
lies = lambda p: (ORDNER / p).read_text(encoding="utf-8")

def skript(code):
    # nichts darf das <script>-Element vorzeitig beenden
    code = code.replace("</script", "<\\/script").replace("<!--", "<\\!--")
    return "<script>\n" + code + "\n</script>"

html = lies("index.html")
svg_uri = "data:image/svg+xml;base64," + base64.b64encode((ORDNER / "icon.svg").read_bytes()).decode()
png_uri = "data:image/png;base64," + base64.b64encode((ORDNER / "icon-180.png").read_bytes()).decode()

html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', "")
html = html.replace('href="icon.svg"', 'href="' + svg_uri + '"').replace('href="icon-180.png"', 'href="' + png_uri + '"')
html = html.replace('src="icon.svg"', 'src="' + svg_uri + '"')
html = html.replace('<link rel="stylesheet" href="app.css">', "<style>\n" + lies("app.css") + "\n</style>")
bibliotheken = "\n".join(skript(lies("vendor/" + f)) for f in ["chart.umd.js", "xlsx.mini.min.js", "jspdf.umd.min.js", "jspdf.plugin.autotable.min.js"])
html = html.replace('<script src="core.js"></script>\n<script src="vendor/chart.umd.js"></script>\n<script src="app.js"></script>',
                    "<script>window.HK_EINZELDATEI = true;</script>\n" + bibliotheken + "\n" + skript(lies("core.js")) + "\n" + skript(lies("app.js")))
for rest in ['href="app.css"', '<script src="core.js"', '<script src="app.js"', '<script src="vendor/', 'href="manifest']:
    assert rest not in html, "noch extern verlinkt: " + rest
html = html.replace("<head>", "<head>\n<!-- Haus-Kosten – komplette App in einer Datei. Erzeugt mit kosten/tools/einzeldatei.py, nicht von Hand ändern. -->", 1)

ziel = ORDNER / "dist" / "Haus-Kosten.html"
ziel.parent.mkdir(exist_ok=True)
ziel.write_text(html, encoding="utf-8")
print(ziel, round(ziel.stat().st_size / 1024), "KB")
