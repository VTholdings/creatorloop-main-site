import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateDispatch,authorizeBackup,assertCurrentRelease} from '../scripts/lib/backup-authorization.mjs';
const repo='VTholdings/creatorloop-main-site',sha='a'.repeat(40),main='b'.repeat(40);
const owner={login:'Creatorloopzone',id:245245322};
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:sha,GITHUB_ACTOR:owner.login,GITHUB_TRIGGERING_ACTOR:owner.login,GITHUB_TOKEN:'FICTIONAL-GH-PRIVATE',EXPECTED_MAIN_SHA:main,ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance'};
const event={ref:'team-access-directory',repository:{full_name:repo},sender:owner,inputs:{low_activity_attestation:'BACKUP_WINDOW_NO_ACTIVE_OPERATORS',expected_release_sha:sha}};
const created='2026-10-04T22:00:00Z',now=()=>Date.parse(created)+10000;
const run={id:123,run_attempt:1,event:'workflow_dispatch',head_sha:sha,head_branch:'team-access-directory',repository:{full_name:repo},path:'.github/workflows/acceptance-backups.yml',actor:owner,triggering_actor:owner,created_at:created};
const approval={state:'approved',user:owner,comment:'',environments:[{name:'creatorloop-acceptance',id:23396552725}]};
function client({runValue=run,reviews=[approval],head=sha,mainHead=main,status=200}={}){
 const calls=[];
 return {calls,fetcher:async(url,options)=>{
  calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(new URL(url).hostname,'api.github.com');
  const value=url.endsWith('/approvals')?reviews:url.endsWith('/heads/team-access-directory')?{ref:'refs/heads/team-access-directory',object:{sha:head}}:url.endsWith('/heads/main')?{ref:'refs/heads/main',object:{sha:mainHead}}:runValue;
  return new Response(JSON.stringify(value),{status});
 }};
}
test('manual attestation and independent Owner environment approval produce non-secret run-bound evidence with an empty review comment',async()=>{
 const c=client();const receipt=await authorizeBackup({context,event,fetcher:c.fetcher,now});
 assert.equal(receipt.attestation,event.inputs.low_activity_attestation);assert.equal(receipt.reviewCommentUsed,false);assert.equal(receipt.runId,'123');assert.equal(receipt.releaseSha,sha);assert.equal(receipt.environmentId,23396552725);assert.equal(c.calls.length,4);
 assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL|TOKEN|Authorization/);
 assert.deepEqual(validateDispatch({context,event:{...event,ref:context.GITHUB_REF}}),validateDispatch({context,event}));
});
test('absent, whitespace, changed or injected attestations fail before network access',async()=>{
 for(const value of [undefined,null,'','approved',' BACKUP_WINDOW_NO_ACTIVE_OPERATORS','BACKUP_WINDOW_NO_ACTIVE_OPERATORS\n','$(echo BACKUP_WINDOW_NO_ACTIVE_OPERATORS)']){
  const c=client();await assert.rejects(authorizeBackup({context,event:{...event,inputs:{...event.inputs,low_activity_attestation:value}},fetcher:c.fetcher,now}),/OWNER_LOW_ACTIVITY_ATTESTATION_REQUIRED/);assert.equal(c.calls.length,0);
 }
});
test('pushes, reruns, another sender, substituted account, branch or expected SHA cannot authorize exports',async()=>{
 for(const change of [{GITHUB_EVENT_NAME:'push'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_ACTOR:'fictional'},{GITHUB_TRIGGERING_ACTOR:'fictional'},{GITHUB_REF:'refs/heads/main'},{GITHUB_REPOSITORY:'fictional/repo'}]){
  const c=client();await assert.rejects(authorizeBackup({context:{...context,...change},event,fetcher:c.fetcher,now}));assert.equal(c.calls.length,0);
 }
 for(const change of [{sender:{...owner,id:1}},{sender:{...owner,login:'fictional'}},{ref:'refs/tags/team-access-directory'},{inputs:{...event.inputs,expected_release_sha:main}},{repository:{full_name:'fictional/repo'}}])assert.throws(()=>validateDispatch({context,event:{...event,...change}}));
});
test('environment approval still fails closed for absent, rejected, unrelated identity or wrong environment even with valid dispatch',async()=>{
 for(const reviews of [[],null,[{...approval,state:'rejected'}],[{...approval,user:{...owner,id:1}}],[{...approval,environments:[{name:'production',id:1}]}],[approval,{...approval,state:'rejected'}]]){
  const c=client({reviews});await assert.rejects(authorizeBackup({context,event,fetcher:c.fetcher,now}),/OWNER_ENVIRONMENT_APPROVAL_REQUIRED/);
 }
 const c=client({status:403});await assert.rejects(authorizeBackup({context,event,fetcher:c.fetcher,now}),/EVIDENCE_UNAVAILABLE/);
});
test('API evidence cannot be substituted across run, attempt, event, SHA, workflow, actor or repository',async()=>{
 for(const change of [{id:124},{run_attempt:2},{event:'push'},{head_sha:main},{head_branch:'main'},{path:'.github/workflows/ci.yml'},{actor:{...owner,id:1}},{triggering_actor:{...owner,id:1}},{repository:{full_name:'fictional/repo'}}]){
  const c=client({runValue:{...run,...change}});await assert.rejects(authorizeBackup({context,event,fetcher:c.fetcher,now}),/DISPATCH_RUN_EVIDENCE_MISMATCH/);
 }
});
test('expired or future attestation and moved branch or main stop authorization; expiry is rechecked before each export',async()=>{
 for(const created_at of ['invalid',new Date(now()+1).toISOString(),new Date(now()-3600001).toISOString()]){
  const c=client({runValue:{...run,created_at}});await assert.rejects(authorizeBackup({context,event,fetcher:c.fetcher,now}),/BACKUP_WINDOW_ATTESTATION_EXPIRED/);
 }
 for(const [change,code] of [[{head:main},'STALE_BACKUP_RELEASE'],[{mainHead:sha},'STALE_BACKUP_MAIN']]){
  const c=client(change);await assert.rejects(authorizeBackup({context,event,fetcher:c.fetcher,now}),new RegExp(code));
 }
 const c=client();await assert.rejects(assertCurrentRelease({context,authorization:{windowExpiresAt:created},fetcher:c.fetcher,now}),/ATTESTATION_EXPIRED/);assert.equal(c.calls.length,0);
});
test('dispatch validation CLI has no secrets or infrastructure calls and captures only accepted input',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-dispatch-'));try{
  const path=join(dir,'event.json'),script=resolve('scripts/acceptance/d1-backup-stage.mjs');
  for(const value of [event,{...event,inputs:{...event.inputs,low_activity_attestation:'FICTIONAL-PRIVATE-INVALID'}}]){
   await writeFile(path,JSON.stringify(value));const r=spawnSync(process.execPath,[script,'validate-dispatch'],{cwd:dir,env:{...context,GITHUB_TOKEN:'',GITHUB_EVENT_PATH:path},encoding:'utf8'});
   assert.equal(r.status,value===event?0:1);assert.doesNotMatch(r.stdout+r.stderr,/FICTIONAL-PRIVATE/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('workflow pushes cannot request protected backups; required dispatch inputs are passed through the event file',async()=>{
 const w=await readFile('.github/workflows/acceptance-backups.yml','utf8');
 assert.match(w,/workflow_dispatch:\n\s+inputs:/);assert.match(w,/low_activity_attestation:[\s\S]*?required: true/);assert.match(w,/expected_release_sha:[\s\S]*?required: true/);
 assert.match(w,/github.event_name == 'workflow_dispatch' && github.actor == 'Creatorloopzone' && github.run_attempt == 1/);
 assert.doesNotMatch(w,/\$\{\{ (?:inputs|github.event.inputs)\./);
 const cli=await readFile('scripts/acceptance/d1-backup-stage.mjs','utf8');
 assert.ok(cli.indexOf('await authorizeBackup')<cli.indexOf('await verifyCloudflare'));assert.match(cli,/await assertCurrentRelease\(\{context:e,authorization\}\)/);
});
test('capture entry point blocks valid dispatch without environment approval before any Cloudflare call or export',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-capture-approval-'));try{
  const path=join(dir,'event.json'),preload=join(dir,'fetch.mjs'),calls=join(dir,'calls.json');
  await writeFile(path,JSON.stringify(event));
  await writeFile(preload,`import {writeFileSync} from 'node:fs';const calls=[];globalThis.fetch=async(url)=>{calls.push(url);writeFileSync(${JSON.stringify(calls)},JSON.stringify(calls));if(!url.startsWith('https://api.github.com/'))throw Error('FORBIDDEN_INFRASTRUCTURE_CALL');return new Response(JSON.stringify(url.endsWith('/approvals')?[]:${JSON.stringify(run)}));};`);
  const r=spawnSync(process.execPath,['--import',preload,resolve('scripts/acceptance/d1-backup-stage.mjs')],{cwd:dir,env:{...context,GITHUB_EVENT_PATH:path,CLOUDFLARE_API_TOKEN:'FICTIONAL-CF-PRIVATE',CREATORLOOP_BACKUP_PASSPHRASE:'FICTIONAL-BACKUP-KEY-FOR-LOCAL-TESTS-ONLY'},encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stdout,/OWNER_ENVIRONMENT_APPROVAL_REQUIRED/);assert.doesNotMatch(r.stdout+r.stderr,/FICTIONAL-CF-PRIVATE|FICTIONAL-GH-PRIVATE/);
  const report=JSON.parse(await readFile(join(dir,'backup-private/export-evidence.json'),'utf8'));assert.deepEqual(report.exports,[]);
  assert.equal(JSON.parse(await readFile(calls,'utf8')).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
