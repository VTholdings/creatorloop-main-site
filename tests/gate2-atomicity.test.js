import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {gate2Plan,gate2Client,executeGate2,fingerprint} from '../scripts/lib/gate2-atomicity.mjs';
import {authorizeGate2,fenceGate2,windowBody} from '../scripts/lib/gate2-authorization.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const sha='c'.repeat(40),main='b'.repeat(40),run='123';
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:run,GITHUB_SHA:sha,GITHUB_TOKEN:'FICTIONAL-PRIVATE-GH',EXPECTED_MAIN_SHA:main,ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',GATE2_SCOPE:'TRAINING_SYNTHETIC_ONLY'};
const owner={login:'Creatorloopzone',id:245245322},time=Date.parse('2026-10-05T02:00:00Z');
const planComment={id:5986789715,user:owner,body:"Owner authorization — Gate 2 only\n\nApprove the bounded Gate 2 plan at:\n9c68e91e0001dcc249f4e0129e3a47d6103ef277\n\nAuthorize isolated synthetic-fixture atomicity, deferred-FK,\nintentional-failure, rollback verification and narrowly owned\ncleanup in training D1:\n12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0\n\nPreserve all existing application data, migration registration,\naudit/history protections and finalized reports.\n\nRequire a confirmed inactive training window and separate\nprotected-environment approval for the final tested execution\nSHA/run. Stop on any discrepancy or uncertain write outcome.\n\nNo production access/write/migration, real training migration,\nrestore, deployment, merge, executor activation or later gate.\n\nPR #18 remains draft."};
function github({approved=true,window=true,body=windowBody(run,sha),edited=false,age=0,head=sha,replay=false,planBody=planComment.body,windowOwner=owner}={}){
 const created=new Date(time-age).toISOString(),comment={id:9,user:windowOwner,body,created_at:created,updated_at:edited?new Date(time+1).toISOString():created};
 let calls=0;return {get calls(){return calls;},fetcher:async(url,o)=>{
  calls++;assert.equal(o.method,'GET');assert.equal(o.redirect,'error');let value;
  if(url.endsWith('/approvals'))value=approved?[{state:'approved',user:owner,environments:[{name:'creatorloop-acceptance'}]}]:[];
  else if(url.endsWith('/issues/comments/5986789715'))value={...planComment,body:planBody};
  else if(url.includes('/issues/18/comments?'))value=window?[comment]:[];
  else if(url.endsWith('/issues/comments/9'))value=comment;
  else if(url.endsWith('/heads/team-access-directory'))value={ref:context.GITHUB_REF,object:{sha:head}};
  else if(url.endsWith('/heads/main'))value={ref:'refs/heads/main',object:{sha:main}};
  else value={id:123,head_sha:sha,head_branch:'team-access-directory',run_attempt:replay?2:1,event:'push',created_at:new Date(time-2*60*60*1000).toISOString(),path:'.github/workflows/acceptance-gate2.yml',repository:{full_name:context.GITHUB_REPOSITORY}};
  return new Response(JSON.stringify(value));
 }};
}
function model({partialGuard=false,cleanupRace=false,rowDrift=false}={}){
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE operators(id TEXT PRIMARY KEY);CREATE TABLE schema_migrations(version TEXT PRIMARY KEY);CREATE TABLE audit_events(id TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER actual_history_keep BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'ACTUAL_HISTORY');END;INSERT INTO audit_events VALUES('ORIGINAL','FICTIONAL-PRIVATE-HISTORY');INSERT INTO schema_migrations VALUES('0004_operator_permissions');");
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const baseline={environment:'TRAINING',databaseId:targets.training.databaseId,schema,foreignKeys:{audit_events:[],operators:[],schema_migrations:[]},dataColumns:Object.fromEntries(['audit_events','operators','schema_migrations'].map(t=>[t,db.prepare('PRAGMA table_info("'+t+'")').all().map(c=>c.name)]))};
 const plan=gate2Plan({runId:run,releaseSha:sha,baseline}),authorization={scope:'TRAINING_SYNTHETIC_ONLY',databaseId:targets.training.databaseId,runId:run,releaseSha:sha},calls=[];
 const fetcher=async(url,o)=>{
  assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+targets.accountId+'/d1/database/'+targets.training.databaseId+'/query');assert.equal(o.method,'POST');assert.equal(o.redirect,'error');
  const body=JSON.parse(o.body);assert.ok(body.batch.every(s=>JSON.stringify(s.params)==='[]'));
  const phase=Object.entries(plan.phases).find(([,p])=>fingerprint(p.sql)===fingerprint(body.batch.map(s=>s.sql)));assert.ok(phase);const [name,p]=phase;calls.push(name);
  if(cleanupRace&&name==='cleanup')db.exec(`UPDATE "${plan.names.p}" SET value='UNEXPECTED';`);
  if(rowDrift&&name==='success')db.exec("INSERT INTO audit_events VALUES('UNEXPECTED','FICTIONAL-PRIVATE-HISTORY');");
  const broken=partialGuard&&name==='guard_fail';
  try{
   if(!broken)db.exec('BEGIN');const result=[];
   for(const s of body.batch){const stmt=db.prepare(s.sql);const rows=stmt.columns().length?stmt.all(): (stmt.run(),[]);result.push({success:true,results:rows,meta:{rows_written:p.read?0:1,changed_db:!p.read}});}
   if(!broken)db.exec('COMMIT');return new Response(JSON.stringify({success:true,result}));
  }catch(error){if(!broken)try{db.exec('ROLLBACK');}catch{}return new Response(JSON.stringify({success:false,errors:[{code:7500,message:error.message+' SQLITE_CONSTRAINT'}]}),{status:400});}
 };
 const request=gate2Client({token:'FICTIONAL-PRIVATE-CF',targets,authorization,plan,fetcher});
 return {db,baseline,plan,calls,request,authorization};
}
const execute=m=>executeGate2({plan:m.plan,request:m.request,fence:async()=>{},preflight:async()=>({status:'LIVE_SCHEMA_INSPECTION_PASS'})});
test('run-scoped plan has fixed synthetic writes, frozen SQL, safe identifiers and no application/production mutation',()=>{
 const m=model();try{
  assert.ok(Object.isFrozen(m.plan.phases.setup.sql));assert.throws(()=>m.plan.phases.setup.sql.push('DROP TABLE audit_events'));
  for(const key of ['setup','success','fk_fail','guard_fail','cleanup'])assert.doesNotMatch(m.plan.phases[key].sql.join('\n'),/\baudit_events\b|\boperators\b|\bschema_migrations\b|foreign_keys=OFF|\bBEGIN;|\bCOMMIT;/);
  assert.throws(()=>gate2Plan({runId:"1'; DROP TABLE operators",releaseSha:sha,baseline:m.baseline}),/REFUSED/);
  assert.throws(()=>gate2Plan({runId:run,releaseSha:sha,baseline:{...m.baseline,environment:'PRODUCTION',databaseId:targets.production.databaseId}}),/REFUSED/);
  for(const options of [{token:''},{targets:{...targets,training:targets.production}},{authorization:{...m.authorization,databaseId:targets.production.databaseId}}])assert.throws(()=>gate2Client({token:'x',targets,authorization:m.authorization,plan:m.plan,...options}),/REFUSED/);
  assert.throws(()=>gate2Client({token:'x',targets,authorization:m.authorization,plan:{...m.plan,phases:{setup:{sql:['DROP TABLE audit_events']}}}}),/REFUSED/);
  assert.throws(()=>gate2Plan({runId:run,releaseSha:sha,baseline:{...m.baseline,dataColumns:{...m.baseline.dataColumns,audit_events:['id);DROP TABLE operators;--']}}}),/COLUMN_BOUNDARY_REFUSED/);
 }finally{m.db.close();}
});
test('local real SQLite proves successful deferred child-before-parent batch, both rollback failures and exact cleanup/history preservation',async()=>{
 const m=model();try{const r=await execute(m);assert.equal(r.status,'GATE2_ATOMICITY_PASS',JSON.stringify(r.blockers));assert.equal(r.cleanupStatus,'VERIFIED');assert.equal(r.atomicExecutionCertified,true);assert.deepEqual(r.remainingFixtureObjects,[]);assert.ok(r.checks.every(c=>c.matched));assert.equal(r.phases.filter(p=>p.status==='EXPECTED_FAILURE').length,2);assert.equal(m.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'cl_g2_%'").get().n,0);assert.equal(m.db.prepare('SELECT value FROM audit_events').get().value,'FICTIONAL-PRIVATE-HISTORY');assert.equal(m.db.prepare('SELECT count(*) n FROM schema_migrations').get().n,1);assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-PRIVATE|CREATE TABLE|INSERT INTO|Bearer/);}finally{m.db.close();}
});
test('partial synthetic schema, registration and history effects block before cleanup instead of being swept away',async()=>{
 const m=model({partialGuard:true});try{const r=await execute(m);assert.equal(r.status,'GATE2_BLOCKED');assert.equal(r.blockers[0].code,'GATE2_GUARD_FAIL_ROLLBACK_DISCREPANCY');assert.ok(!m.calls.includes('cleanup'));assert.equal(m.db.prepare(`SELECT count(*) n FROM "${m.plan.names.m}" WHERE version='GUARD_FAIL'`).get().n,1);assert.equal(m.db.prepare(`SELECT count(*) n FROM "${m.plan.names.h}" WHERE id='GUARD_FAIL'`).get().n,1);assert.ok(m.db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(m.plan.names.abortfail));assert.equal(r.cleanupStatus,'HELD_AFTER_BLOCKER');assert.equal(r.atomicExecutionCertified,false);}finally{m.db.close();}
});
test('cleanup ownership/data race aborts inside cleanup batch before any fixture DROP',async()=>{
 const m=model({cleanupRace:true});try{const r=await execute(m);assert.equal(r.status,'GATE2_BLOCKED');assert.equal(r.cleanupStatus,'HELD_AFTER_BLOCKER');for(const name of m.plan.expectedSchema.map(x=>x.name))assert.ok(m.db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(name));assert.equal(m.calls.filter(c=>c==='cleanup').length,1);}finally{m.db.close();}
});
test('original application-data drift blocks with no cleanup; history changes cannot be hidden by equal row counts',async()=>{
 const m=model({rowDrift:true});try{const r=await execute(m);assert.equal(r.status,'GATE2_BLOCKED');assert.equal(r.blockers[0].code,'GATE2_ATOMIC_COMMIT_AND_DEFERRED_FK_DISCREPANCY');assert.ok(!m.calls.includes('cleanup'));}finally{m.db.close();}
 const n=model();try{const original=n.request;n.request=async phase=>{if(phase==='success')n.db.exec("UPDATE audit_events SET value='DIFFERENT-PRIVATE-CONTENT' WHERE id='ORIGINAL'");return original(phase);};const r=await execute(n);assert.equal(r.status,'GATE2_BLOCKED');assert.ok(!n.calls.includes('cleanup'));}finally{n.db.close();}
});
test('namespace collision and bounded-data failure stop before fixture writes',async()=>{
 const m=model();try{m.db.exec(`CREATE TABLE "${m.plan.names.p}"(id TEXT)`);const r=await execute(m);assert.equal(r.status,'GATE2_BLOCKED');assert.deepEqual(m.calls,['original']);}finally{m.db.close();}
 const n=model();try{const s=n.db.prepare('INSERT INTO operators VALUES(?)');for(let i=0;i<2001;i++)s.run('x'+i);const r=await execute(n);assert.equal(r.blockers[0].code,'GATE2_RESULT_BOUND_OR_EVIDENCE_REFUSED');assert.deepEqual(n.calls,['original']);}finally{n.db.close();}
});
test('exact stored integer, blob, NUL text and real values survive private fingerprints and same-count drift is detected',async()=>{
 for(const [seed,change] of [
  ['9007199254740992','9007199254740993'],
  ["CAST(x'410042' AS TEXT)","CAST(x'410043' AS TEXT)"],
  ["x'00FF'","x'00FE'"],
  ['1.0000000000000002','1.0000000000000004']
 ]){
  const m=model();try{
   // Untyped storage exercises SQLite types without TEXT affinity coercion.
   m.db.exec('ALTER TABLE operators ADD COLUMN exact_value');
   m.db.exec('INSERT INTO operators VALUES(\'EXACT\','+seed+')');
   const baseline={...m.baseline,schema:m.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),dataColumns:{...m.baseline.dataColumns,operators:['id','exact_value']}};
   const plan=gate2Plan({runId:run,releaseSha:sha,baseline});
   const request=gate2Client({token:'x',targets,authorization:m.authorization,plan,fetcher:async(url,o)=>{
    const sql=JSON.parse(o.body).batch.map(s=>s.sql),phase=Object.entries(plan.phases).find(([,p])=>fingerprint(p.sql)===fingerprint(sql))[0];
    if(phase==='setup')throw Error('STOP_BEFORE_WRITE');
    const result=sql.map(s=>({success:true,results:m.db.prepare(s).all(),meta:{rows_written:0,changed_db:false}}));
    return new Response(JSON.stringify({success:true,result}));
   }});
   const before=await request('original');m.db.exec('UPDATE operators SET exact_value='+change);const after=await request('original');
   assert.notEqual(fingerprint(before.rows),fingerprint(after.rows));
   assert.equal(before.rows.at(-2).length,after.rows.at(-2).length);
   const value=before.rows.at(-2)[0].exact_value;assert.equal(typeof value,'string');assert.match(value,/^(integer|text|blob|real):/);
  }finally{m.db.close();}
 }
});
test('schema drift between accepted preflight and initial data snapshot fails before writes; provider handling stays exact',async()=>{
 for(const sql of ['CREATE TABLE unexpected(id TEXT)', 'CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value TEXT) WITHOUT ROWID']){
  const m=model();try{m.db.exec(sql);const r=await execute(m);assert.equal(r.blockers[0].code,'GATE2_ACCEPTED_APP_SCHEMA_DISCREPANCY');assert.deepEqual(m.calls,['original']);}finally{m.db.close();}
 }
 const m=model();try{m.db.exec('CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID');const r=await execute(m);assert.equal(r.status,'GATE2_ATOMICITY_PASS',JSON.stringify(r.blockers));}finally{m.db.close();}
});
test('missing or nonzero read metadata and false intentional failure cannot produce PASS or cleanup',async()=>{
 const m=model();try{
  for(const meta of [undefined,{rows_written:1,changed_db:false},{rows_written:0,changed_db:true}]){
   const request=gate2Client({token:'x',targets,authorization:m.authorization,plan:m.plan,fetcher:async()=>new Response(JSON.stringify({success:true,result:m.plan.phases.original.sql.map(()=>({success:true,results:[],meta}))}))});
   await assert.rejects(request('original'),/EVIDENCE_(REFUSED|REQUIRED)/);
  }
  const request=gate2Client({token:'x',targets,authorization:m.authorization,plan:m.plan,fetcher:async()=>new Response(JSON.stringify({success:true,result:m.plan.phases.fk_fail.sql.map(()=>({success:true,results:[],meta:{rows_written:1,changed_db:true}}))}))});
  await assert.rejects(request('fk_fail'),/INTENTIONAL_FAILURE_DID_NOT_FAIL/);
  await assert.rejects(request('fk_fail'),/WRITE_REPLAY_REFUSED/);
 }finally{m.db.close();}
});
test('transport never retries denied, unknown or malformed writes and refuses arbitrary phases/replayed writes',async()=>{
 const m=model();try{for(const fetcher of [async()=>new Response('FICTIONAL-PRIVATE-PROVIDER',{status:403}),async()=>{throw Error('FICTIONAL-PRIVATE-PROVIDER');},async()=>new Response('FICTIONAL-PRIVATE-PROVIDER')]){let calls=0;const request=gate2Client({token:'x',targets,authorization:m.authorization,plan:m.plan,fetcher:async(...a)=>{calls++;return fetcher(...a);}});await assert.rejects(request('setup'),/NO_RETRY/);await assert.rejects(request('setup'),/REPLAY_REFUSED/);assert.equal(calls,1);await assert.rejects(request('DROP TABLE audit_events'),/PHASE_REFUSED/);assert.equal(calls,1);}}finally{m.db.close();}
});
test('unknown setup outcome records possible owned fixtures and never attempts cleanup',async()=>{
 const m=model();try{const request=async phase=>{if(phase==='setup')throw Error('GATE2_OUTCOME_UNKNOWN_NO_RETRY');return m.request(phase);};const r=await executeGate2({plan:m.plan,request,fence:async()=>{},preflight:async()=>({status:'LIVE_SCHEMA_INSPECTION_PASS'})});assert.equal(r.status,'GATE2_BLOCKED');assert.equal(r.cleanupStatus,'HELD_AFTER_BLOCKER');assert.deepEqual(r.remainingFixtureObjects,m.plan.ownedNames);assert.ok(!m.calls.includes('cleanup'));}finally{m.db.close();}
});
test('Owner approval precedes window validation; run/SHA attestation, expiry, edits, identity and replay fail closed',async()=>{
 const g=github();const a=await authorizeGate2({context,fetcher:g.fetcher,now:()=>time});assert.equal(a.windowCommentId,9);assert.equal(a.reviewCommentUsed,false);
 const absent=github({approved:false,age:2*60*60*1000});await assert.rejects(authorizeGate2({context,fetcher:absent.fetcher,now:()=>time}),/OWNER_ENVIRONMENT_APPROVAL_REQUIRED/);assert.equal(absent.calls,2);
 for(const change of [{window:false},{body:windowBody('999',sha)},{edited:true},{age:3600001},{head:main},{replay:true},{planBody:planComment.body+' REVOKED'},{windowOwner:{login:'Creatorloopzone',id:1}}])await assert.rejects(authorizeGate2({context,fetcher:github(change).fetcher,now:()=>time}));
 for(const change of [{GITHUB_RUN_ATTEMPT:'2'},{GATE2_SCOPE:'PRODUCTION'},{GITHUB_REF:'refs/heads/main'}]){const c=github();await assert.rejects(authorizeGate2({context:{...context,...change},fetcher:c.fetcher,now:()=>time}));assert.equal(c.calls,0);}
 await assert.rejects(fenceGate2({context,authorization:a,fetcher:github({edited:true}).fetcher,now:()=>time}),/CHANGED/);
 await assert.rejects(fenceGate2({context,authorization:a,fetcher:github().fetcher,now:()=>time+3600001}),/EXPIRED/);
});
test('stale or revoked fence stops before the next write and leaves verified fixtures for a separate recovery decision',async()=>{
 const m=model();try{let n=0;const r=await executeGate2({plan:m.plan,request:m.request,preflight:async()=>({status:'LIVE_SCHEMA_INSPECTION_PASS'}),fence:async()=>{if(++n===5)throw Error('GATE2_WINDOW_ATTESTATION_CHANGED');}});assert.equal(r.status,'GATE2_BLOCKED');assert.ok(!m.calls.includes('success'));assert.ok(!m.calls.includes('cleanup'));assert.equal(r.cleanupStatus,'HELD_AFTER_BLOCKER');}finally{m.db.close();}
});
test('live entry point blocks without environment approval before any Cloudflare call or fixture write',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-gate2-owner-'));try{const preload=join(dir,'fetch.mjs');await writeFile(preload,`globalThis.fetch=async(url,o)=>{if(!url.startsWith('https://api.github.com/')||o.method!=='GET')throw Error('FORBIDDEN');return new Response(JSON.stringify(url.endsWith('/approvals')?[]:{id:123,head_sha:'${sha}',head_branch:'team-access-directory',run_attempt:1,event:'push',path:'.github/workflows/acceptance-gate2.yml',repository:{full_name:'${context.GITHUB_REPOSITORY}'}}));};`);const r=spawnSync(process.execPath,['--import',preload,resolve('scripts/gate2/live.mjs')],{cwd:dir,env:context,encoding:'utf8'});assert.equal(r.status,1);const receipt=JSON.parse(await readFile(join(dir,'gate2-evidence/TRAINING.json'),'utf8'));assert.equal(receipt.blockers[0].code,'OWNER_ENVIRONMENT_APPROVAL_REQUIRED');assert.equal(receipt.cleanupStatus,'NOT_STARTED');assert.equal(receipt.atomicExecutionCertified,false);}finally{await rm(dir,{recursive:true,force:true});}
});
test('private baseline preparation corroborates accepted rehearsal and emits training column allowlists without applying pending migrations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-gate2-baseline-'));try{
  const seed=`import pathlib,sqlite3,json,hashlib\np=pathlib.Path(${JSON.stringify(dir)});db=sqlite3.connect(':memory:')\nfor m in sorted(pathlib.Path('migrations').glob('*.sql'))[:4]:db.executescript(m.read_text())\nraw='\\n'.join(db.iterdump()).encode();source=p/'source';source.mkdir();e={'status':'FRESH_EXPORTS_CAPTURED','releaseSha':'a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46','runId':'37242966914','exports':[],'blockers':[]}\nfor env,dbid in [('TRAINING','${targets.training.databaseId}'),('PRODUCTION','${targets.production.databaseId}')]:\n (source/(env+'.sql')).write_bytes(raw);e['exports'].append({'environment':env,'databaseId':dbid,'status':'EXPORT_CAPTURED','sha256':hashlib.sha256(raw).hexdigest(),'completedAt':'2026-10-04T23:14:15Z'})\n(source/'export-evidence.json').write_text(json.dumps(e))\n`;
  let r=spawnSync('python3',['-c',seed],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  for(const args of [['bundle',join(dir,'source'),join(dir,'original.zip')],['restore',join(dir,'original.zip'),join(dir,'restored')],['bundle',join(dir,'restored'),join(dir,'accepted.zip')]]){r=spawnSync('python3',['scripts/backup-stage.py',...args,'--release-sha','a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
  r=spawnSync('python3',['scripts/gate2/baseline.py',join(dir,'accepted.zip'),join(dir,'baseline')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const b=JSON.parse(await readFile(join(dir,'baseline/TRAINING.json'),'utf8'));
  assert.ok(b.dataColumns.operators.includes('login_email'));assert.ok(b.dataColumns.schema_migrations.includes('version'));assert.ok(b.dataColumns.audit_events);
  assert.deepEqual(b.registeredTeamMigrations,[]);assert.equal(b.pendingMigrations.length,3);assert.equal(b.schema.some(r=>r.name==='console_team_profiles'),false);
  await assert.rejects(readFile(join(dir,'baseline/PRODUCTION.json')),/ENOENT/);
  const plan=gate2Plan({runId:run,releaseSha:sha,baseline:b});assert.ok(plan.tables.includes('audit_events'));
  const tamper=`import zipfile,pathlib\np=pathlib.Path(${JSON.stringify(dir)})\nwith zipfile.ZipFile(p/'accepted.zip') as old,zipfile.ZipFile(p/'bad.zip','w') as new:\n for name in old.namelist():new.writestr(name,old.read(name)+(b'\\n--tampered' if name=='TRAINING.sql' else b''))\n`;
  assert.equal(spawnSync('python3',['-c',tamper],{encoding:'utf8'}).status,0);
  r=spawnSync('python3',['scripts/gate2/baseline.py',join(dir,'bad.zip'),join(dir,'blocked')],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/GATE2_BASELINE_BLOCKED/);await assert.rejects(readFile(join(dir,'blocked/TRAINING.json')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Gate 2 workflow has protected credential custody, reliable PR attestation and sanitized artifact boundary only',async()=>{
 const w=await readFile('.github/workflows/acceptance-gate2.yml','utf8');assert.match(w,/name: creatorloop-acceptance/);assert.match(w,/github.run_attempt == 1/);assert.match(w,/GATE2_SCOPE: TRAINING_SYNTHETIC_ONLY/);assert.match(w,/issues: read/);assert.match(w,/scripts\/gate2\/baseline.py/);assert.doesNotMatch(w,/wrangler|migrations apply|d1-backup-stage|edge-executor|pull_request_target|set -x/);
 const upload=w.split('uses: actions/upload-artifact@v4')[1].split('      - name:')[0];assert.match(upload,/gate2-evidence\/TRAINING.json/);assert.doesNotMatch(upload,/gate2-private|\.sql|\.zip|baselines/);
});
