import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,call} from './helpers/operator-fixture.js';
const roles=['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','ADMINISTRATOR'];
for(const role of roles)test(role+' enforces assigned reads and administration boundaries',async()=>{
 const {db,env}=await fixture();
 try{
  const creators=await call(env,role,'GET','creators');
  assert.deepEqual(creators.body.creators.map(r=>r.id).sort(),role==='ADMINISTRATOR'?['CR-100','CR-200','CR-201','CR-202']:['CR-200']);
  assert.equal((await call(env,role,'GET','creators/CR-201')).status,role==='ADMINISTRATOR'?200:403);
  assert.equal((await call(env,role,'GET','campaigns/CMP-200')).status,role==='ADMINISTRATOR'?200:403);
  const dashboard=await call(env,role,'GET','dashboard?campaignId=CMP-100');
  assert.equal(dashboard.status,200);
  assert.equal('cash_budget' in dashboard.body.campaign,role==='ADMINISTRATOR');
  assert.equal('notes' in dashboard.body.campaign,role==='ADMINISTRATOR');
  assert.equal(dashboard.body.counts.IN_PROGRESS,role==='ADMINISTRATOR'?2:1);
  for(const path of ['audit','system'])assert.equal((await call(env,role,'GET',path)).status,role==='ADMINISTRATOR'?200:403);
  const access=await call(env,role,'POST','access',{action:'grant',campaignId:'CMP-100',operatorId:'OP-OPERATOR',recordId:'CR-201'});
  assert.equal(access.status,role==='ADMINISTRATOR'?200:403);
 }finally{db.close();}
});
for(const role of roles)test(role+' allows only its factual and QA actions',async()=>{
 const {db,env}=await fixture();
 try{
  const update=await call(env,role,'PATCH','creators/CR-200',{notes:'Factual training note',version:1});
  assert.equal(update.status,['OPERATOR','OPERATIONS','ADMINISTRATOR'].includes(role)?200:403);
  db.prepare("UPDATE creator_enrollments SET workflow_status='AWAITING_QA' WHERE id='CR-200'").run();
  const version=db.prepare("SELECT version FROM creator_enrollments WHERE id='CR-200'").get().version;
  const qa=await call(env,role,'POST','qa/CR-200',{result:'PASS',version});
  assert.equal(qa.status,role==='OPERATOR'?403:200);
  assert.equal(db.prepare("SELECT assigned_operator_id FROM creator_enrollments WHERE id='CR-200'").get().assigned_operator_id,['OPERATOR','OPERATIONS','ADMINISTRATOR'].includes(role)?'OP-'+role:null);
  assert.equal((await call(env,role,'PATCH','assignments/ASG-200',{status:'Live',version:1})).status,403);
 }finally{db.close();}
});
for(const role of roles)test(role+' cannot originate restricted business decisions outside authority',async()=>{
 const {db,env}=await fixture();
 try{
  const before=db.prepare("SELECT * FROM creator_assignments WHERE id='ASG-200'").get();
  const response=await call(env,role,'PATCH','assignments/ASG-200',{fixedContentFee:123,commissionRate:.5,paidUsageRights:'Yes',signedRightsEvidenceLink:'https://example.com/fake-authority',version:1});
  assert.equal(response.status,role==='ADMINISTRATOR'?200:403);
  if(role!=='ADMINISTRATOR')assert.deepEqual(db.prepare("SELECT * FROM creator_assignments WHERE id='ASG-200'").get(),before);
  assert.equal((await call(env,role,'PATCH','assignments/ASG-200',{ownerApproval:'Approved',version:1})).status,403);
  const terms=(await call(env,role,'GET','creators/CR-200')).body.assignments[0];
  assert.equal('fixed_content_fee' in terms,role!=='QA_REVIEWER');
 }finally{db.close();}
});
test('OPERATIONS records exact authorized values; altered, expired, wrong-record and fabricated authority fail',async()=>{
 const {db,env}=await fixture();
 try{
  const values={fixedContentFee:75,paidUsageRights:'Yes',signedRightsEvidenceLink:'https://example.com/training/agreement',evidenceStatus:'Verified'};
  const approved=await call(env,'ADMINISTRATOR','POST','authorizations',{campaignId:'CMP-100',entityType:'ASSIGNMENT',entityId:'ASG-200',values,evidenceLink:'https://example.com/training/decision'});
  assert.equal(approved.status,201);
  for(const payload of [{...values,fixedContentFee:76},{...values,authorizationId:'fake'}])assert.equal((await call(env,'OPERATIONS','PATCH','assignments/ASG-200',{authorizationId:approved.body.id,...payload,version:1})).status,403);
  const recorded=await call(env,'OPERATIONS','PATCH','assignments/ASG-200',{...values,authorizationId:approved.body.id,version:1});
  assert.equal(recorded.status,200);
  assert.equal(db.prepare("SELECT fixed_content_fee FROM creator_assignments WHERE id='ASG-200'").get().fixed_content_fee,75);
  db.prepare('UPDATE console_authorizations SET expires_at=? WHERE id=?').run('2020-01-01',approved.body.id);
  assert.equal((await call(env,'OPERATIONS','PATCH','assignments/ASG-200',{fixedContentFee:75,paidUsageRights:'No',authorizationId:approved.body.id,version:2})).status,403);
 }finally{db.close();}
});
test('APPROVAL_AUTHORITY requires field-specific Owner delegation and cannot delegate Owner Approval',async()=>{
 const {db,env}=await fixture();
 try{
  const body={campaignId:'CMP-100',entityType:'ASSIGNMENT',entityId:'ASG-200',values:{fixedContentFee:75},evidenceLink:'https://example.com/training/decision'};
  assert.equal((await call(env,'APPROVAL_AUTHORITY','POST','authorizations',body)).status,403);
  assert.equal((await call(env,'ADMINISTRATOR','POST','access',{action:'delegate',campaignId:'CMP-100',operatorId:'OP-APPROVAL_AUTHORITY',fieldKey:'fixedContentFee',expiresAt:'2099-01-01'})).status,200);
  assert.equal((await call(env,'APPROVAL_AUTHORITY','POST','authorizations',body)).status,201);
  assert.equal((await call(env,'APPROVAL_AUTHORITY','POST','authorizations',{...body,values:{paidUsageRights:'Yes'}})).status,403);
  assert.equal((await call(env,'APPROVAL_AUTHORITY','POST','authorizations',{...body,values:{ownerApproval:'Yes'}})).status,403);
 }finally{db.close();}
});
test('record grants do not authorize creating unrelated records; attempted relationship and ownership changes fail',async()=>{
 const {db,env}=await fixture();
 try{
  assert.equal((await call(env,'OPERATOR','POST','creators',{campaignId:'CMP-100'})).status,403);
  for(const payload of [{campaignId:'CMP-200'},{assigned_operator_id:'OP-ADMINISTRATOR'},{creatorId:'CR-202'}])assert.equal((await call(env,'OPERATOR','PATCH','assignments/ASG-200',{...payload,version:1})).status,403);
 }finally{db.close();}
});
test('support is never newly provisioned, disabling preserves historical identity and requires an individual administrator',async()=>{
 const {db,env}=await fixture();
 try{
  assert.equal((await call(env,'ADMINISTRATOR','POST','access',{action:'provision',campaignId:'CMP-100',email:'support@creatorloop.net',role:'ADMINISTRATOR'})).status,422);
  db.prepare("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('OP-OLD','support@creatorloop.net','Historical shared identity','ADMINISTRATOR','ACTIVE')").run();
  assert.equal((await call(env,'ADMINISTRATOR','POST','access',{action:'disable',campaignId:'CMP-100',operatorId:'OP-OLD'})).status,200);
  assert.deepEqual({...db.prepare("SELECT id,login_email,account_status FROM operators WHERE id='OP-OLD'").get()},{id:'OP-OLD',login_email:'support@creatorloop.net',account_status:'DISABLED'});
 }finally{db.close();}
});
test('source queues preserve canonical fields and hide another assigned creator’s escalation',async()=>{
 const {db,env}=await fixture();
 try{
  for(const id of ['CR-200','CR-201'])db.prepare('INSERT INTO console_source_records(tab,record_id,campaign_id,fields_json,source_version,source_updated_at) VALUES(?,?,?,?,?,?)').run('DECISIONS & BLOCKERS','DEC-'+id,'CMP-100',JSON.stringify({'Related ID':id,'Type':'Creator Rights','Status':'In Progress','Decision Needed / Blocker':id+' blocker'}),'SOURCE-TEST',new Date().toISOString());
  const queues=await call(env,'OPERATOR','GET','queues?campaignId=CMP-100');
  assert.equal(queues.status,200);assert.equal(queues.body.stages.find(s=>s.name==='Escalate').items.length,1);
  assert.equal(queues.body.stages.find(s=>s.name==='Escalate').items[0].fields['Related ID'],'CR-200');
 }finally{db.close();}
});
test('Owner Status change requires verified source launch gates, not a client supplied approval',async()=>{
 const {db,env}=await fixture();
 try{
  assert.equal((await call(env,'ADMINISTRATOR','PATCH','assignments/ASG-200',{status:'Live',version:1})).status,403);
  const fields={'Owner Approval':'Approved','Launch Status':'Approved','Pre-Launch QA':'READY','Economics Gate':'READY','Tracking Gate':'VERIFIED','Rights Gate':'VERIFIED','Budget Gate':'READY'};
  db.prepare('INSERT INTO console_source_records(tab,record_id,campaign_id,fields_json,source_version,source_updated_at) VALUES(?,?,?,?,?,?)').run('LAUNCH CONTROL','LCH-200','CMP-100',JSON.stringify(fields),'TRAINING-ONLY',new Date().toISOString());
  assert.equal((await call(env,'OPERATOR','PATCH','assignments/ASG-200',{status:'Live',version:1})).status,403);
  assert.equal((await call(env,'ADMINISTRATOR','PATCH','assignments/ASG-200',{status:'Live',version:1})).status,200);
 }finally{db.close();}
});
