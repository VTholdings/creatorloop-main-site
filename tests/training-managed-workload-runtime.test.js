import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {recoverSavedCustody} from '../scripts/execution/recover-managed-custody-local.mjs';
import {dispatchHash} from '../scripts/lib/training-mediated-dispatcher.mjs';
import {fixture as executionFixture,preserved} from './helpers/training-execution-fixture.js';
import {sha256,TRAINING_TARGET,policyTemplate} from '../scripts/lib/training-execution-contract.mjs';
import {WORKLOAD_EXCEPTION_DECISION,executorAuthorityBinding} from '../scripts/lib/training-workload-policy.mjs';
import {fictionalWorkloadControls} from './helpers/training-workload-fixture.js';
const tools=process.env.MANAGED_TOOL_ROOT,bundles=process.env.MANAGED_BUNDLE_ROOT;
test('native constrained TRAINING workload cannot self-approve and retains recovery-safe machine audit/provider safeguards',{skip:!tools||!bundles},async()=>{
 const {Miniflare}=await import(pathToFileURL(join(tools,'node_modules/miniflare/dist/src/index.js')).href);
 const now=Math.floor(Date.now()/1000),sha='a'.repeat(40),content='FICTIONAL-REGISTERED-WORKFLOW\n',requests=[];
 // Only ephemeral local fixture key material. Not operational App or admission keys.
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'FICTIONAL-RUNTIME'};
 const b64=buf=>Buffer.from(buf).toString('base64url');
 const sign=async payload=>{const raw=b64(JSON.stringify({alg:'RS256',kid:jwk.kid}))+'.'+b64(JSON.stringify(payload));return raw+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(raw)));};
 const policy={protocol:'CREATORLOOP_APPROVED_TRAINING_WORKLOAD_POLICY_V2',environment:'TRAINING',repository:'VTholdings/creatorloop-main-site',branch:'team-access-directory',account:{id:66,login:'fictional-dispatch[bot]'},reviewerId:77,workloadRef:'FICTIONAL-MANAGED-WORKLOAD',signerCustodianRef:'FICTIONAL-OWNER-MAC',exceptionDecisionRef:WORKLOAD_EXCEPTION_DECISION,ownerOverrideRiskAccepted:true,separationControlsRef:'FICTIONAL-REVIEWED-CONTROLS'};
 const c={protocol:'CREATORLOOP_MANAGED_TRAINING_V2',environment:'TRAINING',accessIssuer:'https://fictional.cloudflareaccess.com',accessAudience:'FICTIONAL-AUDIENCE',gatewayOrigin:'https://fictional.example',oidcAudience:'FICTIONAL-JOB',appId:22,installationId:33,repositoryId:44,ownerId:55,appBotId:66,appBotLogin:'fictional-dispatch[bot]',approvedExecutor:policy,identities:[{role:'owner',subject:'owner-sub',email:'owner@example.test',githubId:77},{role:'executor',type:'access-service-token',clientId:'a'.repeat(32)+'.access',githubId:66}],evidencePorts:{}};
 c.allowedOidcSubjects=['repo:FICTIONAL:environment:creatorloop-training-provider-execution'];
 c.workloadControls=fictionalWorkloadControls();
 for(const purpose of ['commissioning','dispatchApproval','runApproval','executionBundle','providerApproval','providerCapability','providerScope','currentRequest','runtime','session','custodyExport'])c.evidencePorts[purpose]={url:'https://independent.example.test/'+purpose,issuer:'FICTIONAL-INDEPENDENT',publicKeys:[jwk],administrationRef:c.workloadControls.approvalEvidenceCustodyRef};
 const r={dispatchId:'11111111-1111-1111-1111-111111111111',decisionRef:'FICTIONAL-DECISION',lane:'provider',executionSha:sha,inputs:{intended_operation:'ADMIT',owner_decision_ref:'FICTIONAL-DECISION',owner_reviewer_id:'77',approved_port_sha256:'b'.repeat(64)}};
 const {createHash}=await import('node:crypto');
 const approval={protocol:'CREATORLOOP_MEDIATED_WORKLOAD_APPROVAL_V2',repository:'VTholdings/creatorloop-main-site',branch:'team-access-directory',workflowFile:'step18-training-provider-workflow.yml',dispatchId:r.dispatchId,decisionRef:r.decisionRef,requestHash:dispatchHash(r),executionSha:sha,workflowSha256:createHash('sha256').update(content).digest('hex'),callerId:policy.account.id,callerLogin:policy.account.login,reviewerId:77,...executorAuthorityBinding(policy),executorPolicyHash:dispatchHash(policy),approvedAt:now-10,expiresAt:now+240};
 const ownerToken=await sign({type:'app',iss:c.accessIssuer,aud:c.accessAudience,sub:'owner-sub',email:'owner@example.test',iat:now-10,exp:now+240});
 const executorToken=await sign({type:'app',iss:c.accessIssuer,aud:c.accessAudience,sub:'',common_name:c.identities[1].clientId,iat:now-10,exp:now+240});
 const exec=executionFixture();exec.manifest.ownerDecisionRef=r.decisionRef;exec.manifest.approvedAt=now-10;exec.manifest.expiresAt=now+240;exec.manifest.requestedAt=now-10;exec.request.requestedAt=now-10;exec.runtime.observedAt=now;exec.session.observedAt=now;exec.session.issuedAt=now-5;exec.session.expiresAt=now+240;
 exec.manifest.executorPrincipal=policy.workloadRef;exec.manifest.signerPrincipal=policy.signerCustodianRef;
 exec.approval={...exec.approval,executorPrincipal:policy.workloadRef,signerPrincipal:policy.signerCustodianRef,manifestHash:sha256(exec.manifest),ownerDecisionRef:r.decisionRef};
 c.providerCapability={credentialRef:exec.manifest.providerCredentialRef,accountId:TRAINING_TARGET.accountId,expiresAt:now+240,permissionAcceptanceVerified:true};
 let dispatches=0,providerCreates=0,commissioned=true,createdPolicy=null;
 const outbound=async req=>{
  const url=new URL(req.url);requests.push({host:url.hostname,path:url.pathname,method:req.method});
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  if(url.hostname==='fictional.cloudflareaccess.com'&&url.pathname==='/cdn-cgi/access/certs')return json({keys:[jwk]});
  if(url.hostname==='independent.example.test'){
   const q=await req.json();let value;
   if(q.purpose==='dispatchApproval')value=approval;
   else if(q.purpose==='commissioning')value={...q.query,workloadControlsHash:dispatchHash(c.workloadControls),sourceSha:sha,ownerOverrideAuditRef:c.workloadControls.ownerOverrideAuditRef,protocol:'CREATORLOOP_TRAINING_WORKLOAD_COMMISSIONING_V2',exceptionDecisionRef:WORKLOAD_EXCEPTION_DECISION,ownerOverrideRiskAcknowledged:true,runtimeHasNoDeploymentAuthority:true,runtimeHasNoApprovalSigningAuthority:true,protectedDeploymentPathVerified:commissioned,unapprovedCodeChangeDetectionVerified:true,directOverrideMitigationVerified:true,vtIndependentRecoveryVerified:true,signingCustodyExcluded:true,appCapabilityScopeVerified:true,auditRetentionVerified:true,approvalObserverAdministrationSeparated:true,controlsEvidenceRef:policy.separationControlsRef,evidenceRef:'FICTIONAL-NOT-LIVE'};
   else if(q.purpose==='runApproval')value={...q.query,...executorAuthorityBinding(policy),workflowFile:approval.workflowFile,callerId:policy.account.id,appBotId:66,expiresAt:now+240};
   else if(q.purpose==='executionBundle')value={manifest:exec.manifest,request:exec.request};
   else if(q.purpose==='providerApproval')value=exec.approval;
   else if(q.purpose==='currentRequest')value={request:exec.request,personnelVersion:exec.request.requestVersion};
   else if(q.purpose==='runtime')value=exec.runtime;
   else if(q.purpose==='session')value=exec.session;
   else if(q.purpose==='providerScope')value={...q.query,effectiveScopeVerified:true,expiresAt:c.providerCapability.expiresAt};
   else if(q.purpose==='custodyExport')value={...q.query,protocol:'CREATORLOOP_OWNER_CUSTODY_EXPORT_APPROVAL_V1',exportId:'33333333-3333-3333-3333-333333333333',decisionRef:'FICTIONAL-OWNER-EXPORT',dataExportAuthorized:true,approvedAt:now-10,expiresAt:now+240};
   else if(q.purpose==='providerCapability'){const call=q.query;value={authorized:true,requestHash:sha256({method:call.method,path:call.path,...(call.body?{body:call.body}:{})}),environment:'TRAINING',targetAppId:TRAINING_TARGET.appId,expiresAt:now+240,credentialRef:exec.manifest.providerCredentialRef};}
   else throw Error('Unexpected fixture evidence');
   return json({jws:await sign({iss:'FICTIONAL-INDEPENDENT',aud:'CREATORLOOP_TRAINING_EVIDENCE',iat:now-10,exp:now+240,purpose:q.purpose,nonce:q.nonce,queryHash:q.queryHash,value})});
  }
  if(url.hostname==='api.github.com'){
   if(url.pathname==='/app/installations/33/access_tokens')return json({token:'FICTIONAL-IN-MEMORY-TOKEN',permissions:{actions:'write',metadata:'read'},expires_at:new Date((now+3500)*1000).toISOString()});
   if(url.pathname==='/installation/repositories')return json({total_count:1,repositories:[{id:44,full_name:'VTholdings/creatorloop-main-site'}]});
   if(url.pathname.endsWith('/dispatches')){dispatches++;const body=await req.json();assert.equal(body.ref,'team-access-directory');assert.equal(body.inputs.expected_execution_sha,sha);return json({workflow_run_id:123});}
   if(url.pathname.endsWith('/git/ref/heads/team-access-directory'))return json({object:{sha}});
   if(url.pathname.includes('/contents/'))return json({encoding:'base64',path:'.github/workflows/step18-training-provider-workflow.yml',content:Buffer.from(content).toString('base64')});
   if(url.pathname==='/repos/VTholdings/creatorloop-main-site')return json({default_branch:'main'});
  }
  if(url.hostname==='api.cloudflare.com'){
   const root='/client/v4/accounts/'+TRAINING_TARGET.accountId+'/access/apps/'+TRAINING_TARGET.appId+'/policies';assert.equal(url.pathname,root);
   if(req.method==='GET')return json({success:true,result:[...preserved,...(createdPolicy?[createdPolicy]:[])],result_info:{total_pages:1}});
   if(req.method==='POST'){providerCreates++;const body=await req.json();assert.deepEqual(body,policyTemplate(exec.manifest));createdPolicy={...body,id:'22222222-2222-2222-2222-222222222222'};return json({success:true,result:createdPolicy});}
  }
  if(url.hostname==='token.actions.githubusercontent.com')return json({keys:[jwk]});
  throw Error('LOCAL TEST FORBIDS ALL OTHER NETWORK');
 };
 const privatePem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
 const mf=new Miniflare({rootPath:bundles,workers:[
  {name:'gateway',modules:true,modulesRoot:bundles,scriptPath:join(bundles,'gateway-build/gateway.js'),compatibilityDate:'2025-10-08',compatibilityFlags:['nodejs_compat'],bindings:{MANAGED_CONFIG_JSON:JSON.stringify(c)},serviceBindings:{CAPABILITY:'capability'},outboundService:outbound},
  {name:'capability',modules:true,modulesRoot:bundles,scriptPath:join(bundles,'capability-build/capability.js'),compatibilityDate:'2025-10-08',compatibilityFlags:['nodejs_compat'],bindings:{MANAGED_CONFIG_JSON:JSON.stringify(c),WORKER_VERSION_METADATA:{id:'FICTIONAL-VERSION'},GITHUB_APP_PRIVATE_KEY:privatePem,TRAINING_PROVIDER_TOKEN:'FICTIONAL-NOT-LIVE-PROVIDER-TOKEN'},durableObjects:{STATE:{className:'TrainingExecutionState',useSQLite:true}},r2Buckets:['EVIDENCE'],outboundService:outbound}
 ]});
 try{
  const call=(path,body,token)=>mf.dispatchFetch(c.gatewayOrigin+path,{method:'POST',headers:{'Content-Type':'application/json',...(path==='/v1/dispatch'?{}:{Origin:c.gatewayOrigin}),'Cf-Access-Jwt-Assertion':token},body:JSON.stringify(body)});
  assert.equal((await call('/v1/approve',{request:r},executorToken)).status,403);
  assert.equal((await call('/v1/dispatch',r,ownerToken)).status,403);
  assert.equal((await call('/v1/dispatch',r,executorToken)).status,403);assert.equal(dispatches,0);
  const approved=await call('/v1/approve',{request:r},ownerToken);assert.equal(approved.status,200,await approved.text());
  const response=await call('/v1/dispatch',r,executorToken);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.dispatchAccepted,true);assert.equal(result.protectedExecutionAccepted,false);assert.equal(dispatches,1);
  assert.equal((await call('/v1/dispatch',r,executorToken)).status,403);assert.equal(dispatches,1);
  const jobToken=await sign({iss:'https://token.actions.githubusercontent.com',aud:c.oidcAudience,iat:now-10,exp:now+240,sub:c.allowedOidcSubjects[0],repository:'VTholdings/creatorloop-main-site',repository_id:'44',repository_owner_id:'55',ref:'refs/heads/team-access-directory',sha,workflow_sha:sha,workflow_ref:'VTholdings/creatorloop-main-site/.github/workflows/step18-training-provider-workflow.yml@refs/heads/team-access-directory',event_name:'workflow_dispatch',run_attempt:'1',actor_id:'66',actor:c.appBotLogin,runner_environment:'github-hosted',environment:'creatorloop-training-provider-execution',run_id:'123',jti:'FICTIONAL-JOB'});
  const jobCall=path=>mf.dispatchFetch(c.gatewayOrigin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jobToken},body:JSON.stringify({dispatchId:r.dispatchId,lane:'provider',executionSha:sha})});
  const checked=await jobCall('/v1/run-check');assert.equal(checked.status,200,await checked.text());
  const executed=await jobCall('/v1/provider');const observed=await executed.json();assert.equal(executed.status,200,JSON.stringify(observed));assert.equal(observed.signerAcceptancePending,true);assert.equal(observed.protectedExecutionAccepted,false);assert.equal(providerCreates,1);
  assert.equal((await jobCall('/v1/provider')).status,403);assert.equal(providerCreates,1);
  const bucket=await mf.getR2Bucket('EVIDENCE','capability');const list=await bucket.list();assert.equal(list.objects.length,6);assert.ok(list.objects.some(o=>o.key.startsWith('training-decisions/')));
  for(const obj of list.objects){const text=await (await bucket.get(obj.key)).text();assert.equal(text.includes('FICTIONAL-IN-MEMORY-TOKEN'),false);assert.equal(text.includes('BEGIN PRIVATE KEY'),false);assert.equal(text.includes(ownerToken),false);}
  const exportBody={protocol:'CREATORLOOP_OWNER_CUSTODY_EXPORT_V1',exportId:'33333333-3333-3333-3333-333333333333',decisionRef:'FICTIONAL-OWNER-EXPORT',expectedVersionId:'FICTIONAL-VERSION'};
  assert.equal((await call('/v1/custody/export',exportBody,executorToken)).status,403);
  const exportedResponse=await call('/v1/custody/export',exportBody,ownerToken),exported=await exportedResponse.json();assert.equal(exportedResponse.status,200,JSON.stringify(exported));
  assert.ok(exported.snapshot.tables.events.every(r=>JSON.parse(r.record_json).protocol==='CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2'));
  assert.ok(exported.snapshot.tables.events.every(r=>!Object.hasOwn(JSON.parse(r.record_json),'humanCustodianRef')));
  const dir=await mkdtemp(join(tmpdir(),'vt-workload-custody-'));await chmod(dir,0o700);
  try{const input=join(dir,'owner-export.json'),output=join(dir,'isolated.sqlite');await writeFile(input,JSON.stringify(exported),{mode:0o600});assert.equal((await recoverSavedCustody({input,output,expectedHash:exported.snapshot.snapshotHash})).isolatedRecoveryVerified,true);}finally{await rm(dir,{recursive:true,force:true});}
  commissioned=false;assert.equal((await call('/v1/dispatch',r,executorToken)).status,403);assert.equal(dispatches,1);
  assert.ok(requests.every(q=>['fictional.cloudflareaccess.com','independent.example.test','api.github.com','api.cloudflare.com','token.actions.githubusercontent.com'].includes(q.host)));
 }finally{await mf.dispose();}
});
