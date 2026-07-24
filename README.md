# CreatorLoop™ — Official Website V1

**The Future of Creator Infrastructure**

Official CreatorLoop™ ecosystem website including Loop Entrance™ (with embedded Tetris), Mission Control™, Blueprint™, and future community infrastructure.

---

## Project Structure

```
creatorloop-main-site/
├── index.html                    # Loop Entrance homepage (Tetris game)
├── 404.html                      # Branded 404 page
├── _redirects                    # Cloudflare Pages routing
├── pages/
│   ├── missions.html             # Mission Control™ page
│   └── blueprint.html            # Blueprint download page
├── css/
│   ├── styles.css                # Global design system
│   ├── loop-entrance.css         # Loop Entrance styles
│   ├── missions.css              # Mission Control styles
│   └── blueprint.css             # Blueprint page styles
├── js/
│   ├── tetris.js                 # Custom HTML5 Tetris engine
│   └── main.js                   # Nav, forms, Google Sheets integration
└── assets/
    ├── images/                   # All brand assets (logo, favicon, cover)
    └── creatorloop-blueprint.pdf # Blueprint downloadable PDF (v3)
```

---

## Deployment

Connect `VTholdings/creatorloop-main-site` to Cloudflare Pages:
- Framework preset: **None** (static site)
- Build command: *(leave blank)*
- Build output directory: `/`
- Production branch: `main`

Every push to `main` triggers automatic deployment.

---

## Google Sheets Integration

The Blueprint form submits leads via a Google Apps Script Web App.

1. Open your Google Sheet → Extensions → Apps Script
2. Deploy a `doPost` function that appends rows: Timestamp, First Name, Last Name, Email, Role, Source, Lead Magnet, Status, Notes
3. Copy the Web App URL
4. In `js/main.js`, replace `YOUR_SCRIPT_ID` in the `SHEET_URL` constant

---

## Updating the Blueprint PDF

Replace `/assets/creatorloop-blueprint.pdf` with the new file (same filename) and push to `main`.

---

## Analytics Setup

GA4 and Meta Pixel placeholders are in every page `<head>`. Uncomment and replace the ID values when ready.

---

## Design Tokens (css/styles.css)

| Token | Value | Usage |
|-------|-------|-------|
| `--cl-gold` | `#C8A84B` | Primary brand gold |
| `--cl-purple` | `#7B3FE4` | Secondary accent |
| `--cl-cyan` | `#00D4FF` | Tertiary accent |
| `--cl-black` | `#0a0a0a` | Page background |
| `--font-display` | Barlow Condensed | Headings |
| `--font-body` | Inter | Body copy |

---

*CreatorLoop™ V1 — Built with precision. Deployed for scale.*
