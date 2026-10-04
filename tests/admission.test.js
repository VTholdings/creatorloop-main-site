import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './helpers/operator-fixture.js';
import {verifier,envelope,admit,revoke} from './helpers/admission-fixture.js';
import {onRequest} from '../functions/api/console/[[path]].js';
import {edgeState,admissionConfiguration} from '../functions/api/admission.js';
async function setup(environment='PRODUCTION') {
 const f=await fixture();
 for(const name of ['0005_team_directory','0006_audit_history','0007_team_governance']){f.db.exec('BEGIN');f.db.exec(await readFile('migrations/'+name+'.sql','utf8'));f.db.exec('COMMIT');}
 f.db.prepare("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('OWNER','team@creatorloop.net','Fictional Owner','ADMINISTRATOR','ACTIVE')").run();
 await verifier(f,environment);
 const r=await req(f,'team',{action:'addPending',fullName:'Fictional Person',email:'person@example.com',role:'OPERATOR',employmentStatus:'EMPLOYED',scopes:[{campaignId:'CMP-100',recordId:'CR-200'}]});
 assert.equal(r.status,201);f.person={id:r.body.id,email:'person@example.com'};return f;
}
async function req(f,path,body,email='team@creatorloop.net') {
 const p=f.db.prepare('SELECT p.auth_not_before FROM console_team_profiles p JOIN operators o ON o.id=p.operator_id WHERE login_email=?').get(email);
 const r=await onRequest({env:f.env,data:{accessSubject:'fictional-subject',loginEmail:email,accessIssuedAt:Math.max(Math.floor(Date.now()/1000),p?.auth_not_before||0)},params:{path:path.split('/')},request:new Request('https://ops.creatorloop.net/api/console/'+path,{method:body?'POST':'GET',headers:{Origin:'https://ops.creatorloop.net'},...(body?{body:JSON.stringify(body)}:{})})});return {status:r.status,body:await r.json()};
}
async function change(f,person,action,extra={}) {return req(f,'team',{action,operatorId:person.id,version:f.db.prepare('SELECT version FROM console_team_profiles WHERE operator_id=?').get(person.id)?.version||0,reason:'Fictional isolated evidence',...extra});}
async function certified(f){await change(f,f.person,'startTraining');await change(f,f.person,'certify',{attestation:true,evidenceLink:'https://example.com/certification'});}
test('deployment switches cannot replace an individual receipt, and a receipt cannot replace certification',async()=>{
 const f=await setup();f.env.HUMAN_PROVISIONING_MODE='REGISTRY_VERIFIED';
 assert.equal((await change(f,f.person,'activate')).status,503);
 await admit(f,f.person,change);assert.equal((await change(f,f.person,'activate')).status,422);
 await certified(f);assert.equal((await change(f,f.person,'activate')).status,200);
 assert.equal((await req(f,'me',null,f.person.email)).status,200);
});
test('signed receipt rejects identity, audience, environment, version, operation and evidence substitutions',async()=>{
 const f=await setup();await change(f,f.person,'requestAdmission');
 for(const override of [{email:'other@example.com'},{operatorId:'OP-OPERATOR'},{audience:f.env.PEER_ACCESS_AUD},{environment:'TRAINING'},{databaseId:f.env.PEER_DATABASE_ID},{deploymentId:f.env.PEER_DEPLOYMENT_ID},{requestVersion:0},{requestId:'other'},{operation:'REVOKE'},{policyVerified:false},{sessionVerified:false},{evidenceHash:'invalid'},{observedAt:Math.floor(Date.now()/1000)+60},{expiresAt:Math.floor(Date.now()/1000)-1},{expiresAt:Math.floor(Date.now()/1000)+90000}]) {
  const r=await change(f,f.person,'recordEdgeReceipt',{receipt:await envelope(f,f.person,override)});assert.equal(r.status,422,JSON.stringify(override));
 }
 assert.equal((await edgeState(f.env.OPERATIONS_DB,f.person.id)).receipt,null);
});
test('untrusted or tampered signatures fail closed; accepted evidence is immutable and cannot be replayed',async()=>{
 const f=await setup();await change(f,f.person,'requestAdmission');const proof=await envelope(f,f.person);
 assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:{...proof,keyId:'untrusted'}})).status,422);
 assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:{...proof,signature:proof.signature.slice(0,-10)+'aaaaaaaaaa'}})).status,422);
 assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:proof})).status,200);
 assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:proof})).status,409);
 const receipt=(await edgeState(f.env.OPERATIONS_DB,f.person.id)).receipt;
 assert.throws(()=>f.db.prepare('DELETE FROM console_team_events WHERE id=?').run(receipt.id),/append-only/);
 assert.throws(()=>f.db.prepare('UPDATE console_team_events SET new_state_json=? WHERE id=?').run('{}',receipt.id),/append-only/);
});
test('stale receipt request must be regenerated after personnel changes; no partial audit or activation',async()=>{
 const f=await setup();await change(f,f.person,'requestAdmission');const proof=await envelope(f,f.person);
 await change(f,f.person,'editEmployment',{employmentStatus:'PENDING_START'});
 const before=f.db.prepare('SELECT count(*) n FROM console_team_events').get().n;
 assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:proof})).status,422);
 assert.equal(f.db.prepare('SELECT count(*) n FROM console_team_events').get().n,before);
 assert.equal(f.db.prepare('SELECT account_status FROM operators WHERE id=?').get(f.person.id).account_status,'DISABLED');
});
test('revocation queues immediately deny access; reactivation waits for signed removal/session proof and new admission',async()=>{
 const f=await setup();await certified(f);await admit(f,f.person,change);await change(f,f.person,'activate');
 await change(f,f.person,'suspend');
 const edge=await edgeState(f.env.OPERATIONS_DB,f.person.id);assert.equal(edge.request.operation,'REVOKE');assert.equal(edge.receipt,null);
 assert.equal((await req(f,'me',null,f.person.email)).status,403);
 assert.equal((await change(f,f.person,'activate')).status,503);
 assert.equal((await change(f,f.person,'requestAdmission')).status,409);
 assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:await envelope(f,f.person,{revokedBefore:0})})).status,422);
 await revoke(f,f.person,change);assert.equal((await change(f,f.person,'activate')).status,503);
 await admit(f,f.person,change);assert.equal((await change(f,f.person,'activate')).status,200);
});
test('receipt expiry and trust-key removal deny fresh sessions without deleting identity/history',async()=>{
 const f=await setup();await certified(f);await admit(f,f.person,change);await change(f,f.person,'activate');
 const before=f.db.prepare('SELECT count(*) n FROM console_team_events').get().n,original=Date.now;
 try {Date.now=()=>original()+4000000;assert.equal((await req(f,'me',null,f.person.email)).status,403);}finally{Date.now=original;}
 f.env.ADMISSION_VERIFIER_KEYS=JSON.stringify(JSON.parse(f.env.ADMISSION_VERIFIER_KEYS).map(k=>({...k,kid:'replacement'})));
 assert.equal((await req(f,'me',null,f.person.email)).status,403);
 assert.equal(f.db.prepare('SELECT count(*) n FROM console_team_events').get().n,before);
});
test('training requires distinct deployment, database and AUD pins, and receipts cannot transfer across databases',async()=>{
 const f=await setup('TRAINING');
 for(const [peer,current] of [['PEER_ACCESS_AUD','CLOUDFLARE_ACCESS_AUD'],['PEER_DATABASE_ID','CONSOLE_DATABASE_ID'],['PEER_DEPLOYMENT_ID','CONSOLE_DEPLOYMENT_ID']])assert.equal(admissionConfiguration({...f.env,[peer]:f.env[current]}),null);
 await admit(f,f.person,change);assert.equal((await change(f,f.person,'startTraining')).status,200);
 assert.equal((await req(f,'me',null,f.person.email)).status,200);
 f.env.CONSOLE_DATABASE_ID='other-db';assert.equal((await req(f,'me',null,f.person.email)).status,403);
});
test('revocation request inserted after validation prevents a previously authorized Save from committing',async()=>{
 const f=await setup();await certified(f);await admit(f,f.person,change);await change(f,f.person,'activate');
 const batch=f.env.OPERATIONS_DB.batch.bind(f.env.OPERATIONS_DB);let raced=false;
 f.env.OPERATIONS_DB.batch=async statements=>{
  if(!raced){raced=true;f.db.prepare("INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) VALUES('RACE',?,'OWNER','team@creatorloop.net','Fictional Owner','ADMINISTRATOR','EDGE_REVOCATION_REQUEST',json_object('requestVersion',99999))").run(f.person.id);}
  return batch(statements);
 };
 const p=f.db.prepare('SELECT auth_not_before FROM console_team_profiles WHERE operator_id=?').get(f.person.id);
 const r=await onRequest({env:f.env,data:{accessSubject:'fictional-subject',loginEmail:f.person.email,accessIssuedAt:p.auth_not_before},params:{path:['creators','CR-200']},request:new Request('https://ops.creatorloop.net/api/console/creators/CR-200',{method:'PATCH',headers:{Origin:'https://ops.creatorloop.net'},body:JSON.stringify({version:1,notes:'Must roll back'})})});
 assert.equal(r.status,403);assert.notEqual(f.db.prepare("SELECT notes FROM creator_enrollments WHERE id='CR-200'").get().notes,'Must roll back');
 assert.equal(f.db.prepare('SELECT count(*) n FROM audit_events WHERE operator_id=?').get(f.person.id).n,0);
});
test('non-Owner, retired identities and missing configuration cannot provision or acknowledge evidence',async()=>{
 const f=await setup();assert.equal((await req(f,'team',{action:'requestAdmission',operatorId:f.person.id,version:1,reason:'No'},'administrator@example.com')).status,403);
 delete f.env.ADMISSION_VERIFIER_KEYS;assert.equal((await change(f,f.person,'requestAdmission')).status,503);
 assert.equal((await change(f,{id:'OWNER'},'requestRevocation')).status,403);
});
test('Owner readiness identifies local configuration separately from deferred live certification',async()=>{
 const f=await setup();const r=await req(f,'readiness');assert.equal(r.status,200);assert.equal(r.body.applicationGatesPrepared,true);assert.equal(r.body.liveAcceptanceComplete,false);assert.equal(r.body.productionCertified,false);assert.equal(r.body.people[0].individualAdmissionCurrent,false);
 assert.equal((await req(f,'readiness',null,'operator@example.com')).status,403);
 const queue=await req(f,'team');assert.deepEqual(queue.body.provisioningQueue,[]);
 await change(f,f.person,'requestAdmission');assert.equal((await req(f,'team')).body.provisioningQueue[0].status,'PENDING_EXTERNAL_EXECUTION');
});
test('managed sessions require the exact verified individual subject; email alone cannot reuse admission',async()=>{
 const f=await setup();await certified(f);await admit(f,f.person,change);await change(f,f.person,'activate');
 const p=f.db.prepare('SELECT auth_not_before FROM console_team_profiles WHERE operator_id=?').get(f.person.id);
 for(const subject of [undefined,'another-individual']){
  const r=await onRequest({env:f.env,data:{loginEmail:f.person.email,accessIssuedAt:p.auth_not_before,accessSubject:subject},params:{path:['me']},request:new Request('https://ops.creatorloop.net/api/console/me')});assert.equal(r.status,403);
 }
 assert.equal((await req(f,'me',null,f.person.email)).status,200);
});
test('ending active training certification queues revocation, and further pending changes refresh the request fence',async()=>{
 const f=await setup('TRAINING');await admit(f,f.person,change);await change(f,f.person,'startTraining');
 assert.equal((await change(f,f.person,'certify',{attestation:true,evidenceLink:'https://example.com/certified-training'})).status,200);
 let edge=await edgeState(f.env.OPERATIONS_DB,f.person.id);assert.equal(edge.request.operation,'REVOKE');assert.equal((await req(f,'me',null,f.person.email)).status,403);
 const oldId=edge.request.id;
 await change(f,f.person,'editScope',{scopes:[{campaignId:'CMP-100',recordId:'CR-201'}],systems:[]});
 edge=await edgeState(f.env.OPERATIONS_DB,f.person.id);assert.notEqual(edge.request.id,oldId);assert.equal(edge.request.requestVersion,f.db.prepare('SELECT version FROM console_team_profiles WHERE operator_id=?').get(f.person.id).version);
 await revoke(f,f.person,change);assert.equal((await change(f,f.person,'activate')).status,503);
});
test('activation rechecks target admission at commit and rolls back when revocation races it',async()=>{
 const f=await setup();await certified(f);await admit(f,f.person,change);const batch=f.env.OPERATIONS_DB.batch.bind(f.env.OPERATIONS_DB);let raced=false;
 f.env.OPERATIONS_DB.batch=async statements=>{if(!raced){raced=true;f.db.prepare("INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) VALUES('ACTIVATION-RACE',?,'OWNER','team@creatorloop.net','Owner','ADMINISTRATOR','EDGE_REVOCATION_REQUEST',json_object('requestVersion',99999))").run(f.person.id);}return batch(statements);};
 assert.equal((await change(f,f.person,'activate')).status,403);assert.equal(f.db.prepare('SELECT account_status FROM operators WHERE id=?').get(f.person.id).account_status,'DISABLED');assert.equal(f.db.prepare('SELECT count(*) n FROM console_access_grants WHERE operator_id=?').get(f.person.id).n,0);
});
test('training rejects missing or shared environment pins before any Console read or write, including Owner',async()=>{
 const f=await setup('TRAINING');f.env.PEER_DATABASE_ID=f.env.CONSOLE_DATABASE_ID;
 assert.equal((await req(f,'dashboard')).status,503);
 assert.equal((await req(f,'team',{action:'requestAdmission',operatorId:f.person.id,version:1,reason:'Blocked'})).status,503);
 assert.equal(f.db.prepare("SELECT count(*) n FROM console_team_events WHERE action='EDGE_ADMISSION_REQUEST'").get().n,0);
});

test('suspension, deactivation and role changes cancel inactive or unfinished admission and require fresh removal evidence',async()=>{
 for(const action of ['suspend','deactivate','changeRole'])for(const received of [false,true]){
  const f=await setup();await change(f,f.person,'requestAdmission');
  const stale=await envelope(f,f.person);if(received)assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:stale})).status,200);
  assert.equal((await change(f,f.person,action,action==='changeRole'?{role:'QA_REVIEWER'}:{})).status,200);
  const edge=await edgeState(f.env.OPERATIONS_DB,f.person.id);
  assert.equal(edge.request.operation,'REVOKE');assert.equal(edge.receipt,null);
  assert.equal((await change(f,f.person,'requestAdmission')).status,409);
  assert.equal((await change(f,f.person,'recordEdgeReceipt',{receipt:stale})).status,422);
  assert.equal((await req(f,'me',null,f.person.email)).status,403);
  await revoke(f,f.person,change);assert.equal((await change(f,f.person,'requestAdmission')).status,200);
 }
});
test('rotating RSA material under the same key ID invalidates old receipts for sessions and activation',async()=>{
 const f=await setup();await certified(f);await admit(f,f.person,change);await change(f,f.person,'activate');
 const original=f.env.ADMISSION_VERIFIER_KEYS;
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 f.env.ADMISSION_VERIFIER_KEYS=JSON.stringify([{...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'fictional-executor'}]);
 assert.equal((await req(f,'me',null,f.person.email)).status,403);
 // Test the actual SQL commit predicate independently of the earlier request check.
 const {admissionCommitCheck}=await import('../functions/api/admission.js');
 const target=f.db.prepare('SELECT * FROM operators WHERE id=?').get(f.person.id);
 const check=admissionCommitCheck(target,f.env);
 assert.equal(f.db.prepare('SELECT '+check.sql+' ok').get(...check.values).ok,0);
 f.env.ADMISSION_VERIFIER_KEYS=original;assert.equal((await req(f,'me',null,f.person.email)).status,200);
});
