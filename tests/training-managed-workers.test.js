import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createManagedState} from '../workers/training-managed/state.mjs';
import {verifyJwt,accessPrincipal,githubJob,independentEvidence,configuration,b64,noRedirectFetch} from '../workers/training-managed/security.mjs';
import {createGateway} from '../workers/training-managed/gateway.mjs';
import {createCapability} from '../workers/training-managed/capability-core.mjs';
import {verifyManagedCommissioning} from '../workers/training-managed/commissioning.mjs';
import {dispatchHash,TRANSFERRED_EXECUTOR_ACCOUNT} from '../scripts/lib/training-mediated-dispatcher.mjs';
import {verifyManagedJob} from '../scripts/execution/github-managed-training-job.mjs';
const now=200;
// Ephemeral, in-memory fictional test keys only; never an operational signing/App key.
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'FICTIONAL-LOCAL-TEST'};
async function token(payload){const head=b64(new TextEncoder().encode(JSON.stringify({alg:'RS256',kid:jwk.kid}))),data=b64(new TextEncoder().encode(JSON.stringify(payload))),raw=head+'.'+data;return raw+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(raw)));}
function config(){return {protocol:'CREATORLOOP_MANAGED_TRAINING_V1',environment:'TRAINING',accessIssuer:'https://fictional.cloudflareaccess.com',accessAudience:'FICTIONAL-AUDIENCE',gatewayOrigin:'https://fictional.example',oidcAudience:'FICTIONAL-JOB-AUDIENCE',appId:22,installationId:33,repositoryId:44,ownerId:55,appBotId:66,appBotLogin:'fictional-dispatch[bot]',capabilityVersionId:'FICTIONAL-VERSION',approvedExecutor:{protocol:'CREATORLOOP_APPROVED_EXECUTOR_POLICY_V1',account:{...TRANSFERRED_EXECUTOR_ACCOUNT},reviewerId:77,humanCustodianRef:'FICTIONAL-CONTRACTOR',signerCustodianRef:'FICTIONAL-OWNER',separationEvidenceRef:'FICTIONAL-OWNER-HANDOFF'},identities:[{role:'owner',subject:'owner-sub',email:'owner@example.test',githubId:77},{role:'executor',subject:'executor-sub',email:'executor@example.test',githubId:TRANSFERRED_EXECUTOR_ACCOUNT.id}],allowedOidcSubjects:['repo:FICTIONAL:environment:creatorloop-training-provider-execution']};}
function access(role='executor'){const c=config(),i=c.identities.find(x=>x.role===role);return {iss:c.accessIssuer,aud:c.accessAudience,sub:i.subject,email:i.email,iat:100,exp:300};}
function job(){const c=config();return {iss:'https://token.actions.githubusercontent.com',aud:c.oidcAudience,iat:100,exp:300,sub:c.allowedOidcSubjects[0],repository:'VTholdings/creatorloop-main-site',repository_id:'44',repository_owner_id:'55',ref:'refs/heads/team-access-directory',sha:'a'.repeat(40),workflow_sha:'a'.repeat(40),workflow_ref:'VTholdings/creatorloop-main-site/.github/workflows/step18-training-provider-workflow.yml@refs/heads/team-access-directory',event_name:'workflow_dispatch',run_attempt:'1',actor_id:'66',actor:c.appBotLogin,runner_environment:'github-hosted',environment:'creatorloop-training-provider-execution',run_id:'123',jti:'FICTIONAL-JTI'};}
const certFetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
function stateFixture(bucketOverride){const db=new DatabaseSync(':memory:'),stored=[];const sql={exec:(query,...args)=>{if(!args.length&&query.includes('CREATE TABLE')){db.exec(query);return {toArray:()=>[]};}const s=db.prepare(query);let rows=[];if(/^(SELECT|PRAGMA)/.test(query))rows=s.all(...args);else s.run(...args);return {toArray:()=>rows};}};const bucket={put:async(key,value)=>{stored.push({key,value});return {etag:'FICTIONAL'};},...bucketOverride};const transactionSync=fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};return {db,stored,state:createManagedState({sql,transactionSync,bucket,now:()=>now})};}
function request(){return {dispatchId:'11111111-1111-1111-1111-111111111111',decisionRef:'FICTIONAL-DECISION',lane:'provider',executionSha:'a'.repeat(40),inputs:{intended_operation:'ADMIT',owner_decision_ref:'FICTIONAL-DECISION',owner_reviewer_id:'77',approved_port_sha256:'b'.repeat(64)}};}
test('managed configuration refuses unprovisioned pins, role overlap and wrong transferred identity',()=>{
 assert.throws(()=>configuration({MANAGED_CONFIG_JSON:'{}'}));assert.equal(configuration({MANAGED_CONFIG_JSON:JSON.stringify(config())}).environment,'TRAINING');
 const c=config();c.identities[1].subject=c.identities[0].subject;assert.throws(()=>configuration({MANAGED_CONFIG_JSON:JSON.stringify(c)}));
});
test('Workers no-redirect wrapper uses manual mode and refuses redirected credentials',async()=>{
 let mode;const good=noRedirectFetch(async(url,options)=>{mode=options.redirect;return new Response('{}');});await good('https://fixture.invalid',{redirect:'error'});assert.equal(mode,'manual');
 await assert.rejects(noRedirectFetch(async()=>new Response(null,{status:302,headers:{Location:'https://other.invalid'}}))('https://fixture.invalid'),/REDIRECT/);
});
test('managed Access verification is cryptographic and binds exact subject/email role; tampering/expiry fail',async()=>{
 const t=await token(access()),p=await accessPrincipal(t,config(),{fetchImpl:certFetch,now});assert.equal(p.id,TRANSFERRED_EXECUTOR_ACCOUNT.id);
 const bad=access();bad.email='other@example.test';await assert.rejects(accessPrincipal(await token(bad),config(),{fetchImpl:certFetch,now}));
 await assert.rejects(verifyJwt(t.slice(0,-5)+'AAAAA',{issuer:config().accessIssuer,audience:config().accessAudience,jwks:[jwk],now}));
 await assert.rejects(verifyJwt(await token({...access(),exp:now}),{issuer:config().accessIssuer,audience:config().accessAudience,jwks:[jwk],now}));
});
test('managed OIDC binds signature/repository/workflow/source/environment/actor/run attempt',async()=>{
 const t=await token(job());assert.equal((await githubJob(t,config(),'provider','a'.repeat(40),{fetchImpl:certFetch,now})).runId,'123');
 for(const change of [{ref:'refs/heads/main'},{run_attempt:'2'},{repository_id:'99'},{environment:'creatorloop-training-release'},{workflow_sha:'b'.repeat(40)},{actor_id:'77'}])await assert.rejects(githubJob(await token({...job(),...change}),config(),'provider','a'.repeat(40),{fetchImpl:certFetch,now}));
});
test('independent evidence requires signed exact nonce/query and refuses replayed/unsigned value',async()=>{
 const c=config();c.evidencePorts={runtime:{url:'https://independent.example.test/runtime',issuer:'FICTIONAL-INDEPENDENT',publicKeys:[jwk]}};
 const fetchImpl=async(url,opts)=>{const q=JSON.parse(opts.body);return new Response(JSON.stringify({jws:await token({iss:'FICTIONAL-INDEPENDENT',aud:'CREATORLOOP_TRAINING_EVIDENCE',iat:100,exp:300,purpose:q.purpose,nonce:q.nonce,queryHash:q.queryHash,value:{fixture:true}})}));};
 assert.equal((await independentEvidence(c,'runtime',{sha:'a'},{fetchImpl,now})).fixture,true);
 await assert.rejects(independentEvidence(c,'runtime',{sha:'a'},{fetchImpl:async()=>new Response(JSON.stringify({value:true})),now}));
 c.evidencePorts.session=c.evidencePorts.runtime;
 await assert.rejects(independentEvidence(c,'session',{requestId:'fixture'},{fetchImpl,now}),/AUTHENTICATED/);
});
test('managed decisions/replay/audit use transactional state and await sanitized R2 retention',async()=>{
 const f=stateFixture();try{
  const r=request(),approval={dispatchId:r.dispatchId,requestHash:dispatchHash(r),expiresAt:300,reviewerId:77};await f.state.putDecision({request:r,approval});assert.equal((await f.state.decision(r.dispatchId)).request.dispatchId,r.dispatchId);await assert.rejects(f.state.putDecision({request:r,approval}));
  const claim={dispatchId:r.dispatchId,decisionRef:r.decisionRef,requestHash:dispatchHash(r)};assert.ok(await f.state.claimOnce(claim));assert.equal(await f.state.claimOnce(claim),null);
  const record={protocol:'CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1',dispatchId:r.dispatchId,decisionRef:r.decisionRef,requestHash:claim.requestHash,bodyHash:'c'.repeat(64),workflowFile:'step18-training-provider-workflow.yml',branch:'team-access-directory',executionSha:r.executionSha,callerLogin:TRANSFERRED_EXECUTOR_ACCOUNT.login,callerId:TRANSFERRED_EXECUTOR_ACCOUNT.id,humanCustodianRef:'FICTIONAL-CONTRACTOR',claimRef:'claim',observedAt:200,outcome:'PREPARED',previousHash:null};await f.state.appendAudit({...record,recordHash:dispatchHash(record)});assert.equal((await f.state.retainedEvents(r.dispatchId)).length,1);assert.equal(f.stored.length,2);assert.equal(f.stored[0].value.includes('intended_operation'),false);
  await f.state.claimJob({key:'d'.repeat(64),dispatchId:r.dispatchId,expiresAt:300});await assert.rejects(f.state.claimJob({key:'d'.repeat(64),dispatchId:r.dispatchId,expiresAt:300}));
  assert.throws(()=>f.db.exec('DELETE FROM events'),/Immutable audit/);assert.throws(()=>f.db.exec("UPDATE claims SET decision_ref='altered'"),/Immutable claim/);assert.throws(()=>f.db.exec("UPDATE decisions SET decision_json='{}'"),/Immutable decision/);assert.throws(()=>f.db.exec('DELETE FROM jobs'),/Immutable job/);
 }finally{f.db.close();}
});
test('R2 retention failure leaves unavailable decision rather than false durable acceptance',async()=>{
 const f=stateFixture({put:async()=>null});try{const r=request();await assert.rejects(f.state.putDecision({request:r,approval:{dispatchId:r.dispatchId,requestHash:dispatchHash(r),expiresAt:300,reviewerId:77}}));await assert.rejects(f.state.decision(r.dispatchId));}finally{f.db.close();}
});
test('gateway permits exact role route only, forwards original JWT and rejects origin/role/arbitrary path',async()=>{
 const c=config(),t=await token(access()),forwarded=[];const env={MANAGED_CONFIG_JSON:JSON.stringify(c),CAPABILITY:{fetch:async r=>{forwarded.push(r);return new Response(JSON.stringify({fixture:true}));}}};const gateway=createGateway({fetchImpl:certFetch,now:()=>now});
 const req=(path='/v1/dispatch',origin=c.gatewayOrigin)=>new Request(c.gatewayOrigin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Cf-Access-Jwt-Assertion':t},body:JSON.stringify(request())});
 assert.equal((await gateway.fetch(req(),env)).status,200);assert.equal(forwarded[0].headers.get('Cf-Access-Jwt-Assertion'),t);assert.equal(forwarded[0].headers.has('X-Role'),false);
 assert.equal((await gateway.fetch(req('/v1/approve'),env)).status,403);assert.equal((await gateway.fetch(req('/v1/dispatch','https://evil.test'),env)).status,403);assert.equal((await gateway.fetch(req('/any'),env)).status,404);
});
test('private capability refuses uncommissioned identity/state without reading a secret',async()=>{
 let secretRead=false;const env={MANAGED_CONFIG_JSON:JSON.stringify(config()),get GITHUB_APP_PRIVATE_KEY(){secretRead=true;throw Error('private');}};
 const response=await createCapability({fetchImpl:certFetch,now:()=>now}).fetch(new Request('https://private.invalid/v1/dispatch',{method:'POST',body:JSON.stringify(request())}),env);assert.equal(response.status,403);assert.equal(secretRead,false);
 await assert.rejects(verifyManagedCommissioning(env,config(),{fetchImpl:certFetch,now}),/VERSION/);
});
test('managed protected-job client only calls exact run-check with current source and never executes provider',async()=>{
 const c=config(),calls=[],context={repository:'VTholdings/creatorloop-main-site',ref:'refs/heads/team-access-directory',eventName:'workflow_dispatch',runAttempt:'1',runnerEnvironment:'github-hosted',executionSha:'a'.repeat(40),workflowSha:'a'.repeat(40),runId:'123'},inputs={dispatch_id:request().dispatchId,expected_execution_sha:context.executionSha};
 const result=await verifyManagedJob({context,inputs,lane:'provider',policy:{protocol:'CREATORLOOP_MANAGED_JOB_POLICY_V1',gatewayOrigin:c.gatewayOrigin,oidcAudience:c.oidcAudience},getOidc:async()=> 'FICTIONAL-OIDC',postManaged:async call=>{calls.push(call);return {dispatchId:inputs.dispatch_id,runId:'123',executionSha:context.executionSha,mediatedRunVerified:true};}});assert.equal(result.protectedExecutionAccepted,false);assert.equal(calls[0].url,c.gatewayOrigin+'/v1/run-check');
});
