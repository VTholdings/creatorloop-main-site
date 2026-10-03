import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,sign} from 'node:crypto';
import {fixture} from './helpers/operator-fixture.js';
import {onRequest as middleware} from '../functions/_middleware.js';
import {onRequest as consoleRequest} from '../functions/api/console/[[path]].js';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
test('individually signed lifecycle uses middleware, rejects stale and future sessions, preserves historical attribution',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldNow=Date.now;
 let now=Math.ceil(oldNow()/1000)*1000;Date.now=()=>now;
 try {
  for(const name of ['0005_team_directory','0006_audit_history','0007_team_governance']){f.db.exec('BEGIN');f.db.exec(await readFile('migrations/'+name+'.sql','utf8'));f.db.exec('COMMIT');}
  f.db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('SIGNED-OWNER','team@creatorloop.net','Fictional Owner','ADMINISTRATOR','ACTIVE');
  Object.assign(f.env,{CLOUDFLARE_ACCESS_TEAM_DOMAIN:'signed-lifecycle',CLOUDFLARE_ACCESS_AUD:'production-fixture',HUMAN_PROVISIONING_MODE:'REGISTRY_VERIFIED'});
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[{...publicKey.export({format:'jwk'}),kid:'fixture'}]}));
  const token=(email,iat=now/1000,aud='production-fixture')=>{const h=encode({alg:'RS256',kid:'fixture'}),p=encode({iss:'https://signed-lifecycle.cloudflareaccess.com',aud,email,iat,exp:now/1000+3600});return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');};
  async function call(email,method,path,body,jwt){now+=2000;const context={env:f.env,data:{},params:{path:path.split('/')},request:new Request('https://ops.creatorloop.net/api/console/'+path,{method,headers:{'Cf-Access-Jwt-Assertion':jwt||token(email),Origin:'https://ops.creatorloop.net','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})};const response=await middleware({...context,next:()=>consoleRequest(context)});return {status:response.status,body:await response.text()};}
  const owner='team@creatorloop.net',email='signed.individual@example.com';
  const added=await call(owner,'POST','team',{action:'addPending',fullName:'Fictional Individual',email,role:'OPERATOR',employmentStatus:'EMPLOYED',scopes:[{campaignId:'CMP-100',recordId:'CR-200'}]});assert.equal(added.status,201);const id=JSON.parse(added.body).id;
  const change=async(action,extra={})=>call(owner,'POST','team',{action,operatorId:id,version:f.db.prepare('SELECT version FROM console_team_profiles WHERE operator_id=?').get(id).version,reason:'Isolated signed acceptance',...extra});
  assert.equal((await call(email,'GET','me')).status,403);
  assert.equal((await change('startTraining')).status,200);
  assert.equal((await change('certify',{attestation:true,evidenceLink:'https://example.com/fictional-training'})).status,200);
  assert.equal((await call(email,'GET','me')).status,403);
  assert.equal((await change('activate')).status,200);
  assert.equal((await call(email,'GET','creators/CR-200')).status,200);
  assert.equal((await call(email,'GET','creators/CR-202')).status,403);
  assert.equal((await call(email,'GET','team')).status,403);
  const prior=token(email);assert.equal((await change('visibility',{categories:[],exports:[]})).status,200);
  assert.equal((await call(email,'GET','me',undefined,prior)).status,403);
  assert.equal((await call(email,'GET','me',undefined,token(email,now/1000+100))).status,401);
  assert.equal((await call(email,'GET','me',undefined,token(email,now/1000,'training-fixture'))).status,401);
  assert.equal((await call(email,'GET','me')).status,200);
  assert.equal((await change('suspend')).status,200);assert.equal((await call(email,'GET','me')).status,403);
  assert.equal((await change('deactivate')).status,200);assert.equal((await call(email,'GET','me')).status,403);
  assert.ok(f.db.prepare('SELECT id FROM operators WHERE id=?').get(id));assert.ok(f.db.prepare('SELECT count(*) n FROM console_team_events WHERE target_operator_id=?').get(id).n>=7);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;f.db.close();}
});
test('atomic migration rehearsal rolls back schema, identities and registration after an interrupted extension',async()=>{
 const f=await fixture();
 try {
  for(const name of ['0005_team_directory','0006_audit_history']){f.db.exec('BEGIN');f.db.exec(await readFile('migrations/'+name+'.sql','utf8'));f.db.exec('COMMIT');}
  const identities=f.db.prepare('SELECT * FROM operators ORDER BY id').all();
  const schema=f.db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  f.db.exec('BEGIN');
  assert.throws(()=>f.db.exec((awaitMigration)+'\nSELECT * FROM deliberately_missing_interruption_table;'));
  f.db.exec('ROLLBACK');
  assert.deepEqual(f.db.prepare('SELECT * FROM operators ORDER BY id').all(),identities);
  assert.deepEqual(f.db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all(),schema);
  assert.equal(f.db.prepare("SELECT count(*) n FROM schema_migrations WHERE version='0007_team_governance'").get().n,0);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});
const awaitMigration=await readFile('migrations/0007_team_governance.sql','utf8');
