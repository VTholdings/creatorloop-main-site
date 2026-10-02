# Operator training — existing CreatorLoop workflow

This extends the approved operator-readiness work. The PNB Acquisition & Launch Control System remains the operational source of truth; this document does not replace the existing Discord Master SOP, content review, rights or launch procedures.

`node training/walkthrough.mjs` runs the same Console API, all production-schema migrations and approved role enforcement in a separate in-memory SQLite database. Every person, campaign, approval and metric is fictional. It performs no production write or external action. `CONSOLE_ENVIRONMENT=TRAINING` rejects the signed production synchronization endpoint. This is an isolated API acceptance environment, **not yet a hosted employee training Console**.

The walkthrough covers assigned intake, factual processing, authorized QA, required rights escalation, launch denial despite QA PASS, simulated zero-spend monitoring and Owner-verified closeout. It checks individual audit attribution and denies an operator's attempted QA, launch and closeout approval.

## Hosted sandbox deployment

Use a separate Cloudflare Pages project and a separately created D1 database, with the same Console commit and schema. Never reuse `creatorloop-operations-nonproduction` or the active source workbook as its write target. Bind `OPERATIONS_DB` to the new training database. Set `CONSOLE_ENVIRONMENT=TRAINING`; configure its own Cloudflare Access audience, individual account grants and Owner identity. Do not install production sync secrets, production Access service-token credentials or platform credentials. Test the binding IDs and denied synchronization endpoint before provisioning a trainee.

Owner/QA/Operations training examples may simulate decisions; they do not create live authority or change production compensation. The standard operator account uses the same field restrictions and record scope as production. Use prominent TRAINING banners and preserve the production certification fixtures untouched.

## Existing SOP/setup completion

Apply these approved boundaries to the existing Discord ADMIN SETUP CARD and operator training section:

1. Receive submission through the approved source; keep its original evidence. Match permanent IDs and the assigned campaign. Escalate duplicates or ambiguous identity.
2. Process verified facts in the Console. Product Focus belongs to the creator; Product Scope belongs to CAMPAIGNS and CREATOR ASSIGNMENTS. Approved compensation, rights and schedules are controlled values.
3. Send completed factual processing to QA. The authorized reviewer uses the existing content scorecard and compliance checks. QA PASS grants no compensation, paid rights, launch or Owner authority.
4. Record missing evidence and exceptions in DECISIONS & BLOCKERS through the Console. Use the established Type and Severity. Pending export is not proof that the source write succeeded. Keep work blocked until the authorized decision appears.
5. Read LAUNCH CONTROL. Tracking Gate and Rights Gate must be VERIFIED; Pre-Launch QA, Economics Gate and Budget Gate must be READY; explicit Owner Approval and Launch Status must be Approved. Routine operators never originate approval or bypass a gate.
6. Monitor verified DATA INTAKE, RETARGETING and CREATOR PERFORMANCE facts. Meta attribution is distinct from Shopify order/refund facts. Escalate discrepancies; do not expand budgets or treat imported metrics as approval.
7. Capture closeout facts and evidence. Management verifies completion, money, rights and unresolved exceptions. No payment, new campaign or extra spend follows automatically.

Before onboarding, the existing setup card must identify the actual approved intake/drop links, escalation lead and backup, handoff location, coverage, authorized identities and training URL. They must be read from the current setup infrastructure or supplied by the Owner; do not invent personnel or route sensitive approvals to the support mailbox. The approved Owner/Administrator identity is `team@creatorloop.net`, reserved for the Owner/Administrator and never a shared employee login. Each employee requires a separately authorized individual identity.

## Production rollout order

1. Authenticate Wrangler to the correct existing account. Take a D1 export and record counts, IDs, terms, operator identities and audit counts.
2. First provision `team@creatorloop.net` as an ACTIVE ADMINISTRATOR and add it to the Cloudflare Access authorization without removing support access. Verify that this identity successfully authenticates to the Console and has the intended Owner/Admin permissions. A Wrangler authorization alone does not verify Console sign-in.
3. Apply `0004_operator_permissions.sql` remotely with Wrangler's D1 file/migration execution, not the dashboard multi-statement query box. Verify its registration and `PRAGMA foreign_key_check`; verify pre-existing records, compensation and audit history are unchanged. Deploy the tested commit; install the updated bound Apps Script and run the signed round trip. Source queues remain unverified until real imports/exports pass.
4. Only after successful Owner/Admin Console verification, disable the historical support operator and remove support authorization from Cloudflare Access and bootstrap configuration wherever applicable. Keep the historical support operator record, IDs and audit attribution unchanged; its business mailbox is unaffected.
5. Verify individual routine operator reads/writes and prohibited attempts live; verify Owner/Admin, QA, Operations and delegated approvals.
6. Verify external source connections and exact mappings before enabling authoritative imports. No Shopify/Meta/Klaviyo/Discord integration is currently verified in this execution environment.
7. Run the hosted training walkthrough and employee-facing SOP check. Certify operator readiness only after all live checks pass.

No new policy approval is needed for the architecture above. Remaining account sign-ins and connection permissions are execution dependencies.
