import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './helpers/operator-fixture.js';
import {onRequest} from '../functions/api/console/[[path]].js';
import {TEAM_ROLES} from '../functions/api/team-policy.js';
async function setup() {
 const f=await fixture();
 f.db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('OP-OWNER','team@creatorloop.net','Fictional Owner','ADMINISTRATOR','ACTIVE');
 f.db.exec(await readFile('migrations/0005_team_directory.sql','utf8'));
 f.db.exec(await readFile('migrations/0006_audit_history.sql','utf8'));
 f.db.exec('BEGIN');f.db.exec(await readFile('migrations/0007_team_governance.sql','utf8'));f.db.exec('COMMIT');
 return f;
}
// These fixtures simulate validated middleware context, not live Cloudflare admission.
async function request(f,method,path,body,email='team@creatorloop.net',issuedAt) {
 const p=f.db.prepare('SELECT p.auth_not_before FROM console_team_profiles p JOIN operators o ON o.id=p.operator_id WHERE o.login_email=?').get(email);
 const response=await onRequest({env:f.env,data:{loginEmail:email,accessIssuedAt:issuedAt??Math.max(Math.floor(Date.now()/1000),p?.auth_not_before||0)},params:{path:path.split('?')[0].split('/')},request:new Request('https://ops.creatorloop.net/api/console/'+path,{method,headers:method==='GET'?{}:{Origin:'https://ops.creatorloop.net','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})});
 return {status:response.status,body:await response.json(),headers:response.headers};
}
async function add(f,role='OPERATOR',scopes=[{campaignId:'CMP-100',recordId:'CR-200'}]) {
 const email=role.toLowerCase()+'.person@example.com';
 const result=await request(f,'POST','team',{action:'addPending',fullName:'Fictional '+role,email,role,employmentStatus:'EMPLOYED',scopes,...(role==='TECHNICIAN'?{technicalLevel:f.env.CONSOLE_ENVIRONMENT==='TRAINING'?'TRAINING':'PRODUCTION_SUPPORT'}:{})});
 assert.equal(result.status,201,JSON.stringify(result.body));return {id:result.body.id,email};
}
async function change(f,person,action,extra={}) {
 const p=f.db.prepare('SELECT version FROM console_team_profiles WHERE operator_id=?').get(person.id);
 return request(f,'POST','team',{action,operatorId:person.id,version:p?.version||0,reason:'Fictional authorization for isolated test',...extra});
}
async function activate(f,person) {
 assert.equal((await change(f,person,'startTraining')).status,200);
 assert.equal((await change(f,person,'certify',{attestation:true,evidenceLink:'https://example.com/fictional-certification'})).status,200);
 f.env.HUMAN_PROVISIONING_MODE='REGISTRY_VERIFIED'; // Test configuration only; never production evidence.
 assert.equal((await change(f,person,'activate')).status,200);
}
test('expanded role migration preserves all original rows and foreign keys, including attributed history',async()=>{
 const f=await fixture();
 f.db.exec(await readFile('migrations/0005_team_directory.sql','utf8'));
 f.db.prepare("UPDATE creator_enrollments SET assigned_operator_id='OP-OPERATOR' WHERE id='CR-200'").run();
 f.db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').run('AUD-LEGACY','OP-OPERATOR','CMP-100','NOTE','CreatorEnrollment','CR-200','Original immutable note');
 const tables=f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'schema_migrations'").all().map(r=>r.name);
 const before=new Map(tables.map(table=>[table,f.db.prepare('SELECT * FROM '+table).all()]));
 f.db.exec(await readFile('migrations/0006_audit_history.sql','utf8'));
 f.db.exec('BEGIN');f.db.exec(await readFile('migrations/0007_team_governance.sql','utf8'));f.db.exec('COMMIT');
 for(const table of tables){const rows=f.db.prepare('SELECT * FROM '+table).all();for(let i=0;i<rows.length;i++)for(const key of Object.keys(before.get(table)[i]))assert.equal(rows[i][key],before.get(table)[i][key],table+'.'+key);assert.equal(rows.length,before.get(table).length);}
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(f.db.prepare('SELECT count(*) n FROM console_audit_actor_snapshots').get().n,0,'No fabricated historical snapshot');
});
test('every approved job role starts individually invited and inactive, without implicit authority',async()=>{
 const f=await setup();
 for(const role of TEAM_ROLES){const person=await add(f,role);assert.equal((await request(f,'GET','me',undefined,person.email)).status,403);assert.equal(f.db.prepare('SELECT count(*) n FROM console_approval_delegations WHERE operator_id=?').get(person.id).n,0);assert.equal(f.db.prepare('SELECT lifecycle_status FROM console_team_profiles WHERE operator_id=?').get(person.id).lifecycle_status,'INVITED');}
});
test('training and certification do not confer production access; activation requires a verified external gate',async()=>{
 const f=await setup(),person=await add(f);
 assert.equal((await change(f,person,'activate')).status,503);
 assert.equal((await change(f,person,'startTraining')).status,200);
 assert.equal((await request(f,'GET','me',undefined,person.email)).status,403);
 assert.equal((await change(f,person,'certify',{attestation:false,evidenceLink:'https://example.com/evidence'})).status,422);
 assert.equal((await change(f,person,'certify',{attestation:true,evidenceLink:'https://example.com/evidence'})).status,200);
 assert.equal((await request(f,'GET','me',undefined,person.email)).status,403);
 assert.equal((await change(f,person,'activate')).status,503);
 f.env.HUMAN_PROVISIONING_MODE='REGISTRY_VERIFIED';
 assert.equal((await change(f,person,'activate')).status,200);
 assert.equal((await request(f,'GET','me',undefined,person.email,0)).body.code,'REAUTHENTICATE');
 assert.equal((await request(f,'GET','creators/CR-200',undefined,person.email)).status,200);
});
test('suspension and deactivation block active sessions while preserving notes, attribution, audits and identity',async()=>{
 const f=await setup(),person=await add(f);await activate(f,person);
 f.db.prepare('UPDATE creator_enrollments SET assigned_operator_id=? WHERE id=?').run(person.id,'CR-200');
 const before=f.db.prepare("SELECT * FROM creator_enrollments WHERE id='CR-200'").get();
 assert.equal((await change(f,person,'suspend')).status,200);
 assert.equal((await request(f,'GET','creators/CR-200',undefined,person.email)).status,403);
 assert.equal((await change(f,person,'activate')).status,200);
 assert.equal((await change(f,person,'deactivate')).status,200);
 assert.equal((await request(f,'GET','me',undefined,person.email)).status,403);
 assert.deepEqual(f.db.prepare("SELECT * FROM creator_enrollments WHERE id='CR-200'").get(),before);
 assert.equal(f.db.prepare('SELECT edge_revocation_status FROM console_team_profiles WHERE operator_id=?').get(person.id).edge_revocation_status,'PENDING_VERIFICATION');
 assert.ok(f.db.prepare('SELECT * FROM operators WHERE id=?').get(person.id));
 assert.ok(f.db.prepare('SELECT count(*) n FROM console_team_events WHERE target_operator_id=?').get(person.id).n>=6);
});
test('scope revocation invalidates old tokens and cannot be bypassed by historical record assignment',async()=>{
 const f=await setup(),person=await add(f);await activate(f,person);
 f.db.prepare('UPDATE creator_enrollments SET assigned_operator_id=? WHERE id=?').run(person.id,'CR-200');
 assert.equal((await change(f,person,'editScope',{scopes:[],systems:[]})).status,200);
 assert.equal((await request(f,'GET','creators/CR-200',undefined,person.email,0)).body.code,'REAUTHENTICATE');
 assert.equal((await request(f,'GET','creators/CR-200',undefined,person.email)).status,403);
 assert.equal(f.db.prepare("SELECT assigned_operator_id FROM creator_enrollments WHERE id='CR-200'").get().assigned_operator_id,person.id);
});
test('role changes require recertification and clear authority without rewriting the old actor role',async()=>{
 const f=await setup(),person=await add(f);await activate(f,person);
 assert.equal((await request(f,'PATCH','creators/CR-200',{version:1,notes:'Fictional old-role action'},person.email)).status,200);
 const audit=f.db.prepare("SELECT * FROM audit_events WHERE operator_id=? AND object_id='CR-200'").get(person.id);
 assert.equal((await change(f,person,'changeRole',{role:'OPERATIONS_MANAGER'})).status,200);
 assert.equal((await request(f,'GET','me',undefined,person.email)).status,403);
 assert.equal((await change(f,person,'activate')).status,422);
 assert.equal(f.db.prepare('SELECT actor_role FROM console_audit_actor_snapshots WHERE event_id=?').get(audit.id).actor_role,'OPERATOR');
 assert.equal(f.db.prepare('SELECT role FROM operators WHERE id=?').get(person.id).role,'OPERATIONS_MANAGER');
});
test('new job titles default to assigned reads without PII, economics, QA, security or Owner authority',async()=>{
 for(const role of ['OPERATIONS_MANAGER','MARKETING_CAMPAIGN_MANAGER','TECHNICIAN','READ_ONLY_AUDITOR']) {
  const f=await setup(),person=await add(f,role);await activate(f,person);
  const read=await request(f,'GET','creators/CR-200',undefined,person.email);assert.equal(read.status,200);
  for(const field of ['contact','creator_name','handle','notes','fixed_content_fee','compensation_model'])assert.equal(field in read.body.creator,false,role+'.'+field);
  assert.equal((await request(f,'PATCH','creators/CR-200',{version:1,notes:'Prohibited'},person.email)).status,403);
  for(const path of ['team','audit','system','diagnostics'])assert.equal((await request(f,'GET',path,undefined,person.email)).status,403,role+'.'+path);
  assert.equal((await request(f,'POST','qa/CR-200',{result:'PASS',version:1},person.email)).status,403);
  assert.equal((await request(f,'POST','team',{action:'changeRole',operatorId:person.id,version:1,reason:'Self promote',role:'ADMINISTRATOR'},person.email)).status,403);
 }
});
test('approval is explicit capability, not a job title, and cannot delegate Owner, launch or budget controls',async()=>{
 const f=await setup(),person=await add(f,'OPERATIONS_MANAGER');await activate(f,person);
 const decision={entityType:'ASSIGNMENT',entityId:'ASG-200',campaignId:'CMP-100',values:{fixedContentFee:50},evidenceLink:'https://example.com/decision'};
 assert.equal((await request(f,'POST','authorizations',decision,person.email)).status,403);
 assert.equal((await change(f,person,'manageAuthority',{delegations:[{campaignId:'CMP-100',fieldKey:'Owner Approval',expiresAt:'2099-01-01T00:00:00Z'}]})).status,422);
 assert.equal((await change(f,person,'manageAuthority',{delegations:[{campaignId:'CMP-100',fieldKey:'fixedContentFee',expiresAt:'2099-01-01T00:00:00Z'}]})).status,200);
 assert.equal((await request(f,'POST','authorizations',decision,person.email)).status,201);
 assert.equal((await request(f,'POST','authorizations',{...decision,values:{commissionRate:.5}},person.email)).status,403);
 assert.equal((await request(f,'PATCH','assignments/ASG-200',{version:1,fixedContentFee:999},person.email)).status,403);
});
test('scoped audit visibility is separate from export, and omits unrelated records and personnel details',async()=>{
 const f=await setup(),person=await add(f,'READ_ONLY_AUDITOR');await activate(f,person);
 for(const id of ['CR-200','CR-201'])f.db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').run('AUD-'+id,'OP-OWNER','CMP-100','NOTE','CreatorEnrollment',id,'Private details');
 assert.equal((await request(f,'GET','audit?campaignId=CMP-100',undefined,person.email)).status,403);
 assert.equal((await change(f,person,'visibility',{categories:['audit_history'],exports:[]})).status,200);
 const history=await request(f,'GET','audit?campaignId=CMP-100',undefined,person.email);
 assert.equal(history.status,200);assert.deepEqual(history.body.events.map(e=>e.object_id),['CR-200']);assert.equal(history.body.events[0].new_value,'Restricted details');assert.equal(history.body.events[0].actor_email,undefined);
 assert.equal((await request(f,'POST','exports',{dataset:'audit',campaignId:'CMP-100'},person.email)).status,403);
 assert.equal((await request(f,'POST','audit/corrections',{eventId:'AUD-CR-200',reason:'Unauthorized',correction:'Change'},person.email)).status,403);
});
test('sensitive exports require explicit permission, retain scope/visibility and generate immutable audit',async()=>{
 const f=await setup(),person=await add(f,'READ_ONLY_AUDITOR');await activate(f,person);
 assert.equal((await request(f,'POST','exports',{dataset:'creators',campaignId:'CMP-100'},person.email)).status,403);
 assert.equal((await change(f,person,'visibility',{categories:[],exports:['creators']})).status,200);
 const exported=await request(f,'POST','exports',{dataset:'creators',campaignId:'CMP-100'},person.email);
 assert.equal(exported.status,200);assert.deepEqual(exported.body.records.map(r=>r.id),['CR-200']);assert.equal('contact' in exported.body.records[0],false);assert.match(exported.headers.get('Content-Disposition'),/attachment/);
 assert.equal((await request(f,'POST','exports',{dataset:'personnel'},person.email)).status,403);
 assert.equal((await request(f,'POST','exports',{dataset:'creators',campaignId:'CMP-200'},person.email)).status,403);
 assert.equal(f.db.prepare("SELECT count(*) n FROM console_team_events WHERE actor_operator_id=? AND action='SENSITIVE_EXPORT'").get(person.id).n,1);
});
test('audit history and snapshots are database-immutable; corrections append without changing the original',async()=>{
 const f=await setup();
 f.db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').run('AUD-ORIGINAL','OP-OWNER','CMP-100','NOTE','CreatorEnrollment','CR-200','Original');
 const original=f.db.prepare("SELECT * FROM audit_events WHERE id='AUD-ORIGINAL'").get();
 assert.throws(()=>f.db.exec("UPDATE audit_events SET new_value='Altered' WHERE id='AUD-ORIGINAL'"),/append-only/);
 assert.throws(()=>f.db.exec("DELETE FROM audit_events WHERE id='AUD-ORIGINAL'"),/append-only/);
 assert.throws(()=>f.db.exec("UPDATE console_audit_actor_snapshots SET actor_role='OPERATOR'"),/append-only/);
 assert.equal((await request(f,'POST','audit/corrections',{eventId:'AUD-ORIGINAL',reason:'Fictional correction evidence',correction:'Corrected explanation'})).status,201);
 assert.deepEqual(f.db.prepare("SELECT * FROM audit_events WHERE id='AUD-ORIGINAL'").get(),original);
 assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='AUDIT_CORRECTION' AND object_id='AUD-ORIGINAL'").get().n,1);
});
test('stale management changes cannot mutate role or scope, and the old provisioning route cannot bypass governance',async()=>{
 const f=await setup(),person=await add(f);const before=f.db.prepare('SELECT * FROM operators WHERE id=?').get(person.id);
 assert.equal((await request(f,'POST','team',{action:'changeRole',operatorId:person.id,version:0,reason:'Stale',role:'OPERATIONS_MANAGER'})).status,409);
 assert.deepEqual(f.db.prepare('SELECT * FROM operators WHERE id=?').get(person.id),before);
 assert.equal((await request(f,'POST','access',{action:'provision',campaignId:'CMP-100',email:'bypass@example.com',role:'ADMINISTRATOR'})).status,410);
 assert.equal(f.db.prepare("SELECT id FROM operators WHERE login_email='bypass@example.com'").get(),undefined);
});
test('transaction guard blocks a mutation if permissions are reduced after field validation',async()=>{
 const f=await setup(),person=await add(f);await activate(f,person);
 const originalBatch=f.env.OPERATIONS_DB.batch.bind(f.env.OPERATIONS_DB);
 let raced=false;f.env.OPERATIONS_DB.batch=async statements=>{
  if(!raced){raced=true;f.db.prepare('UPDATE console_team_profiles SET version=version+1 WHERE operator_id=?').run(person.id);}
  return originalBatch(statements);
 };
 const result=await request(f,'PATCH','creators/CR-200',{version:1,notes:'Must not persist'},person.email);
 assert.equal(result.status,403);assert.notEqual(f.db.prepare("SELECT notes FROM creator_enrollments WHERE id='CR-200'").get().notes,'Must not persist');
 assert.equal(f.db.prepare('SELECT count(*) n FROM console_mutation_guards').get().n,0);
});
test('technical levels do not create credentials or security authority; system scope can support a diagnostic-only user',async()=>{
 const f=await setup(),person=await add(f,'TECHNICIAN',[]);
 assert.equal((await change(f,person,'editScope',{scopes:[],systems:['console_diagnostics']})).status,200);await activate(f,person);
 assert.equal((await request(f,'GET','campaigns',undefined,person.email)).body.campaigns.length,0);
 const result=await request(f,'GET','diagnostics',undefined,person.email);assert.equal(result.status,200);assert.deepEqual(Object.keys(result.body).sort(),['environment','notice','schemaReady']);
 for(const path of ['system','team','audit'])assert.equal((await request(f,'GET',path,undefined,person.email)).status,403);
 assert.equal((await request(f,'POST','authorizations',{entityType:'ASSIGNMENT',entityId:'ASG-200',campaignId:'CMP-100',values:{fixedContentFee:99},evidenceLink:'https://example.com'},person.email)).status,403);
});
test('training admission is environment-bound and does not authorize production, even with a recognized identity',async()=>{
 const f=await setup();f.env.CONSOLE_ENVIRONMENT='TRAINING';
 const person=await add(f,'TECHNICIAN');
 assert.equal((await change(f,person,'startTraining')).status,503);
 f.env.HUMAN_PROVISIONING_MODE='REGISTRY_VERIFIED';assert.equal((await change(f,person,'startTraining')).status,200);
 assert.equal((await request(f,'GET','me',undefined,person.email)).status,200);
 f.env.CONSOLE_ENVIRONMENT='PRODUCTION';assert.equal((await request(f,'GET','me',undefined,person.email)).status,403);
});
test('Owner and retired support identities cannot be modified, reused or given routine destructive actions',async()=>{
 const f=await setup();
 f.db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('OP-SUPPORT','support@creatorloop.net','Historical Support','ADMINISTRATOR','DISABLED');
 for(const id of ['OP-OWNER','OP-SUPPORT'])for(const action of ['changeRole','activate','deactivate','visibility'])assert.equal((await request(f,'POST','team',{action,operatorId:id,version:0,reason:'Forbidden',...(action==='changeRole'?{role:'OPERATOR'}:{}),...(action==='visibility'?{categories:[],exports:[]}:{} )})).status,403);
 assert.equal((await request(f,'DELETE','team/OP-SUPPORT')).status,405);
 assert.equal(f.db.prepare("SELECT account_status FROM operators WHERE id='OP-SUPPORT'").get().account_status,'DISABLED');
});
test('finalized reports preserve immutable versions, reason and original role attribution',async()=>{
 const f=await setup(),body={campaignId:'CMP-100',dataset:'creators',title:'Fictional creator closeout',reason:'Fictional finalization evidence',expectedVersion:0};
 const first=await request(f,'POST','reports',body);assert.equal(first.status,201);
 const original=f.db.prepare('SELECT * FROM audit_events WHERE id=?').get(first.body.eventId);
 f.db.prepare("UPDATE creator_enrollments SET notes='Changed later' WHERE id='CR-200'").run();
 const second=await request(f,'POST','reports',{...body,reportId:first.body.reportId,expectedVersion:1,reason:'Fictional correction'});assert.equal(second.status,201);
 assert.deepEqual(f.db.prepare('SELECT * FROM audit_events WHERE id=?').get(first.body.eventId),original);
 const history=await request(f,'GET','reports?campaignId=CMP-100');assert.equal(history.body.reports.length,2);
 const one=history.body.reports.find(r=>r.version===1),two=history.body.reports.find(r=>r.version===2);
 assert.equal(two.previousEventId,one.eventId);assert.notEqual(two.snapshotHash,one.snapshotHash);assert.equal(one.roleAtEvent,'ADMINISTRATOR');assert.equal(one.records.find(r=>r.id==='CR-200').notes,null);assert.equal(two.records.find(r=>r.id==='CR-200').notes,'Changed later');
 for(const method of ['PATCH','DELETE'])assert.equal((await request(f,method,'reports',{reportId:first.body.reportId})).status,405);
 assert.throws(()=>f.db.prepare('DELETE FROM audit_events WHERE id=?').run(first.body.eventId),/append-only/);
 assert.throws(()=>f.db.prepare("UPDATE audit_events SET new_value='{}' WHERE id=?").run(first.body.eventId),/append-only/);
});
test('report finalization, visibility and exports are separate explicit permissions and keep current scope',async()=>{
 const f=await setup(),person=await add(f,'READ_ONLY_AUDITOR');await activate(f,person);
 const body={campaignId:'CMP-100',dataset:'creators',title:'Fictional snapshot',reason:'Training verification',expectedVersion:0};
 assert.equal((await request(f,'POST','reports',body,person.email)).status,403);
 assert.equal((await request(f,'POST','reports',body)).status,201);
 assert.equal((await request(f,'GET','reports?campaignId=CMP-100',undefined,person.email)).status,403);
 assert.equal((await change(f,person,'visibility',{categories:[],exports:['reports']})).status,422);
 assert.equal((await change(f,person,'visibility',{categories:['finalized_reports'],exports:[]})).status,200);
 const read=await request(f,'GET','reports?campaignId=CMP-100',undefined,person.email);assert.equal(read.status,200);assert.deepEqual(read.body.reports[0].records.map(r=>r.id),['CR-200']);assert.equal('contact' in read.body.reports[0].records[0],false);assert.equal(read.body.reports[0].reason,'Restricted details');
 assert.equal((await request(f,'POST','exports',{dataset:'reports',campaignId:'CMP-100'},person.email)).status,403);
 assert.equal((await change(f,person,'visibility',{categories:['finalized_reports'],exports:['reports']})).status,200);
 const exported=await request(f,'POST','exports',{dataset:'reports',campaignId:'CMP-100'},person.email);assert.equal(exported.status,200);assert.equal(exported.body.records[0].records.length,1);
 assert.equal((await change(f,person,'editScope',{scopes:[],systems:[]})).status,200);
 assert.equal((await request(f,'GET','reports?campaignId=CMP-100',undefined,person.email)).status,403);
});
test('stale report supersession and arbitrary client snapshots are rejected without overwriting history',async()=>{
 const f=await setup(),body={campaignId:'CMP-100',dataset:'creators',title:'Fictional snapshot',reason:'Training verification',expectedVersion:0};
 const first=await request(f,'POST','reports',body);
 assert.equal((await request(f,'POST','reports',{...body,records:[{id:'Forged'}]})).status,422);
 assert.equal((await request(f,'POST','reports',{...body,reportId:first.body.reportId,expectedVersion:1})).status,201);
 assert.equal((await request(f,'POST','reports',{...body,reportId:first.body.reportId,expectedVersion:1})).status,409);
 const previous=f.db.prepare('SELECT * FROM audit_events WHERE id=?').get(first.body.eventId),value=JSON.parse(previous.new_value);value.version=3;
 assert.throws(()=>f.db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,previous_value,new_value) VALUES(?,?,?,?,?,?,?,?)').run('AUD-FORGED','OP-OWNER','CMP-100','REPORT_SUPERSEDED','FinalizedReport',first.body.reportId,first.body.eventId,JSON.stringify(value)),/latest version/);
 assert.throws(()=>f.db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').run('AUD-UNAUTHORIZED','OP-OPERATOR','CMP-100','REPORT_FINALIZED','FinalizedReport','REPORT-FORGED',previous.new_value),/Owner authority/);
 assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE object_type='FinalizedReport'").get().n,2);
});
test('existing 0006 actor snapshots remain unchanged when governance extends their metadata',async()=>{
 const f=await fixture();f.db.exec(await readFile('migrations/0005_team_directory.sql','utf8'));f.db.exec(await readFile('migrations/0006_audit_history.sql','utf8'));
 f.db.prepare("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id) VALUES('AUD-PRIOR-SNAPSHOT','OP-OPERATOR','CMP-100','NOTE','CreatorEnrollment','CR-200')").run();
 const before=f.db.prepare("SELECT * FROM console_audit_actor_snapshots WHERE event_id='AUD-PRIOR-SNAPSHOT'").get();
 f.db.exec('BEGIN');f.db.exec(await readFile('migrations/0007_team_governance.sql','utf8'));f.db.exec('COMMIT');
 const after=f.db.prepare("SELECT * FROM console_audit_actor_snapshots WHERE event_id='AUD-PRIOR-SNAPSHOT'").get();
 for(const key of Object.keys(before))assert.equal(after[key],before[key]);assert.equal(after.permission_snapshot_json,null);assert.equal(after.membership_version,null);
 assert.throws(()=>f.db.exec("INSERT OR REPLACE INTO console_audit_actor_snapshots SELECT * FROM console_audit_actor_snapshots"),/append-only/);
 assert.throws(()=>f.db.exec("INSERT OR REPLACE INTO audit_events SELECT * FROM audit_events"),/append-only/);
});
test('expiry timestamps are compared as instants and cannot extend authority through text ordering',async()=>{
 const f=await setup(),person=await add(f,'APPROVAL_AUTHORITY');await activate(f,person);
 const now=Date.now(),expired=new Date(now-60000).toISOString(),today=new Date(now).toISOString();
 f.db.prepare('INSERT INTO console_approval_delegations(operator_id,campaign_id,field_key,delegated_by,expires_at) VALUES(?,?,?,?,?)').run(person.id,'CMP-100','fixedContentFee','OP-OWNER',expired);
 const body={campaignId:'CMP-100',entityType:'ASSIGNMENT',entityId:'ASG-200',values:{fixedContentFee:75},evidenceLink:'https://example.com/evidence'};
 assert.equal((await request(f,'POST','authorizations',body,person.email)).status,403);
 const approved=await request(f,'POST','authorizations',{...body,expiresAt:expired});assert.equal(approved.status,201);
 assert.equal((await request(f,'PATCH','assignments/ASG-200',{version:1,fixedContentFee:75,authorizationId:approved.body.id},'operations@example.com')).status,403);
 assert.equal(f.db.prepare("SELECT datetime(?)<datetime(?) expired").get(expired,today).expired,1);
});
test('employment status changes are attributable and do not silently confer or restore access',async()=>{
 const f=await setup(),person=await add(f);assert.equal((await change(f,person,'editEmployment',{employmentStatus:'PENDING_START'})).status,200);
 assert.equal((await change(f,person,'startTraining')).status,200);assert.equal((await change(f,person,'certify',{attestation:true,evidenceLink:'https://example.com/evidence'})).status,200);f.env.HUMAN_PROVISIONING_MODE='REGISTRY_VERIFIED';
 assert.equal((await change(f,person,'activate')).status,422);assert.equal((await change(f,person,'editEmployment',{employmentStatus:'EMPLOYED'})).status,200);assert.equal((await request(f,'GET','me',undefined,person.email)).status,403);assert.equal((await change(f,person,'activate')).status,200);
 assert.equal((await change(f,person,'editEmployment',{employmentStatus:'PENDING_START'})).status,422);
 const event=f.db.prepare("SELECT * FROM console_team_events WHERE target_operator_id=? AND action='TEAM_EDITEMPLOYMENT' ORDER BY created_at,id").all(person.id);assert.equal(event.length,2);assert.ok(event.every(e=>e.previous_state_json&&e.new_state_json));
});
test('all Technician levels deny self-granted authority, audit/report destruction and unauthorized exports',async()=>{
 for(const level of ['TRAINING','PRODUCTION_SUPPORT','INFRASTRUCTURE_ADMIN']){
  const f=await setup();if(level==='TRAINING')f.env.CONSOLE_ENVIRONMENT='TRAINING';
  const person=await add(f,'TECHNICIAN');assert.equal((await change(f,person,'changeRole',{role:'TECHNICIAN',technicalLevel:level})).status,200);assert.equal((await change(f,person,'certify',{attestation:true,evidenceLink:'https://example.com/fictional-certification'})).status,200);f.env.HUMAN_PROVISIONING_MODE='REGISTRY_VERIFIED';assert.equal((await change(f,person,'activate')).status,200);
  for(const action of ['activate','changeRole','editScope','manageAuthority','visibility'])assert.equal((await request(f,'POST','team',{action,operatorId:person.id,version:1,reason:'Prohibited self grant',role:'ADMINISTRATOR',scopes:[{campaignId:'CMP-200',recordId:'*'}]},person.email)).status,403,level+'.'+action);
  assert.equal((await request(f,'GET','audit?campaignId=CMP-100',undefined,person.email)).status,403);
  assert.equal((await request(f,'POST','exports',{dataset:'creators',campaignId:'CMP-100'},person.email)).status,403);
  assert.equal((await request(f,'DELETE','audit/AUD-EXAMPLE',undefined,person.email)).status,404);
  assert.equal((await request(f,'DELETE','reports',{reportId:'REPORT-FICTIONAL'},person.email)).status,405);
  assert.equal((await request(f,'POST','reports',{campaignId:'CMP-100',dataset:'creators',title:'Unauthorized',reason:'Prohibited',expectedVersion:0},person.email)).status,403);
  assert.equal((await request(f,'GET','system',undefined,person.email)).status,403);
 }
});
