import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { onRequest } from "../functions/api/console/[[path]].js";

class D1Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new D1Statement(this.database, this.sql, values); }
  first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
  all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
  async batch(statements) { return statements.map((statement) => statement.run()); }
}

async function fixture() {
  const database = new DatabaseSync(":memory:");
  database.exec(await readFile("migrations/0001_bm01.sql", "utf8"));
  database.exec(await readFile("migrations/0002_operations_console_v2.sql", "utf8"));
  database.exec(await readFile("migrations/0003_source_primary_platform.sql", "utf8"));
  database.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status) VALUES (?,?,?,?,?)")
    .run("OP-OPER", "operator@example.com", "Test Operator", "OPERATOR", "ACTIVE");
  database.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status) VALUES (?,?,?,?,?)")
    .run("OP-QA", "qa@example.com", "QA Reviewer", "QA_REVIEWER", "ACTIVE");
  database.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status) VALUES (?,?,?,?,?)")
    .run("OP-ADMIN", "admin@example.com", "Project Owner", "ADMINISTRATOR", "ACTIVE");
  return { database, env: { OPERATIONS_DB: new D1Database(database) } };
}

async function v1Fixture() {
  const database = new DatabaseSync(":memory:");
  database.exec(await readFile("migrations/0001_bm01.sql", "utf8"));
  database.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status) VALUES (?,?,?,?,?)")
    .run("OP-OPER", "operator@example.com", "Test Operator", "OPERATOR", "ACTIVE");
  return { database, env: { OPERATIONS_DB: new D1Database(database) } };
}

async function request(env, email, method, path, body) {
  const response = await onRequest({
    env,
    data: { loginEmail: email },
    params: { path: path.split("?")[0].split("/").filter(Boolean) },
    request: new Request(`https://ops.creatorloop.net/api/console/${path}`, {
      method,
      headers: method === "GET" ? {} : { "Content-Type": "application/json", Origin: "https://ops.creatorloop.net" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  });
  return { response, body: await response.json() };
}

const enrollment = {
  campaignId: "CMP-100",
  creatorName: "Certification Creator",
  primaryPlatform: "TikTok",
  handle: "@certcreator",
  contact: "certification@example.com",
  creatorStatus: "Active",
  compensationModel: "Performance",
  rightsStatus: "Paid Usage Approved",
  productFocus: "PNB_META_ACQ_3ITEMS_202609 — 3-product campaign",
  notes: "Synthetic BM-01 certification record",
  evidenceLink: "https://drive.google.com/evidence/certification",
};

test("operator workflow persists, preserves QA history, attributes audit, and blocks duplicates", async () => {
  const { database, env } = await fixture();

  const created = await request(env, "operator@example.com", "POST", "creators", enrollment);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.id, "CR-101");

  const duplicate = await request(env, "operator@example.com", "POST", "creators", { ...enrollment, contact: "different@example.com" });
  assert.equal(duplicate.response.status, 409);
  assert.match(duplicate.body.error, /already has campaign record CR-101/);

  let record = await request(env, "operator@example.com", "GET", "creators/CR-101");
  assert.equal(record.body.creator.workflow_status, "IN_PROGRESS");
  assert.ok(Object.values(record.body.checklist).every(Boolean));

  const submitted = await request(env, "operator@example.com", "PATCH", "creators/CR-101", { action: "AWAITING_QA", version: record.body.creator.version });
  assert.equal(submitted.response.status, 200);

  record = await request(env, "operator@example.com", "GET", "creators/CR-101");
  const unauthorizedQa = await request(env, "operator@example.com", "POST", "qa/CR-101", { result: "PASS", version: record.body.creator.version });
  assert.equal(unauthorizedQa.response.status, 403);

  const correction = await request(env, "qa@example.com", "POST", "qa/CR-101", { result: "CORRECTION_REQUIRED", notes: "Replace the evidence link.", version: record.body.creator.version });
  assert.equal(correction.response.status, 200);

  record = await request(env, "operator@example.com", "GET", "creators/CR-101");
  assert.equal(record.body.creator.workflow_status, "CORRECTION_REQUIRED");
  assert.equal(record.body.reviews.length, 1);
  assert.equal(record.body.reviews[0].reviewer_name, "QA Reviewer");

  const corrected = await request(env, "operator@example.com", "PATCH", "creators/CR-101", { ...enrollment, evidenceLink: "https://drive.google.com/evidence/corrected", version: record.body.creator.version });
  assert.equal(corrected.response.status, 200);
  record = await request(env, "operator@example.com", "GET", "creators/CR-101");
  await request(env, "operator@example.com", "PATCH", "creators/CR-101", { action: "AWAITING_QA", version: record.body.creator.version });
  record = await request(env, "qa@example.com", "GET", "creators/CR-101");

  const passed = await request(env, "qa@example.com", "POST", "qa/CR-101", { result: "PASS", version: record.body.creator.version });
  assert.equal(passed.response.status, 200);
  record = await request(env, "operator@example.com", "GET", "creators/CR-101");
  assert.equal(record.body.creator.workflow_status, "PASSED");
  assert.equal(record.body.reviews.length, 2);

  const locked = await request(env, "operator@example.com", "PATCH", "creators/CR-101", { ...enrollment, version: record.body.creator.version });
  assert.equal(locked.response.status, 409);

  const operatorAudit = await request(env, "operator@example.com", "GET", "audit");
  assert.equal(operatorAudit.response.status, 403);
  const audit = await request(env, "admin@example.com", "GET", "audit");
  const creatorEvents = audit.body.events.filter((event) => event.object_id === "CR-101");
  assert.deepEqual(new Set(creatorEvents.map((event) => event.operator_id)), new Set(["OP-OPER", "OP-QA"]));
  assert.equal(creatorEvents.filter((event) => event.action === "QA_REVIEW_COMPLETED").length, 2);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM creator_enrollments WHERE id='CR-101'").get().count, 1);
  assert.equal(database.prepare("SELECT workflow_status FROM creator_enrollments WHERE id='CR-100'").get().workflow_status, "PASSED");
  assert.ok(database.prepare("SELECT COUNT(*) count FROM control_system_outbox WHERE entity_id='CR-101'").get().count >= 5);

  const dashboard = await request(env, "operator@example.com", "GET", "dashboard");
  assert.equal(dashboard.body.counts.PASSED, 2);
  database.close();
});

test("stale version and cross-origin mutations fail closed", async () => {
  const { database, env } = await fixture();
  await request(env, "operator@example.com", "POST", "creators", enrollment);
  const stale = await request(env, "operator@example.com", "PATCH", "creators/CR-101", { ...enrollment, notes: "stale", version: 0 });
  assert.equal(stale.response.status, 409);

  const response = await onRequest({
    env,
    data: { loginEmail: "operator@example.com" },
    params: { path: ["creators"] },
    request: new Request("https://ops.creatorloop.net/api/console/creators", { method: "POST", headers: { Origin: "https://attacker.example" }, body: JSON.stringify(enrollment) }),
  });
  assert.equal(response.status, 403);
  database.close();
});

test("a note edit preserves an imported Primary Platform in database and export",async () => {
  const {database,env}=await fixture();
  await request(env,'operator@example.com','POST','creators',enrollment);
  database.prepare("UPDATE creator_enrollments SET source_primary_platform=?,source_version=? WHERE id='CR-101'").run('TikTok + Instagram','SHEET-TEST');
  const record=await request(env,'operator@example.com','GET','creators/CR-101');
  const edited=await request(env,'operator@example.com','PATCH','creators/CR-101',{...enrollment,primaryPlatform:'TikTok + Instagram',notes:'Preserve source platform',version:record.body.creator.version});
  assert.equal(edited.response.status,200);
  assert.equal(database.prepare("SELECT source_primary_platform FROM creator_enrollments WHERE id='CR-101'").get().source_primary_platform,'TikTok + Instagram');
  const payloads=database.prepare("SELECT payload_json FROM control_system_outbox WHERE entity_id='CR-101' AND action='UPSERT'").all().map(row=>JSON.parse(row.payload_json));
  assert.ok(payloads.some(row=>row.primaryPlatform==='TikTok + Instagram' && row.notes==='Preserve source platform'));
  database.close();
});


test("V2 campaign and creator search opens existing records", async () => {
  const { database, env } = await fixture();
  const byCampaign = await request(env, "operator@example.com", "GET", "campaigns?q=CMP-100");
  assert.equal(byCampaign.response.status, 200);
  assert.equal(byCampaign.body.campaigns[0].id, "CMP-100");

  const byName = await request(env, "operator@example.com", "GET", "campaigns?q=PNB_META");
  assert.equal(byName.body.campaigns[0].name, "PNB_META_ACQ_3ITEMS_202609");

  const byCreator = await request(env, "operator@example.com", "GET", "creators?q=MayaPaws");
  assert.equal(byCreator.body.creators[0].id, "CR-100");
  assert.equal(byCreator.body.creators[0].campaign_id, "CMP-100");
  database.close();
});

test("pre-migration console remains browsable while V2 mutations stay locked", async () => {
  const { database, env } = await v1Fixture();

  const campaigns = await request(env, "operator@example.com", "GET", "campaigns?q=CMP-100");
  assert.equal(campaigns.response.status, 200);
  assert.equal(campaigns.body.campaigns[0].id, "CMP-100");

  const creators = await request(env, "operator@example.com", "GET", "creators?campaignId=CMP-100&q=MayaPaws");
  assert.equal(creators.response.status, 200);
  assert.equal(creators.body.creators[0].id, "CR-100");
  assert.equal(creators.body.creators[0].campaign_slug, null);

  const creator = await request(env, "operator@example.com", "GET", "creators/CR-100");
  assert.equal(creator.response.status, 200);
  assert.equal(creator.body.creator.campaign_name, "PNB_META_ACQ_3ITEMS_202609");

  const blocked = await request(env, "operator@example.com", "POST", "creators", enrollment);
  assert.equal(blocked.response.status, 503);
  assert.match(blocked.body.error, /migration is pending/);
  database.close();
});

test("assignment changes are attributed, replay-safe, and do not alter locked identities", async () => {
  const { database, env } = await fixture();
  const body = {
    creatorId: "CR-100", campaignId: "CMP-100", status: "In Progress",
    startDate: "2026-09-28", contentDue: "2026-10-02",
    fixedContentFee: "75", commissionRate: "0.10", paidUsageRights: "Pending",
    attributionWindowDays: "30", evidenceStatus: "Planned", notes: "Synthetic V2 test"
  };
  const created = await request(env, "operator@example.com", "POST", "assignments", body);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.id, "ASG-100");

  const duplicate = await request(env, "operator@example.com", "POST", "assignments", body);
  assert.equal(duplicate.response.status, 409);

  const updated = await request(env, "operator@example.com", "PATCH", "assignments/ASG-100", {
    ...body, status: "Active", evidenceStatus: "Verified",
    paidUsageRights: "Yes", signedRightsEvidenceLink: "https://example.com/signed-rights",
    version: 1
  });
  assert.equal(updated.response.status, 200);

  const stale = await request(env, "operator@example.com", "PATCH", "assignments/ASG-100", { ...body, version: 1 });
  assert.equal(stale.response.status, 409);
  assert.equal(database.prepare("SELECT creator_id FROM creator_assignments WHERE id='ASG-100'").get().creator_id, "CR-100");
  assert.equal(database.prepare("SELECT COUNT(*) count FROM audit_events WHERE object_id='ASG-100'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM control_system_outbox WHERE entity_id='ASG-100'").get().count, 2);
  database.close();
});
