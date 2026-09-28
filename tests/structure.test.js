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
