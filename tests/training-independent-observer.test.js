import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingObserver} from '../scripts/lib/creatorloop-training-observer.mjs';
import {createTrainingSigner} from '../scripts/lib/creatorloop-training-signer.mjs';
import {TRAINING_TARGET,policyTemplate,sha256} from '../scripts/lib/training-execution-contract.mjs';
import {fixture,preserved,publicJwk} from './helpers/training-execution-fixture.js';
const policyId='11111111-1111-1111-1111-111111111111';
function setup(operation='ADMIT',overrides={}) {
 const f=fixture(operation),reads=[];
 const policies=operation==='ADMIT'?[...preserved,{id:policyId,...policyTemplate(f.manifest)}]:structuredClone(preserved);
 const config={...f,observerPrincipal:f.manifest.signerPrincipal,readPolicyPage:async request=>{reads.push(request);return {success:true,result:policies,result_info:{page:1,total_pages:1}};},observeRuntime:async()=>f.runtime,observeSession:async()=>f.session,...overrides};
 return {...f,reads,config,observe:createTrainingObserver(config)};
}
test('independent observer reads fixed TRAINING policy endpoint and verifies existing ADMIT/REVOKE proof contract',async()=>{
 for(const operation of ['ADMIT','REVOKE']){
  const f=setup(operation),proof=await f.observe(f.request);
  assert.equal(proof.observerPrincipal,f.manifest.signerPrincipal);assert.equal(proof.policyId,policyId);assert.equal(proof.policyVerified,true);assert.equal(proof.session.operation,operation);
  assert.equal(f.reads.length,1);assert.deepEqual(f.reads[0],{method:'GET',path:`/accounts/${TRAINING_TARGET.accountId}/access/apps/${TRAINING_TARGET.appId}/policies?page=1&per_page=50`,redirect:'error'});
 }
});
test('missing private ports and executor-labelled observer refuse before reads',()=>{
 assert.throws(()=>createTrainingObserver({}),/PORTS/);
 const f=fixture();assert.throws(()=>createTrainingObserver({...setup().config,observerPrincipal:f.manifest.executorPrincipal}),/SIGNER_CONTROLLED/);
});
test('missing/stale approval or changed request version refuses before independent policy reads',async()=>{
 for(const overrides of [{verifyApproval:async()=>null},{readCurrentRequest:async()=>({request:fixture().request,personnelVersion:4})}]){
  const f=setup('ADMIT',overrides);await assert.rejects(f.observe(f.request));assert.equal(f.reads.length,0);
 }
});
test('mutated preserved policy, same-name collision, ambiguous IDs and wrong owned-policy state refuse',async()=>{
 const m=fixture().manifest,own={id:policyId,...policyTemplate(m)};
 for(const list of [[{...preserved[0],decision:'bypass'},own],[...preserved,{...own,include:[{everyone:{}}]}],[...preserved,own,{...own}],structuredClone(preserved)]){
  const f=setup('ADMIT',{readPolicyPage:async()=>({success:true,result:list})});await assert.rejects(f.observe(f.request));
 }
 const f=setup('REVOKE',{readPolicyPage:async()=>({success:true,result:[...preserved,own]})});await assert.rejects(f.observe(f.request));
});
test('stale runtime, wrong identity and missing active revocation denial refuse',async()=>{
 const runtime=fixture().runtime,session=fixture().session;
 for(const overrides of [{observeRuntime:async()=>({...runtime,observedAt:-500})},{observeSession:async()=>({...session,subject:'OTHER-SUBJECT'})}]){
  const f=setup('ADMIT',overrides);await assert.rejects(f.observe(f.request));
 }
 const f=setup('REVOKE',{observeSession:async()=>({...fixture('REVOKE').session,oldSessionDenied:false})});await assert.rejects(f.observe(f.request));
});
test('request change during observation is caught at final fence',async()=>{
 const f=fixture();let reads=0;
 const s=setup('ADMIT',{observeSession:async()=>{reads=1;return f.session;},readCurrentRequest:async()=>({request:f.request,personnelVersion:reads?4:3})});
 await assert.rejects(s.observe(s.request),/CURRENT_REQUEST/);
});
test('invalid/changed pagination refuses rather than accepting partial list',async()=>{
 const f=setup('ADMIT',{readPolicyPage:async()=>({success:true,result:[],result_info:{page:1,total_pages:21}})});await assert.rejects(f.observe(f.request),/PAGINATION/);
 let count=0;const g=setup('ADMIT',{readPolicyPage:async()=>({success:true,result:[],result_info:{page:++count,total_pages:count===1?2:3}})});await assert.rejects(g.observe(g.request),/PAGINATION/);
});
test('observer read exception is redacted; no provider credential text retained',async()=>{
 const f=setup('ADMIT',{readPolicyPage:async()=>{throw Error('DO_NOT_LEAK_PRIVATE_ERROR');}});
 await assert.rejects(f.observe(f.request),error=>error.message==='INDEPENDENT_POLICY_READ_FAILED');
});
test('existing signer accepts independent observer proof but rejects an invalid external signature; no key generated',async()=>{
 const f=setup(),proof=await f.observe(f.request);
 const projection={email:f.request.email,operation:'ADMIT',environment:'TRAINING',audience:f.request.audience,databaseId:f.request.databaseId,deploymentId:f.request.deploymentId,policyId,subject:f.manifest.subject.subject,policyVerified:true,sessionVerified:true,ownerPolicyUnchanged:true,servicePoliciesUnchanged:true};
 const receipt={protocol:'CREATORLOOP_EDGE_V1',requestId:f.request.id,operatorId:f.request.operatorId,email:f.request.email,operation:'ADMIT',environment:'TRAINING',audience:f.request.audience,databaseId:f.request.databaseId,deploymentId:f.request.deploymentId,requestVersion:f.request.requestVersion,observedAt:200,expiresAt:86600,evidenceHash:sha256(projection),policyId,subject:f.manifest.subject.subject,policyVerified:true,sessionVerified:true};
 let calls=0;
 const sign=await createTrainingSigner({...f,publicJwk,independentEvidence:f.observe,externalSign:async()=>{calls++;return {keyId:publicJwk.kid,signature:'not-valid'};}});
 await assert.rejects(sign(Buffer.from(JSON.stringify(receipt)).toString('base64url')),/EXTERNAL_SIGNATURE_NOT_VERIFIED/);assert.equal(calls,1);assert.equal(proof.policyId,policyId);
});
