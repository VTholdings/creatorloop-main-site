import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import { runInNewContext } from "node:vm";
import { onRequest } from "../functions/api/integrations/control-system.js";

test("Apps Script signs Unicode payloads with explicit UTF-8 and identical transmitted bytes",async () => {
  const source = await readFile("assets/operations-control-system-sync.gs","utf8");
  const secret = "synthetic-secret";
  const payload = { mode:"diagnostic",name:"CreatorLoop™ — café 🐈" };
  let sent;
  const context = {
    Utilities:{
      Charset:{ UTF_8:"UTF-8" },
      computeHmacSha256Signature(value,key,charset) {
        assert.equal(charset,"UTF-8","Default Apps Script encoding must not be used");
        return [...createHmac("sha256",key).update(value,"utf8").digest()].map(b => b > 127 ? b - 256 : b);
      }
    },
    UrlFetchApp:{ fetch(endpoint,options) { sent = options; return {getResponseCode:() => 200,getContentText:() => "{}"}; } }
  };
  runInNewContext(source,context);
  context.signedFetch_("https://example.test",secret,"id","access-secret","post",payload);
  assert.equal(sent.payload,JSON.stringify(payload));
  const { database,binding } = await databaseFixture();
  try {
    const result = await onRequest({request:new Request("https://example.test",{
      method:"POST",headers:sent.headers,body:sent.payload
    }),env:{OPERATIONS_DB:binding,CONTROL_SYSTEM_SYNC_SECRET:secret}});
    assert.equal(result.status,422,"Signed unsupported mode authenticates without writing records");
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM control_system_imports").get().total,0);
  } finally { database.close(); }
});

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

test("control-system bridge fails closed when the production signing secret is not bound",async () => {
  const { database,binding } = await databaseFixture();
  const timestamp = String(Math.floor(Date.now()/1000));
  const payload = { mode:"import",eventId:"SYNC-NO-SECRET",sourceVersion:"TEST",campaigns:[],creators:[],assignments:[],creatives:[] };
  const body = JSON.stringify(payload);
  const originalError = console.error;
  let diagnostic;
  console.error = (message,detail) => { diagnostic = { message,detail }; };
  try {
    const result = await call(binding,undefined,payload,{
      "X-CreatorLoop-Timestamp":timestamp,
      "X-CreatorLoop-Signature":await signature("configured-only-in-client",timestamp,body)
    });
    assert.equal(result.response.status,401);
    assert.deepEqual(diagnostic,{
      message:"Control-system authentication unavailable",
      detail:{ reason:"CONTROL_SYSTEM_SYNC_SECRET is not bound" }
    });
  } finally {
    console.error = originalError;
    database.close();
  }
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
