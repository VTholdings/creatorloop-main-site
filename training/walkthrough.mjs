import {verifier} from '../tests/helpers/admission-fixture.js';
// Isolated API training fixture; never opens a production DB or external connection.
// Run from the repository root: node training/walkthrough.mjs
import assert from 'node:assert/strict';
import {fixture,call} from '../tests/helpers/operator-fixture.js';
import {onRequest as signedSync} from '../functions/api/integrations/control-system.js';
export async function walkthrough() {
 const {db,env}=await fixture();await verifier({env},'TRAINING');
 const steps=[];
 const source=(tab,id,fields,creatorId='CR-200')=>db.prepare('INSERT INTO console_source_records(tab,record_id,campaign_id,creator_id,fields_json,source_version,source_updated_at) VALUES(?,?,?,?,?,?,?)').run(tab,id,'CMP-100',creatorId,JSON.stringify(fields),'TRAINING-FIXTURE',new Date().toISOString());
 try{
  source('Creator Loop: Sign Up Form (Responses)','TRAINING-RESPONSE-1',{'Timestamp':'2026-10-01','Name:':'Fictional CR-200','Email:':'cr200@example.com','Verification Status':'Pending','Approved Y/N':'','Notes':'TRAINING ONLY'});
  source('LAUNCH CONTROL','LCH-200',{'Launch ID':'LCH-200','Campaign ID':'CMP-100','Launch Status':'Blocked','Pre-Launch QA':'READY','Economics Gate':'READY','Tracking Gate':'NOT VERIFIED','Rights Gate':'RIGHTS REQUIRED','Budget Gate':'READY','Owner Approval':''},null);
  source('DATA INTAKE','TEST-TRAINING-1',{'Import Batch':'TEST-TRAINING-1','Campaign ID':'CMP-100','Creator ID':'CR-200','Source Platform':'Meta','Spend ($)':'0','Purchases':'0','Revenue ($)':'0','Notes':'SIMULATED; no financial facts'});
  source('CREATOR PERFORMANCE','CR-200',{'Creator ID':'CR-200','Status':'In Progress','Decision':'Hold','Notes':'TRAINING ONLY'});
  let queues=await call(env,'OPERATOR','GET','queues?campaignId=CMP-100');
  assert.equal(queues.status,200);assert.equal(queues.body.stages[0].items.length,1);steps.push('Receive Submission: assigned fictional intake visible');
  assert.equal((await call(env,'OPERATOR','PATCH','creators/CR-200',{notes:'TRAINING — identity and submission evidence verified',version:1})).status,200);steps.push('Process: factual update attributed to individual OPERATOR');
  assert.equal((await call(env,'OPERATOR','PATCH','creators/CR-200',{action:'AWAITING_QA',version:2})).status,200);
  assert.equal((await call(env,'OPERATOR','POST','qa/CR-200',{result:'PASS',version:3})).status,403);
  assert.equal((await call(env,'QA_REVIEWER','POST','qa/CR-200',{result:'PASS',version:3})).status,200);steps.push('QA: authorized review; operator approval denied');
  const escalation={campaignId:'CMP-100',creatorId:'CR-200',type:'Creator Rights',severity:'Yellow',description:'TRAINING — signed rights evidence is missing',evidenceLink:'https://example.com/training/intake',eventId:'training-required-escalation'};
  const created=await call(env,'OPERATOR','POST','escalations',escalation);assert.equal(created.status,201);
  assert.equal((await call(env,'OPERATOR','POST','escalations',escalation)).body.replay,true);steps.push('Escalate: source-named blocker and idempotent capture');
  assert.equal((await call(env,'OPERATOR','PATCH','assignments/ASG-200',{status:'Live',version:1})).status,403);
  assert.equal((await call(env,'ADMINISTRATOR','PATCH','assignments/ASG-200',{status:'Live',version:1})).status,403);steps.push('Launch Gate: blocked source gate prevents operator and Owner bypass');
  queues=await call(env,'OPERATOR','GET','queues?campaignId=CMP-100');assert.equal('Spend ($)' in queues.body.stages.find(s=>s.name==='Monitor').items[0].fields,false);
  const ownerQueues=await call(env,'ADMINISTRATOR','GET','queues?campaignId=CMP-100');assert.equal(ownerQueues.body.stages.find(s=>s.name==='Monitor').items[0].fields['Spend ($)'],'0');steps.push('Monitor: operator facts exclude restricted economics; Owner verifies simulated zero spend; no platform action');
  assert.equal((await call(env,'OPERATOR','PATCH','assignments/ASG-200',{status:'Complete',version:1})).status,403);
  assert.equal((await call(env,'ADMINISTRATOR','PATCH','assignments/ASG-200',{status:'Complete',notes:'TRAINING — closeout verified; no payment or next spend authorized',version:1})).status,200);steps.push('Close Out: Owner records verified closeout; operator cannot originate approval');
  const sync=await signedSync({env,request:new Request('https://ops.creatorloop.net/api/integrations/control-system')});assert.equal(sync.status,403);steps.push('Isolation: production synchronization denied in TRAINING');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  return {environment:'Isolated in-memory SQLite; same API, schema and role enforcement',productionWrites:0,externalActions:0,steps,result:'PASS — isolated API walkthrough; hosted employee sandbox and live authentication are still pending'};
 }finally{db.close();}
}
if(process.argv[1]?.endsWith('walkthrough.mjs'))console.log(JSON.stringify(await walkthrough(),null,2));
