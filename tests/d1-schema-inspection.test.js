import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectionPlan,schemaReadClient,inspectSchema} from '../scripts/lib/d1-schema-inspection.mjs';
import {authorizeInspection} from '../scripts/inspection/d1-schema-context.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const baseline={protocol:'CREATORLOOP_D1_SCHEMA_BASELINE_V1',environment:'TRAINING',databaseId:targets.training.databaseId,backupRunId:'37242966914',backupReleaseSha:'a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46',backupSha256:'a'.repeat(64),exportCompletedAt:'2026-10-04T23:14:15Z',schema:[{type:'table',name:'operators',tbl_name:'operators',sql:'CREATE TABLE operators(id TEXT PRIMARY KEY)'}],registration:[{version:'0004_operator_permissions'}],operators:[{cid:0,name:'id',type:'TEXT',notnull:0,dflt_value:null,pk:1}],foreignKeys:{operators:[],schema_migrations:[]},migrationSha256:{'0007_team_governance.sql':'a'.repeat(64)},acceptedRehearsalSha256:{'0007_team_governance.sql':'a'.repeat(64)},registeredTeamMigrations:[],pendingMigrations:['0005_team_directory','0006_audit_history','0007_team_governance']};
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:'c'.repeat(40),GITHUB_TOKEN:'FICTIONAL-PRIVATE-GH',EXPECTED_MAIN_SHA:'b'.repeat(40),ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',SCHEMA_INSPECTION_SCOPE:'TRAINING_ONLY'};
const response=(rows,meta={rows_written:0,changed_db:false})=>new Response(JSON.stringify({success:true,result:[{success:true,results:rows,meta}]}));
const clientOptions={token:'FICTIONAL-PRIVATE-CF',targets,environment:'TRAINING',baseline};
const provider={type:'table',name:'_cf_KV',tbl_name:'_cf_KV',sql:'CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID'};
const providerHash='7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686';
async function normalizedInspection({first=[provider],last=first,extra=[],b=baseline,enabled=true}={}){
 const plan=inspectionPlan(b);let calls=0;
 const receipt=await inspectSchema({baseline:b,normalizeTrainingProvider:enabled,client:async()=>{
  const q=plan[calls++];return {rows:q.key.startsWith('schema')?[...(q.key==='schema'?first:last),...q.expected,...extra]:q.expected,evidence:{rowsWritten:0,changedDatabase:false}};
 }});return {receipt,calls,plan};
}
test('training normalization requires exact provider metadata and retains raw and comparison fingerprints at both fences',async()=>{
 const {receipt,calls,plan}=await normalizedInspection();assert.equal(receipt.status,'LIVE_SCHEMA_INSPECTION_PASS');assert.equal(calls,plan.length);
 for(const c of receipt.checks.filter(c=>c.check.startsWith('schema'))){assert.equal(c.matched,true);assert.equal(c.providerNormalization.actualMetadataSha256,providerHash);assert.equal(c.providerNormalization.requiredMetadataSha256,providerHash);assert.equal(c.providerNormalization.excluded,true);assert.notEqual(c.actualSha256,c.comparisonSha256);assert.equal(c.comparisonSha256,c.expectedSha256);assert.equal(c.rowCount,c.comparisonRowCount+1);}
 assert.doesNotMatch(JSON.stringify(receipt),/CREATE TABLE|value BLOB/);
 const absent=await normalizedInspection({first:[]});assert.equal(absent.receipt.status,'LIVE_SCHEMA_INSPECTION_PASS');assert.equal(absent.receipt.checks[0].providerNormalization.excluded,false);
});
test('changed, malformed and duplicate provider definitions stop at the first schema read',async()=>{
 for(const first of [[{...provider,sql:provider.sql+' '}],[{...provider,sql:provider.sql.replace('value BLOB','value TEXT')}],[{...provider,type:'view'}],[{...provider,tbl_name:'operators'}],[{...provider,extra:'FICTIONAL-PRIVATE'}],[provider,provider]]){
  const {receipt,calls}=await normalizedInspection({first});assert.equal(receipt.status,'LIVE_SCHEMA_INSPECTION_BLOCKED');assert.equal(receipt.blockers[0].code,'PROVIDER_OBJECT_DEFINITION_DISCREPANCY');assert.equal(calls,1);assert.equal(receipt.checks[0].providerNormalization.excluded,false);assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE|CREATE TABLE/);
 }
});
test('only the named provider table is excluded; other provider objects, dependent objects and application changes still block',async()=>{
 for(const extra of [[{...provider,name:'_cf_EXTERNALS',tbl_name:'_cf_EXTERNALS'}],[{type:'trigger',name:'unexpected',tbl_name:'_cf_KV',sql:'FICTIONAL-PRIVATE'}],[{...provider,type:'index',name:'unexpected_index'}],[{type:'view',name:'unexpected_application',tbl_name:'unexpected_application',sql:'FICTIONAL-PRIVATE'}]]){
  const {receipt,calls}=await normalizedInspection({extra});assert.equal(receipt.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE/);
 }
 let calls=0;const plan=inspectionPlan(baseline);const receipt=await inspectSchema({baseline,normalizeTrainingProvider:true,client:async()=>{const q=plan[calls++];return {rows:q.key==='schema'?[provider,{...q.expected[0],sql:'FICTIONAL-PRIVATE'}]:q.expected,evidence:{}};}});assert.equal(receipt.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.equal(calls,1);
});
test('normalization never applies by default, to production, or to a baseline containing the provider object',async()=>{
 const strict=await normalizedInspection({enabled:false});assert.equal(strict.receipt.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.equal(strict.calls,1);
 for(const b of [{...baseline,environment:'PRODUCTION',databaseId:targets.production.databaseId},{...baseline,schema:[provider,...baseline.schema]},{...baseline,foreignKeys:{...baseline.foreignKeys,_cf_KV:[]}}]){
  const {receipt,calls}=await normalizedInspection({b});assert.equal(receipt.blockers[0].code,'TRAINING_PROVIDER_NORMALIZATION_REFUSED');assert.equal(calls,0);
 }
 const production={...baseline,environment:'PRODUCTION',databaseId:targets.production.databaseId};const strictProduction=await normalizedInspection({b:production,enabled:false});assert.equal(strictProduction.receipt.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');
});
test('provider disappearance, appearance, duplicate or altered definition at the end fence blocks',async()=>{
 for(const change of [{last:[]},{first:[],last:[provider]},{last:[{...provider,sql:provider.sql+' '}]},{last:[provider,provider]}]){
  const {receipt,calls,plan}=await normalizedInspection(change);assert.equal(receipt.status,'LIVE_SCHEMA_INSPECTION_BLOCKED');assert.match(receipt.blockers[0].code,/PROVIDER_OBJECT_(END_FENCE|DEFINITION)_DISCREPANCY/);assert.equal(calls,plan.findIndex(q=>q.key==='schemaEndFence')+1);
 }
});
test('normalization does not bypass zero-write evidence or stale-release fencing',async()=>{
 const client=schemaReadClient({...clientOptions,fetcher:async()=>response([provider,...baseline.schema],{rows_written:1,changed_db:true})});
 const r=await inspectSchema({baseline,normalizeTrainingProvider:true,client});assert.equal(r.blockers[0].code,'SCHEMA_READ_ZERO_WRITE_EVIDENCE_REQUIRED');
 let calls=0;const stale=await inspectSchema({baseline,normalizeTrainingProvider:true,client:async()=>{calls++;},fence:async()=>{throw Error('STALE_BACKUP_RELEASE');}});assert.equal(stale.blockers[0].code,'STALE_BACKUP_RELEASE');assert.equal(calls,0);
});
test('registration, identity, foreign-key enforcement and history schema guards remain strict with provider normalization enabled',async()=>{
 const plan=inspectionPlan(baseline);
 for(const key of ['registration','operators','foreignKeyEnforcement','foreignKeys:operators','registrationEndFence']){
  let calls=0;const receipt=await inspectSchema({baseline,normalizeTrainingProvider:true,client:async()=>{const q=plan[calls++];return {rows:q.key===key?[{private:'FICTIONAL-PRIVATE'}]:q.key.startsWith('schema')?[provider,...q.expected]:q.expected,evidence:{rowsWritten:0,changedDatabase:false}};}});
  assert.equal(receipt.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.equal(calls,plan.findIndex(q=>q.key===key)+1);assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE/);
 }
 const guarded={...baseline,schema:[...baseline.schema,{type:'trigger',name:'history_guard',tbl_name:'operators',sql:'FICTIONAL-PRIVATE'}]};let calls=0;
 const receipt=await inspectSchema({baseline:guarded,normalizeTrainingProvider:true,client:async()=>{calls++;return {rows:[provider,...baseline.schema],evidence:{rowsWritten:0,changedDatabase:false}};}});assert.equal(receipt.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.equal(calls,1);
});
test('inspection makes only exact fixed SQL reads to one pinned D1 query endpoint and matches accepted schema',async()=>{
 const calls=[],plan=inspectionPlan(baseline);
 const client=schemaReadClient({...clientOptions,fetcher:async(url,o)=>{
  calls.push({url,o});const body=JSON.parse(o.body);assert.deepEqual(body.params,[]);const q=plan.find(q=>q.sql===body.sql);assert.ok(q);return response(q.expected);
 }});
 const receipt=await inspectSchema({baseline,client,releaseSha:context.GITHUB_SHA,mainSha:context.EXPECTED_MAIN_SHA,runId:'123'});
 assert.equal(receipt.status,'LIVE_SCHEMA_INSPECTION_PASS');assert.equal(calls.length,plan.length);
 for(const {url,o} of calls){assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+targets.accountId+'/d1/database/'+targets.training.databaseId+'/query');assert.equal(o.method,'POST');assert.equal(o.redirect,'error');}
 assert.equal(receipt.remoteMigrationsApplied,false);assert.equal(receipt.atomicExecutionCertified,false);assert.equal(receipt.remoteAppliedFileHashesStored,false);
 assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL|CREATE TABLE|dflt_value|Bearer/);
});
test('transport rejects mutations, settings, injected SQL, arbitrary reads, substitution and malformed baseline before any call',async()=>{
 let calls=0;const client=schemaReadClient({...clientOptions,fetcher:async()=>{calls++;return response([]);}});
 for(const sql of ['DROP TABLE operators','UPDATE operators SET role=\'ADMINISTRATOR\'','DELETE FROM audit_events','PRAGMA foreign_keys=OFF','PRAGMA defer_foreign_keys=ON','PRAGMA optimize','BEGIN','SELECT * FROM operators','SELECT version FROM schema_migrations; DROP TABLE operators','PRAGMA foreign_key_list("operators"); DELETE FROM audit_events'])await assert.rejects(client(sql),/SCHEMA_SQL_REFUSED/);
 for(const change of [{targets:{...targets,accountId:'f'.repeat(32)}},{environment:'PRODUCTION'},{baseline:{...baseline,databaseId:targets.production.databaseId}},{targets:{...targets,training:{...targets.training,databaseId:targets.production.databaseId}}}])assert.throws(()=>schemaReadClient({...clientOptions,...change}),/REFUSED/);
 assert.throws(()=>inspectionPlan({...baseline,foreignKeys:{'operators");DROP TABLE operators;--':[]}}),/REFUSED/);assert.equal(calls,0);
});
test('denied, unknown, redirect and malformed responses never retry or reveal provider messages',async()=>{
 for(const fetcher of [async()=>new Response('FICTIONAL-PRIVATE-PROVIDER',{status:403}),async()=>{throw Error('FICTIONAL-PRIVATE-PROVIDER');},async()=>new Response('FICTIONAL-PRIVATE-PROVIDER'),async()=>new Response(JSON.stringify({success:true,result:[]})),async()=>response([],{}),async()=>response([],{rows_written:1,changed_db:true}),async()=>response([], {rows_written:0})]){
  let calls=0;const client=schemaReadClient({...clientOptions,fetcher:async(...args)=>{calls++;return fetcher(...args);}});
  const r=await inspectSchema({baseline,client,releaseSha:context.GITHUB_SHA,mainSha:context.EXPECTED_MAIN_SHA,runId:'123'});
  assert.equal(r.status,'LIVE_SCHEMA_INSPECTION_BLOCKED');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-PRIVATE-PROVIDER/);
 }
});
test('schema, registration, identity-column, guard, FK and end-fence drift stop at the first mismatch',async()=>{
 const plan=inspectionPlan(baseline);
 for(const key of ['schema','registration','operators','foreignKeys:operators','schemaEndFence','registrationEndFence']){
  let calls=0;const receipt=await inspectSchema({baseline,client:async()=>{const q=plan[calls++];return {rows:q.key===key?[{private:'FICTIONAL-PRIVATE-DATA'}]:q.expected,evidence:{rowsWritten:0,changedDatabase:false}};},releaseSha:context.GITHUB_SHA,mainSha:context.EXPECTED_MAIN_SHA,runId:'123'});
  assert.equal(receipt.status,'LIVE_SCHEMA_INSPECTION_BLOCKED');assert.equal(receipt.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.equal(calls,plan.findIndex(q=>q.key===key)+1);assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE-DATA/);
 }
 const unsafe={...baseline,foreignKeys:{...baseline.foreignKeys,schema_migrations:[{table:'operators',on_delete:'CASCADE',on_update:'NO ACTION'}]}};
 const p=inspectionPlan(unsafe);let calls=0;const receipt=await inspectSchema({baseline:unsafe,client:async()=>({rows:p[calls++].expected,evidence:{}})});assert.equal(receipt.blockers[0].code,'UNSUPPORTED_IDENTITY_FOREIGN_KEY_ACTION');
});
test('all SQL reads require zero-write evidence and obey result and response-size limits',async()=>{
 for(const fetcher of [async()=>response(Array.from({length:257},()=>({}))),async()=>new Response('x'.repeat(2*1024*1024+1))]){
  const client=schemaReadClient({...clientOptions,fetcher});await assert.rejects(client(inspectionPlan(baseline)[0].sql),/BOUND_EXCEEDED|RESPONSE_REFUSED/);
 }
});
function authorizationClient({approved=true,head=context.GITHUB_SHA,runAttempt=1,rejected=false,user={login:'Creatorloopzone',id:245245322}}={}){
 const calls=[];return {calls,fetcher:async(url,o)=>{calls.push({url,o});assert.equal(o.method,'GET');
 const run={id:123,run_attempt:runAttempt,event:'push',head_sha:context.GITHUB_SHA,head_branch:'team-access-directory',repository:{full_name:context.GITHUB_REPOSITORY},path:'.github/workflows/acceptance-d1-schema.yml'};
 const reviews=approved?[{state:rejected?'rejected':'approved',user,comment:'',environments:[{name:'creatorloop-acceptance'}]}]:[];
 return new Response(JSON.stringify(url.endsWith('/approvals')?reviews:url.endsWith('/heads/team-access-directory')?{ref:context.GITHUB_REF,object:{sha:head}}:url.endsWith('/heads/main')?{ref:'refs/heads/main',object:{sha:context.EXPECTED_MAIN_SHA}}:run));
 }};
}
test('protected schema context separately requires Owner approval, first attempt, exact run and current branch/main',async()=>{
 const c=authorizationClient();assert.equal((await authorizeInspection({context,fetcher:c.fetcher})).approvedBy,'Creatorloopzone');
 for(const change of [{approved:false},{rejected:true},{user:{login:'Creatorloopzone',id:1}},{head:'a'.repeat(40)},{runAttempt:2}]){const c=authorizationClient(change);await assert.rejects(authorizeInspection({context,fetcher:c.fetcher}));}
 for(const change of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{ACCEPTANCE_ENVIRONMENT:'production'},{GITHUB_REF:'refs/heads/main'},{GITHUB_REPOSITORY:'fictional/repo'},{SCHEMA_INSPECTION_SCOPE:'PRODUCTION'},{SCHEMA_INSPECTION_SCOPE:undefined}]){const c=authorizationClient();await assert.rejects(authorizeInspection({context:{...context,...change},fetcher:c.fetcher}));assert.equal(c.calls.length,0);}
});
test('a stale fence stops inspection before the next SQL read',async()=>{
 let calls=0;const r=await inspectSchema({baseline,client:async()=>{calls++;return{};},fence:async()=>{throw Error('STALE_BACKUP_RELEASE');}});assert.equal(calls,0);assert.equal(r.status,'LIVE_SCHEMA_INSPECTION_BLOCKED');
});
test('accepted backup baseline validates preserved manifests and exact rehearsal hashes without rerunning pending migrations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-schema-baseline-'));
 try{
  const seed=`import pathlib,sqlite3,json,hashlib,runpy,zipfile\np=pathlib.Path(${JSON.stringify(dir)});db=sqlite3.connect(':memory:')\nfor m in sorted(pathlib.Path('migrations').glob('*.sql'))[:4]:db.executescript(m.read_text())\nraw='\\n'.join(db.iterdump()).encode();source=p/'source';source.mkdir();e={'status':'FRESH_EXPORTS_CAPTURED','releaseSha':'${baseline.backupReleaseSha}','runId':'37242966914','exports':[],'blockers':[]}\nfor env,dbid in [('TRAINING','${targets.training.databaseId}'),('PRODUCTION','${targets.production.databaseId}')]:\n (source/(env+'.sql')).write_bytes(raw);e['exports'].append({'environment':env,'databaseId':dbid,'status':'EXPORT_CAPTURED','sha256':hashlib.sha256(raw).hexdigest(),'completedAt':'2026-10-04T23:14:15Z'})\n(source/'export-evidence.json').write_text(json.dumps(e))\n`;
  let r=spawnSync('python3',['-c',seed],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  for(const args of [['bundle',join(dir,'source'),join(dir,'original.zip')],['restore',join(dir,'original.zip'),join(dir,'restored')],['bundle',join(dir,'restored'),join(dir,'accepted.zip')]]){r=spawnSync('python3',['scripts/backup-stage.py',...args,'--release-sha',baseline.backupReleaseSha],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
  r=spawnSync('python3',['scripts/inspection/d1-schema-baseline.py',join(dir,'accepted.zip'),join(dir,'baselines')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  r=spawnSync('python3',['scripts/inspection/d1-schema-baseline.py',join(dir,'accepted.zip'),join(dir,'training-baseline'),'--training-only'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);await assert.rejects(readFile(join(dir,'training-baseline/PRODUCTION.json')),/ENOENT/);
  const trainingArchive=`import zipfile,pathlib\np=pathlib.Path(${JSON.stringify(dir)})\nwith zipfile.ZipFile(p/'accepted.zip') as old,zipfile.ZipFile(p/'training-evidence.zip','w') as new:\n for name in old.namelist():\n  if not name.startswith('PRODUCTION'):new.writestr(name,old.read(name))\n`;
  assert.equal(spawnSync('python3',['-c',trainingArchive],{encoding:'utf8'}).status,0);
  r=spawnSync('python3',['scripts/inspection/d1-schema-baseline.py',join(dir,'training-evidence.zip'),join(dir,'training-only-evidence'),'--training-only'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const b=JSON.parse(await readFile(join(dir,'baselines/TRAINING.json'),'utf8'));assert.deepEqual(b.pendingMigrations,baseline.pendingMigrations);assert.ok(b.foreignKeys.audit_events);assert.equal(b.schema.some(r=>r.name==='console_team_profiles'),false);
  const plan=inspectionPlan(b);assert.ok(plan.length<=54);const receipt=await inspectSchema({baseline:b,client:async sql=>({rows:plan.find(q=>q.sql===sql).expected,evidence:{rowsWritten:0,changedDatabase:false}})});assert.equal(receipt.status,'LIVE_SCHEMA_INSPECTION_PASS');
  const tamper=`import zipfile,json,pathlib\np=pathlib.Path(${JSON.stringify(dir)})\nwith zipfile.ZipFile(p/'accepted.zip') as old,zipfile.ZipFile(p/'tampered.zip','w') as new:\n for name in old.namelist():\n  value=old.read(name)\n  if name=='TRAINING-preflight.json':\n   d=json.loads(value);d['migration_sha256']['0007_team_governance.sql']='f'*64;value=json.dumps(d).encode()\n  new.writestr(name,value)\n`;
  assert.equal(spawnSync('python3',['-c',tamper],{encoding:'utf8'}).status,0);
  r=spawnSync('python3',['scripts/inspection/d1-schema-baseline.py',join(dir,'tampered.zip'),join(dir,'bad-baseline')],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/ACCEPTED_SCHEMA_BASELINE_BLOCKED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('live entry point cannot read Cloudflare without Owner approval and emits safe receipts for both databases',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-schema-owner-'));try{
  const preload=join(dir,'fetch.mjs'),calls=join(dir,'calls.json');
  await writeFile(preload,`import {writeFileSync} from 'node:fs';let n=0;globalThis.fetch=async url=>{writeFileSync(${JSON.stringify(calls)},JSON.stringify(++n));if(!url.startsWith('https://api.github.com/'))throw Error('FICTIONAL-PRIVATE-FORBIDDEN');return new Response(JSON.stringify(url.endsWith('/approvals')?[]:{id:123,run_attempt:1,event:'push',head_sha:'${context.GITHUB_SHA}',head_branch:'team-access-directory',repository:{full_name:'${context.GITHUB_REPOSITORY}'},path:'.github/workflows/acceptance-d1-schema.yml'}));};`);
  const r=spawnSync(process.execPath,['--import',preload,resolve('scripts/inspection/d1-schema-live.mjs')],{cwd:dir,env:{...context,CLOUDFLARE_API_TOKEN:'FICTIONAL-PRIVATE-CF'},encoding:'utf8'});
  assert.equal(r.status,1);assert.equal(JSON.parse(await readFile(calls,'utf8')),2);assert.doesNotMatch(r.stdout+r.stderr,/FICTIONAL-PRIVATE/);
  for(const env of ['TRAINING','PRODUCTION']){const receipt=JSON.parse(await readFile(join(dir,'schema-evidence',env+'.json'),'utf8'));assert.equal(receipt.status,env==='PRODUCTION'?'NOT_AUTHORIZED_PRODUCTION_HELD':'NOT_EXECUTED_AFTER_BLOCKER');assert.equal(receipt.blockers[0].code,env==='PRODUCTION'?'PRODUCTION_INSPECTION_NOT_AUTHORIZED':'OWNER_ENVIRONMENT_APPROVAL_REQUIRED');}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('approved live entry point succeeds for training and never loads a production baseline or queries production',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-training-only-'));try{
  await mkdir(join(dir,'schema-private/baselines'),{recursive:true});await writeFile(join(dir,'schema-private/baselines/TRAINING.json'),JSON.stringify(baseline));
  const preload=join(dir,'fetch.mjs'),calls=join(dir,'calls.json'),plan=inspectionPlan(baseline);
  await writeFile(preload,`import {writeFileSync} from 'node:fs';const calls=[],plan=${JSON.stringify(plan)},provider=${JSON.stringify(provider)};globalThis.fetch=async(url,o)=>{calls.push(url);writeFileSync(${JSON.stringify(calls)},JSON.stringify(calls));if(url.startsWith('https://api.cloudflare.com/')){if(url!=='https://api.cloudflare.com/client/v4/accounts/${targets.accountId}/d1/database/${targets.training.databaseId}/query'||o.method!=='POST')throw Error('FICTIONAL-PRIVATE-FORBIDDEN');const body=JSON.parse(o.body),q=plan.find(q=>q.sql===body.sql);if(!q||JSON.stringify(body.params)!=='[]')throw Error('FICTIONAL-PRIVATE-FORBIDDEN');return new Response(JSON.stringify({success:true,result:[{success:true,results:q.key.startsWith('schema')?[provider,...q.expected]:q.expected,meta:{rows_written:0,changed_db:false}}]}));}if(o.method!=='GET')throw Error('FICTIONAL-PRIVATE-FORBIDDEN');const data=url.endsWith('/approvals')?[{state:'approved',user:{login:'Creatorloopzone',id:245245322},environments:[{name:'creatorloop-acceptance'}]}]:url.endsWith('/heads/team-access-directory')?{ref:'${context.GITHUB_REF}',object:{sha:'${context.GITHUB_SHA}'}}:url.endsWith('/heads/main')?{ref:'refs/heads/main',object:{sha:'${context.EXPECTED_MAIN_SHA}'}}:{id:123,run_attempt:1,event:'push',head_sha:'${context.GITHUB_SHA}',head_branch:'team-access-directory',repository:{full_name:'${context.GITHUB_REPOSITORY}'},path:'.github/workflows/acceptance-d1-schema.yml'};return new Response(JSON.stringify(data));};`);
  const r=spawnSync(process.execPath,['--import',preload,resolve('scripts/inspection/d1-schema-live.mjs')],{cwd:dir,env:{...context,CLOUDFLARE_API_TOKEN:'FICTIONAL-PRIVATE-CF'},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
  const requests=JSON.parse(await readFile(calls,'utf8'));assert.equal(requests.filter(u=>u.startsWith('https://api.cloudflare.com/')).length,plan.length);assert.ok(requests.every(u=>!u.includes(targets.production.databaseId)));
  const training=JSON.parse(await readFile(join(dir,'schema-evidence/TRAINING.json'),'utf8'));assert.equal(training.status,'LIVE_SCHEMA_INSPECTION_PASS');assert.equal(training.authorization.scope,'TRAINING_ONLY');assert.equal(training.checks[0].providerNormalization.actualMetadataSha256,providerHash);
  const production=JSON.parse(await readFile(join(dir,'schema-evidence/PRODUCTION.json'),'utf8'));assert.equal(production.status,'NOT_AUTHORIZED_PRODUCTION_HELD');assert.equal(production.blockers[0].code,'PRODUCTION_INSPECTION_NOT_AUTHORIZED');assert.equal(production.checks,undefined);assert.doesNotMatch(JSON.stringify(training)+JSON.stringify(production)+r.stdout+r.stderr,/FICTIONAL-PRIVATE|CREATE TABLE/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('workflow retains only sanitized receipts, existing encrypted evidence is reused, and no write executor is wired',async()=>{
 const w=await readFile('.github/workflows/acceptance-d1-schema.yml','utf8');assert.match(w,/environment:\n\s+name: creatorloop-acceptance/);assert.match(w,/github.run_attempt == 1/);assert.match(w,/artifact-ids: '11317109290'/);assert.match(w,/d9d3ef5b502c70f1801693a73f7b516c954ac402a480300f4b1cb25d890ce191/);
 assert.doesNotMatch(w,/wrangler|migrations apply|d1-backup-stage|exportDatabase|edge-executor|pull_request_target|set -x/);
 const upload=w.split('uses: actions/upload-artifact@v4')[1].split('      - name:')[0];assert.match(upload,/schema-evidence\/TRAINING.json/);assert.match(upload,/schema-evidence\/PRODUCTION.json/);assert.doesNotMatch(upload,/schema-private|\.sql|\.zip|baselines/);
 assert.match(w,/--training-only/);assert.match(w,/SCHEMA_INSPECTION_SCOPE: TRAINING_ONLY/);assert.match(w,/NOT_AUTHORIZED_PRODUCTION_HELD/);
});
