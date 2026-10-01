import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import { runInNewContext } from "node:vm";
import { onRequest } from "../functions/api/integrations/control-system.js";

test("creator snapshots preserve exact source fields and include unassigned creators",async () => {
  const source=await readFile('assets/operations-control-system-sync.gs','utf8');
  const headers=['Creator ID','Creator Name','Primary Platform','Product Focus'];
  const values=['CR-100','Synthetic','TikTok + Instagram','Established Product Focus'];
  const context={SpreadsheetApp:{getActive:()=>({getSheetByName:name=>{
    assert.equal(name,'🗺️CREATORS');
    return {getLastColumn:()=>4,getLastRow:()=>4,getRange:row=>({getDisplayValues:()=>[row===3?headers:values]})};
  }})}};
  runInNewContext(source,context);
  const [row]=context.creatorRows_({});
  assert.equal(row.primaryPlatform,'TikTok + Instagram');assert.equal(row.productFocus,'Established Product Focus');assert.equal(row.campaignId,null);
  assert.match(row.sourceRecord,/🗺️CREATORS/);
});

test("signed source import preserves the exact Primary Platform",async () => {
  const {database,binding}=await databaseFixture();
  const secret='synthetic-secret',timestamp=String(Math.floor(Date.now()/1000));
  const payload={mode:'import',eventId:'SOURCE-PRIMARY-PLATFORM',sourceVersion:'SHEET-TEST',creators:[{
    id:'CR-100',campaignId:'CMP-100',creatorName:'Synthetic',primaryPlatform:'TikTok + Instagram',
    handle:'@synthetic',contact:'synthetic@example.com',creatorStatus:'Active',compensationModel:'Performance',rightsStatus:'Organic Only',productFocus:'Established Product Focus'
  }]};
  const result=await call(binding,secret,payload,{'X-CreatorLoop-Timestamp':timestamp,'X-CreatorLoop-Signature':await signature(secret,timestamp,JSON.stringify(payload))});
  assert.equal(result.response.status,200);
  const row=database.prepare("SELECT primary_platform,product_focus FROM creator_enrollments WHERE id='CR-100'").get();
  assert.equal(row.primary_platform,'TikTok + Instagram');assert.equal(row.product_focus,'Established Product Focus');
  database.close();
});

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
  database.exec("BEGIN");
  database.exec(await readFile("migrations/0003_pnb_source_contract.sql","utf8"));
  database.exec("COMMIT");
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

test("unacknowledged exports retry after a failed workbook write and stop after acknowledgement", async () => {
  const {database,binding} = await databaseFixture();
  try {
    database.prepare("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES ('OP-TEST','qa@example.test','QA','OPERATOR','ACTIVE')").run();
    database.prepare("INSERT INTO control_system_outbox(id,idempotency_key,operator_id,entity_type,entity_id,action,payload_json) VALUES ('SYNC-RETRY','KEY-RETRY','OP-TEST','ASSIGNMENT','ASG-TEST','UPSERT','{}')").run();
    const secret = 'retry-test';
    const signed = async payload => {
      const timestamp = String(Math.floor(Date.now()/1000));
      return call(binding,secret,payload,{'X-CreatorLoop-Timestamp':timestamp,'X-CreatorLoop-Signature':await signature(secret,timestamp,payload === null ? '' : JSON.stringify(payload))});
    };
    assert.equal((await signed(null)).body.changes[0].id,'SYNC-RETRY');
    assert.equal((await signed(null)).body.changes[0].id,'SYNC-RETRY');
    await signed({mode:'ack',ids:['SYNC-RETRY']});
    assert.deepEqual((await signed(null)).body.changes,[]);
    assert.equal(database.prepare("SELECT attempt_count FROM control_system_outbox WHERE id='SYNC-RETRY'").get().attempt_count,2);
  } finally { database.close(); }
});

test("workbook validation failures leave the whole mapped record unchanged", async () => {
  const source = await readFile('assets/operations-control-system-sync.gs','utf8');
  const cells = [{value:'Old name'},{value:'Approved focus',allowed:['Approved focus']}];
  const writes=[];
  const headers=['Creator ID','Creator Name','Product Focus'];
  const sheet={getLastColumn:()=>3,getLastRow:()=>4,getRange(row,col,count){
    if(row===3) return {getDisplayValues:()=>[headers]};
    if(count) return {getDisplayValues:()=>[['CR-101','Old name','Approved focus']]};
    const cell=cells[col-2];
    return {getFormula:()=>'',getDataValidation:()=>cell.allowed ? {getAllowInvalid:()=>false,getCriteriaType:()=> 'LIST',getCriteriaValues:()=>[cell.allowed]} : null,setValue:value=>writes.push(value)};
  }};
  const context={SpreadsheetApp:{getActive:()=>({getSheetByName:()=>sheet}),DataValidationCriteria:{VALUE_IN_LIST:'LIST',VALUE_IN_RANGE:'RANGE'}}};
  runInNewContext(source,context);
  assert.throws(()=>context.upsertMappedRow_('🗺️CREATORS','Creator ID','CR-101',{'Creator Name':'New name','Product Focus':'Not approved'}),/not allowed/);
  assert.deepEqual(writes,[]);
  assert.throws(()=>context.upsertMappedRow_('🗺️CREATORS','Creator ID','CR-101',{'Missing field':'x'}),/Missing mapped column/);
  assert.deepEqual(writes,[]);
});

test("new assignment rows inherit source formulas and validation without another record's business values",async () => {
  const source=await readFile('assets/operations-control-system-sync.gs','utf8');
  const headers=['Assignment ID','Status','Product Scope','Platform','Fixed Content Fee ($)'];
  const values=new Map([[`4,1`,'ASG-100'],[`4,2`,'Active'],[`4,3`,'Existing scope'],[`4,4`,'Meta'],[`4,5`,50]]);
  const formulas=new Map([[`4,3`,'=CAMPAIGN_SCOPE(RC[-1])'],[`4,4`,'=CAMPAIGN_PLATFORM(RC[-2])']]);
  let formats=0,validations=0;
  const sheet={getLastColumn:()=>5,getLastRow:()=>4,getRange(row,col,rows,cols){
    if(row===3) return {getDisplayValues:()=>[headers]};
    if(rows>1 || (rows===1 && cols===5)) return {
      getDisplayValues:()=>[['ASG-100','Active','Existing scope','Meta','50']],
      copyTo:()=>{formats++;},getDataValidations:()=>[[null,null,null,null,null]],setDataValidations:()=>{validations++;}
    };
    const key=`${row},${col}`;
    return {getFormula:()=>formulas.get(key)||'',getFormulaR1C1:()=>formulas.get(key)||'',getDisplayValue:()=>values.get(key)||'',getDataValidation:()=>null,setValue:v=>values.set(key,v),setFormulaR1C1:f=>formulas.set(key,f)};
  }};
  const context={SpreadsheetApp:{getActive:()=>({getSheetByName:()=>sheet}),CopyPasteType:{PASTE_FORMAT:'FORMAT'}}};
  runInNewContext(source,context);
  context.upsertMappedRow_('CREATOR ASSIGNMENTS','Assignment ID','ASG-101',{'Status':'Not Started','Fixed Content Fee ($)':0});
  assert.equal(values.get('5,1'),'ASG-101');assert.equal(values.get('5,2'),'Not Started');assert.equal(values.get('5,5'),0);
  assert.equal(formulas.get('5,3'),formulas.get('4,3'));assert.equal(formulas.get('5,4'),formulas.get('4,4'));
  assert.equal(formats,1);assert.equal(validations,1);assert.equal(values.get('4,5'),50);
});

 test("unchanged source date formulas allow note edits but changed dates fail closed",async()=>{
  const source=await readFile('assets/operations-control-system-sync.gs','utf8');
  const writes=[]; const headers=['Assignment ID','Start Date','Notes'];
  const sheet={getLastColumn:()=>3,getLastRow:()=>4,getRange(row,col,rows){
    if(row===3)return {getDisplayValues:()=>[headers]};
    if(rows)return {getDisplayValues:()=>[['ASG-100','9/20/2026','Old']]};
    return {getFormula:()=>col===2?'=DATE(2026,9,20)':'',getDisplayValue:()=>col===2?'9/20/2026':'Old',getValue:()=>new Date('2026-09-20T10:00:00Z'),getDataValidation:()=>null,setValue:v=>writes.push(v)};
  }};
  const context={SpreadsheetApp:{getActive:()=>({getSheetByName:()=>sheet,getSpreadsheetTimeZone:()=> 'Pacific/Honolulu'})},Utilities:{formatDate:()=> '2026-09-20'}};
  runInNewContext(source,context);
  context.upsertMappedRow_('CREATOR ASSIGNMENTS','Assignment ID','ASG-100',{'Start Date':'2026-09-20','Notes':'New'});
  assert.deepEqual(writes,['New']);
  assert.throws(()=>context.upsertMappedRow_('CREATOR ASSIGNMENTS','Assignment ID','ASG-100',{'Start Date':'2026-09-21','Notes':'Changed'}),/Refusing to overwrite formula/);
  assert.deepEqual(writes,['New']);
});
