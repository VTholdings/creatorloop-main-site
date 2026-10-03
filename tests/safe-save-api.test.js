import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {fixture,call} from './helpers/operator-fixture.js';
import {onRequest as sync} from '../functions/api/integrations/control-system.js';

async function setup(){
 const f=await fixture();
 for(const name of ['0005_team_directory','0006_audit_history','0007_team_governance']){f.db.exec('BEGIN');f.db.exec(await readFile('migrations/'+name+'.sql','utf8'));f.db.exec('COMMIT');}
 f.db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('OP-MARKETING_CAMPAIGN_MANAGER','marketing_campaign_manager@example.com','Fictional manager','MARKETING_CAMPAIGN_MANAGER','ACTIVE');
 f.db.prepare("INSERT INTO console_team_profiles(operator_id,employment_status,training_status,lifecycle_status,updated_by,visibility_json) VALUES(?,'EMPLOYED','CERTIFIED','ACTIVE','OP-ADMINISTRATOR',?)").run('OP-MARKETING_CAMPAIGN_MANAGER',JSON.stringify(['financial_economics']));
 f.db.prepare("INSERT INTO console_access_grants(operator_id,campaign_id,record_id,granted_by) VALUES(?,'CMP-100','*','OP-ADMINISTRATOR')").run('OP-MARKETING_CAMPAIGN_MANAGER');
 return f;
}
async function revision(f,role='MARKETING_CAMPAIGN_MANAGER'){return (await call(f.env,role,'GET','campaigns/CMP-100')).body.editing.revision;}
async function importSource(f,collections,eventId='FRESH-SOURCE'){
 const secret='fictional-safe-save-signing-secret',timestamp=String(Math.floor(Date.now()/1000));
 const body=JSON.stringify({mode:'import',eventId,sourceVersion:eventId,...collections});
 return sync({env:{...f.env,CONTROL_SYSTEM_SYNC_SECRET:secret},request:new Request('https://ops.creatorloop.net/api/integrations/control-system',{method:'POST',body,headers:{'X-CreatorLoop-Timestamp':timestamp,'X-CreatorLoop-Signature':createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex')}})});
}
async function bridge(f,payload){
 const secret='fictional-safe-save-signing-secret',timestamp=String(Math.floor(Date.now()/1000)),body=payload?JSON.stringify(payload):'';
 return sync({env:{...f.env,CONTROL_SYSTEM_SYNC_SECRET:secret},request:new Request('https://ops.creatorloop.net/api/integrations/control-system',{method:payload?'POST':'GET',...(payload?{body}:{}),headers:{'X-CreatorLoop-Timestamp':timestamp,'X-CreatorLoop-Signature':createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex')}})});
}
test('permitted creator Save commits exact before/after values with immutable actor history',async()=>{
 const f=await setup();
 const result=await call(f.env,'OPERATOR','PATCH','creators/CR-200',{version:1,notes:'  Verified delivery  ',handle:'@updated'});
 assert.equal(result.status,200);
 const audit=f.db.prepare("SELECT * FROM audit_events WHERE action='CREATOR_ENROLLMENT_UPDATED'").get();
 assert.equal(JSON.parse(audit.previous_value).handle,'@CR-200');assert.equal(JSON.parse(audit.new_value).handle,'@updated');assert.equal(JSON.parse(audit.new_value).notes,'Verified delivery');
 assert.equal(f.db.prepare('SELECT actor_role FROM console_audit_actor_snapshots WHERE event_id=?').get(audit.id).actor_role,'OPERATOR');
 assert.throws(()=>f.db.prepare('DELETE FROM audit_events WHERE id=?').run(audit.id),/append-only/);
});
test('normal Save rejects governed fields, locked identities, out-of-scope records and QA field injection',async()=>{
 const f=await setup();const before=f.db.prepare("SELECT * FROM creator_enrollments WHERE id='CR-200'").get();
 for(const body of [{rightsStatus:'Paid Usage Approved'},{compensationModel:'Performance'},{campaignId:'CMP-200'},{ownerApproval:'Approved'},{action:'AWAITING_QA',rightsStatus:'Paid Usage Approved'}])assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-200',{version:1,...body})).status,403);
 assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-201',{version:1,notes:'Forbidden'})).status,403);
 assert.equal((await call(f.env,'OPERATOR','PATCH','assignments/ASG-200',{version:1,environment:'PRODUCTION'})).status,403);
 f.db.prepare("UPDATE creator_enrollments SET workflow_status='AWAITING_QA' WHERE id='CR-200'").run();
 assert.equal((await call(f.env,'QA_REVIEWER','POST','qa/CR-200',{version:1,result:'HOLD',notes:'Check evidence',fixedContentFee:99})).status,403);
 f.db.prepare("UPDATE creator_enrollments SET workflow_status='IN_PROGRESS' WHERE id='CR-200'").run();assert.deepEqual(f.db.prepare("SELECT * FROM creator_enrollments WHERE id='CR-200'").get(),before);
});
test('reviewed Owner Save records governed values only with an exact separate authorization',async()=>{
 const f=await setup(),body={saveIntent:'REVIEWED_RECORD_EDIT',version:1,fixedContentFee:75};
 assert.equal((await call(f.env,'ADMINISTRATOR','PATCH','assignments/ASG-200',body)).status,403);
 assert.equal((await call(f.env,'ADMINISTRATOR','PATCH','assignments/ASG-200',{version:1,fixedContentFee:75})).status,403,'Omitting the UI marker cannot bypass separate approval');
 const approval=await call(f.env,'ADMINISTRATOR','POST','authorizations',{campaignId:'CMP-100',entityType:'ASSIGNMENT',entityId:'ASG-200',values:{fixedContentFee:75},evidenceLink:'https://example.com/owner-decision'});
 assert.equal(approval.status,201);
 assert.equal((await call(f.env,'ADMINISTRATOR','PATCH','assignments/ASG-200',{...body,fixedContentFee:76,authorizationId:approval.body.id})).status,403);
 assert.equal((await call(f.env,'ADMINISTRATOR','PATCH','assignments/ASG-200',{...body,authorizationId:approval.body.id})).status,200);
 const audit=f.db.prepare("SELECT * FROM audit_events WHERE action='CREATOR_ASSIGNMENT_UPDATED'").get();assert.equal(JSON.parse(audit.previous_value).fixedContentFee,50);assert.equal(JSON.parse(audit.new_value).fixedContentFee,75);
});
test('revoked permission before Save and stale versions reject without changes or audit',async()=>{
 const f=await setup();
 f.db.prepare("UPDATE operators SET account_status='SUSPENDED' WHERE id='OP-OPERATOR'").run();
 assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-200',{version:1,notes:'No'})).status,403);
 f.db.prepare("UPDATE operators SET account_status='ACTIVE' WHERE id='OP-OPERATOR'").run();
 assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-200',{version:1,notes:'First'})).status,200);
 assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-200',{version:1,notes:'Stale'})).status,409);
 assert.equal(f.db.prepare("SELECT notes FROM creator_enrollments WHERE id='CR-200'").get().notes,'First');
 assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='CREATOR_ENROLLMENT_UPDATED'").get().n,1);
});
test('scope removed between validation and commit blocks Save atomically',async()=>{
 const f=await setup(),original=f.env.OPERATIONS_DB.batch.bind(f.env.OPERATIONS_DB);
 // Managed scope prevents historical assignments from restoring the revoked grant.
 f.db.prepare("INSERT INTO console_team_profiles(operator_id,employment_status,lifecycle_status,updated_by,visibility_json) VALUES('OP-OPERATOR','EMPLOYED','ACTIVE','OP-ADMINISTRATOR','[\"creator_pii\",\"creator_compensation\"]')").run();
 f.env.OPERATIONS_DB.batch=statements=>{f.db.prepare("DELETE FROM console_access_grants WHERE operator_id='OP-OPERATOR'").run();return original(statements);};
 assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-200',{version:1,notes:'Must not commit'})).status,403);
 assert.equal(f.db.prepare("SELECT notes FROM creator_enrollments WHERE id='CR-200'").get().notes,null);
 assert.equal(f.db.prepare('SELECT count(*) n FROM audit_events').get().n,0);
});
test('authorization revoked after validation cannot commit an approved scheduling Save',async()=>{
 const f=await setup();
 const values={contentDue:'2026-10-20'};
 const approval=await call(f.env,'ADMINISTRATOR','POST','authorizations',{campaignId:'CMP-100',entityType:'ASSIGNMENT',entityId:'ASG-200',values,evidenceLink:'https://example.com/decision'});
 assert.equal(approval.status,201);
 const original=f.env.OPERATIONS_DB.batch.bind(f.env.OPERATIONS_DB);
 f.env.OPERATIONS_DB.batch=statements=>{f.db.prepare('UPDATE console_authorizations SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').run(approval.body.id);return original(statements);};
 assert.equal((await call(f.env,'OPERATOR','PATCH','assignments/ASG-200',{version:1,...values,authorizationId:approval.body.id})).status,403);
 assert.equal(f.db.prepare("SELECT content_due FROM creator_assignments WHERE id='ASG-200'").get().content_due,null);
});
test('campaign Notes require approved role, whole campaign scope and visibility; governed changes are denied',async()=>{
 const f=await setup(),rev=await revision(f);
 assert.equal((await call(f.env,'OPERATOR','PATCH','campaigns/CMP-100',{revision:rev,notes:'No'})).status,403);
 for(const body of [{cashBudget:900},{status:'LIVE'},{productScope:'Replacement'},{approvalAuthority:'Owner'}])assert.equal((await call(f.env,'MARKETING_CAMPAIGN_MANAGER','PATCH','campaigns/CMP-100',{revision:rev,notes:'No',...body})).status,403);
 assert.equal((await call(f.env,'MARKETING_CAMPAIGN_MANAGER','PATCH','campaigns/CMP-200',{revision:rev,notes:'No'})).status,403);
 assert.equal((await call(f.env,'MARKETING_CAMPAIGN_MANAGER','PATCH','campaigns/CMP-100',{revision:rev,notes:'Operational delivery note'})).status,200);
 const event=f.db.prepare("SELECT * FROM audit_events WHERE object_type='Campaign'").get();assert.equal(JSON.parse(event.previous_value).notes,'PRIVATE MANAGEMENT NOTES');assert.equal(JSON.parse(event.new_value).notes,'Operational delivery note');
 assert.equal(f.db.prepare("SELECT cash_budget FROM campaigns WHERE id='CMP-100'").get().cash_budget,777);
 assert.equal((await call(f.env,'MARKETING_CAMPAIGN_MANAGER','PATCH','campaigns/CMP-100',{revision:rev,notes:'Stale'})).status,409);
});
test('campaign source changes and scope removal at commit invalidate reviewed Notes safely',async()=>{
 const f=await setup(),rev=await revision(f);
 f.db.prepare("UPDATE campaigns SET objective='Changed upstream' WHERE id='CMP-100'").run();
 assert.equal((await call(f.env,'MARKETING_CAMPAIGN_MANAGER','PATCH','campaigns/CMP-100',{revision:rev,notes:'Stale'})).status,409);
 const fresh=await revision(f),original=f.env.OPERATIONS_DB.batch.bind(f.env.OPERATIONS_DB);
 f.env.OPERATIONS_DB.batch=statements=>{f.db.prepare("DELETE FROM console_access_grants WHERE operator_id='OP-MARKETING_CAMPAIGN_MANAGER'").run();return original(statements);};
 assert.equal((await call(f.env,'MARKETING_CAMPAIGN_MANAGER','PATCH','campaigns/CMP-100',{revision:fresh,notes:'No'})).status,403);
 assert.equal(f.db.prepare("SELECT notes FROM campaigns WHERE id='CMP-100'").get().notes,'PRIVATE MANAGEMENT NOTES');
});
test('signed source imports invalidate creator/assignment edit versions and preserve pending campaign Notes',async()=>{
 const f=await setup(),rev=await revision(f);
 assert.equal((await call(f.env,'ADMINISTRATOR','PATCH','campaigns/CMP-100',{revision:rev,notes:'Pending local Notes'})).status,200);
 const result=await importSource(f,{campaigns:[{id:'CMP-100',name:'Source name',status:'IN_PROGRESS',notes:'Older source Notes'}],creators:[{id:'CR-200',campaignId:'CMP-100',creatorName:'Updated source',primaryPlatform:'TikTok',handle:'@CR-200',contact:'CR-200@example.com',creatorStatus:'In Progress',compensationModel:'N/A',rightsStatus:'Not Reviewed',productFocus:'PNB_META_ACQ_3ITEMS_202609 — 3-product campaign'}],assignments:[{id:'ASG-200',creatorId:'CR-200',campaignId:'CMP-100',environment:'TEST',status:'In Progress'}]});
 assert.equal(result.status,200,await result.text());
 assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-200',{version:1,notes:'Stale source edit'})).status,409);
 assert.equal((await call(f.env,'OPERATOR','PATCH','assignments/ASG-200',{version:1,notes:'Stale source edit'})).status,409);
 assert.equal(f.db.prepare("SELECT notes FROM campaigns WHERE id='CMP-100'").get().notes,'Pending local Notes');
});
test('campaign Notes signed export/retry/acknowledgement/reimport keeps committed audit and original authority',async()=>{
 const f=await setup(),rev=await revision(f);
 assert.equal((await call(f.env,'MARKETING_CAMPAIGN_MANAGER','PATCH','campaigns/CMP-100',{revision:rev,notes:'Verified source Notes'})).status,200);
 const first=await (await bridge(f)).json(),retry=await (await bridge(f)).json();
 assert.equal(first.changes.length,1);assert.equal(retry.changes[0].id,first.changes[0].id);assert.equal(first.changes[0].action,'NOTES_ONLY');assert.equal(first.changes[0].payload.previousNotes,'PRIVATE MANAGEMENT NOTES');
 const audit=f.db.prepare("SELECT * FROM audit_events WHERE object_type='Campaign'").get();
 assert.equal((await bridge(f,{mode:'ack',ids:[first.changes[0].id]})).status,200);
 assert.equal((await (await bridge(f)).json()).changes.length,0);
 assert.equal((await importSource(f,{campaigns:[{id:'CMP-100',name:'Confirmed source campaign',status:'IN_PROGRESS',cashBudget:777,notes:'Verified source Notes'}]},'CONFIRMED-NOTES')).status,200);
 assert.equal(f.db.prepare("SELECT notes FROM campaigns WHERE id='CMP-100'").get().notes,'Verified source Notes');
 assert.deepEqual(f.db.prepare('SELECT * FROM audit_events WHERE id=?').get(audit.id),audit);
 assert.equal(f.db.prepare('SELECT actor_role FROM console_audit_actor_snapshots WHERE event_id=?').get(audit.id).actor_role,'MARKETING_CAMPAIGN_MANAGER');
});
test('reviewed Save fails closed before governance migration instead of losing commit guards',async()=>{
 const f=await fixture();assert.equal((await call(f.env,'OPERATOR','PATCH','creators/CR-200',{saveIntent:'REVIEWED_RECORD_EDIT',version:1,notes:'No unguarded write'})).status,503);assert.equal(f.db.prepare("SELECT notes FROM creator_enrollments WHERE id='CR-200'").get().notes,null);
});
