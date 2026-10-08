import test from 'node:test';
import assert from 'node:assert/strict';
import {executeEdgeRequest} from '../scripts/lib/edge-executor.mjs';
const request={id:'EDGE-FICTIONAL',operation:'ADMIT',operatorId:'OP-FICTIONAL',email:'fictional@example.com',environment:'TRAINING',audience:'training-aud',databaseId:'training-db',deploymentId:'training-project',requestVersion:2,requestedAt:100};
function ports(overrides={}) {
 const actions=[];return {actions,request,currentRequest:async()=>request,now:()=>200,provider:{ensureApprovedIndividualAdmission:async r=>actions.push(['admit',r.id]),revokeIndividualAdmissionAndSessions:async r=>actions.push(['revoke',r.id]),verifyIndividualState:async r=>({...r,policyId:'approved-individual-policy',subject:'individual-subject',policyVerified:true,sessionVerified:true,ownerPolicyUnchanged:true,servicePoliciesUnchanged:true,revokedBefore:200,...overrides})},sign:async()=>{actions.push(['sign']);return {keyId:'isolated-key',signature:'fictional-signature'};}};
}
test('executor prepares only the requested individual, independently verifies preserved policies, then signs bound evidence',async()=>{
 const p=ports(),result=await executeEdgeRequest(p);assert.deepEqual(p.actions,[['admit',request.id],['sign']]);
 const receipt=JSON.parse(Buffer.from(result.payload,'base64url'));assert.equal(receipt.requestId,request.id);assert.equal(receipt.requestVersion,2);assert.equal(receipt.environment,'TRAINING');assert.equal(receipt.evidenceHash.length,64);assert.equal(receipt.expiresAt,86600);
});
test('executor refuses incomplete, broadened, wrong-environment or shared-policy-changing evidence',async()=>{
 for(const override of [{email:'other@example.com'},{audience:'prod-aud'},{databaseId:'prod-db'},{deploymentId:'prod-project'},{ownerPolicyUnchanged:false},{servicePoliciesUnchanged:false},{policyVerified:false},{sessionVerified:false},{operation:'REVOKE'}]){const p=ports(override);await assert.rejects(executeEdgeRequest(p),/incomplete/);assert.equal(p.actions.some(a=>a[0]==='sign'),false);}
});
test('revocation cannot be acknowledged on provider failure or without a current individual session boundary',async()=>{
 const p=ports();p.request={...request,operation:'REVOKE'};p.currentRequest=async()=>p.request;
 assert.equal(JSON.parse(Buffer.from((await executeEdgeRequest(p)).payload,'base64url')).revokedBefore,200);assert.equal(p.actions[0][0],'revoke');
 const failure=ports({revokedBefore:0});failure.request=p.request;failure.currentRequest=p.currentRequest;await assert.rejects(executeEdgeRequest(failure),/boundary/);
 const rejected=ports();rejected.request=p.request;rejected.currentRequest=p.currentRequest;rejected.provider.revokeIndividualAdmissionAndSessions=async()=>{throw Error('Provider unavailable');};await assert.rejects(executeEdgeRequest(rejected),/unavailable/);assert.deepEqual(rejected.actions,[]);
});
test('executor fences a superseded request before operations and after provider verification; retries retain request identity',async()=>{
 const before=ports();before.currentRequest=async()=>({...request,requestVersion:3});await assert.rejects(executeEdgeRequest(before),/changed/);assert.deepEqual(before.actions,[]);
 const after=ports();let reads=0;after.currentRequest=async()=>++reads===1?request:{...request,id:'NEW'};await assert.rejects(executeEdgeRequest(after),/changed/);assert.deepEqual(after.actions,[['admit',request.id]]);
 const retry=ports();const a=await executeEdgeRequest(retry),b=await executeEdgeRequest(retry);assert.equal(a.payload,b.payload);
});

test('provider ports cannot mutate the selected person or inject secret fields into the signed evidence',async()=>{
 const p=ports();p.provider.ensureApprovedIndividualAdmission=async r=>{r.email='unapproved@example.com';};
 await assert.rejects(executeEdgeRequest(p),TypeError);assert.deepEqual(p.actions,[]);
 const projected=ports({apiToken:'FICTIONAL-SECRET',jwt:'FICTIONAL-SESSION'});
 const result=await executeEdgeRequest(projected);assert.doesNotMatch(Buffer.from(result.payload,'base64url').toString(),/FICTIONAL-SECRET|FICTIONAL-SESSION|apiToken|jwt/);
 assert.equal(request.email,'fictional@example.com');
});
test('a request superseded during signing produces no usable result, and malformed evidence cannot reach signing',async()=>{
 const p=ports();let reads=0;p.currentRequest=async()=>++reads<3?request:{...request,requestVersion:3};
 await assert.rejects(executeEdgeRequest(p),/changed/);
 for(const bad of [{subject:{}},{policyId:[]},{subject:''}]){
  const f=ports(bad);await assert.rejects(executeEdgeRequest(f),/incomplete/);assert.equal(f.actions.some(a=>a[0]==='sign'),false);
 }
 const invalid=ports();invalid.sign=async()=>({keyId:'k',signature:'not a signature'});await assert.rejects(executeEdgeRequest(invalid),/signer/);
});
