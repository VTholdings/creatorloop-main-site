"""Build an offline Owner QA preview from the canonical page; no dependencies."""
from pathlib import Path
import base64
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text()
css = (ROOT / "styles.css").read_text()

def data_url(name):
    data = (ROOT / name).read_bytes()
    return "data:image/webp;base64," + base64.b64encode(data).decode()

css = re.sub(r'url\("(assets/[^\"]+)"\)', lambda m: 'url("' + data_url(m[1]) + '")', css)
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = re.sub(r'href="(assets/[^\"]+)"', lambda m: 'href="' + data_url(m[1]) + '"', html)
(ROOT / "qa" / "owner-preview.html").write_text(html)
files = ["index.html", "styles.css", "assets/approved-brand-artwork.webp", "assets/global-infrastructure.webp"]
manifest = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in files}
manifest["qa/owner-preview.html"] = hashlib.sha256(html.encode()).hexdigest()
(ROOT / "qa" / "source-sha256.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Offline preview built from canonical HTML, CSS, and assets.")
