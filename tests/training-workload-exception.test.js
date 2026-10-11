import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMediatedDispatcher,dispatchHash,validateApprovedExecutorPolicy} from '../scripts/lib/training-mediated-dispatcher.mjs';
import {WORKLOAD_EXCEPTION_DECISION,executorAuthorityBinding} from '../scripts/lib/training-workload-policy.mjs';
import {configuration,accessPrincipal} from '../workers/training-managed/security.mjs';
import {validateWorkloadControls,refuseRuntimeManagementBindings} from '../workers/training-managed/workload-controls.mjs';
import {verifyMediatedWorkflowRun} from '../scripts/lib/training-mediated-run.mjs';
import {fictionalWorkloadPolicy,fictionalWorkloadControls} from './helpers/training-workload-fixture.js';
import {createWorkloadSubmitter} from '../scripts/lib/training-workload-submitter.mjs';
import {independentEvidence} from '../workers/training-managed/security.mjs';
function fixture(){
 const policy=fictionalWorkloadPolicy(),content='FICTIONAL-WORKFLOW\n',request={dispatchId:'11111111-1111-1111-1111-111111111111',decisionRef:'FICTIONAL-OWNER',lane:'provider',executionSha:'a'.repeat(40),inputs:{intended_operation:'ADMIT',owner_decision_ref:'FICTIONAL-OWNER',owner_reviewer_id:'77',approved_port_sha256:'b'.repeat(64)}};
 const principal={...policy.account,authenticationRef:'FICTIONAL-AUTH',authenticatedAt:200},audits=[],sent=[],claims=new Set();
 const approval={protocol:'CREATORLOOP_MEDIATED_WORKLOAD_APPROVAL_V2',...executorAuthorityBinding(policy),executorPolicyHash:dispatchHash(policy),repository:policy.repository,branch:policy.branch,workflowFile:'step18-training-provider-workflow.yml',dispatchId:request.dispatchId,decisionRef:request.decisionRef,requestHash:dispatchHash(request),executionSha:request.executionSha,workflowSha256:createHash('sha256').update(content).digest('hex'),callerId:66,callerLogin:policy.account.login,reviewerId:77,approvedAt:100,expiresAt:300};
 const ports={approvedExecutor:policy,now:()=>200,authenticateCaller:async()=>principal,verifyOwnerDecision:async()=>approval,readGithub:async path=>path.includes('/git/ref/')?{object:{sha:request.executionSha}}:path.includes('/contents/')?{encoding:'base64',path:'.github/workflows/step18-training-provider-workflow.yml',content:Buffer.from(content).toString('base64')}:{default_branch:'main'},claimOnce:async c=>{if(claims.has(c.dispatchId))return null;claims.add(c.dispatchId);return {...c,claimRef:'FICTIONAL-CLAIM'};},appendAudit:async r=>{audits.push(r);return {recordHash:r.recordHash,auditRef:'FICTIONAL-AUDIT'};},dispatchGithub:async c=>{sent.push(c);return {status:200,runId:123};}};
 return {policy,request,principal,approval,ports,audits,sent};
}
test('workload exception is explicit, TRAINING/ref scoped and never converts a human policy implicitly',()=>{
 assert.equal(validateApprovedExecutorPolicy(fictionalWorkloadPolicy()).environment,'TRAINING');
 for(const update of [{environment:'PRODUCTION'},{branch:'main'},{ownerOverrideRiskAccepted:false},{exceptionDecisionRef:'OTHER'},{account:{id:66,login:'kailuatester-del'}},{account:{id:77,login:'owner[bot]'}},{humanCustodianRef:'OWNER'}])assert.throws(()=>validateApprovedExecutorPolicy({...fictionalWorkloadPolicy(),...update}));
 const legacy={protocol:'CREATORLOOP_APPROVED_EXECUTOR_POLICY_V1',account:{id:66,login:'fictional'},reviewerId:77,humanCustodianRef:'OWNER',signerCustodianRef:'OWNER',separationEvidenceRef:'FICTIONAL'};assert.throws(()=>validateApprovedExecutorPolicy(legacy));
});
test('workload dispatch requires independent request-bound Owner approval and audits machine not fictional human',async()=>{
 const f=fixture(),dispatch=createMediatedDispatcher(f.ports);assert.equal((await dispatch({request:f.request})).protectedExecutionAccepted,false);
 assert.equal(f.sent.length,1);assert.equal(f.audits[0].protocol,'CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2');assert.equal(f.audits[0].exceptionDecisionRef,WORKLOAD_EXCEPTION_DECISION);assert.equal(Object.hasOwn(f.audits[0],'humanCustodianRef'),false);
 await assert.rejects(dispatch({request:f.request}));assert.equal(f.sent.length,1);
});
test('missing/manufactured Owner approval, wrong exception and Owner caller refuse before dispatch',async()=>{
 for(const change of [f=>f.approval.protocol='CREATORLOOP_MEDIATED_DISPATCH_APPROVAL_V1',f=>f.approval.reviewerId=66,f=>f.approval.requestHash='c'.repeat(64),f=>f.approval.exceptionDecisionRef='OTHER',f=>f.approval.humanCustodianRef='OWNER',f=>f.principal.id=77]){
  const f=fixture();change(f);await assert.rejects(createMediatedDispatcher(f.ports)({request:f.request}));assert.equal(f.sent.length,0);
 }
});
test('workflow run requires same explicit exception/workload and exact App bot',async()=>{
 const f=fixture(),context={repository:f.policy.repository,ref:'refs/heads/team-access-directory',eventName:'workflow_dispatch',runAttempt:'1',runnerEnvironment:'github-hosted',executionSha:f.request.executionSha,workflowSha:f.request.executionSha,runId:'123',actorId:'66',actorLogin:f.policy.account.login},policy={protocol:'CREATORLOOP_MEDIATED_RUN_POLICY_V1',approvedExecutor:f.policy,reviewerId:77,appBotId:66,appBotLogin:context.actorLogin};
 const proof={runId:'123',dispatchId:f.request.dispatchId,requestHash:dispatchHash(f.request),executionSha:f.request.executionSha,workflowFile:'step18-training-provider-workflow.yml',callerId:66,executorPolicyHash:dispatchHash(f.policy),appBotId:66,expiresAt:300,...executorAuthorityBinding(f.policy)};
 const config={context,policy,inputs:{...f.request.inputs,dispatch_id:f.request.dispatchId,expected_execution_sha:f.request.executionSha},lane:'provider',now:()=>200,verifyRunApproval:async()=>proof};assert.equal((await verifyMediatedWorkflowRun(config)).mediatedRunVerified,true);
 delete proof.exceptionDecisionRef;await assert.rejects(verifyMediatedWorkflowRun(config));
});
const managedConfig=()=>({protocol:'CREATORLOOP_MANAGED_TRAINING_V2',environment:'TRAINING',accessIssuer:'https://fictional.cloudflareaccess.com',accessAudience:'FICTIONAL-AUD',gatewayOrigin:'https://fictional.example',oidcAudience:'FICTIONAL-JOB',appId:22,installationId:33,repositoryId:44,ownerId:55,appBotId:66,appBotLogin:'fictional-dispatch[bot]',approvedExecutor:fictionalWorkloadPolicy(),workloadControls:fictionalWorkloadControls(),identities:[{role:'owner',subject:'owner-sub',email:'owner@example.test',githubId:77},{role:'executor',type:'access-service-token',clientId:'a'.repeat(32)+'.access',githubId:66}]});
test('signed Access service JWT authenticates workload but cannot become Owner; wrong/old contractor tokens refuse',async()=>{
 const c=configuration({MANAGED_CONFIG_JSON:JSON.stringify(managedConfig())});
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'FICTIONAL-KEY'};
 const sign=async value=>{const raw=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:c.accessIssuer,aud:c.accessAudience,iat:100,exp:300,...value})).toString('base64url');return raw+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(raw))).toString('base64url');};
 const opts={now:200,fetchImpl:async()=>new Response(JSON.stringify({keys:[jwk]}))};
 assert.equal((await accessPrincipal(await sign({type:'app',sub:'',common_name:c.identities[1].clientId}),c,opts)).role,'executor');
 assert.equal((await accessPrincipal(await sign({type:'app',sub:'owner-sub',email:'owner@example.test'}),c,opts)).role,'owner');
 for(const claims of [{type:'app',sub:'',common_name:'b'.repeat(32)+'.access'},{type:'app',sub:'contractor-sub',email:'contractor@example.test'},{type:'app',sub:'owner-sub',email:'owner@example.test',common_name:c.identities[1].clientId},{type:'org',sub:'',common_name:c.identities[1].clientId}])await assert.rejects(accessPrincipal(await sign(claims),c,opts));
});
test('workload config and runtime reject implicit legacy conversion/extra private authority',()=>{
 const c=managedConfig();assert.throws(()=>configuration({MANAGED_CONFIG_JSON:JSON.stringify({...c,protocol:'CREATORLOOP_MANAGED_TRAINING_V1'})}));
 for(const binding of ['CLOUDFLARE_API_TOKEN','DEPLOY_TOKEN','APPROVAL_PRIVATE_KEY','ADMISSION_PRIVATE_KEY'])assert.throws(()=>refuseRuntimeManagementBindings({[binding]:'FICTIONAL'},c));
 refuseRuntimeManagementBindings({GITHUB_APP_PRIVATE_KEY:'FICTIONAL',TRAINING_PROVIDER_TOKEN:'FICTIONAL'},c);
});
test('nonsecret override controls plan demands protected path, scoped credential/no runtime management and retained recovery',()=>{
 const p=fictionalWorkloadPolicy(),plan={protocol:'CREATORLOOP_TRAINING_WORKLOAD_CONTROLS_V1',environment:'TRAINING',accountId:'2a3b96a0b37850cd03107131baa66b6d',workers:['creatorloop-training-execution-gateway','creatorloop-training-execution-capability'],repository:p.repository,branch:p.branch,releaseEnvironment:'creatorloop-training-release',preventSelfReview:true,allowAdminBypass:false,ownerReviewerId:77,deploymentCredentialScope:'selected-workers-editor',runtimeManagementCredentials:false,runtimeApprovalSigningCredentials:false,automaticCloudflareBuilds:false,alternateDeploymentCredentials:false,capabilityPublicRoute:false,ownerOverrideRiskAccepted:true,freezePrivilegedChangesWhenCommissioningExpires:true,expectedSourceSha:'a'.repeat(40),ownerOverrideAuditRef:'FICTIONAL',configVersionReconciliationRef:'FICTIONAL',vtRecoveryCopyRef:'FICTIONAL',approvalEvidenceCustodyRef:'FICTIONAL'};
 assert.equal(validateWorkloadControls(plan,p).effectiveCloudflareControlsVerified,false);
 for(const update of [{runtimeManagementCredentials:true},{automaticCloudflareBuilds:true},{allowAdminBypass:true},{vtRecoveryCopyRef:''},{workers:['other']}])assert.throws(()=>validateWorkloadControls({...plan,...update},p));
});
test('workload submitter sends only bound approved dispatch, sanitizes result and never follows redirects/retries',async()=>{
 const f=fixture(),gatewayOrigin='https://fictional.example',clientId='a'.repeat(32)+'.access',calls=[];
 const ports={policy:f.policy,gatewayOrigin,clientId,now:()=>200,verifySubmissionApproval:async binding=>({...binding,reviewerId:77,exceptionDecisionRef:WORKLOAD_EXCEPTION_DECISION,expiresAt:300}),resolveServiceCapability:async()=>({clientId,gatewayOrigin,dispatchOnlyVerified:true,expiresAt:300,clientSecret:'FICTIONAL-NOT-LIVE'}),fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({dispatchId:f.request.dispatchId,dispatchAccepted:true,protectedExecutionAccepted:false,runId:123,leak:'PRIVATE'}));}};
 const result=await createWorkloadSubmitter(ports)(f.request);assert.equal(result.runVerified,false);assert.equal(Object.hasOwn(result,'leak'),false);assert.equal(calls[0].url,gatewayOrigin+'/v1/dispatch');assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.headers.Origin,undefined);
 let redirects=0;await assert.rejects(createWorkloadSubmitter({...ports,fetchImpl:async()=>{redirects++;return new Response(null,{status:302,headers:{Location:'https://other.invalid'}});}})(f.request));assert.equal(redirects,1);
 await assert.rejects(createWorkloadSubmitter({...ports,verifySubmissionApproval:async binding=>({...binding,reviewerId:66,expiresAt:300})})(f.request));assert.equal(calls.length,1);
});
test('Owner evidence is not accepted from the executor gateway or wrong administration reference',async()=>{
 const c=managedConfig();let calls=0;
 for(const port of [{url:c.gatewayOrigin+'/evidence',administrationRef:c.workloadControls.approvalEvidenceCustodyRef},{url:'https://other.example',administrationRef:c.approvedExecutor.workloadRef}]){
  c.evidencePorts={commissioning:{...port,publicKeys:[{}],issuer:'FICTIONAL'}};
  await assert.rejects(independentEvidence(c,'commissioning',{}, {now:200,fetchImpl:async()=>{calls++;}}),/SEPARATE_EVIDENCE/);
 }
 assert.equal(calls,0);
});
test('new shared policy branch preserves legacy human dispatch and V1 audit without rewriting history',async()=>{
 const f=fixture();f.policy={protocol:'CREATORLOOP_APPROVED_EXECUTOR_POLICY_V1',account:{id:66,login:'fictional-human'},reviewerId:77,humanCustodianRef:'FICTIONAL-HUMAN',signerCustodianRef:'FICTIONAL-OWNER-MAC',separationEvidenceRef:'FICTIONAL'};
 f.principal.login=f.policy.account.login;f.ports.approvedExecutor=f.policy;
 delete f.approval.workloadRef;delete f.approval.exceptionDecisionRef;
 Object.assign(f.approval,{protocol:'CREATORLOOP_MEDIATED_DISPATCH_APPROVAL_V1',callerLogin:f.principal.login,humanCustodianRef:f.policy.humanCustodianRef,executorPolicyHash:dispatchHash(f.policy)});
 assert.equal((await createMediatedDispatcher(f.ports)({request:f.request})).dispatchAccepted,true);
 assert.equal(f.audits[0].protocol,'CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1');assert.equal(f.audits[0].humanCustodianRef,'FICTIONAL-HUMAN');assert.equal(Object.hasOwn(f.audits[0],'exceptionDecisionRef'),false);
});
