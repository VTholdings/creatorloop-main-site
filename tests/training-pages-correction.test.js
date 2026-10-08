import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {planTrainingCorrection,correctTrainingPages} from '../scripts/lib/training-pages-correction.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const secret='FICTIONAL-PRIVATE-VALUE',token='FICTIONAL-TOKEN';
const path='/accounts/'+targets.accountId+'/pages/projects/'+targets.training.projectCandidates[0];
const project=()=>({id:'22222222-2222-4222-8222-222222222222',name:targets.training.projectCandidates[0],source:{config:{preview_deployment_setting:'all'}},domains:[],deployment_configs:{production:{env_vars:{CONSOLE_ENVIRONMENT:{type:'plain_text',value:'TRAINING'},CLOUDFLARE_ACCESS_AUD:{type:'plain_text',value:targets.production.audience},PRIVATE_SECRET:{type:'secret_text',value:secret}},d1_databases:{OPERATIONS_DB:{id:targets.training.databaseId}}},preview:{env_vars:{},d1_databases:{},compatibility_date:'2026-01-01'}}});
function fixture({mutateFresh,mutateAfter,patchError=false,networkError=false}={}){
 let training=project(),reads=0;
 const production={id:'11111111-1111-4111-8111-111111111111',name:targets.production.projectCandidates[0],domains:[targets.production.domain],deployment_configs:{production:{env_vars:{PRIVATE_SECRET:{type:'secret_text',value:secret}}}}};
 const calls=[];
 const fetcher=async(url,o)=>{
  const p=url.slice('https://api.cloudflare.com/client/v4'.length);calls.push({path:p,method:o.method,body:o.body,redirect:o.redirect});
  if(o.method==='PATCH'){
   assert.equal(p,path);if(networkError)throw Error(secret);
   if(patchError)return new Response(JSON.stringify({success:false,errors:[{message:secret}]}),{status:403});
   for(const [slot,c] of Object.entries(JSON.parse(o.body).deployment_configs)){
    const conf=training.deployment_configs[slot]||={};
    if(c.env_vars)conf.env_vars={...conf.env_vars,...c.env_vars};
    if(c.d1_databases)conf.d1_databases=structuredClone(c.d1_databases);
   }
   if(mutateAfter)mutateAfter(training);
   return new Response(JSON.stringify({success:true,result:training}));
  }
  let value;
  if(p.endsWith('/tokens/verify'))value={status:'active'};
  else if(p===path){reads++;if(reads===2&&mutateFresh)mutateFresh(training);value=training;}
  else if(p.endsWith('/'+production.name))value=production;
  else throw Error('Unexpected endpoint');
  return new Response(JSON.stringify({success:true,result:value}));
 };
 return {calls,setTraining:p=>{training=p;},run:()=>correctTrainingPages({token,targets,fetcher})};
}
test('correction uses one training PATCH for approved variables/binding, preserving secrets, deployment settings and production',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'TRAINING_CORRECTION_VERIFIED',JSON.stringify(r));
 const writes=f.calls.filter(c=>c.method!=='GET');assert.equal(writes.length,1);assert.equal(writes[0].path,path);assert.equal(writes[0].redirect,'error');
 const body=JSON.parse(writes[0].body);assert.deepEqual(Object.keys(body),['deployment_configs']);
 for(const c of Object.values(body.deployment_configs)){
  assert.equal(Object.keys(c.env_vars).every(k=>['CLOUDFLARE_ACCESS_AUD','CLOUDFLARE_ACCESS_TEAM_DOMAIN'].includes(k)),true);
  if(c.d1_databases)assert.deepEqual(c.d1_databases,{OPERATIONS_DB:{id:targets.training.databaseId}});
 }
 assert.equal(r.productionUnchanged,true);assert.equal(r.writeVerified,true);
 assert.doesNotMatch(JSON.stringify(r)+writes[0].body,/FICTIONAL-PRIVATE-VALUE|PRIVATE_SECRET|FICTIONAL-TOKEN/);
});
test('only explicit preview none skips preview correction; unknown/empty settings require approved preview bindings',()=>{
 for(const mode of ['none','all','custom',undefined]){
  const p=project();p.source.config.preview_deployment_setting=mode;
  const plan=planTrainingCorrection(p,targets);assert.equal(plan.previewDisabled,mode==='none');
  assert.equal(Boolean(plan.payload.deployment_configs.preview),mode!=='none');
 }
});
test('correction refuses substituted targets and production identities before any write',async()=>{
 for(const t of [{...targets,accountId:'f'.repeat(32)},{...targets,training:{...targets.training,audience:targets.production.audience}},{...targets,training:{...targets.training,databaseId:targets.production.databaseId}},{...targets,training:{...targets.training,projectCandidates:targets.production.projectCandidates}}]){
  let called=false;const r=await correctTrainingPages({token,targets:t,fetcher:async()=>{called=true;}});assert.equal(called,false);assert.equal(r.writeAttempted,false);
 }
 const p=project();p.deployment_configs.production.env_vars.CONSOLE_ENVIRONMENT.value='PRODUCTION';assert.throws(()=>planTrainingCorrection(p,targets),/TRAINING_PROJECT_IDENTITY_REQUIRED/);
});
test('a configuration race is fenced before PATCH',async()=>{
 const f=fixture({mutateFresh:p=>{p.source.config.preview_deployment_setting='none';}}),r=await f.run();
 assert.equal(r.blockers[0].code,'STALE_TRAINING_CONFIGURATION');assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
});
test('denied or unknown PATCH outcomes are sanitized and never retried',async()=>{
 for(const options of [{patchError:true},{networkError:true}]){
  const f=fixture(options),r=await f.run();assert.equal(r.status,'TRAINING_CORRECTION_BLOCKED');assert.equal(r.writeVerified,false);
  assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-PRIVATE-VALUE|FICTIONAL-TOKEN/);
 }
});
test('unrelated settings changed by the provider block correction verification without rollback writes',async()=>{
 const f=fixture({mutateAfter:p=>{delete p.deployment_configs.production.env_vars.PRIVATE_SECRET;}}),r=await f.run();
 assert.equal(r.blockers[0].code,'UNAPPROVED_TRAINING_CONFIGURATION_CHANGED');assert.equal(r.writeVerified,false);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);
});
test('already-correct configuration is idempotent and sends no PATCH',async()=>{
 const f=fixture(),p=project();for(const c of Object.values(p.deployment_configs)){c.env_vars.CLOUDFLARE_ACCESS_AUD={type:'plain_text',value:targets.training.audience};c.env_vars.CLOUDFLARE_ACCESS_TEAM_DOMAIN={type:'plain_text',value:targets.teamDomain};c.d1_databases.OPERATIONS_DB={id:targets.training.databaseId};}f.setTraining(p);
 const r=await f.run();assert.equal(r.status,'TRAINING_CONFIGURATION_ALREADY_MATCHES');assert.equal(r.productionUnchanged,true);assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
});
test('CLI refuses nonprotected context and workflow gates the write before read-only verification',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'creatorloop-correction-'));
 try{
  const r=spawnSync(process.execPath,[resolve('scripts/acceptance/training-pages-correction.mjs')],{cwd:dir,env:{PATH:process.env.PATH,CLOUDFLARE_API_TOKEN:token,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',APPROVED_CHANGE:'CREATORLOOP_TRAINING_BINDINGS_V1'},encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stdout,/PROTECTED_CORRECTION_CONTEXT_REQUIRED/);assert.doesNotMatch(r.stdout+r.stderr,/FICTIONAL-TOKEN/);
 }finally{await rm(dir,{recursive:true,force:true});}
 const workflow=await readFile('.github/workflows/acceptance-training-correction.yml','utf8');assert.match(workflow,/environment:\n\s+name: creatorloop-acceptance/);assert.match(workflow,/needs: validate/);assert.match(workflow,/persist-credentials: false/);
 assert.doesNotMatch(workflow,/pull_request_target|wrangler|migrations apply|revoke_tokens|set -x/);
 assert.equal(workflow.indexOf('run: node scripts/acceptance/training-pages-correction.mjs')<workflow.indexOf('run: node scripts/acceptance/cloudflare-readonly.mjs'),true);
});
