import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingProvider} from '../scripts/lib/creatorloop-training-provider.mjs';
import {executeEdgeRequest} from '../scripts/lib/edge-executor.mjs';
import {policyTemplate} from '../scripts/lib/training-execution-contract.mjs';
import {fixture,preserved} from './helpers/training-execution-fixture.js';
function setup(operation='ADMIT') {
 const f=fixture(operation),calls=[];let policies=structuredClone(preserved);
 if(operation==='REVOKE')policies.push({...policyTemplate(f.manifest),id:f.manifest.ownedPolicyId});
 const transport=async c=>{calls.push(c);
  if(c.method==='GET')return {success:true,result:structuredClone(policies)};
  if(c.method==='POST'&&c.path.endsWith('/policies')){const p={...c.body,id:'11111111-1111-1111-1111-111111111111'};policies.push(p);return {success:true,result:p};}
  if(c.method==='DELETE'){policies=policies.filter(p=>p.id!==f.manifest.ownedPolicyId);return {success:true,result:{}};}
  return {success:true,result:true};
 };
 const options={...f,transport,observeRuntime:async()=>f.runtime,observeSession:async()=>f.session};
 return {...f,calls,options,get policies(){return policies;},set policies(p){policies=p;},provider:()=>createTrainingProvider(options)};
}
test('exact TRAINING admit uses existing executor and projects a compatible receipt without secrets',async()=>{
 const f=setup(),provider=f.provider();
 const envelope=await executeEdgeRequest({request:f.request,provider,currentRequest:provider.currentRequest,now:f.now,sign:async()=>({keyId:'fictional',signature:'fictional-signature'})});
 const receipt=JSON.parse(Buffer.from(envelope.payload,'base64url'));
 assert.equal(receipt.requestVersion,3);assert.equal(receipt.subject,f.manifest.subject.subject);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 assert.deepEqual(f.calls.find(c=>c.method==='POST').body,policyTemplate(f.manifest));
 assert.ok(f.calls.every(c=>c.path.includes(f.manifest.targets.appId)));
 assert.doesNotMatch(JSON.stringify(receipt),/credentialRef|keyRef|token|secret/i);
});
test('exact REVOKE removes only owned policy and revokes only dedicated subject with devices/WARP disabled',async()=>{
 const f=setup('REVOKE'),p=f.provider();await p.revokeIndividualAdmissionAndSessions(f.request);const proof=await p.verifyIndividualState(f.request);
 assert.equal(proof.revokedBefore,190);assert.equal(f.policies.length,1);assert.deepEqual(f.policies[0],preserved[0]);
 const revoke=f.calls.find(c=>c.path.endsWith('/revoke_user'));
 assert.deepEqual(revoke.body,{email:f.request.email,user_uid:f.manifest.subject.subject,devices:false,warp_session_reauth:false});
 assert.equal(f.calls.some(c=>c.path.includes('revoke_tokens')),false);
});
test('changed subject, production target, missing custody, expired window and absent independent approval refuse before mutation',async()=>{
 for(const change of [m=>m.subject.email='team@creatorloop.net',m=>m.targets.databaseId='production-db',m=>m.signerPrincipal=m.executorPrincipal,m=>m.expiresAt=199]){const f=setup();change(f.manifest);assert.throws(()=>f.provider());assert.equal(f.calls.length,0);}
 const f=setup();f.options.verifyApproval=async()=>null;await assert.rejects(f.provider().ensureApprovedIndividualAdmission(f.request),/APPROVAL/);assert.equal(f.calls.length,0);
});
test('stale request/version and altered Owner policy refuse before mutation',async()=>{
 const a=setup();a.options.readCurrentRequest=async()=>({request:a.request,personnelVersion:4});await assert.rejects(a.provider().ensureApprovedIndividualAdmission(a.request),/FENCE/);assert.equal(a.calls.length,0);
 const b=setup();b.policies[0].decision='deny';await assert.rejects(b.provider().ensureApprovedIndividualAdmission(b.request),/POLICIES_CHANGED/);assert.equal(b.calls.some(c=>c.method!=='GET'),false);
});
test('unknown create outcome is never retried, including through a second invocation',async()=>{
 const f=setup();const base=f.options.transport;f.options.transport=async c=>{if(c.method==='POST'){f.calls.push(c);throw Error('unknown');}return base(c);};const p=f.provider();
 await assert.rejects(p.ensureApprovedIndividualAdmission(f.request),/OUTCOME_UNKNOWN_NO_RETRY/);
 await assert.rejects(p.ensureApprovedIndividualAdmission(f.request),/MUTATION_REPLAY_REFUSED/);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('provider success cannot substitute fresh subject/runtime or old-and-new session-denial proof',async()=>{
 for(const key of ['subject','signatureVerified','identityBased']){const f=setup();f.session[key]=key==='subject'?'wrong':false;const p=f.provider();await p.ensureApprovedIndividualAdmission(f.request);await assert.rejects(p.verifyIndividualState(f.request));}
 const f=setup('REVOKE');f.session.freshLoginDenied=false;const p=f.provider();await p.revokeIndividualAdmissionAndSessions(f.request);await assert.rejects(p.verifyIndividualState(f.request),/DENIAL/);
 const r=setup();r.runtime.databaseId='production';await assert.rejects(r.provider().ensureApprovedIndividualAdmission(r.request),/RUNTIME/);assert.equal(r.calls.some(c=>c.method!=='GET'),false);
});

test('personnel request changed after provider mutation prevents receipt evidence or signing',async()=>{
 const f=setup(),base=f.options.transport;let changed=false;
 f.options.transport=async c=>{const result=await base(c);if(c.method==='POST')changed=true;return result;};
 f.options.readCurrentRequest=async()=>({request:f.request,personnelVersion:changed?4:3});
 await assert.rejects(f.provider().ensureApprovedIndividualAdmission(f.request),/FENCE/);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('stale runtime proof and broad service/email-domain policy requirements cannot authorize mutation',async()=>{
 const f=setup();f.runtime.observedAt=-500;await assert.rejects(f.provider().ensureApprovedIndividualAdmission(f.request),/RUNTIME/);assert.equal(f.calls.some(c=>c.method!=='GET'),false);
 for(const rule of [{email_domain:{domain:'example.invalid'}},{any_valid_service_token:{}},{everyone:{}}]){const g=setup();g.manifest.requireRules=[rule];assert.throws(()=>g.provider(),/REQUIREMENTS/);assert.equal(g.calls.length,0);}
});
