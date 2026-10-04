import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readOnlyClient,verifyCloudflare} from '../scripts/lib/cloudflare-readonly.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const secret='FICTIONAL-NOT-A-LIVE-TOKEN';
const mainSha='a'.repeat(40),releaseSha='b'.repeat(40);
const ids={production:'11111111-1111-4111-8111-111111111111',training:'22222222-2222-4222-8222-222222222222'};
const root='/accounts/'+targets.accountId;
function fixture(){
 const calls=[],bodies=new Map(),statuses=new Map(),ok=result=>({success:true,result});
 bodies.set(root+'/tokens/verify',ok({status:'active',id:secret}));
 for(const name of ['production','training']){
  const pin=targets[name],vars={
   CLOUDFLARE_ACCESS_AUD:{type:'plain_text',value:pin.audience},
   CLOUDFLARE_ACCESS_TEAM_DOMAIN:{type:'plain_text',value:targets.teamDomain},
   UNRELATED_SECRET:{type:'secret_text',value:secret},
   ADMISSION_VERIFIER_KEYS:{type:'plain_text',value:secret}
  };
  const settings={env_vars:vars,d1_databases:{OPERATIONS_DB:{id:pin.databaseId}}};
  bodies.set(root+'/pages/projects/'+pin.projectCandidates[0],ok({
   name:pin.projectCandidates[0],id:ids[name],domains:name==='production'?[pin.domain]:[],
   production_branch:'main',canonical_deployment:{id:ids[name],deployment_trigger:{metadata:{commit_hash:mainSha}}},
   deployment_configs:{production:structuredClone(settings),preview:structuredClone(settings)},extraSecret:secret
  }));
  bodies.set(root+'/d1/database/'+pin.databaseId,ok({uuid:pin.databaseId,name:'Fictional database',extraSecret:secret}));
  bodies.set(root+'/access/apps/'+ids[name]+'/policies?page=1&per_page=50',ok([{
   id:ids[name],decision:'allow',include:[{email:{email:'team@creatorloop.net'}},{email:{email:'private-person@example.com'}}],
   require:[],exclude:[],privateProviderValue:secret
  }]));
 }
 bodies.set(root+'/access/apps?page=1&per_page=50',ok(['production','training'].map(n=>({id:ids[n],aud:targets[n].audience,domain:targets[n].domain||'creatorloop-operator-training.pages.dev'}))));
 const fetcher=async(url,options)=>{
  const path=url.slice('https://api.cloudflare.com/client/v4'.length);calls.push({url,path,options});
  const body=bodies.get(path);return new Response(JSON.stringify(body||{success:false,errors:[{message:secret}]}),{status:statuses.get(path)||(body?200:404)});
 };
 const client=readOnlyClient({token:secret,targets,fetcher});
 return {bodies,statuses,calls,client,run:()=>verifyCloudflare({client,targets,releaseSha,mainSha,now:()=> '2026-10-04T01:00:00Z'})};
}
test('protected verifier observes pinned Pages, D1 and Access resources exclusively through GET without signing or certification',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'READ_ONLY_METADATA_MATCH',JSON.stringify(r.blockers));
 assert.equal(r.observations.production.production.databaseId,targets.production.databaseId);
 assert.equal(r.observations.training.production.audience,targets.training.audience);
 assert.equal(r.productionCertified,false);assert.equal(r.operatorReadinessCertified,false);assert.equal(r.liveLifecycleVerified,false);
 assert.equal(f.calls.every(c=>c.options.method==='GET'&&c.options.body===undefined&&c.options.redirect==='error'),true);
 assert.equal(f.calls.every(c=>c.url.startsWith('https://api.cloudflare.com/client/v4/')),true);
 assert.equal(f.calls[0].options.headers.Authorization,'Bearer '+secret);
 assert.equal(f.calls[0].path,root+'/tokens/verify');
 assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-NOT-A-LIVE-TOKEN|private-person@example.com|privateProviderValue|UNRELATED_SECRET/);
 assert.equal(r.observations.access.production.policies[0].ownerExplicitlyIncluded,true);
});
test('active account token near expiry continues through all pinned metadata checks without user-token fallback',async()=>{
 const f=fixture();
 f.bodies.set(root+'/tokens/verify',{success:true,result:{status:'active',id:secret,expires_on:'2026-10-04T01:01:00Z'}});
 const r=await f.run();
 assert.equal(r.status,'READ_ONLY_METADATA_MATCH');
 assert.equal(r.observations.tokenActive,true);
 assert.equal(r.observations.production.databaseMetadataReadable,true);
 assert.equal(r.observations.training.databaseMetadataReadable,true);
 assert.equal(r.observations.access.production.expectedDomainPresent,true);
 assert.equal(r.observations.access.training.expectedDomainPresent,true);
 assert.equal(f.calls.some(c=>c.path.startsWith('/user/')),false);
});
test('transport refuses queries, exports, mutation/session endpoints, arbitrary resources and credential redirects',async()=>{
 const f=fixture();
 for(const path of [
  root+'/d1/database/'+targets.production.databaseId+'/query',root+'/d1/database/'+targets.production.databaseId+'/export',
  root+'/access/apps/'+ids.production+'/revoke_tokens',root+'/access/apps/'+ids.production,
  root+'/pages/projects/unapproved',root+'/pages/projects/'+targets.production.projectCandidates[0]+'/deployments',
  root+'/workers/scripts',root+'/tokens',root+'/access/users',root+'/access/apps?page=1&per_page=50&untrusted=1',
  '/accounts/'+'f'.repeat(32)+'/access/apps?page=1&per_page=50','https://untrusted.example/','/user/tokens/verify?token='+secret,
  '/user/tokens/verify','/accounts/'+'f'.repeat(32)+'/tokens/verify',root+'/tokens/verify?untrusted=1',root+'/tokens/verify/extra'
 ])await assert.rejects(f.client.get(path),/ENDPOINT_NOT_ALLOWED/);
 assert.equal(f.calls.length,0);
 for(const changed of [{...targets,accountId:'untrusted'}, {...targets,training:{...targets.training,databaseId:targets.production.databaseId}}, {...targets,production:{...targets.production,projectCandidates:['project/../../tokens']}}])assert.throws(()=>readOnlyClient({token:secret,targets:changed}),/INVALID_|SHARED_/);
 const redirect=readOnlyClient({token:secret,targets,fetcher:async()=>{throw Error(secret);}});
 await assert.rejects(redirect.get(root+'/tokens/verify'),e=>e.code==='NETWORK_OR_REDIRECT_BLOCKED'&&!e.message.includes(secret));
});
test('missing or expired credentials stop metadata access and never expose provider errors',async()=>{
 assert.throws(()=>readOnlyClient({token:'',targets}),/MISSING_ENVIRONMENT_SECRET/);
 for(const body of [{success:true,result:{status:'expired'}},{success:false,errors:[{message:secret}]}]){
  const f=fixture();f.bodies.set(root+'/tokens/verify',body);const r=await f.run();assert.equal(r.status,'READ_ONLY_VERIFICATION_BLOCKED');
  assert.equal(f.calls.length,1);assert.doesNotMatch(JSON.stringify(r),new RegExp(secret));
 }
});
test('permission failure and malformed responses produce sanitized blockers rather than fallback access or broader credentials',async()=>{
 const f=fixture();f.bodies.delete(root+'/d1/database/'+targets.production.databaseId);const r=await f.run();
 assert.equal(r.status,'READ_ONLY_VERIFICATION_BLOCKED');assert.equal(r.blockers.some(b=>b.code==='CLOUDFLARE_HTTP_ERROR'&&b.status===404),true);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(secret));
 const client=readOnlyClient({token:secret,targets,fetcher:async()=>new Response(secret,{status:200})});
 await assert.rejects(client.get(root+'/tokens/verify'),/INVALID_API_RESPONSE/);
});
test('training binding/audience drift, sync secrets and shared projects cannot be represented as isolation PASS',async()=>{
 const f=fixture(),p=f.bodies.get(root+'/pages/projects/'+targets.training.projectCandidates[0]).result;
 p.id=ids.production;p.deployment_configs.production.d1_databases.OPERATIONS_DB.id=targets.production.databaseId;
 p.deployment_configs.preview.env_vars.CLOUDFLARE_ACCESS_AUD.value=targets.production.audience;
 p.deployment_configs.production.env_vars.CONTROL_SYSTEM_SYNC_SECRET={type:'secret_text',value:secret};
 const r=await f.run();for(const code of ['DATABASE_BINDING_MISMATCH','ACCESS_AUDIENCE_MISMATCH','TRAINING_HAS_SYNC_CREDENTIAL','SHARED_PAGES_PROJECT'])assert.equal(r.blockers.some(b=>b.code===code),true,code);
 assert.equal(r.productionCertified,false);assert.doesNotMatch(JSON.stringify(r),new RegExp(secret));
});
test('missing/ambiguous identities, retired human rules, bypass and production SHA drift remain explicit held gates',async()=>{
 const f=fixture(),p=f.bodies.get(root+'/pages/projects/'+targets.production.projectCandidates[0]).result;
 p.canonical_deployment.deployment_trigger.metadata.commit_hash='c'.repeat(40);
 f.bodies.get(root+'/access/apps/'+ids.production+'/policies?page=1&per_page=50').result.push({id:ids.training,decision:'bypass',include:[]},{id:ids.production,decision:'allow',include:[{email:{email:'support@creatorloop.net'}}]});
 f.bodies.get(root+'/access/apps?page=1&per_page=50').result.push({id:ids.training,aud:targets.training.audience});
 const r=await f.run();
 for(const code of ['PRODUCTION_SHA_REQUIRES_RECONCILIATION','RETIRED_IDENTITY_EXPLICITLY_ALLOWED','ACCESS_BYPASS_REQUIRES_REVIEW','MISSING_OR_AMBIGUOUS_ACCESS_APPLICATION'])assert.equal(r.blockers.some(b=>b.code===code),true,code);
});
test('Access pagination must be complete; unrelated identities are neither selected nor stored in evidence',async()=>{
 const f=fixture(),appPath=root+'/access/apps';
 f.bodies.set(appPath+'?page=1&per_page=50',{success:true,result:Array.from({length:50},()=>({aud:'unrelated',name:secret})),result_info:{total_pages:2}});
 f.bodies.set(appPath+'?page=2&per_page=50',{success:true,result:['production','training'].map(n=>({id:ids[n],aud:targets[n].audience,domain:targets[n].domain||'creatorloop-operator-training.pages.dev'})),result_info:{total_pages:2}});
 const r=await f.run();assert.equal(r.status,'READ_ONLY_METADATA_MATCH');assert.equal(f.calls.some(c=>c.path===appPath+'?page=2&per_page=50'),true);assert.doesNotMatch(JSON.stringify(r),new RegExp(secret));
 const tooMany=fixture(),get=tooMany.client.get.bind(tooMany.client);tooMany.client.get=async path=>path.startsWith(appPath+'?')?{success:true,result:[],result_info:{total_pages:21}}:get(path);
 const blocked=await tooMany.run();assert.equal(blocked.status,'READ_ONLY_VERIFICATION_BLOCKED');assert.equal(blocked.blockers.some(b=>b.code==='INCOMPLETE_PAGINATION'),true);
});
function deniedPagesFixture(){
 const f=fixture(),tokenId='9'.repeat(32),path=root+'/pages/projects/'+targets.production.projectCandidates[0];
 f.bodies.set(root+'/tokens/verify',{success:true,result:{status:'active',id:tokenId}});
 f.bodies.set(path,{success:false,errors:[{code:10000,message:secret}]});f.statuses.set(path,403);
 return {...f,tokenId};
}
test('Pages 403 probes independent GET capabilities and self-token policy metadata while redacting token identifiers and provider messages',async()=>{
 const f=deniedPagesFixture();
 f.bodies.set(root,{success:true,result:{id:targets.accountId,name:secret}});
 f.bodies.set('/accounts?page=1&per_page=50',{success:true,result:[{id:targets.accountId,name:secret}]});
 f.bodies.set(root+'/tokens/'+f.tokenId,{success:true,result:{id:f.tokenId,name:secret,creator_email_at_creation:'private-person@example.com',status:'active',policies:[{effect:'allow',permission_groups:[{name:'D1 Read'},{name:'Account Settings Read'}],resources:{['com.cloudflare.api.account.'+targets.accountId]:'*'}}]}});
 f.bodies.set(root+'/pages/projects?page=1&per_page=50',{success:false,errors:[{code:10000,message:secret}]});f.statuses.set(root+'/pages/projects?page=1&per_page=50',403);
 const r=await f.run(),d=r.observations.pagesAuthorizationDiagnostics;
 assert.equal(r.status,'READ_ONLY_VERIFICATION_BLOCKED');assert.equal(d.classification,'PAGES_PERMISSION_NOT_DECLARED');
 assert.equal(d.checks.accountDetails.pinnedAccountMatches,true);assert.equal(d.checks.accessibleAccounts.pinnedAccountListed,true);
 assert.equal(d.checks['database:production'].pinnedDatabaseMatches,true);assert.equal(d.checks.accessApplicationList.productionAudiencePresent,true);
 assert.deepEqual(r.blockers[0].providerCodes,[10000]);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(secret+'|'+f.tokenId+'|private-person@example.com|creator_email_at_creation'));
 assert.equal(r.requests.some(q=>q.path===root+'/tokens/{authenticated-token}'),true);
 assert.equal(f.calls.every(c=>c.options.method==='GET'&&!c.options.body&&c.options.redirect==='error'),true);
 await assert.rejects(f.client.get(root+'/tokens/'+'8'.repeat(32)),/ENDPOINT_NOT_ALLOWED/);
 await assert.rejects(f.client.get(root+'/tokens/'+f.tokenId+'/value'),/ENDPOINT_NOT_ALLOWED/);
});
test('complete Pages discovery identifies wrong project pins without changing targets or following discovered projects',async()=>{
 const f=deniedPagesFixture();
 f.bodies.set(root+'/pages/projects?page=1&per_page=50',{success:true,result:[{name:'actual-console',domains:[targets.production.domain],extraSecret:secret}]});
 const r=await f.run(),d=r.observations.pagesAuthorizationDiagnostics;
 assert.equal(d.classification,'PINNED_PRODUCTION_PROJECT_NOT_LISTED');
 assert.deepEqual(d.checks.pagesProjectList.productionDomainProjects,['actual-console']);
 assert.equal(f.calls.some(c=>c.path===root+'/pages/projects/actual-console'),false);
 assert.equal(r.productionCertified,false);assert.equal(d.changesMade,false);
});
test('denied discovery and self-token metadata remain inconclusive and do not invent account absence or request broader access',async()=>{
 const f=deniedPagesFixture(),r=await f.run(),d=r.observations.pagesAuthorizationDiagnostics;
 assert.equal(d.classification,'AUTHORIZATION_CONDITION_UNRESOLVED');
 assert.equal(d.checks.authenticatedTokenMetadata.readable,false);assert.equal(d.checks.accountDetails.readable,false);
 assert.equal(d.checks.pagesProjectList.readable,false);assert.equal(r.liveLifecycleVerified,false);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(f.tokenId+'|'+secret));
 const incomplete=deniedPagesFixture();
 incomplete.bodies.set(root+'/tokens/'+incomplete.tokenId,{success:true,result:{policies:[{effect:'allow',resources:{},permission_groups:[{id:secret}]}]}});
 const partial=await incomplete.run();
 assert.equal(partial.observations.pagesAuthorizationDiagnostics.classification,'AUTHORIZATION_CONDITION_UNRESOLVED');
});
test('diagnostic endpoints require verified authentication and forbid token enumeration, mutation/value routes, unknown accounts and query extensions',async()=>{
 const f=fixture();
 for(const path of [root,'/accounts?page=1&per_page=50',root+'/pages/projects?page=1&per_page=50',root+'/tokens/'+'9'.repeat(32)])await assert.rejects(f.client.get(path),/ENDPOINT_NOT_ALLOWED/);
 await assert.rejects(f.client.selfTokenMetadata(),/AUTHENTICATED_TOKEN_METADATA_UNAVAILABLE/);
 await f.client.get(root+'/tokens/verify');
 for(const path of [root+'/tokens','/accounts/'+'f'.repeat(32),root+'/tokens/'+'8'.repeat(32),'/accounts?page=1&per_page=50&extra=1',root+'/pages/projects?page=1&per_page=50&extra=1'])await assert.rejects(f.client.get(path),/ENDPOINT_NOT_ALLOWED/);
 assert.equal(f.calls.length,1);
});
test('extended Pages diagnostics compare canonical route and pinned subresources, retain safe provider trace evidence and never expose deployments',async()=>{
 const f=deniedPagesFixture();
 const path=root+'/pages/projects/'+targets.production.projectCandidates[0];
 f.bodies.set(root+'/pages/projects',{success:false,errors:[{code:10000,message:'Authentication error '+secret}]});f.statuses.set(root+'/pages/projects',403);
 f.bodies.set(root+'/pages/projects?page=1&per_page=50',{success:false,errors:[{code:10000,message:'Authentication error '+secret}]});f.statuses.set(root+'/pages/projects?page=1&per_page=50',403);
 f.bodies.set(path+'/domains',{success:true,result:[{name:targets.production.domain,secret}]});
 f.bodies.set(path+'/deployments?page=1&per_page=1',{success:true,result:[{id:secret,env_vars:{secret},url:secret}]});
 const r=await f.run(),d=r.observations.pagesAuthorizationDiagnostics;
 assert.equal(d.pagesDenialIndependentOfProjectName,true);assert.equal(d.pagesSubresourceReadable,true);
 assert.equal(d.checks['domains:'+targets.production.projectCandidates[0]].productionDomainPresent,true);
 assert.equal(d.checks['deployments:'+targets.production.projectCandidates[0]].deploymentPresent,true);
 assert.deepEqual(d.checks.pagesCanonicalList.providerEvidence.errorCategories,['AUTHENTICATION_REJECTED']);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(secret+'|'+f.tokenId));
 const trace=readOnlyClient({token:secret,targets,fetcher:async()=>new Response(JSON.stringify({success:false,errors:[{code:10000,message:secret}]}),{status:403,headers:{'cf-ray':'0123456789abcdef-HNL',date:'Sun, 04 Oct 2026 03:32:12 GMT','untrusted':secret}})});
 await assert.rejects(trace.get(root+'/tokens/verify'),e=>e.providerEvidence.cloudflareRay==='0123456789abcdef-HNL'&&e.providerEvidence.serverTime==='2026-10-04T03:32:12.000Z'&&!JSON.stringify(e).includes(secret));
 assert.doesNotMatch(JSON.stringify(trace.requests),new RegExp(secret));
});
test('extended diagnostic transport blocks token-issuing GET endpoints, credential values, arbitrary projects and unbounded deployment enumeration',async()=>{
 const f=fixture();await f.client.get(root+'/tokens/verify');
 for(const path of [root+'/pages/projects/unapproved/domains',root+'/pages/projects/'+targets.production.projectCandidates[0]+'/upload-token',root+'/pages/projects/'+targets.production.projectCandidates[0]+'/deployments?page=2&per_page=1',root+'/pages/projects/'+targets.production.projectCandidates[0]+'/deployments?page=1&per_page=100',root+'/pages/projects/'+targets.production.projectCandidates[0]+'/domains?extra=1'])await assert.rejects(f.client.get(path),/ENDPOINT_NOT_ALLOWED/);
 assert.equal(f.calls.length,1);
 const framed=readOnlyClient({token:' cfat_'+secret+'\n',targets,fetcher:async()=>{throw Error(secret);}});
 assert.deepEqual(framed.credentialFraming,{surroundingWhitespace:true,controlCharactersPresent:true,format:'OTHER_TOKEN_FORMAT'});
 assert.doesNotMatch(JSON.stringify(framed.credentialFraming),new RegExp(secret));
});
test('CLI requires the approved Actions repository, branch, event and environment before accessing Cloudflare',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'creatorloop-readonly-'));
 try{
  const r=spawnSync(process.execPath,[resolve('scripts/acceptance/cloudflare-readonly.mjs')],{cwd:dir,env:{PATH:process.env.PATH,CLOUDFLARE_API_TOKEN:secret,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance'},encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stdout,/PROTECTED_RUN_CONTEXT_REQUIRED/);assert.doesNotMatch(r.stdout+r.stderr,new RegExp(secret));
  const evidence=JSON.parse(await readFile(join(dir,'acceptance-evidence/cloudflare-readonly.json'),'utf8'));
  assert.equal(evidence.productionCertified,false);assert.equal(evidence.blockers[0].code,'PROTECTED_RUN_CONTEXT_REQUIRED');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Actions wiring confines the credential to the protected read-only step after validation and branch fencing',async()=>{
 const workflow=await readFile('.github/workflows/acceptance-readonly.yml','utf8');
 assert.match(workflow,/branches: \[team-access-directory\]/);
 assert.match(workflow,/environment:\n\s+name: creatorloop-acceptance/);
 assert.match(workflow,/needs: validate/);assert.match(workflow,/persist-credentials: false/);
 assert.equal((workflow.match(/secrets\.CLOUDFLARE_API_TOKEN/g)||[]).length,1);
 assert.match(workflow,/name: Read Cloudflare metadata only\n\s+env:\n\s+CLOUDFLARE_API_TOKEN:/);
 assert.doesNotMatch(workflow,/pull_request_target|workflow_dispatch|wrangler|revoke_tokens|migrations apply|secrets: inherit|set -x/);
 assert.match(workflow,/run: node scripts\/acceptance\/cloudflare-readonly\.mjs/);
 assert.match(workflow,/path: acceptance-evidence\/cloudflare-readonly.json/);
});
