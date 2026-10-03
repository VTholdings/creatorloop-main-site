import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {fixture,call} from './helpers/operator-fixture.js';
import {onRequest} from '../functions/api/integrations/control-system.js';
async function signed(env,payload) {
 const raw=payload?JSON.stringify(payload):'',timestamp=String(Math.floor(Date.now()/1000));
 const response=await onRequest({env,request:new Request('https://ops.creatorloop.net/api/integrations/control-system',{method:payload?'POST':'GET',headers:{'X-CreatorLoop-Timestamp':timestamp,'X-CreatorLoop-Signature':createHmac('sha256',env.CONTROL_SYSTEM_SYNC_SECRET).update(timestamp+'.'+raw).digest('hex')},body:payload?raw:undefined})});
 return {status:response.status,body:await response.json()};
}
for(const governance of [false,true])test('signed operational round trip preserves pending escalation and immutable history; governance='+governance,async()=>{
 const {db,env}=await fixture();env.CONTROL_SYSTEM_SYNC_SECRET='ISOLATED-TEST-KEY';
 try{
  if(governance)for(const file of ['0005_team_directory','0006_audit_history','0007_team_governance']){db.exec('BEGIN');db.exec(await readFile('migrations/'+file+'.sql','utf8'));db.exec('COMMIT');}
  const payload={mode:'import',eventId:'source-queue-import-1',sourceVersion:'SOURCE-VERIFIED-1',operationalRecords:[{tab:'LAUNCH CONTROL',recordId:'LCH-200',campaignId:'CMP-100',fields:{'Owner Approval':'','Launch Status':'Blocked','Tracking Gate':'NOT VERIFIED','Rights Gate':'RIGHTS REQUIRED','Cash Budget ($)':999999}}]};
  assert.equal((await signed(env,payload)).status,200);assert.equal((await signed(env,payload)).body.replay,true);
  const queue=await call(env,'OPERATOR','GET','queues?campaignId=CMP-100');
  const gates=queue.body.stages.find(s=>s.name==='Launch Gate').items[0].fields;
  assert.equal(gates['Tracking Gate'],'NOT VERIFIED');assert.equal('Cash Budget ($)' in gates,false);
  const body={campaignId:'CMP-100',creatorId:'CR-200',type:'Creator Rights',severity:'Yellow',description:'Missing signed rights',evidenceLink:'https://example.com/training/evidence',eventId:'source-escalation-event-1'};
  assert.equal((await call(env,'OPERATOR','POST','escalations',body)).status,201);
  const exported=await signed(env,null);assert.equal(exported.status,200);
  const change=exported.body.changes.find(c=>c.entity_type==='DECISION');
  assert.equal(change.payload.fields.Type,'Creator Rights');assert.equal(change.payload.fields.Status,'In Progress');assert.equal('Decision' in change.payload.fields,false);
  assert.equal((await signed(env,null)).body.changes.find(c=>c.entity_type==='DECISION').id,change.id);
  const importedDecision={tab:'DECISIONS & BLOCKERS',recordId:change.entity_id,campaignId:'CMP-100',creatorId:'CR-200',fields:{...change.payload.fields,Status:'Resolved'}};
  const pending=db.prepare("SELECT * FROM console_source_records WHERE tab='DECISIONS & BLOCKERS' AND record_id=?").get(change.entity_id);
  assert.equal((await signed(env,{mode:'import',eventId:'conflicting-source-before-ack',sourceVersion:'SOURCE-FRESH-CONFLICT',operationalRecords:[importedDecision]})).status,200);
  assert.deepEqual(db.prepare("SELECT * FROM console_source_records WHERE tab='DECISIONS & BLOCKERS' AND record_id=?").get(change.entity_id),pending,'Pending export is not overwritten or falsely resolved');
  assert.equal((await signed(env,{mode:'ack',ids:[change.id]})).status,200);
  assert.equal((await signed(env,null)).body.changes.some(c=>c.id===change.id),false);
  const returned={mode:'import',eventId:'decision-source-confirmed-after-ack',sourceVersion:'SOURCE-ACKNOWLEDGED',operationalRecords:[importedDecision]};
  assert.equal((await signed(env,returned)).status,200);assert.equal((await signed(env,returned)).body.replay,true);
  const confirmed=db.prepare("SELECT * FROM console_source_records WHERE tab='DECISIONS & BLOCKERS' AND record_id=?").get(change.entity_id);assert.equal(JSON.parse(confirmed.fields_json).Status,'Resolved');assert.equal(confirmed.source_version,'SOURCE-ACKNOWLEDGED');
  assert.equal(db.prepare('SELECT status FROM console_source_outbox WHERE id=?').get(change.id).status,'ACKED');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='ESCALATION_CAPTURED'").get().n,1);
  if(governance){assert.equal(db.prepare("SELECT actor_role FROM console_audit_actor_snapshots JOIN audit_events ON event_id=id WHERE action='ESCALATION_CAPTURED'").get().actor_role,'OPERATOR');assert.throws(()=>db.exec('DELETE FROM audit_events'),/append-only/);}
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
