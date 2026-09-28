import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { onRequest } from "../functions/api/integrations/control-system.js";

class D1Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new D1Statement(this.database,this.sql,values); }
  first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
  all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}
class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database,sql); }
  async batch(statements) { return statements.map((statement) => statement.run()); }
}
async function databaseFixture() {
  const database = new DatabaseSync(":memory:");
  database.exec(await readFile("migrations/0001_bm01.sql","utf8"));
  database.exec(await readFile("migrations/0002_operations_console_v2.sql","utf8"));
  return { database, binding: new D1Database(database) };
}
async function signature(secret,timestamp,body) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw",encoder.encode(secret),{ name:"HMAC",hash:"SHA-256" },false,["sign"]);
  const bytes = await crypto.subtle.sign("HMAC",key,encoder.encode(timestamp + "." + body));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2,"0")).join("");
}
async function call(binding,secret,payload,headers = {}) {
  const body = payload === null ? "" : JSON.stringify(payload);
  const request = new Request("https://ops.creatorloop.net/api/integrations/control-system",{
    method: payload === null ? "GET" : "POST",
    headers,
    body: payload === null ? undefined : body
  });
  const response = await onRequest({ request,env:{ OPERATIONS_DB:binding,CONTROL_SYSTEM_SYNC_SECRET:secret } });
  return { response,body:await response.json() };
}

test("control-system bridge fails closed without a valid signature",async () => {
  const { database,binding } = await databaseFixture();
  const result = await call(binding,"secret",null);
  assert.equal(result.response.status,401);
  database.close();
});

test("signed imports are idempotent and older source records cannot overwrite newer state",async () => {
  const { database,binding } = await databaseFixture();
  const secret = "test-sync-secret";
  const timestamp = String(Math.floor(Date.now()/1000));
  const payload = {
    mode:"import",
    eventId:"SYNC-TEST-001",
    sourceVersion:"TEST-V2",
    campaigns:[{
      id:"CMP-100",name:"TEST_CAMPAIGN_V2",brandCode:"TEST",status:"IN_PROGRESS",
      sourceReference:"Synthetic certification fixture",platform:"Meta",objective:"TEST",slug:"SYNTHETIC",
      cashBudget:0,promoCredit:0,startDate:"2026-09-28",owner:"Operations",
      productScope:"Synthetic scope",notes:"No production data",sourceUpdatedAt:"2026-09-28T12:00:00Z"
    }],
    creators:[],assignments:[],creatives:[]
  };
  const body = JSON.stringify(payload);
  const headers = {
    "X-CreatorLoop-Timestamp":timestamp,
    "X-CreatorLoop-Signature":await signature(secret,timestamp,body)
  };
  const first = await call(binding,secret,payload,headers);
  assert.equal(first.response.status,200);
  assert.equal(first.body.status,"APPLIED");
  assert.equal(database.prepare("SELECT name FROM campaigns WHERE id='CMP-100'").get().name,"TEST_CAMPAIGN_V2");

  const replay = await call(binding,secret,payload,headers);
  assert.equal(replay.body.replay,true);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM control_system_imports").get().count,1);

  const older = {
    ...payload,eventId:"SYNC-TEST-002",
    campaigns:[{ ...payload.campaigns[0],name:"STALE_NAME",sourceUpdatedAt:"2026-09-27T12:00:00Z" }]
  };
  const olderBody = JSON.stringify(older);
  const olderHeaders = {
    "X-CreatorLoop-Timestamp":timestamp,
    "X-CreatorLoop-Signature":await signature(secret,timestamp,olderBody)
  };
  await call(binding,secret,older,olderHeaders);
  assert.equal(database.prepare("SELECT name FROM campaigns WHERE id='CMP-100'").get().name,"TEST_CAMPAIGN_V2");
  database.close();
});
