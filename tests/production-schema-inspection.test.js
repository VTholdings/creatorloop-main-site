import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {schemaReadClient,inspectionPlan} from '../scripts/lib/d1-schema-inspection.mjs';
import {authorizeProductionInspection,inspectProductionSchema,verifyTrainingPass} from '../scripts/lib/production-schema-inspection.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const baseline={protocol:'CREATORLOOP_D1_SCHEMA_BASELINE_V1',environment:'PRODUCTION',databaseId:targets.production.databaseId,backupRunId:'37242966914',backupReleaseSha:'a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46',backupSha256:'a'.repeat(64),schema:[{type:'table',name:'operators',tbl_name:'operators',sql:'CREATE TABLE operators(id TEXT PRIMARY KEY)'}],registration:[{version:'0004_operator_permissions'}],operators:[],foreignKeys:{operators:[],schema_migrations:[]},migrationSha256:{'0007_team_governance.sql':'a'.repeat(64)},acceptedRehearsalSha256:{},registeredTeamMigrations:[],pendingMigrations:['0005_team_directory','0006_audit_history','0007_team_governance']};
const provider={type:'table',name:'_cf_KV',tbl_name:'_cf_KV',sql:'CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID'};
const providerHash='7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686';
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:'c'.repeat(40),GITHUB_TOKEN:'FICTIONAL-PRIVATE-GH',EXPECTED_MAIN_SHA:'b'.repeat(40),ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',SCHEMA_INSPECTION_SCOPE:'PRODUCTION_ONLY'};
const training={protocol:'CREATORLOOP_D1_SCHEMA_INSPECTION_V1',environment:'TRAINING',databaseId:targets.training.databaseId,runId:'37248108426',releaseSha:'adfaadbdaa1d7348670761083f71da39a5d725ff',status:'LIVE_SCHEMA_INSPECTION_PASS',blockers:[],checks:Array.from({length:21},(_,i)=>({check:i===0?'schema':i===19?'schemaEndFence':'fixture'+i,matched:true,rowsWritten:0,changedDatabase:false,...(i===0||i===19?{providerNormalization:{actualMetadataSha256:providerHash,excluded:true,definitionMatched:true}}:{})})),authorization:{scope:'TRAINING_ONLY',approvedBy:'Creatorloopzone'},remoteMigrationsApplied:false,remoteRestorePerformed:false,productionDeployed:false,migrationSha256:baseline.migrationSha256};
const response=(rows,meta={rows_written:0,changed_db:false})=>new Response(JSON.stringify({success:true,result:[{success:true,results:rows,meta}]}));
function github({approved=true,head=context.GITHUB_SHA,runPath='.github/workflows/acceptance-production-schema.yml',rejected=false}={}){
 return async(url,o)=>{assert.equal(o.method,'GET');const run={id:123,run_attempt:1,event:'push',head_sha:context.GITHUB_SHA,head_branch:'team-access-directory',repository:{full_name:context.GITHUB_REPOSITORY},path:runPath};return new Response(JSON.stringify(url.endsWith('/approvals')?approved?[{state:rejected?'rejected':'approved',user:{login:'Creatorloopzone',id:245245322},environments:[{name:'creatorloop-acceptance'}]}]:[]:url.endsWith('/heads/team-access-directory')?{ref:context.GITHUB_REF,object:{sha:head}}:url.endsWith('/heads/main')?{ref:'refs/heads/main',object:{sha:context.EXPECTED_MAIN_SHA}}:run));};
}
async function inspect({first=[provider],last=first,extra=[],enabled=true,mismatch}={}){
 const plan=inspectionPlan(baseline);let calls=0;const r=await inspectProductionSchema({baseline,normalizeProvider:enabled,client:async()=>{const q=plan[calls++];return {rows:q.key===mismatch?[{private:'FICTIONAL-PRIVATE'}]:q.key.startsWith('schema')?[...(q.key==='schema'?first:last),...q.expected,...extra]:q.expected,evidence:{rowsWritten:0,changedDatabase:false}};}});return {r,calls,plan};
}
test('production requires its own approved environment, exact workflow, scope, first attempt and current SHA',async()=>{
 assert.equal((await authorizeProductionInspection({context,fetcher:github()})).scope,'PRODUCTION_ONLY');
 for(const change of [{approved:false},{rejected:true},{head:'a'.repeat(40)},{runPath:'.github/workflows/acceptance-d1-schema.yml'}])await assert.rejects(authorizeProductionInspection({context,fetcher:github(change)}));
 for(const change of [{SCHEMA_INSPECTION_SCOPE:'TRAINING_ONLY'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_REF:'refs/heads/main'}]){let calls=0;await assert.rejects(authorizeProductionInspection({context:{...context,...change},fetcher:async()=>{calls++;}}));assert.equal(calls,0);}
});
test('completed training evidence and unchanged migration bytes are required before production',()=>{
 assert.equal(verifyTrainingPass(training,baseline).runId,'37248108426');
 for(const change of [{status:'LIVE_SCHEMA_INSPECTION_BLOCKED'},{runId:'1'},{checks:training.checks.slice(1)},{remoteMigrationsApplied:true},{migrationSha256:{}},{authorization:{scope:'PRODUCTION_ONLY'}}])assert.throws(()=>verifyTrainingPass({...training,...change},baseline),/REQUIRED/);
 assert.throws(()=>verifyTrainingPass({...training,checks:training.checks.map(c=>c.check==='schema'?{...c,providerNormalization:{}}:c)},baseline),/REQUIRED/);
});
test('production named exact provider exception retains raw inventory, exact fingerprint and both end fences',async()=>{
 const {r,calls,plan}=await inspect();assert.equal(r.status,'LIVE_SCHEMA_INSPECTION_PASS');assert.equal(calls,plan.length);assert.equal(r.providerChecks.length,2);
 for(const c of r.checks.filter(c=>c.check.startsWith('schema'))){assert.notEqual(c.actualSha256,c.comparisonSha256);assert.equal(c.expectedSha256,c.comparisonSha256);assert.equal(c.providerNormalization.actualMetadataSha256,providerHash);assert.equal(c.providerNormalization.excluded,true);}
 assert.doesNotMatch(JSON.stringify(r),/CREATE TABLE|value BLOB|FICTIONAL-PRIVATE/);
 assert.equal((await inspect({first:[]})).r.status,'LIVE_SCHEMA_INSPECTION_PASS');assert.equal((await inspect({enabled:false})).r.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');
 await assert.rejects(inspectProductionSchema({baseline:{...baseline,environment:'TRAINING',databaseId:targets.training.databaseId},client:async()=>{throw Error('UNEXPECTED');}}),/TARGET_REFUSED/);
 await assert.rejects(inspectProductionSchema({baseline:{...baseline,schema:[provider,...baseline.schema]},normalizeProvider:true,client:async()=>{throw Error('UNEXPECTED');}}),/BASELINE_REFUSED/);
});
test('changed or duplicate provider, unrelated provider/application object and end-fence drift stop immediately',async()=>{
 for(const first of [[{...provider,sql:provider.sql+' '}],[provider,provider],[{...provider,type:'view'}]]){const {r,calls}=await inspect({first});assert.equal(calls,1);assert.equal(r.blockers[0].code,'PROVIDER_OBJECT_DEFINITION_DISCREPANCY');assert.equal(r.providerChecks[0].providerNormalization.excluded,false);}
 for(const extra of [[{...provider,name:'_cf_EXTERNALS',tbl_name:'_cf_EXTERNALS'}],[{type:'trigger',name:'unexpected',tbl_name:'_cf_KV',sql:'FICTIONAL-PRIVATE'}]]){const {r,calls}=await inspect({extra});assert.equal(calls,1);assert.equal(r.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-PRIVATE/);}
 for(const change of [{last:[]},{first:[],last:[provider]},{last:[{...provider,sql:provider.sql+' '}]}]){const {r,calls,plan}=await inspect(change);assert.equal(calls,plan.findIndex(q=>q.key==='schemaEndFence')+1);assert.match(r.blockers[0].code,/PROVIDER_OBJECT_(END_FENCE|DEFINITION)_DISCREPANCY/);}
});
test('schema, migrations, identity, FK configuration and guards still compare strictly; zero-write and stale fences remain mandatory',async()=>{
 for(const mismatch of ['schema','registration','operators','foreignKeyEnforcement','foreignKeys:operators','registrationEndFence']){const {r,calls,plan}=await inspect({mismatch});assert.equal(r.blockers[0].code,'LIVE_SCHEMA_DISCREPANCY');assert.equal(calls,plan.findIndex(q=>q.key===mismatch)+1);}
 let calls=0;const client=schemaReadClient({token:'FICTIONAL-PRIVATE',targets,environment:'PRODUCTION',baseline,fetcher:async()=>{calls++;return response([provider,...baseline.schema],{rows_written:1,changed_db:true});}});
 const r=await inspectProductionSchema({baseline,client,normalizeProvider:true});assert.equal(r.blockers[0].code,'SCHEMA_READ_ZERO_WRITE_EVIDENCE_REQUIRED');assert.equal(calls,1);
 calls=0;const stale=await inspectProductionSchema({baseline,normalizeProvider:true,client:async()=>{calls++;},fence:async()=>{throw Error('STALE_BACKUP_RELEASE');}});assert.equal(calls,0);assert.equal(stale.blockers[0].code,'STALE_BACKUP_RELEASE');
});
test('production entry point cannot contact Cloudflare before separate environment approval',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-prod-approval-'));try{
  const preload=join(dir,'fetch.mjs');
  await writeFile(preload,`globalThis.fetch=async(url,o)=>{if(!url.startsWith('https://api.github.com/')||o.method!=='GET')throw Error('FORBIDDEN');return new Response(JSON.stringify(url.endsWith('/approvals')?[]:{id:123,run_attempt:1,event:'push',head_sha:'${context.GITHUB_SHA}',head_branch:'team-access-directory',repository:{full_name:'${context.GITHUB_REPOSITORY}'},path:'.github/workflows/acceptance-production-schema.yml'}));};`);
  const r=spawnSync(process.execPath,['--import',preload,resolve('scripts/production-inspection/live.mjs')],{cwd:dir,env:context,encoding:'utf8'});assert.equal(r.status,1);const receipt=JSON.parse(await readFile(join(dir,'production-evidence/PRODUCTION.json'),'utf8'));assert.equal(receipt.blockers[0].code,'OWNER_ENVIRONMENT_APPROVAL_REQUIRED');assert.doesNotMatch(r.stdout+r.stderr,/FICTIONAL-PRIVATE/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('approved production entry point queries only production and reuses accepted training receipt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-prod-only-'));try{
  await mkdir(join(dir,'production-private/baselines'),{recursive:true});await mkdir(join(dir,'production-private/training-pass'));await writeFile(join(dir,'production-private/baselines/PRODUCTION.json'),JSON.stringify(baseline));await writeFile(join(dir,'production-private/training-pass/TRAINING.json'),JSON.stringify(training));
  const preload=join(dir,'fetch.mjs'),callsPath=join(dir,'calls.json'),plan=inspectionPlan(baseline);
  await writeFile(preload,`import {writeFileSync} from 'node:fs';const plan=${JSON.stringify(plan)},provider=${JSON.stringify(provider)},calls=[];globalThis.fetch=async(url,o)=>{calls.push(url);writeFileSync(${JSON.stringify(callsPath)},JSON.stringify(calls));if(url.startsWith('https://api.cloudflare.com/')){if(url!=='https://api.cloudflare.com/client/v4/accounts/${targets.accountId}/d1/database/${targets.production.databaseId}/query'||o.method!=='POST')throw Error('FORBIDDEN');const body=JSON.parse(o.body),q=plan.find(q=>q.sql===body.sql);if(!q||JSON.stringify(body.params)!=='[]')throw Error('FORBIDDEN');return new Response(JSON.stringify({success:true,result:[{success:true,results:q.key.startsWith('schema')?[provider,...q.expected]:q.expected,meta:{rows_written:0,changed_db:false}}]}));}const data=url.endsWith('/approvals')?[{state:'approved',user:{login:'Creatorloopzone',id:245245322},environments:[{name:'creatorloop-acceptance'}]}]:url.endsWith('/heads/team-access-directory')?{ref:'${context.GITHUB_REF}',object:{sha:'${context.GITHUB_SHA}'}}:url.endsWith('/heads/main')?{ref:'refs/heads/main',object:{sha:'${context.EXPECTED_MAIN_SHA}'}}:{id:123,run_attempt:1,event:'push',head_sha:'${context.GITHUB_SHA}',head_branch:'team-access-directory',repository:{full_name:'${context.GITHUB_REPOSITORY}'},path:'.github/workflows/acceptance-production-schema.yml'};return new Response(JSON.stringify(data));};`);
  const r=spawnSync(process.execPath,['--import',preload,resolve('scripts/production-inspection/live.mjs')],{cwd:dir,env:{...context,CLOUDFLARE_API_TOKEN:'FICTIONAL-PRIVATE'},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);const calls=JSON.parse(await readFile(callsPath,'utf8'));assert.equal(calls.filter(u=>u.startsWith('https://api.cloudflare.com/')).length,plan.length);assert.ok(calls.every(u=>!u.includes(targets.training.databaseId)));
  const receipt=JSON.parse(await readFile(join(dir,'production-evidence/PRODUCTION.json'),'utf8'));assert.equal(receipt.status,'LIVE_SCHEMA_INSPECTION_PASS');assert.equal(receipt.trainingPass.runId,'37248108426');assert.equal(receipt.authorization.scope,'PRODUCTION_ONLY');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('production workflow is protected, retains only a sanitized receipt and has no write executor or new export',async()=>{
 const w=await readFile('.github/workflows/acceptance-production-schema.yml','utf8');assert.match(w,/name: creatorloop-acceptance/);assert.match(w,/github.run_attempt == 1/);assert.match(w,/SCHEMA_INSPECTION_SCOPE: PRODUCTION_ONLY/);assert.match(w,/artifact-ids: '11317109290'/);assert.match(w,/artifact-ids: '11320388581'/);assert.doesNotMatch(w,/wrangler|migrations apply|d1-backup-stage|exportDatabase|edge-executor|pull_request_target|set -x/);
 const upload=w.split('uses: actions/upload-artifact@v4')[1].split('      - name:')[0];assert.match(upload,/production-evidence\/PRODUCTION.json/);assert.doesNotMatch(upload,/production-private|\.sql|\.zip|baselines/);
});
