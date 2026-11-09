import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {configurationHash,recoverBeforeConfiguration,safeDifferences,inspectPreservation} from '../scripts/lib/training-preservation-forensics.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const project=()=>({id:'22222222-2222-4222-8222-222222222222',name:targets.training.projectCandidates[0],domains:[],source:null,production_branch:'main',build_config:{},canonical_deployment:{id:'original'},deployment_configs:{production:{env_vars:{CLOUDFLARE_ACCESS_AUD:{type:'plain_text',value:targets.production.audience},CONSOLE_ENVIRONMENT:{type:'plain_text',value:'TRAINING'},PRIVATE_SECRET:{type:'secret_text',value:'FICTIONAL-PRIVATE-VALUE'}}},preview:null}});
const config=p=>({id:p.id,name:p.name,domains:p.domains||[],source:p.source||null,production_branch:p.production_branch,build_config:p.build_config||{},deployment_configs:p.deployment_configs||{},canonicalDeploymentId:p.canonical_deployment?.id||null});
function fixture(){
 const before=project(),current=structuredClone(before);current.deployment_configs.production.env_vars.CLOUDFLARE_ACCESS_AUD.value=targets.training.audience;
 current.deployment_configs.preview={env_vars:{CLOUDFLARE_ACCESS_AUD:{type:'plain_text',value:targets.training.audience},CLOUDFLARE_ACCESS_TEAM_DOMAIN:{type:'plain_text',value:targets.teamDomain}},d1_databases:{OPERATIONS_DB:{id:targets.training.databaseId}}};
 const correction={protocol:'CREATORLOOP_TRAINING_CORRECTION_V1',releaseSha:'a'.repeat(40),patchStatus:200,beforeConfigurationHash:configurationHash(config(before)),blockers:[{code:'UNAPPROVED_TRAINING_CONFIGURATION_CHANGED'}],requests:[{serverTime:'2026-10-04T19:35:30Z'}]};
 const production={id:'11111111-1111-4111-8111-111111111111',name:targets.production.projectCandidates[0],canonical_deployment:{id:'production',deployment_trigger:{metadata:{commit_hash:'b'.repeat(40)}}},deployment_configs:{production:{env_vars:{CLOUDFLARE_ACCESS_AUD:{value:targets.production.audience},CLOUDFLARE_ACCESS_TEAM_DOMAIN:{value:targets.teamDomain}},d1_databases:{OPERATIONS_DB:{id:targets.production.databaseId}}}}};production.deployment_configs.preview=structuredClone(production.deployment_configs.production);
 const baseline={protocol:'CREATORLOOP_READONLY_V1',accountId:targets.accountId,observations:{production:{projectId:production.id,canonicalDeploymentId:'production',deployedSha:'b'.repeat(40),...Object.fromEntries(['production','preview'].map(slot=>[slot,{databaseId:targets.production.databaseId,audience:targets.production.audience,teamDomain:targets.teamDomain}]))}}};
 return {before,current,correction,production,baseline};
}
test('before-state reconstruction requires an exact recorded hash; structural candidates never invent configured runtime values',()=>{
 const f=fixture(),r=recoverBeforeConfiguration(f.current,targets,f.correction.beforeConfigurationHash);assert.deepEqual(r,config(f.before));
 f.current.deployment_configs.production.fail_open=true;assert.equal(recoverBeforeConfiguration(f.current,targets,f.correction.beforeConfigurationHash),null);
});
test('field differences preserve safe before/after states while hiding secret names, values and unrecognized provider data',()=>{
 const differences=safeDifferences({deployment_configs:{preview:{fail_open:false,env_vars:{PRIVATE_SECRET:{value:'FICTIONAL-PRIVATE-VALUE'}}}}},{deployment_configs:{preview:{fail_open:true,env_vars:{PRIVATE_SECRET:{value:'OTHER-PRIVATE-VALUE'}}}}});
 assert.equal(differences.some(d=>d.field==='deployment_configs.preview.fail_open'&&d.before.value===false&&d.after.value===true),true);
 assert.doesNotMatch(JSON.stringify(differences),/PRIVATE_SECRET|PRIVATE-VALUE/);
});
test('forensic transport uses GET only, bounds audit reads, recovers exact baseline and keeps production claims limited',async()=>{
 const f=fixture(),calls=[];
 const r=await inspectPreservation({...f,token:'FICTIONAL-TOKEN',targets,fetcher:async(url,o)=>{
  calls.push({url,method:o.method,body:o.body,redirect:o.redirect});let result;
  if(url.endsWith('/tokens/verify'))result={status:'active'};
  else if(url.endsWith('/'+f.current.name))result=f.current;
  else if(url.endsWith('/'+f.production.name))result=f.production;
  else result=[{resource:{id:'unrelated'},actor:{email:'private@example.com'},oldValue:'FICTIONAL-PRIVATE-VALUE'}];
  return new Response(JSON.stringify({success:true,result}));
 }});
 assert.equal(r.status,'EXACT_CONFIGURATION_DIFFERENCES_RECOVERED');assert.equal(r.beforeHashVerified,true);assert.equal(r.productionObservedFieldsUnchanged,true);assert.equal(r.changesMade,false);
 assert.equal(calls.every(c=>c.method==='GET'&&c.body===undefined&&c.redirect==='error'),true);assert.equal(calls.length,5);
 assert.equal(calls.filter(c=>c.url.includes('audit')).every(c=>c.url.includes('2026-10-04T19%3A35%3A00.000Z')&&c.url.includes('2026-10-04T19%3A36%3A00.000Z')),true);
 assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-TOKEN|FICTIONAL-PRIVATE-VALUE|private@example.com|PRIVATE_SECRET/);
});
test('unrecoverable baselines and denied audit access stay unresolved without permission fallback',async()=>{
 const f=fixture();f.correction.beforeConfigurationHash='f'.repeat(64);
 const r=await inspectPreservation({...f,token:'FICTIONAL-TOKEN',targets,fetcher:async(url)=>{
  if(url.includes('audit'))return new Response(JSON.stringify({success:false,errors:[{code:9109,message:'FICTIONAL-PRIVATE-VALUE'}]}),{status:403});
  return new Response(JSON.stringify({success:true,result:url.endsWith('/tokens/verify')?{status:'active'}:url.endsWith('/'+f.current.name)?f.current:f.production}));
 }});
 assert.equal(r.status,'PRESERVATION_UNRESOLVED');assert.equal(r.beforeConfigurationRecovered,false);assert.equal(r.audit.v1.status,403);assert.equal(r.blockers[0].code,'FULL_BEFORE_CONFIGURATION_NOT_RECOVERED');assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-PRIVATE-VALUE/);
});
test('audit oldValue can recover the exact original configuration and expose a real unrelated setting change',async()=>{
 const f=fixture();f.before.deployment_configs.production.fail_open=false;f.correction.beforeConfigurationHash=configurationHash(config(f.before));f.current.deployment_configs.production.fail_open=true;
 const r=await inspectPreservation({...f,token:'FICTIONAL-TOKEN',targets,fetcher:async(url)=>{
  const result=url.endsWith('/tokens/verify')?{status:'active'}:url.endsWith('/'+f.current.name)?f.current:url.endsWith('/'+f.production.name)?f.production:[{resource:{id:f.current.id},oldValue:JSON.stringify(f.before)}];
  return new Response(JSON.stringify({success:true,result}));
 }});
 assert.equal(r.beforeHashVerified,true);assert.equal(r.differences.some(d=>d.field==='deployment_configs.production.fail_open'&&d.before.value===false&&d.after.value===true&&!d.approvedField),true);assert.equal(r.productionCertified,false);
});
test('forensic workflow has protected credential custody and no correction/mutation entry point',async()=>{
 const workflow=await readFile('.github/workflows/acceptance-preservation-forensics.yml','utf8');assert.match(workflow,/environment:\n\s+name: creatorloop-acceptance/);assert.match(workflow,/needs: validate/);assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/actions: read/);
 assert.equal((workflow.match(/secrets\.CLOUDFLARE_API_TOKEN/g)||[]).length,1);assert.doesNotMatch(workflow,/run: .*training-pages-correction|wrangler|migrations apply|set -x|pull_request_target/);
});
