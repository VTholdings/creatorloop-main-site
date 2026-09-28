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
  database.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status) VALUES (?,?,?,?,?)")
    .run("OP-OPER", "operator@example.com", "Test Operator", "OPERATOR", "ACTIVE");
  database.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status) VALUES (?,?,?,?,?)")
    .run("OP-QA", "qa@example.com", "QA Reviewer", "QA_REVIEWER", "ACTIVE");
  return { database, env: { OPERATIONS_DB: new D1Database(database) } };
}

async function request(env, email, method, path, body) {
  const response = await onRequest({
    env,
    data: { loginEmail: email },
    params: { path: path.split("/").filter(Boolean) },
    request: new Request(`https://ops.creatorloop.net/api/console/${path}`, {
      method,
      headers: method === "GET" ? {} : { "Content-Type": "application/json", Origin: "https://ops.creatorloop.net" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  });
  return { response, body: await response.json() };
}

const enrollment = {
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

  const audit = await request(env, "qa@example.com", "GET", "audit");
  const creatorEvents = audit.body.events.filter((event) => event.object_id === "CR-101");
  assert.deepEqual(new Set(creatorEvents.map((event) => event.operator_id)), new Set(["OP-OPER", "OP-QA"]));
  assert.equal(creatorEvents.filter((event) => event.action === "QA_REVIEW_COMPLETED").length, 2);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM creator_enrollments WHERE id='CR-101'").get().count, 1);
  assert.equal(database.prepare("SELECT workflow_status FROM creator_enrollments WHERE id='CR-100'").get().workflow_status, "PASSED");

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
