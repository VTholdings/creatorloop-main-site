import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMediatedDispatcher,EXECUTOR_ACCOUNT,DISPATCH_WORKFLOWS,dispatchHash,validateDispatchRequest} from '../scripts/lib/training-mediated-dispatcher.mjs';
import {createGithubDispatchTransport} from '../scripts/lib/training-github-dispatch-transport.mjs';
import {verifyMediatedWorkflowRun} from '../scripts/lib/training-mediated-run.mjs';
import {openDispatchAuditStore} from '../scripts/lib/training-dispatch-audit-store.mjs';
import {readFile,mkdtemp,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function fixture(lane='provider',overrides={}) {
 const request={dispatchId:'11111111-1111-1111-1111-111111111111',decisionRef:'OWNER-FICTIONAL-DECISION',lane,executionSha:'a'.repeat(40),inputs:{...(lane==='provider'?{intended_operation:'ADMIT'}:{application_sha:'b'.repeat(40),configuration_hash:'c'.repeat(64)}),owner_decision_ref:'OWNER-FICTIONAL-DECISION',owner_reviewer_id:'245245322',approved_port_sha256:'d'.repeat(64)}};
 const principal={...EXECUTOR_ACCOUNT,authenticationRef:'FICTIONAL-AUTH',authenticatedAt:200};
 const content='FICTIONAL-REVIEWED-WORKFLOW-NOT-ACTIVE\n';
 const approval={protocol:'CREATORLOOP_MEDIATED_DISPATCH_APPROVAL_V1',repository:'VTholdings/creatorloop-main-site',branch:'team-access-directory',workflowFile:DISPATCH_WORKFLOWS[lane],dispatchId:request.dispatchId,decisionRef:request.decisionRef,requestHash:dispatchHash(request),executionSha:request.executionSha,workflowSha256:createHash('sha256').update(content).digest('hex'),callerId:principal.id,callerLogin:principal.login,reviewerId:245245322,humanCustodianRef:'FICTIONAL-INDEPENDENT-HUMAN',approvedAt:100,expiresAt:300};
 const reads=[],sends=[],audits=[],claims=new Set();
 const ports={now:()=>200,authenticateCaller:async()=>principal,verifyOwnerDecision:async()=>approval,readGithub:async path=>{reads.push(path);if(path.includes('/git/ref/'))return {object:{sha:request.executionSha}};if(path.includes('/contents/'))return {encoding:'base64',path:`.github/workflows/${DISPATCH_WORKFLOWS[lane]}`,content:Buffer.from(content).toString('base64')};return {default_branch:'main'};},claimOnce:async c=>{if(claims.has(c.dispatchId))return null;claims.add(c.dispatchId);return {...c,claimRef:'FICTIONAL-DURABLE-CLAIM'};},appendAudit:async r=>{audits.push(r);return {recordHash:r.recordHash,auditRef:'FICTIONAL-RESTRICTED-AUDIT'};},dispatchGithub:async c=>{sends.push(c);return {status:200,runId:123};},...overrides};
 return {request,principal,approval,reads,sends,audits,ports,dispatch:createMediatedDispatcher(ports)};
}
test('exact provider/release mediated dispatch retains caller, exact inputs and hash-chained audit without claiming acceptance',async()=>{
 for(const lane of ['provider','release']){
  const f=fixture(lane),out=await f.dispatch({request:f.request,callerContext:{}});
  assert.equal(out.dispatchAccepted,true);assert.equal(out.runVerified,false);assert.equal(out.protectedExecutionAccepted,false);assert.equal(f.sends.length,1);
  const c=f.sends[0];assert.equal(c.path,`/repos/VTholdings/creatorloop-main-site/actions/workflows/${DISPATCH_WORKFLOWS[lane]}/dispatches`);assert.equal(c.body.ref,'team-access-directory');assert.equal(c.body.inputs.dispatch_id,f.request.dispatchId);assert.equal(c.body.inputs.expected_execution_sha,f.request.executionSha);
  assert.deepEqual(f.audits.map(a=>a.outcome),['PREPARED','SEND_INTENT','ACCEPTED_PENDING_RUN_VERIFICATION']);assert.equal(f.audits[1].previousHash,f.audits[0].recordHash);assert.equal(f.audits[0].callerId,EXECUTOR_ACCOUNT.id);assert.equal(Object.hasOwn(f.audits[0],'callerContext'),false);
 }
});
test('arbitrary workflow/branch/extra inputs, malformed version and unknown operation refuse before authentication',()=>{
 for(const mutate of [r=>r.workflow='ci.yml',r=>r.branch='main',r=>r.inputs.ref='main',r=>r.lane='constructor',r=>r.inputs.intended_operation='DELETE',r=>r.executionSha='main',r=>r.inputs.owner_decision_ref='OTHER']){
  const f=fixture();mutate(f.request);assert.throws(()=>validateDispatchRequest(f.request));
 }
});
test('wrong or stale caller, self-review and expired/substituted approval refuse before reads/send',async()=>{
 for(const type of ['wrongCaller','staleCaller','selfReview','expired','hash']){
  const f=fixture();if(type==='wrongCaller')f.principal.id=1;if(type==='staleCaller')f.principal.authenticatedAt=-500;if(type==='selfReview')f.approval.reviewerId=EXECUTOR_ACCOUNT.id;if(type==='expired')f.approval.expiresAt=199;if(type==='hash')f.approval.requestHash='0'.repeat(64);
  await assert.rejects(f.dispatch({request:f.request}));assert.equal(f.sends.length,0);assert.equal(f.reads.length,0);
 }
});
test('changed training SHA/default branch/workflow hash refuses dispatch',async()=>{
 for(const response of [{object:{sha:'b'.repeat(40)}},{default_branch:'other'},{encoding:'base64',path:'.github/workflows/step18-training-provider-workflow.yml',content:Buffer.from('substituted').toString('base64')}]){
  const f=fixture('provider',{readGithub:async path=>path.includes('/git/ref/')?(response.object?response:{object:{sha:'a'.repeat(40)}}):path.includes('/contents/')?(response.content?response:{encoding:'base64',path:'.github/workflows/step18-training-provider-workflow.yml',content:Buffer.from('FICTIONAL-REVIEWED-WORKFLOW-NOT-ACTIVE\n').toString('base64')}):(response.default_branch?response:{default_branch:'main'})});
  await assert.rejects(f.dispatch({request:f.request}));assert.equal(f.sends.length,0);
 }
});
test('durable one-time claim prevents concurrent/replayed mutation',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.dispatch({request:f.request}),f.dispatch({request:f.request})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sends.length,1);await assert.rejects(f.dispatch({request:f.request}));assert.equal(f.sends.length,1);
});
test('private claim-store exception is redacted and prevents dispatch',async()=>{
 const f=fixture('provider',{claimOnce:async()=>{throw Error('PRIVATE-STORE-CREDENTIAL');}});
 await assert.rejects(f.dispatch({request:f.request}),e=>e.message==='DURABLE_DISPATCH_CLAIM_FAILED_NO_RETRY');assert.equal(f.sends.length,0);
});
test('audit failure before send prevents dispatch; final failure never retries an accepted send',async()=>{
 const before=fixture('provider',{appendAudit:async()=>{throw Error('PRIVATE-AUDIT-ERROR');}});await assert.rejects(before.dispatch({request:before.request}),/AUDIT/);assert.equal(before.sends.length,0);
 const f=fixture();let auditCount=0;const dispatch=createMediatedDispatcher({...f.ports,appendAudit:async r=>{if(++auditCount===3)throw Error('private');return {recordHash:r.recordHash,auditRef:'AUDIT'};}});await assert.rejects(dispatch({request:f.request}),/AUDIT/);assert.equal(f.sends.length,1);
});
test('approval/source race after prepared audit refuses before send',async()=>{
 const f=fixture();const dispatch=createMediatedDispatcher({...f.ports,appendAudit:async r=>{f.audits.push(r);if(r.outcome==='PREPARED')f.approval.workflowSha256='0'.repeat(64);return {recordHash:r.recordHash,auditRef:'AUDIT'};}});
 await assert.rejects(dispatch({request:f.request}),/RECONCILIATION/);assert.equal(f.sends.length,0);assert.equal(f.audits.at(-1).outcome,'REFUSED_BEFORE_SEND');
});
test('uncertain dispatch records uncertainty, redacts error and is not retried; 204 remains uncorrelated',async()=>{
 const f=fixture('provider',{dispatchGithub:async()=>{throw Error('DO-NOT-LEAK-TOKEN');}});await assert.rejects(f.dispatch({request:f.request}),error=>error.message==='DISPATCH_OUTCOME_UNKNOWN_NO_RETRY');assert.equal(f.audits.at(-1).outcome,'OUTCOME_UNKNOWN_NO_RETRY');await assert.rejects(f.dispatch({request:f.request}));
 const g=fixture('provider',{dispatchGithub:async()=>({status:204})}),out=await g.dispatch({request:g.request});assert.equal(out.runVerified,false);assert.equal(Object.hasOwn(out,'runId'),false);
});
async function transportFixture(overrides={}){
 const f=fixture();await f.dispatch({request:f.request});const call=f.sends[0],calls=[];
 const authority={requestHash:call.requestHash,bodyHash:call.bodyHash,decisionRef:call.decisionRef,expiresAt:call.expiresAt,capabilityRef:'PRIVATE-APP-REF',appId:22,installationId:33};
 const capability={kind:'github-app-installation',appId:22,installationId:33,repositories:['VTholdings/creatorloop-main-site'],permissions:{actions:'write',metadata:'read'},effectiveScopeVerified:true,expiresAt:1000,token:'FICTIONAL-NOT-LIVE'};
 const ports={now:()=>200,verifyDispatchAuthorization:async()=>authority,resolveAppCapability:async()=>capability,fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({workflow_run_id:123}),{status:200});},...overrides};return {call,capability,authority,calls,transport:createGithubDispatchTransport(ports),ports};
}
test('private transport sends only exact POST with scoped App capability and sanitizes provider response',async()=>{
 const f=await transportFixture(),result=await f.transport(f.call);assert.deepEqual(result,{status:200,runId:123});assert.equal(f.calls.length,1);assert.equal(f.calls[0].opts.redirect,'error');assert.equal(Object.hasOwn(result,'token'),false);
});
test('private transport rejects other endpoint/body, user token, broad scope and expanded permissions before HTTP',async()=>{
 for(const type of ['path','body','kind','repos','permissions','binding']){
  const f=await transportFixture();if(type==='path')f.call.path='/repos/VTholdings/creatorloop-main-site/actions/runs/123';if(type==='body')f.call.body.ref='main';if(type==='kind')f.capability.kind='personal-access-token';if(type==='repos')f.capability.repositories.push('other/repo');if(type==='permissions')f.capability.permissions.contents='write';if(type==='binding')f.authority.bodyHash='0'.repeat(64);
  await assert.rejects(f.transport(f.call));assert.equal(f.calls.length,0);
 }
});
test('transport unknown outcome is redacted and response size is bounded',async()=>{
 const f=await transportFixture({fetchImpl:async()=>{throw Error('PRIVATE-TOKEN');}});await assert.rejects(f.transport(f.call),e=>e.message==='GITHUB_DISPATCH_TRANSPORT_OUTCOME_UNKNOWN_NO_RETRY');
 const g=await transportFixture({fetchImpl:async()=>new Response('x'.repeat(20000),{status:200})});await assert.rejects(g.transport(g.call),/RESPONSE_UNKNOWN/);
});
test('workflow-side binding requires pinned bot and exact independently approved run/source/inputs',async()=>{
 const f=fixture(),inputs={...f.request.inputs,dispatch_id:f.request.dispatchId,expected_execution_sha:f.request.executionSha};
 const context={repository:'VTholdings/creatorloop-main-site',ref:'refs/heads/team-access-directory',eventName:'workflow_dispatch',runAttempt:'1',runnerEnvironment:'github-hosted',executionSha:f.request.executionSha,workflowSha:f.request.executionSha,runId:'123',actorId:'99',actorLogin:'fictional-dispatch[bot]'};
 const policy={protocol:'CREATORLOOP_MEDIATED_RUN_POLICY_V1',appBotId:99,appBotLogin:context.actorLogin,executorAccountId:EXECUTOR_ACCOUNT.id,reviewerId:245245322};
 const verifyRunApproval=async()=>({runId:'123',dispatchId:f.request.dispatchId,requestHash:dispatchHash(f.request),executionSha:f.request.executionSha,workflowFile:DISPATCH_WORKFLOWS.provider,callerId:EXECUTOR_ACCOUNT.id,appBotId:99,expiresAt:300});
 const config={context,inputs,policy,lane:'provider',verifyRunApproval,now:()=>200};assert.equal((await verifyMediatedWorkflowRun(config)).mediatedRunVerified,true);
 for(const override of [{context:{...context,actorId:String(EXECUTOR_ACCOUNT.id)}},{inputs:{...inputs,expected_execution_sha:'b'.repeat(40)}},{verifyRunApproval:async()=>null}])await assert.rejects(verifyMediatedWorkflowRun({...config,...override}));
});
test('integration templates remain inactive and require dispatcher checks before/after environment gate',async()=>{
 for(const lane of ['provider','release']){
  const text=await readFile('docs/proposals/'+DISPATCH_WORKFLOWS[lane],'utf8');assert.match(text,/dispatch_id:/);assert.match(text,/expected_execution_sha:/);assert.equal(text.split('github-mediated-run-check.mjs '+lane).length-1,2);assert.match(text,/contents: read/);await assert.rejects(readFile('.github/workflows/'+DISPATCH_WORKFLOWS[lane]),{code:'ENOENT'});
 }
});
test('private local store preserves exact audit and rejects replay after restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fictional-dispatch-store-'));await chmod(dir,0o700);let store;
 try{
  store=openDispatchAuditStore(join(dir,'audit.sqlite'));const f=fixture();const dispatch=createMediatedDispatcher({...f.ports,claimOnce:store.claimOnce,appendAudit:store.appendAudit});
  await dispatch({request:f.request});const records=store.readDispatch(f.request.dispatchId);assert.equal(records.length,3);assert.equal(records[2].previousHash,records[1].recordHash);
  const altered={...records[2],outcome:'ALTERED'};await assert.rejects(store.appendAudit(altered),/HASHED/);
  store.close();store=openDispatchAuditStore(join(dir,'audit.sqlite'));assert.equal(await store.claimOnce({dispatchId:f.request.dispatchId,decisionRef:f.request.decisionRef,requestHash:dispatchHash(f.request)}),null);assert.equal(store.readDispatch(f.request.dispatchId).length,3);
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
test('audit store refuses shared directory before provisioning',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fictional-dispatch-shared-'));try{await chmod(dir,0o755);assert.throws(()=>openDispatchAuditStore(join(dir,'audit.sqlite')),/OWNER_ONLY/);}finally{await rm(dir,{recursive:true,force:true});}
});
