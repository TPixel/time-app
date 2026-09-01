#!/usr/bin/env python3
# MacroPad Panel — skaerm-udgave af MacroPad'en: en lille lokal server der
# viser et knap-grid i browseren (http://localhost:8787) og udfoerer
# handlingerne ved klik. Virker ogsaa paa en Mac UDEN det fysiske board.
#
# Knapperne defineres i ~/.macropad/panel.json. Serveren udfoerer KUN
# handlinger fra den fil (aldrig vilkaarlige kommandoer fra browseren),
# og lytter kun paa localhost.

import json
import os
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

MP_DIR = os.path.expanduser("~/.macropad")
CONFIG = os.path.join(MP_DIR, "panel.json")
PORT = 8787

SIDE = """<!DOCTYPE html>
<html lang="da"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MacroPad Panel</title>
<style>
  body { margin:0; background:#16161a; color:#eee;
         font-family:-apple-system, Helvetica, sans-serif; }
  h1 { font-size:15px; letter-spacing:2px; text-align:center;
       color:#888; margin:14px 0 4px; }
  h2 { font-size:11px; letter-spacing:1px; text-transform:uppercase;
       color:#666; margin:14px 14px 6px; }
  .grid { display:grid; grid-template-columns:repeat(3, 1fr);
          gap:10px; padding:0 14px; }
  button { border:none; border-radius:14px; padding:18px 4px;
           font-size:14px; font-weight:600; color:#111;
           cursor:pointer; transition:transform .06s, filter .06s; }
  button:active { transform:scale(.94); filter:brightness(1.35); }
  .ok { outline:3px solid #fff; }
</style></head><body>
<h1>MACROPAD</h1>
<div id="indhold"></div>
<script>
const cfg = __CONFIG__;
const rod = document.getElementById("indhold");
cfg.grupper.forEach((g, gi) => {
  const h = document.createElement("h2"); h.textContent = g.navn; rod.appendChild(h);
  const grid = document.createElement("div"); grid.className = "grid";
  g.knapper.forEach((k, ki) => {
    const b = document.createElement("button");
    b.textContent = k.navn; b.style.background = k.farve;
    b.onclick = () => {
      fetch("/run", {method:"POST", headers:{"Content-Type":"application/json"},
                     body:JSON.stringify({gruppe:gi, knap:ki})});
      b.classList.add("ok"); setTimeout(() => b.classList.remove("ok"), 250);
    };
    grid.appendChild(b);
  });
  rod.appendChild(grid);
});
</script></body></html>"""


def hent_config():
    with open(CONFIG) as f:
        return json.load(f)


def udfoer(knap):
    t = knap.get("type")
    v = knap.get("vaerdi", "")
    if t == "open":
        cmd = ["open", "-a", v]
    elif t == "run":
        cmd = ["shortcuts", "run", v]
    elif t == "script":
        cmd = ["osascript", os.path.join(MP_DIR, "scripts",
                                         os.path.basename(v) + ".applescript")]
    elif t == "st":
        cmd = ["smartthings", "scenes:execute", v]
    else:
        return
    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        try:
            side = SIDE.replace("__CONFIG__", json.dumps(hent_config()))
        except Exception as e:
            side = "<h1>Fejl i panel.json: %s</h1>" % e
        data = side.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path == "/run":
            try:
                laengde = int(self.headers.get("Content-Length", 0))
                valg = json.loads(self.rfile.read(laengde))
                cfg = hent_config()
                knap = cfg["grupper"][valg["gruppe"]]["knapper"][valg["knap"]]
                udfoer(knap)
            except Exception:
                pass
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
