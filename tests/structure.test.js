import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("console route is protected by Cloudflare Access identity",async()=>{
  const middleware=await readFile("functions/_middleware.js","utf8");
  assert.match(middleware,/verifyAccessIdentity/);
  const verifier=await readFile("functions/access-auth.js","utf8");
  assert.match(verifier,/Cf-Access-Jwt-Assertion/);
  assert.match(verifier,/RSASSA-PKCS1-v1_5/);
});

test("operations hostname root opens the protected console without changing public routing",async()=>{
  const middleware=await readFile("functions/_middleware.js","utf8");
  assert.match(middleware,/hostname === "ops\.creatorloop\.net"/);
  assert.match(middleware,/Response\.redirect\(new URL\("\/console\/"/);
});

test("application exposes no public dispatch or shared password",async()=>{
  const files=await Promise.all(["console/app.js","functions/api/console/[[path]].js","migrations/0001_bm01.sql"].map(f=>readFile(f,"utf8")));
  const source=files.join("\n");
  assert.doesNotMatch(source,/shared.password|DEFAULT_PASSWORD|password\s*=/i);
  assert.doesNotMatch(source,/api\/dispatch|test-dispatch/i);
});

test("source workbook remains an external read-only source reference",async()=>{
  const migration=await readFile("migrations/0001_bm01.sql","utf8");
  assert.match(migration,/PNB Acquisition & Launch Control System/);
  assert.match(migration,/TEST \/ FICTIONAL/);
});

test("duplicate submissions are blocked in UI and API",async()=>{
  const [client,api]=await Promise.all([readFile("console/app.js","utf8"),readFile("functions/api/console/[[path]].js","utf8")]);
  assert.match(client,/submit\.disabled=true/);
  assert.match(api,/already has campaign record/);
  assert.match(api,/LOWER\(TRIM\(handle\)\)/);
});


test("V2 keeps inbox out and audit out of standard operator navigation", async () => {
  const [html,client,api] = await Promise.all([
    readFile("console/index.html","utf8"),
    readFile("console/app.js","utf8"),
    readFile("functions/api/console/[[path]].js","utf8")
  ]);
  assert.doesNotMatch(html + client,/inbox/i);
  assert.match(html,/admin-only/);
  assert.match(api,/AUDIT_ROLES\.has\(user\.role\)/);
  assert.match(api,/Administrator authority required/);
});

test("V2 sync bridge is signed, replay-safe, and uses the existing D1 binding", async () => {
  const [sync,migration,config] = await Promise.all([
    readFile("functions/api/integrations/control-system.js","utf8"),
    readFile("migrations/0002_operations_console_v2.sql","utf8"),
    readFile("wrangler.toml","utf8")
  ]);
  assert.match(sync,/CONTROL_SYSTEM_SYNC_SECRET/);
  assert.match(sync,/X-CreatorLoop-Signature/);
  assert.match(sync,/control_system_imports/);
  assert.match(migration,/control_system_outbox/);
  assert.match(config,/database_name = "creatorloop-operations-nonproduction"/);
  assert.match(config,/database_id = "c4993a97-5835-4c6c-af06-7020fa8d4f2a"/);
});

test("Apps Script crosses Cloudflare Access with a scoped service token and still signs every request", async () => {
  const script = await readFile("assets/operations-control-system-sync.gs","utf8");
  assert.match(script,/CREATORLOOP_ACCESS_CLIENT_ID/);
  assert.match(script,/CREATORLOOP_ACCESS_CLIENT_SECRET/);
  assert.match(script,/"CF-Access-Client-Id"/);
  assert.match(script,/"CF-Access-Client-Secret"/);
  assert.match(script,/"X-CreatorLoop-Signature"/);
  assert.match(script,/followRedirects:\s*false/);
});

test("V2 operator UI exposes campaign identity, search, existing records, and field classes", async () => {
  const [html,client] = await Promise.all([
    readFile("console/index.html","utf8"),
    readFile("console/app.js","utf8")
  ]);
  assert.match(html,/Find campaign or creator/);
  assert.match(client,/Campaign ID/);
  assert.match(client,/data-record/);
  for (const classification of ["AUTO","SELECT","INPUT","LOCKED","APPROVAL"]) assert.match(client,new RegExp(classification));
});

test("pre-migration records are visibly and mechanically view-only", async () => {
  const client = await readFile("console/app.js","utf8");
  assert.match(client,/lockEditorIfMigrationPending/);
  assert.match(client,/This record is view-only/);
  assert.match(client,/querySelectorAll\("input,select,textarea,button"\)/);
  assert.match(client,/control\.disabled = true/);
});

test("console assets are revisioned so Cloudflare deploys cannot retain stale controls", async () => {
  const html = await readFile("console/index.html","utf8");
  assert.match(html,/console\.css\?v=\d{8}\.\d+/);
  assert.match(html,/app\.js\?v=\d{8}\.\d+/);
});
