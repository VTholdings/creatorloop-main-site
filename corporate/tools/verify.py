"""Verify mission boundaries, accessible source, assets and offline packaging.

This intentionally does not claim browser layout measurements.
"""
from pathlib import Path
from html.parser import HTMLParser
import base64
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text()
css = (ROOT / "styles.css").read_text()
preview = (ROOT / "qa/owner-preview.html").read_text()
checks = {}

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.text = []
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))
    def handle_data(self, text):
        self.text.append(text)

page = Page()
page.feed(html)
text = " ".join(" ".join(page.text).split())
required = [
    "CREATOR", "LOOP", "PEOPLE · BRANDS · OPPORTUNITY · BEYOND",
    "Building infrastructure", "for the creator economy.",
    "CreatorLoop™ develops systems that connect creators, brands, campaigns and opportunity through accountable, measurable collaboration.",
    "PARTICIPATION IN THE CREATORLOOP NETWORK IS CURATED.",
    "CREATOR INFRASTRUCTURE", "CAMPAIGN OPERATIONS", "BRAND COLLABORATION", "TECHNOLOGY",
    "BRAND PARTNERSHIPS & STRATEGIC INQUIRIES", "team@creatorloop.net",
    "Sunshine Recovery Solutions", "Puss-N-Boots",
    "© 2026 CreatorLoop™. All Rights Reserved.",
    "BUILDING THE FUTURE OF CREATOR INFRASTRUCTURE.",
]
checks["required_copy"] = all(s in text for s in required)
checks["semantic_structure"] = all(sum(t == tag for t, _ in page.tags) == 1 for tag in ["html", "main", "h1", "footer"])
checks["no_unapproved_controls"] = not any(t in ["nav", "button", "form", "input", "script", "iframe"] for t, _ in page.tags)
checks["only_email_link"] = [a.get("href") for t, a in page.tags if t == "a"] == ["mailto:team@creatorloop.net"]
checks["no_private_or_other_public_paths"] = not re.search(r"https?://|loop\.creatorloop\.net|join\.creatorloop|ops\.creatorloop|login|pricing|privacy|terms", html, re.I)
checks["zoom_enabled"] = 'content="width=device-width, initial-scale=1"' in html and "user-scalable" not in html
checks["named_partner_marks"] = all(name in html for name in ['aria-labelledby="srs-title"', 'aria-labelledby="pnb-title"'])
checks["visible_keyboard_focus"] = ":focus-visible" in css
checks["no_content_clipping_hack"] = "overflow-x: hidden" not in css and "overflow: hidden" not in css.replace("svg { display: block; overflow: hidden; }", "")
checks["responsive_rules_present"] = all(s in css for s in ["max-width: 999px", "max-width: 600px", "max-width: 359px", "max-height: 950px", "flex-wrap: wrap", "min-height: 100svh"])
checks["readable_mobile_body"] = ".description { font-size: 17px;" in css
checks["staging_noindex"] = 'name="robots" content="noindex, nofollow"' in html
refs = re.findall(r'(?:href|src)="(assets/[^\"]+)"', html) + re.findall(r'url\("(assets/[^\"]+)"\)', css)
checks["all_assets_present"] = all((ROOT / p).is_file() for p in refs)
checks["offline_preview_self_contained"] = "<style>" in preview and not re.search(r'(?:href|src)="assets/|url\("assets/|https?://', preview)
embedded = re.findall(r"data:image/webp;base64,([A-Za-z0-9+/=]+)", preview)
checks["offline_assets_match_source"] = len(embedded) == 2 and set(hashlib.sha256(base64.b64decode(s)).hexdigest() for s in embedded) == set(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in set(refs))
checks["shared_brand_artwork_resolves"] = sum(t == "use" and a.get("href") == "#approved-brand-artwork" for t, a in page.tags) == 3 and sum(a.get("id") == "approved-brand-artwork" for _, a in page.tags) == 1
manifest = json.loads((ROOT / "qa/source-sha256.json").read_text())
checks["package_hashes_match"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == sha for p, sha in manifest.items())
changed = subprocess.check_output(["git", "diff", "--name-only", "HEAD"], cwd=ROOT.parent, text=True).splitlines()
untracked = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT.parent, text=True).splitlines()
checks["changes_isolated_to_corporate_directory"] = all(p.startswith("corporate/") for p in changed + untracked)
result = {
    "status": "PASS" if all(checks.values()) else "FAIL",
    "scope": "Automated source, accessibility-structure, asset and offline-package checks only",
    "checks": checks,
    "responsive_browser_qa": "NOT RUN — supported browser-control skill unavailable",
    "owner_visual_qa": "PENDING — qa/owner-preview.html",
    "viewport_qa_targets": ["1920×1080", "1536×1024", "1440×900", "1366×768", "1280×720", "1024×768", "768×1024", "390×844", "320×568", "200% zoom"],
    "production_deployment": "NOT AUTHORIZED / NOT PERFORMED",
}
(ROOT / "qa/verification.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
print(json.dumps(result, indent=2, ensure_ascii=False))
raise SystemExit(0 if all(checks.values()) else 1)
