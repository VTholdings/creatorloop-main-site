import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readOnlyClient} from '../scripts/lib/cloudflare-readonly.mjs';
import {trainingApplicationMetadata} from '../scripts/lib/training-application-readiness.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const releaseSha='a'.repeat(40),root='/accounts/'+targets.accountId;
const appId='72da9ab5-d951-4de4-8456-fd6660e4d86e',deployment='7637de42-2d67-4623-bf62-6be6560120a8',peer='fcff287f-8ef7-4421-9e95-bfb9130a4fab';
const secret='FICTIONAL-SECRET-NOT-A-CREDENTIAL';
function fixture(){
 const plain=value=>({type:'plain_text',value});
 const vars=Object.fromEntries(Object.entries({CONSOLE_ENVIRONMENT:'TRAINING',CLOUDFLARE_ACCESS_AUD:targets.training.audience,CLOUDFLARE_ACCESS_TEAM_DOMAIN:targets.teamDomain,CONSOLE_DATABASE_ID:targets.training.databaseId,CONSOLE_DEPLOYMENT_ID:deployment,PEER_DATABASE_ID:targets.production.databaseId,PEER_DEPLOYMENT_ID:peer,PEER_ACCESS_AUD:targets.production.audience,ADMISSION_VERIFIER_KEYS:secret}).map(([k,v])=>[k,plain(v)]));
 vars.UNRELATED_SECRET={type:'secret_text',value:secret};
 const settings={env_vars:vars,d1_databases:{OPERATIONS_DB:{id:targets.training.databaseId}}};
 const project={name:targets.training.projectCandidates[0],id:'9863d88c-8025-414c-9524-078ee470e9e7',canonical_deployment:{id:deployment,deployment_trigger:{metadata:{commit_hash:releaseSha}}},source:{config:{preview_deployment_setting:'none'}},deployment_configs:{production:settings}};
 const bodies=new Map([
  [root+'/tokens/verify',{status:'active'}],
  [root+'/pages/projects/'+project.name,project],
  [root+'/d1/database/'+targets.training.databaseId,{uuid:targets.training.databaseId}],
  [root+'/access/apps?page=1&per_page=50',[{id:appId,aud:targets.training.audience,domain:project.name+'.pages.dev'},{id:peer,aud:targets.production.audience,domain:'ops.creatorloop.net',extraSecret:secret}]],
  [root+'/access/apps/'+appId+'/policies?page=1&per_page=50',[{id:appId,decision:'allow',include:[{email:{email:'team@creatorloop.net'}},{email:{email:'private-person@example.com'}}],extraSecret:secret}]]
 ]);
 const calls=[],errors=new Map();
 const client=readOnlyClient({targets,token:secret,fetcher:async(url,options)=>{
  const path=url.slice('https://api.cloudflare.com/client/v4'.length);calls.push({path,options});
  assert.ok(bodies.has(path),'Unapproved request: '+path);
  const error=errors.get(path);return new Response(JSON.stringify(error?{success:false,errors:[{code:7500,message:secret}]}:{success:true,result:bodies.get(path)}),{status:error||200});
 }});
 return {project,bodies,calls,errors,run:()=>trainingApplicationMetadata({client,targets,releaseSha,now:()=> '2026-10-08T19:00:00Z'})};
}
test('TRAINING metadata makes only allowed GETs and never treats metadata or secret presence as readiness',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'TRAINING_METADATA_MATCH',JSON.stringify(r.blockers));
 assert.equal(r.step18Complete,false);assert.equal(r.step19Ready,false);assert.equal(r.productionCertified,false);
 assert.equal(f.calls.length,5);
 for(const {path,options} of f.calls){assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.ok(options.signal);assert.doesNotMatch(path,/query|export|revoke|creatorloop-operations-console|c4993a97/);}
 assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-SECRET|private-person@example.com|UNRELATED_SECRET/);
 assert.equal(r.observations.access.expectedDomainPresent,true);assert.equal(r.observations.slots.production.verifierKeysPresent,true);
});
test('stale deployments, wrong bindings, missing runtime pins and forbidden TRAINING synchronization produce blockers',async()=>{
 const f=fixture();f.project.canonical_deployment.deployment_trigger.metadata.commit_hash='b'.repeat(40);
 const c=f.project.deployment_configs.production;c.d1_databases.OPERATIONS_DB.id=targets.production.databaseId;delete c.env_vars.ADMISSION_VERIFIER_KEYS;
 c.env_vars.CONTROL_SYSTEM_SYNC_SECRET={type:'secret_text',value:secret};
 f.project.source.config.preview_deployment_setting='all';f.project.deployment_configs.preview={};
 const r=await f.run(),codes=r.blockers.map(b=>b.code);
 for(const code of ['TRAINING_DEPLOYED_SHA_DIFFERS_FROM_REVIEWED_RELEASE','TRAINING_RUNTIME_PIN_MISMATCH','TRAINING_PEER_PIN_MISSING_OR_SHARED','ADMISSION_PUBLIC_VERIFIER_KEYS_MISSING','TRAINING_FORBIDDEN_CREDENTIAL_OR_BOOTSTRAP_PRESENT'])assert.ok(codes.includes(code),code);
 assert.equal(r.status,'TRAINING_METADATA_BLOCKED');assert.equal(r.step19Ready,false);assert.doesNotMatch(JSON.stringify(r),new RegExp(secret));
});
test('TRAINING metadata retains numeric provider HTTP/code evidence and remains fatal without raw errors or fallback',async()=>{
 const f=fixture();f.errors.set(root+'/pages/projects/'+f.project.name,400);
 const r=await f.run();assert.equal(r.status,'TRAINING_METADATA_BLOCKED');assert.equal(f.calls.length,2);
 assert.equal(r.blockers[0].status,400);assert.deepEqual(r.blockers[0].providerCodes,[7500]);assert.doesNotMatch(JSON.stringify(r),new RegExp(secret));
});
test('protected metadata workflow preserves environment review, checkout/current-head fence and read-only GitHub permissions',async()=>{
 const s=await readFile('.github/workflows/acceptance-training-application-readiness.yml','utf8');
 assert.match(s,/name: creatorloop-acceptance/);assert.match(s,/contents: read/);assert.match(s,/persist-credentials: false/);
 assert.match(s,/refs\/remotes\/origin\/team-access-directory/);assert.match(s,/cancel-in-progress: false/);
 assert.doesNotMatch(s,/workflow_dispatch|pull_request_target|permissions:[\s\S]*contents: write/);
});
