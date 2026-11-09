import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,writeFile,rm,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {MIGRATION_HASHES,TRAINING_DB,trainingMigrationPlan,trainingMigrationClient,executeTrainingMigrations,verifyAcceptedGate2} from '../scripts/lib/training-migrations.mjs';
import {fingerprint} from '../scripts/lib/gate2-atomicity.mjs';
import {authorizeTrainingMigration,fenceTrainingMigration,migrationWindowBody} from '../scripts/lib/training-migration-authorization.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
// Keep the closed executor's exact accepted-byte model separate from corrected pending files.
const migrations=Object.fromEntries(await Promise.all(Object.keys(MIGRATION_HASHES).map(async n=>[n,await readFile((n==='0005_team_directory.sql'?'migrations/':'tests/fixtures/accepted-team-migrations/')+n,'utf8')])));
const dir=await mkdtemp(join(tmpdir(),'cl-training-migrations-'));after(()=>rm(dir,{recursive:true,force:true}));
const historicalRoot=join(dir,'historical-source');await mkdir(historicalRoot);
await cp('scripts',join(historicalRoot,'scripts'),{recursive:true});await cp('migrations',join(historicalRoot,'migrations'),{recursive:true});
for(const [name,sql] of Object.entries(migrations))await writeFile(join(historicalRoot,'migrations',name),sql);
const fixture=`import pathlib,sqlite3,json,hashlib
p=pathlib.Path(${JSON.stringify(dir)});db=sqlite3.connect(':memory:')
for m in sorted(pathlib.Path('migrations').glob('*.sql'))[:4]:db.executescript(m.read_text())
db.execute("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('OWNER','team@creatorloop.net','FICTIONAL-PRIVATE-OWNER','ADMINISTRATOR','ACTIVE')")
db.execute("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('RETIRED','support@creatorloop.net','FICTIONAL-PRIVATE-RETIRED','ADMINISTRATOR','DISABLED')")
db.execute("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES('HISTORY','RETIRED','CMP-100','NOTE','Campaign','CMP-100','FICTIONAL-PRIVATE-HISTORY')")
db.commit();raw='\\n'.join(db.iterdump()).encode();(p/'original.sql').write_bytes(raw);source=p/'source';source.mkdir()
e={'status':'FRESH_EXPORTS_CAPTURED','releaseSha':'a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46','runId':'37242966914','exports':[],'blockers':[]}
for env,dbid in [('TRAINING','${TRAINING_DB}'),('PRODUCTION','${targets.production.databaseId}')]:
 (source/(env+'.sql')).write_bytes(raw);e['exports'].append({'environment':env,'databaseId':dbid,'status':'EXPORT_CAPTURED','sha256':hashlib.sha256(raw).hexdigest(),'completedAt':'2026-10-04T23:14:15Z'})
(source/'export-evidence.json').write_text(json.dumps(e))
`;
let r=spawnSync('python3',['-c',fixture],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
for(const args of [['bundle',join(dir,'source'),join(dir,'original.zip')],['restore',join(dir,'original.zip'),join(dir,'restored')],['bundle',join(dir,'restored'),join(dir,'accepted.zip')]]){r=spawnSync('python3',['scripts/backup-stage.py',...args,'--release-sha','a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46'],{encoding:'utf8',cwd:historicalRoot});assert.equal(r.status,0,r.stderr);}
r=spawnSync('python3',['scripts/training-migrations/baseline.py',join(dir,'accepted.zip'),join(dir,'baseline')],{encoding:'utf8',cwd:historicalRoot});assert.equal(r.status,0,r.stderr);
const baseline=JSON.parse(await readFile(join(dir,'baseline/TRAINING.json'),'utf8')),originalSQL=await readFile(join(dir,'original.sql'),'utf8');
const sha='c'.repeat(40),main='b'.repeat(40),run='123',time=Date.parse('2026-10-05T18:00:00Z'),owner={login:'Creatorloopzone',id:245245322};
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:run,GITHUB_SHA:sha,GITHUB_TOKEN:'FICTIONAL-PRIVATE-GH',EXPECTED_MAIN_SHA:main,ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',TRAINING_MIGRATION_SCOPE:'TRAINING_0005_0007_ONLY'};
const provider="CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID";
function model(options={}){
 const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});db.exec(originalSQL);db.exec('PRAGMA foreign_keys=ON');db.exec(provider);
 const b=structuredClone(baseline);b.acceptedGate2SchemaSha256=fingerprint(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
 const plan=trainingMigrationPlan({runId:run,releaseSha:sha,baseline:b,migrations});
 const authorization={scope:'TRAINING_0005_0007_ONLY',databaseId:TRAINING_DB,runId:run,releaseSha:sha,attempt:1,windowExpiresAt:new Date(Date.now()+60*60*1000).toISOString()},calls=[],bodies=[];
 const fetcher=async(url,o)=>{
  assert.equal(o.redirect,'error');assert.equal(new URL(url).origin,'https://api.cloudflare.com');assert.ok(!url.includes(targets.production.databaseId));
  if(url.endsWith('/tokens/verify')){assert.equal(o.method,'GET');calls.push('token');return new Response(JSON.stringify({success:true,result:{status:options.tokenStatus??'active',expires_on:options.tokenExpiry}}));}
  if(!url.endsWith('/query')){assert.equal(o.method,'GET');assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+targets.accountId+'/d1/database/'+TRAINING_DB);calls.push('metadata');return new Response(JSON.stringify({success:true,result:{uuid:TRAINING_DB}}));}
  assert.equal(o.method,'POST');assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+targets.accountId+'/d1/database/'+TRAINING_DB+'/query');
  const body=JSON.parse(o.body);bodies.push(body);assert.ok(body.batch.every(x=>JSON.stringify(x.params)==='[]'));
  const writing=body.batch.length===1&&body.batch[0].sql===plan.migrationSQL;
  if(writing){
   calls.push('migrate');if(options.timeoutBefore)throw Error('FICTIONAL-PRIVATE-TIMEOUT');
   try{
    if(!options.partial)db.exec('BEGIN');
    if(options.failAfterFirst||options.partial){db.exec(migrations['0005_team_directory.sql']);throw Error('SQLITE_CONSTRAINT intentional engine failure');}
    db.exec(body.batch[0].sql);
    if(options.lateFailure)db.exec("INSERT INTO schema_migrations(version) VALUES('0007_team_governance')");
    db.exec('COMMIT');
    if(options.historyDrift)db.exec("INSERT INTO console_team_events VALUES('UNEXPECTED','OWNER','OWNER','FICTIONAL-PRIVATE','FICTIONAL-PRIVATE','ADMINISTRATOR','UNEXPECTED',NULL,'{}',CURRENT_TIMESTAMP)");
    if(options.roleDrift)db.exec("UPDATE operators SET role='OPERATOR' WHERE id='OWNER'");
    if(options.missingGuard)db.exec('DROP TRIGGER audit_events_no_delete');
    if(options.providerDrift)db.exec('ALTER TABLE _cf_KV ADD COLUMN unexpected TEXT');
    if(options.timeoutAfter)throw Error('FICTIONAL-PRIVATE-TIMEOUT');
    if(options.badWriteResponse)return new Response('FICTIONAL-PRIVATE-MALFORMED');
    const one={success:true,results:[],meta:{rows_written:1,changed_db:true}};
    return new Response(JSON.stringify({success:true,result:options.multiResults?[one,one,one]:[one]}));
   }catch(error){
    if(options.timeoutAfter)throw error;
    if(!options.partial)try{db.exec('ROLLBACK');}catch{}
    return new Response(JSON.stringify({success:false,errors:[{code:7500,message:error.message}]}),{status:400});
   }
  }
  const phase=body.batch.some(x=>x.sql.includes('console_team_profiles'))?'post':calls.includes('migrate')?'rollback':calls.includes('before')?'beforeFence':'before';calls.push(phase);
  if(options.race&&phase==='beforeFence')db.exec("UPDATE campaigns SET name='FICTIONAL-PRIVATE-DRIFT' WHERE id='CMP-100'");
  if(options.readFault)return new Response('FICTIONAL-PRIVATE-PROVIDER',{status:403});
  try{
   db.exec('BEGIN');const result=body.batch.map(x=>({success:true,results:db.prepare(x.sql).all(),meta:{rows_written:options.readWrites?1:0,changed_db:options.readWrites===true}}));db.exec('COMMIT');
   if(options.overflow)result[0].results=Array.from({length:513},()=>({}));
   return new Response(JSON.stringify({success:true,result}));
  }catch(error){try{db.exec('ROLLBACK');}catch{}return new Response(JSON.stringify({success:false,errors:[{code:7500,message:error.message}]}),{status:400});}
 };
 const request=trainingMigrationClient({token:'FICTIONAL-PRIVATE-CF',targets,authorization,plan,fetcher});
 return {db,b,plan,authorization,calls,bodies,request,fetcher};
}
const execute=(m,extra={})=>executeTrainingMigrations({plan:m.plan,request:m.request,fence:async()=>{},preflight:async()=>({status:'LIVE_SCHEMA_INSPECTION_PASS'}),...extra});
function github(options={}){
 const created=new Date(time-(options.age??0)).toISOString(),c={id:9,user:options.user??owner,body:options.body??migrationWindowBody(run,sha),issue_url:options.issueUrl??'https://api.github.com/repos/VTholdings/creatorloop-main-site/issues/18',created_at:created,updated_at:options.edited?new Date(time+1).toISOString():created};
 const calls=[];return {calls,fetcher:async(url,o)=>{
  calls.push(url);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');let value;
  if(url.endsWith('/approvals'))value=options.approved===false?[]:[{state:options.rejected?'rejected':'approved',user:options.reviewer??owner,environments:[{name:'creatorloop-acceptance'}]}];
  else if(url.includes('/issues/18/comments?'))value=options.noComment?[]:options.duplicate?[c,c]:[c];
  else if(url.endsWith('/issues/comments/9'))value=c;
  else if(url.endsWith('/heads/team-access-directory'))value={ref:context.GITHUB_REF,object:{sha:options.head??sha}};
  else if(url.endsWith('/heads/main'))value={ref:'refs/heads/main',object:{sha:options.main??main}};
  else value={id:123,head_sha:sha,head_branch:'team-access-directory',run_attempt:options.attempt??1,event:'push',created_at:new Date(time-2*60*60*1000).toISOString(),path:options.path??'.github/workflows/acceptance-training-migrations.yml',repository:{full_name:context.GITHUB_REPOSITORY}};
  return new Response(JSON.stringify(value));
 }};
}
test('historical training-only baseline verifies pinned accepted SQL rehearsal and late-failure rollback',()=>{
 assert.equal(baseline.localRehearsal,'LOCAL_REHEARSAL_AND_ROLLBACK_PASS');assert.deepEqual(baseline.pendingMigrations,Object.keys(MIGRATION_HASHES).map(n=>n.slice(0,-4)));assert.equal(baseline.backupData.audit_events.count,1);assert.equal(baseline.backupData.schema_migrations.count,3);assert.equal(Object.hasOwn(baseline,'production'),false);
 assert.equal(baseline.postTableInfo.console_team_profiles.find(c=>c.name==='environment').dflt_value,"'PRODUCTION'");assert.equal(baseline.postSchema.some(s=>s.name==='operators_expanded'),false);
});
test('closed executor and private rehearsal reject corrected current migration bytes before remote I/O',async()=>{
 const current=Object.fromEntries(await Promise.all(Object.keys(MIGRATION_HASHES).map(async n=>[n,await readFile('migrations/'+n,'utf8')])));
 const m=model();try{assert.throws(()=>trainingMigrationPlan({runId:run,releaseSha:sha,baseline:m.b,migrations:current}),/REVIEWED_MIGRATION_BYTES_REQUIRED/);assert.deepEqual(m.calls,[]);}finally{m.db.close();}
 const result=spawnSync('python3',['scripts/training-migrations/baseline.py',join(dir,'accepted.zip'),join(dir,'current-blocked')],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/TRAINING_MIGRATION_BASELINE_BLOCKED/);
});
test('migration plan preserves reviewed bytes/order as one frozen SQL unit and refuses substitution, altered bytes and registration drift',()=>{
 const m=model();try{
  assert.equal(m.plan.migrationSQL,Object.values(migrations).join('\n'));assert.ok(Object.isFrozen(m.plan));assert.ok(Object.isFrozen(m.plan.before));assert.deepEqual(m.plan.migrationSha256,MIGRATION_HASHES);
  const build=changes=>trainingMigrationPlan({runId:run,releaseSha:sha,baseline:structuredClone(m.b),migrations,...changes});
  for(const changes of [{runId:"1';DELETE"},{releaseSha:'x'},{baseline:{...baseline,environment:'PRODUCTION',databaseId:targets.production.databaseId}},{baseline:{...baseline,registeredTeamMigrations:['0005_team_directory']}},{baseline:{...baseline,dataColumns:{...baseline.dataColumns,operators:['id']}}},{baseline:{...baseline,foreignKeys:{...baseline.foreignKeys,audit_events:[{table:'operators',on_delete:'CASCADE',on_update:'NO ACTION'}]}}},{migrations:{...migrations,'0007_team_governance.sql':migrations['0007_team_governance.sql']+' '}},{migrations:Object.fromEntries(Object.entries(migrations).reverse())}])assert.throws(()=>build(changes),/REFUSED|REQUIRED/);
  assert.throws(()=>trainingMigrationClient({token:'x',targets,authorization:m.authorization,plan:{...m.plan}}),/REFUSED/);
  for(const change of [{token:''},{targets:{...targets,accountId:'f'.repeat(32)}},{targets:{...targets,training:targets.production}},{authorization:{...m.authorization,databaseId:targets.production.databaseId}},{authorization:{...m.authorization,scope:'TRAINING_SYNTHETIC_ONLY'}}])assert.throws(()=>trainingMigrationClient({token:'x',targets,authorization:m.authorization,plan:m.plan,...change}),/REFUSED/);
 }finally{m.db.close();}
});
test('atomic migration succeeds, preserves retired identity/history, creates empty governance tables and exact registrations',async()=>{
 for(const multiResults of [false,true]){
  const m=model({multiResults});try{
   const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_PASS',JSON.stringify(receipt.blockers));assert.equal(receipt.remoteMigrationsApplied,true);assert.equal(m.calls.filter(c=>c==='migrate').length,1);
   const write=m.bodies.find(b=>b.batch.length===1&&b.batch[0].sql===m.plan.migrationSQL);assert.equal(write.batch.length,1);assert.equal(write.batch[0].sql,Object.values(migrations).join('\n'));
   assert.equal(m.db.prepare("SELECT account_status FROM operators WHERE id='RETIRED'").get().account_status,'DISABLED');assert.equal(m.db.prepare("SELECT new_value FROM audit_events WHERE id='HISTORY'").get().new_value,'FICTIONAL-PRIVATE-HISTORY');
   assert.equal(m.db.prepare('SELECT count(*) n FROM schema_migrations').get().n,6);for(const t of m.plan.newTables)assert.equal(m.db.prepare('SELECT count(*) n FROM '+t).get().n,0);
   assert.ok(receipt.checks.every(c=>c.matched));assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE|CREATE TABLE|INSERT INTO|Bearer|login_email|support@/);
  }finally{m.db.close();}
 }
});
test('early and late statement failures roll back all schema, registration and original history without retry',async()=>{
 for(const options of [{failAfterFirst:true},{lateFailure:true}]){const m=model(options);try{
  const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.equal(receipt.blockers[0].code,'MIGRATION_SQL_FAILED_ROLLBACK_VERIFIED');assert.equal(receipt.rollbackStatus,'VERIFIED_ATOMIC_ROLLBACK');assert.equal(receipt.remoteMigrationsApplied,false);assert.equal(m.db.prepare('SELECT count(*) n FROM schema_migrations').get().n,3);assert.equal(m.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='console_team_profiles'").get().n,0);assert.equal(m.calls.filter(c=>c==='migrate').length,1);await assert.rejects(m.request('migrate'),/REPLAY_REFUSED/);
 }finally{m.db.close();}}
});
test('partial schema/registration effects block with unverified recovery and no compensating writes',async()=>{
 const m=model({partial:true});try{const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.match(receipt.blockers[0].code,/SCHEMA_DEFINITIONS_DISCREPANCY/);assert.equal(receipt.rollbackStatus,'UNVERIFIED_RECOVERY_HELD');assert.equal(receipt.remoteMigrationsApplied,null);assert.equal(m.db.prepare('SELECT count(*) n FROM schema_migrations').get().n,4);assert.equal(m.calls.filter(c=>c==='migrate').length,1);}finally{m.db.close();}
});
test('timeout never proves rollback, even if a bounded read finds unchanged state; committed unknown outcomes remain held',async()=>{
 for(const options of [{timeoutBefore:true},{timeoutAfter:true},{badWriteResponse:true}]){const m=model(options);try{
  const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.equal(receipt.remoteMigrationsApplied,null);assert.equal(m.calls.filter(c=>c==='migrate').length,1);assert.doesNotMatch(receipt.rollbackStatus,/^VERIFIED/);assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE/);
  if(options.timeoutBefore)assert.equal(receipt.rollbackStatus,'UNCHANGED_AT_INSPECTION_OUTCOME_STILL_UNKNOWN');
 }finally{m.db.close();}}
});
test('backup data drift, same-count race, schema drift and unapproved provider objects block before migration submission',async()=>{
 for(const change of [m=>m.db.exec("UPDATE operators SET display_name='FICTIONAL-PRIVATE-DRIFT' WHERE id='OWNER'"),m=>m.db.exec('CREATE TABLE unexpected(id TEXT)'),m=>m.db.exec('ALTER TABLE _cf_KV ADD COLUMN unexpected TEXT')]){const m=model();try{change(m);const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.equal(receipt.migrationSubmitted,false);assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}}
 const m=model({race:true});try{assert.equal((await execute(m)).status,'TRAINING_MIGRATION_BLOCKED');assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}
});
test('post-checks reject changed identity/history, missing guards and changed provider state without correcting anything',async()=>{
 for(const options of [{roleDrift:true},{historyDrift:true},{missingGuard:true},{providerDrift:true}]){const m=model(options);try{const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.equal(receipt.remoteMigrationsApplied,true);assert.equal(receipt.rollbackStatus,'COMMITTED_NO_AUTOMATIC_RESTORE');assert.equal(m.calls.filter(c=>c==='migrate').length,1);}finally{m.db.close();}}
});
test('disabled enforcement, constraint bypass, active FK deferral and FK violations all block before migration',async()=>{
 for(const sql of ['PRAGMA foreign_keys=OFF','PRAGMA ignore_check_constraints=ON']){const m=model();try{m.db.exec(sql);const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}}
 const m=model();try{m.db.exec("PRAGMA foreign_keys=OFF;INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id) VALUES('ORPHAN','MISSING','CMP-100','NOTE','Campaign','CMP-100');PRAGMA foreign_keys=ON");assert.equal((await execute(m)).status,'TRAINING_MIGRATION_BLOCKED');assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}
});
test('read responses require zero-write evidence and enforce bounded rows without leaking provider messages',async()=>{
 for(const options of [{readWrites:true},{overflow:true},{readFault:true}]){const m=model(options);try{const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.ok(!m.calls.includes('migrate'));assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE/);}finally{m.db.close();}}
});
test('account credential status/expiry and database target corroboration fail closed before any migration',async()=>{
 for(const options of [{tokenStatus:'expired'},{tokenExpiry:new Date(Date.now()+1000).toISOString()}]){const m=model(options);try{const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}}
 const m=model();try{const request=trainingMigrationClient({token:'x',targets,authorization:m.authorization,plan:m.plan,fetcher:async()=>new Response(JSON.stringify({success:true,result:{uuid:targets.production.databaseId}}))});await assert.rejects(request('metadata'),/METADATA_MISMATCH/);}finally{m.db.close();}
});
test('arbitrary phase/SQL requests and request replay cannot introduce a second write or other target',async()=>{
 const m=model();try{for(const name of ['DROP TABLE operators','restore','production','cleanup','apply0005'])await assert.rejects(m.request(name),/PHASE_REFUSED/);await m.request('token');await assert.rejects(m.request('token'),/REPLAY_REFUSED/);assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}
});
test('denied, redirected, oversized and malformed migration responses retain unknown outcome and never retry',async()=>{
 const m=model();try{
  for(const fetcher of [async()=>new Response('FICTIONAL-PRIVATE',{status:403}),async()=>new Response('FICTIONAL-PRIVATE',{status:302}),async()=>new Response('x'.repeat(4*1024*1024+1)),async()=>new Response(JSON.stringify({success:true,result:[]}))]){
   let calls=0;const request=trainingMigrationClient({token:'x',targets,authorization:m.authorization,plan:m.plan,fetcher:async(...a)=>{calls++;return fetcher(...a);}});
   const result=await request('migrate');assert.equal(result.outcome,'UNKNOWN');assert.doesNotMatch(JSON.stringify(result),/FICTIONAL-PRIVATE/);await assert.rejects(request('migrate'),/REPLAY_REFUSED/);assert.equal(calls,1);
  }
 }finally{m.db.close();}
});
test('report JSON/version conflicts are detected in preflight before index or migration writes',async()=>{
 for(const values of [[['BAD','INVALID']],[['FIRST','{"version":1}'],['SECOND','{"version":1}']]]){
  const m=model();try{
   for(const [id,newValue] of values)m.db.prepare("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,'OWNER','CMP-100','REPORT_FINALIZED','FinalizedReport','REPORT',?)").run(id,newValue);
   const receipt=await execute(m);assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');
   assert.equal(receipt.blockers[0].code,values.length===1?'MIGRATION_REPORTJSONPREFLIGHT_DISCREPANCY':'MIGRATION_REPORTVERSIONCOLLISIONS_DISCREPANCY');assert.ok(!m.calls.includes('migrate'));
  }finally{m.db.close();}
 }
});
test('an expired per-request fence blocks immediately before migration submission',async()=>{
 const m=model();let fences=0;try{const receipt=await execute(m,{fence:async()=>{if(++fences===6)throw Error('MIGRATION_WINDOW_ATTESTATION_EXPIRED');}});assert.equal(receipt.status,'TRAINING_MIGRATION_BLOCKED');assert.equal(receipt.migrationSubmitted,false);assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}
});
test('insufficient remaining window blocks the client before I/O and is reported as not submitted',async()=>{
 const m=model();try{
  const request=trainingMigrationClient({token:'x',targets,authorization:{...m.authorization,windowExpiresAt:new Date(Date.now()+60000).toISOString()},plan:m.plan,fetcher:m.fetcher});
  const receipt=await execute(m,{request});assert.equal(receipt.migrationSubmitted,false);assert.equal(receipt.remoteMigrationsApplied,false);assert.equal(receipt.blockers[0].code,'MIGRATION_WINDOW_EXECUTION_BUDGET_REQUIRED');assert.ok(!m.calls.includes('migrate'));
 }finally{m.db.close();}
});
test('stale fence or failed fresh Gate 1 prevents any migration and later reads/writes',async()=>{
 const m=model();try{const receipt=await execute(m,{fence:async()=>{throw Error('STALE_BACKUP_RELEASE');}});assert.equal(receipt.migrationSubmitted,false);assert.equal(m.calls.length,0);}finally{m.db.close();}
 const n=model();try{const receipt=await execute(n,{preflight:async()=>({status:'LIVE_SCHEMA_INSPECTION_BLOCKED'})});assert.equal(receipt.migrationSubmitted,false);assert.ok(!n.calls.includes('before')&&!n.calls.includes('migrate'));}finally{n.db.close();}
});
test('exact immutable Owner migration comment plus independent environment approval authorizes only this run/SHA',async()=>{
 const g=github();const a=await authorizeTrainingMigration({context,fetcher:g.fetcher,now:()=>time});assert.equal(a.scope,'TRAINING_0005_0007_ONLY');assert.equal(a.reviewCommentUsed,false);assert.equal(a.databaseId,TRAINING_DB);assert.ok(Object.isFrozen(a));assert.equal(a.windowExpiresAt,new Date(time+60*60*1000).toISOString());
 await fenceTrainingMigration({context,authorization:a,fetcher:g.fetcher,now:()=>time});
});
test('missing environment approval takes precedence over absent/expired window; neither can be bypassed',async()=>{
 const g=github({approved:false,age:2*60*60*1000});await assert.rejects(authorizeTrainingMigration({context,fetcher:g.fetcher,now:()=>time}),/OWNER_ENVIRONMENT_APPROVAL_REQUIRED/);assert.equal(g.calls.length,2);
 for(const options of [{noComment:true},{duplicate:true},{edited:true},{user:{login:'Creatorloopzone',id:1}},{reviewer:{login:'Creatorloopzone',id:1}},{issueUrl:'https://api.github.com/repos/VTholdings/creatorloop-main-site/issues/17'},{body:migrationWindowBody('124',sha)},{body:migrationWindowBody(run,'d'.repeat(40))},{body:'CREATORLOOP_GATE2_WINDOW_V1\nrun=123\nsha='+sha+'\nattestation=GATE2_TRAINING_NO_ACTIVE_OPERATORS'},{age:60*60*1000},{age:-1},{rejected:true},{head:'d'.repeat(40)},{main:'d'.repeat(40)},{attempt:2},{path:'.github/workflows/acceptance-gate2.yml'}]){const g=github(options);await assert.rejects(authorizeTrainingMigration({context,fetcher:g.fetcher,now:()=>time}));}
});
test('foreign workflow/context, replay, missing scope and nontraining environment fail before fetching evidence',async()=>{
 for(const change of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_REF:'refs/heads/main'},{GITHUB_REPOSITORY:'foreign/repo'},{TRAINING_MIGRATION_SCOPE:'PRODUCTION'},{TRAINING_MIGRATION_SCOPE:undefined},{ACCEPTANCE_ENVIRONMENT:'production'}]){const g=github();await assert.rejects(authorizeTrainingMigration({context:{...context,...change},fetcher:g.fetcher,now:()=>time}));assert.equal(g.calls.length,0);}
});
test('each fence rechecks saved comment, independent approval, run attempt, branch/main and expiry',async()=>{
 const a=await authorizeTrainingMigration({context,fetcher:github().fetcher,now:()=>time});
 for(const options of [{edited:true},{noComment:true,body:'CHANGED'},{approved:false},{head:'e'.repeat(40)},{main:'e'.repeat(40)},{attempt:2}])await assert.rejects(fenceTrainingMigration({context,authorization:a,fetcher:github(options).fetcher,now:()=>time}));
 await assert.rejects(fenceTrainingMigration({context,authorization:a,fetcher:github().fetcher,now:()=>time+60*60*1000}),/EXPIRED/);
 const m=model();try{const request=trainingMigrationClient({token:'x',targets,authorization:{...m.authorization,windowExpiresAt:new Date(Date.now()+1000).toISOString()},plan:m.plan,fetcher:m.fetcher});await assert.rejects(request('migrate'),/EXECUTION_BUDGET/);assert.ok(!m.calls.includes('migrate'));}finally{m.db.close();}
});
test('unpinned or forged Gate 2 receipt cannot replace accepted rollback/backup evidence',()=>{
 for(const raw of ['{}',JSON.stringify({status:'GATE2_ATOMICITY_PASS',atomicExecutionCertified:true})])assert.throws(()=>verifyAcceptedGate2(raw,baseline),/HASH_REQUIRED/);
});
test('live entry point blocks before any Cloudflare request without approval and never exposes secrets',async()=>{
 const sub=join(dir,'entry');await import('node:fs/promises').then(x=>x.mkdir(sub));const preload=join(sub,'fetch.mjs');
 await writeFile(preload,`globalThis.fetch=async(url,o)=>{if(!url.startsWith('https://api.github.com/')||o.method!=='GET')throw Error('FORBIDDEN');return new Response(JSON.stringify(url.endsWith('/approvals')?[]:{id:123,head_sha:'${sha}',head_branch:'team-access-directory',run_attempt:1,event:'push',created_at:'2026-10-05T17:00:00Z',path:'.github/workflows/acceptance-training-migrations.yml',repository:{full_name:'${context.GITHUB_REPOSITORY}'}}));};`);
 const result=spawnSync(process.execPath,['--import',preload,resolve('scripts/training-migrations/live.mjs')],{cwd:sub,env:{...context,CLOUDFLARE_API_TOKEN:'FICTIONAL-PRIVATE-CF'},encoding:'utf8'});assert.equal(result.status,1);
 const receipt=JSON.parse(await readFile(join(sub,'training-migration-evidence/TRAINING.json'),'utf8'));assert.equal(receipt.blockers[0].code,'OWNER_ENVIRONMENT_APPROVAL_REQUIRED');assert.equal(receipt.migrationSubmitted,false);assert.equal(receipt.productionAccessed,false);assert.doesNotMatch(result.stdout+result.stderr+JSON.stringify(receipt),/FICTIONAL-PRIVATE/);
});
test('protected workflow contains one migration executor, existing secrets, pinned accepted evidence and sanitized-only retention',async()=>{
 const w=await readFile('.github/workflows/acceptance-training-migrations.yml','utf8');assert.match(w,/environment:\n\s+name: creatorloop-acceptance/);assert.match(w,/github.run_attempt == 1/);assert.match(w,/TRAINING_MIGRATION_SCOPE: TRAINING_0005_0007_ONLY/);assert.match(w,/secrets.CLOUDFLARE_API_TOKEN/);assert.match(w,/secrets.CREATORLOOP_BACKUP_PASSPHRASE/);assert.match(w,/artifact-ids: '11317109290'/);assert.match(w,/artifact-ids: '11363258261'/);assert.match(w,/retention-days: 90/);
 assert.doesNotMatch(w,/wrangler|migrations apply|d1-backup-stage|edge-executor|pull_request_target|set -x|workflow_dispatch/i);
 const upload=w.split('uses: actions/upload-artifact@v4')[1].split('      - name:')[0];assert.match(upload,/training-migration-evidence\/TRAINING.json/);assert.doesNotMatch(upload,/private|\.sql|\.zip|baselines/);
});
