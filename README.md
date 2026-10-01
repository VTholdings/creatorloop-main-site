# CreatorLoop™ — Official Website V1

**The Future of Creator Infrastructure**

Official CreatorLoop™ ecosystem website including Loop Entrance™ (with embedded Tetris), Mission Control™, Blueprint™, and future community infrastructure.

The protected `/console/` path contains the BM-01 CreatorLoop Operations Console. It validates Cloudflare Access JWTs for individual operator identity and uses a Cloudflare D1 binding named `OPERATIONS_DB` for persistent campaign, workflow, QA, and audit data. Apply `migrations/0001_bm01.sql` before enabling access. Set `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD`, and `BOOTSTRAP_ADMIN_EMAIL` as protected Pages environment variables; never commit an operator email or credential.

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


## Operations Console V2

The protected Operations Console is the operator-facing layer over the PNB Acquisition & Launch Control System. Operators search and work by campaign/creator identity, manage creator enrollments and assignments, attach evidence, and submit QA without opening the system-of-record spreadsheet.

V2 preserves these boundaries:

- Cloudflare Access supplies the authenticated individual identity.
- D1 binding `OPERATIONS_DB` remains `creatorloop-operations-nonproduction`.
- Standard operators cannot access the audit API or Audit Trail navigation.
- IDs, timestamps, rollups, approval decisions, and source-controlled fields remain automatic or locked.
- Console mutations write an immutable audit event and a durable `control_system_outbox` record in the same D1 batch.
- The sync integration fails closed unless its request has a valid, fresh HMAC signature.
- Import event IDs are unique, source timestamps prevent stale overwrites, and pending local changes are not overwritten by source imports.
- No inbox is included; operator communication remains outside the Console.

Apply `migrations/0002_operations_console_v2.sql` to the existing nonproduction D1 database before enabling V2 mutations.

### Control System synchronization

The bridge has two parts:

1. `/api/integrations/control-system` on Cloudflare Pages accepts signed snapshots, exposes pending Console changes, and acknowledges applied outbox events.
2. `assets/operations-control-system-sync.gs` is installed as a bound Apps Script in the approved Control System workbook.

Store `CONTROL_SYSTEM_SYNC_SECRET` only as an encrypted Cloudflare Pages secret and as the Apps Script property `CREATORLOOP_SYNC_SECRET`. Set the Apps Script property `CREATORLOOP_SYNC_ENDPOINT` to the protected integration URL.

Cloudflare Pages binds encrypted environment values to a deployment. After adding or rotating `CONTROL_SYSTEM_SYNC_SECRET`, create a fresh Production deployment before testing the bridge. The Console home card reports `Configured` only when the running deployment can see the secret.

Because Cloudflare Access protects the Operations hostname, create a scoped Access service token and permit it only on the Control System integration path. Store its client ID and secret as the Apps Script properties `CREATORLOOP_ACCESS_CLIENT_ID` and `CREATORLOOP_ACCESS_CLIENT_SECRET`. The Apps Script sends those Access headers in addition to the application-level HMAC signature; both security layers must pass. Redirect following is disabled so credentials cannot be forwarded to an interactive login origin. Never commit or paste any shared secret or service-token credential into source, issues, logs, or chat.



## Exact source Primary Platform

`source_primary_platform` maps exactly to `🗺️CREATORS` → `Primary Platform`. The existing constrained `primary_platform` remains an internal category and is never exported in place of the exact source value. Signed imports carry the existing category as `primaryPlatform` and the exact source field as `sourcePrimaryPlatform`. Creator edits preserve an unchanged signed source value; creating new values remains subject to the existing platform controls.

Apply `migrations/0003_source_primary_platform.sql` once to the existing Console D1 database before deploying this revision or installing its bound Apps Script. The migration adds one application column and preserves all existing database records and constraints. It does not change the PNB Acquisition & Launch Control System. Then run the bound bridge again to recover the exact source values.

Formula-backed `Start Date` and `Content Due` are compared in the spreadsheet timezone. Unchanged dates allow other mapped edits; attempts to change a source formula still fail before the record is written.
