import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fixture,call } from './helpers/operator-fixture.js';
import { onRequest } from '../functions/api/console/[[path]].js';
const OWNER='team@creatorloop.net';
const draft={action:'addPending',fullName:'Fictional Employee',email:'new.employee@example.com',role:'OPERATOR',employmentStatus:'PENDING_START',scopes:[{campaignId:'CMP-100',recordId:'CR-200'}]};
async function setup(migrate=true) {
 const result=await fixture();
 result.db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('OP-OWNER',OWNER,'Owner','ADMINISTRATOR','ACTIVE');
 result.db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('OP-RETIRED','support@creatorloop.net','Historical support','ADMINISTRATOR','DISABLED');
 if(migrate){result.db.exec(await readFile('migrations/0005_team_directory.sql','utf8'));result.db.exec(await readFile('migrations/0006_audit_history.sql','utf8'));result.db.exec('BEGIN');result.db.exec(await readFile('migrations/0007_team_governance.sql','utf8'));result.db.exec('COMMIT');}
 return result;
}
async function request(env,method='GET',path='team',body,email=OWNER,origin='https://ops.creatorloop.net') {
 const headers=method==='GET'?{}:{'Content-Type':'application/json',...(origin===null?{}:{Origin:origin})};
 const response=await onRequest({env,data:{loginEmail:email},params:{path:path.split('/')},request:new Request('https://ops.creatorloop.net/api/console/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})});
 return {status:response.status,body:await response.json()};
}
test('team migration preserves every existing table row and registers separately',async()=>{
 const {db}=await setup(false);
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'schema_migrations'").all().map(row=>row.name);
 const before=Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT * FROM "'+table+'"').all()]));
 db.exec(await readFile('migrations/0005_team_directory.sql','utf8'));
 for(const table of tables)assert.deepEqual(db.prepare('SELECT * FROM "'+table+'"').all(),before[table],table);
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version='0005_team_directory'").get());
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('only the current active Owner can list or view Team records, including against direct API calls',async()=>{
 const {env,db}=await setup();
 for(const role of ['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','ADMINISTRATOR']) {
  assert.equal((await call(env,role,'GET','team')).status,403,role);
  assert.equal((await call(env,role,'GET','team/OP-OWNER')).status,403,role);
  assert.equal((await call(env,role,'POST','team',draft)).status,403,role);
 }
 assert.equal((await request(env)).status,200);
 assert.equal((await request(env,'GET','team/OP-RETIRED')).status,200);
 assert.equal((await request(env,'GET','team',undefined,'support@creatorloop.net')).status,403);
 db.prepare("UPDATE operators SET role='OPERATIONS' WHERE id='OP-OWNER'").run();
 assert.equal((await request(env)).status,403);
});
test('directory reports actual grants and fallback record assignments without asserting certification',async()=>{
 const {env,db}=await setup();
 db.prepare("UPDATE creator_enrollments SET assigned_operator_id='OP-OPERATOR' WHERE id='CR-201'").run();
 const {body}=await request(env);
 const employee=body.users.find(person=>person.id==='OP-OPERATOR');
 assert.equal(employee.profile,null);
 assert.equal(employee.scope[0].record_id,'CR-200');
 assert.equal(employee.assignedRecords[0].id,'CR-201');
 assert.equal(body.activationAvailable,false);
 assert.equal(body.loginUrl,'https://ops.creatorloop.net');
 assert.deepEqual(body.approvedRoles,['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','OPERATIONS_MANAGER','MARKETING_CAMPAIGN_MANAGER','TECHNICIAN','READ_ONLY_AUDITOR']);
 assert.equal(body.users.find(person=>person.id==='OP-RETIRED').accessStatus,'DISABLED');
});
test('missing metadata migration keeps directory read-only and fails writes closed',async()=>{
 const {env}=await setup(false);
 assert.equal((await request(env)).body.metadataReady,false);
 assert.equal((await request(env,'POST','team',draft)).status,503);
});
test('Add User is atomic, inactive, individually attributable and creates no grants or delegation',async()=>{
 const {env,db}=await setup();
 const originalAudit=db.prepare('SELECT * FROM audit_events').all();
 const originalGrants=db.prepare('SELECT * FROM console_access_grants').all();
 const originalDelegations=db.prepare('SELECT * FROM console_approval_delegations').all();
 const added=await request(env,'POST','team',{...draft,email:' NEW.EMPLOYEE@EXAMPLE.COM '});
 assert.equal(added.status,201);
 const user=db.prepare('SELECT * FROM operators WHERE id=?').get(added.body.id);
 assert.equal(user.account_status,'DISABLED');assert.equal(user.login_email,draft.email);
 assert.equal((await request(env,'GET','me',undefined,draft.email)).status,403);
 const profile=db.prepare('SELECT * FROM console_team_profiles WHERE operator_id=?').get(user.id);
 assert.equal(profile.lifecycle_status,'INVITED');assert.equal(profile.training_status,'NOT_STARTED');
 assert.deepEqual(JSON.parse(profile.proposed_scope_json),draft.scopes);
 const event=db.prepare('SELECT * FROM console_team_events WHERE target_operator_id=?').get(user.id);
 assert.equal(event.actor_email,OWNER);assert.equal(event.actor_role,'ADMINISTRATOR');assert.equal(event.previous_state_json,null);
 assert.equal(JSON.parse(event.new_state_json).accessStatus,'DISABLED');
 assert.deepEqual(db.prepare('SELECT * FROM audit_events').all(),originalAudit);
 assert.deepEqual(db.prepare('SELECT * FROM console_access_grants').all(),originalGrants);
 assert.deepEqual(db.prepare('SELECT * FROM console_approval_delegations').all(),originalDelegations);
});
test('retired, duplicate, malformed and Owner identities cannot be reused; no extra Administrator is granted',async()=>{
 const {env,db}=await setup();
 for(const change of [{email:'support@creatorloop.net'},{email:'SUPPORT@CREATORLOOP.NET'},{email:OWNER},{email:'invalid'},{email:'<user>@example.com'},{fullName:''},{role:'ADMINISTRATOR'},{role:'MARKETING'},{employmentStatus:'UNKNOWN'}])assert.equal((await request(env,'POST','team',{...draft,...change})).status,422,JSON.stringify(change));
 db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('OP-FORMER','Former@Example.com','Former employee','OPERATOR','DISABLED');
 assert.equal((await request(env,'POST','team',{...draft,email:'former@example.com'})).status,409);
 assert.equal((await request(env,'POST','team',draft)).status,201);
 assert.equal((await request(env,'POST','team',draft)).status,409);
});
test('all four approved employee roles can be prepared without active authority',async()=>{
 const {env,db}=await setup();
 for(const role of ['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY']) {
  const result=await request(env,'POST','team',{...draft,email:role.toLowerCase()+'.draft@example.com',role,scopes:[]});
  assert.equal(result.status,201);
  assert.equal(db.prepare('SELECT account_status FROM operators WHERE id=?').get(result.body.id).account_status,'DISABLED');
 }
});
test('proposed scope rejects wrong campaign/record relationships and never enables a scope grant',async()=>{
 const {env,db}=await setup();
 for(const scopes of [[{campaignId:'CMP-100',recordId:'CR-202'}],[{campaignId:'CMP-999',recordId:'*'}],[{campaignId:'CMP-100',recordId:'*',admin:true}],null])assert.equal((await request(env,'POST','team',{...draft,scopes})).status,422);
 const result=await request(env,'POST','team',{...draft,scopes:[draft.scopes[0],draft.scopes[0]]});
 const profile=db.prepare('SELECT * FROM console_team_profiles WHERE operator_id=?').get(result.body.id);
 assert.deepEqual(JSON.parse(profile.proposed_scope_json),draft.scopes);
 assert.equal(db.prepare('SELECT count(*) n FROM console_access_grants WHERE operator_id=?').get(result.body.id).n,0);
});
test('activation, deletion, role/scope changes, certification injection and off-origin requests are denied',async()=>{
 const {env,db}=await setup();
 const before=db.prepare('SELECT * FROM operators WHERE id=?').get('OP-OWNER');
 for(const action of ['activate','deactivate','delete','changeRole','editScope'])assert.equal((await request(env,'POST','team',{...draft,action,operatorId:'OP-OWNER'})).status,422);
 for(const extra of [{accountStatus:'ACTIVE'},{trainingStatus:'CERTIFIED'},{canManageTeam:true}])assert.equal((await request(env,'POST','team',{...draft,...extra})).status,422);
 assert.equal((await request(env,'DELETE','team/OP-OWNER')).status,405);
 for(const origin of [null,'https://evil.example'])assert.equal((await request(env,'POST','team',draft,OWNER,origin)).status,403);
 assert.equal(db.prepare('SELECT role FROM operators WHERE id=?').get('OP-OWNER').role,before.role);
});
test('new Team audit retains role/email/name snapshots and rejects modification or deletion',async()=>{
 const {env,db}=await setup();
 await request(env,'POST','team',draft);
 db.prepare("UPDATE operators SET display_name='Changed name',role='OPERATIONS' WHERE id='OP-OWNER'").run();
 const event=db.prepare('SELECT * FROM console_team_events').get();
 assert.equal(event.actor_name,'Owner');assert.equal(event.actor_role,'ADMINISTRATOR');assert.equal(event.actor_email,OWNER);
 assert.throws(()=>db.prepare("UPDATE console_team_events SET actor_role='OPERATOR'").run(),/append-only/);
 assert.throws(()=>db.prepare('DELETE FROM console_team_events').run(),/append-only/);
});
test('a failed Team audit rolls back the entire pending user creation',async()=>{
 const {env,db}=await setup();
 db.exec("CREATE TRIGGER fail_team_event BEFORE INSERT ON console_team_events BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 assert.equal((await request(env,'POST','team',draft)).status,500);
 assert.equal(db.prepare('SELECT id FROM operators WHERE login_email=?').get(draft.email),undefined);
 assert.equal(db.prepare('SELECT count(*) n FROM console_team_profiles').get().n,0);
});
test('Team UI escapes identity data and presents inactive preparation without functional activation controls',async()=>{
 const source=await readFile('console/app.js','utf8');
 const context={document:{addEventListener(){},querySelector(){return {addEventListener(){}};}}};
 runInNewContext(source.replace(/start\(\);\s*$/,''),context);
 const html=runInNewContext(`teamRows([{id:'OP-1',fullName:'<script>alert(1)</script>',email:'x@example.com',role:'OPERATOR',accessStatus:'DISABLED',profile:{lifecycle_status:'PENDING',training_status:'NOT_STARTED'},scope:[],assignedRecords:[],delegations:[]}])`,context);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Invited · inactive/);assert.match(html,/data-team-person=/);
 const form=runInNewContext(`addTeamForm({metadataReady:true,approvedRoles:['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY'],campaigns:[{id:'CMP-100',name:'<unsafe>'}]})`,context);
 assert.match(form,/Save inactive user/);assert.doesNotMatch(form,/<option[^>]*>ADMINISTRATOR/);assert.match(form,/&lt;unsafe&gt;/);
 assert.match(source,/view === "team" && !state.dashboard.user.canManageTeam/);
});
