import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTrainingSigner,validatePublicVerifierKeys} from '../scripts/lib/creatorloop-training-signer.mjs';
import {prepareTrainingRelease} from '../scripts/lib/training-release-plan.mjs';
import {sha256} from '../scripts/lib/training-execution-contract.mjs';
import {fixture,publicJwk} from './helpers/training-execution-fixture.js';
function receipt(f){
 const projection={email:f.request.email,operation:'ADMIT',environment:'TRAINING',audience:f.request.audience,databaseId:f.request.databaseId,deploymentId:f.request.deploymentId,policyId:'fictional-policy',subject:f.manifest.subject.subject,policyVerified:true,sessionVerified:true,ownerPolicyUnchanged:true,servicePoliciesUnchanged:true};
 return {protocol:'CREATORLOOP_EDGE_V1',requestId:f.request.id,operatorId:f.request.operatorId,email:f.request.email,operation:'ADMIT',environment:'TRAINING',audience:f.request.audience,databaseId:f.request.databaseId,deploymentId:f.request.deploymentId,requestVersion:3,observedAt:200,expiresAt:86600,evidenceHash:sha256(projection),policyId:'fictional-policy',subject:f.manifest.subject.subject,policyVerified:true,sessionVerified:true};
}
const payload=r=>Buffer.from(JSON.stringify(r)).toString('base64url');
async function signer(f,overrides={}){let signs=0;const sign=await createTrainingSigner({...f,publicJwk,independentEvidence:async()=>({observerPrincipal:f.manifest.signerPrincipal,policyVerified:true,policyId:'fictional-policy',ownerPolicyUnchanged:true,servicePoliciesUnchanged:true,runtime:f.runtime,session:f.session}),externalSign:async()=>{signs++;return {keyId:publicJwk.kid,signature:'not-valid'};},...overrides});return {sign,get signs(){return signs;}};}
test('public verifier normalization imports public-only RSA and refuses duplicate/private/short material',async()=>{
 assert.equal((await validatePublicVerifierKeys([publicJwk]))[0].key_ops[0],'verify');
 for(const keys of [[publicJwk,publicJwk],[{...publicJwk,d:''}],[{...publicJwk,n:'AQAB'}]])await assert.rejects(validatePublicVerifierKeys(keys));
});
test('unbound receipt payload, stale approval, wrong independent principal or hash cannot reach external signer',async()=>{
 for(const change of [r=>r.subject='wrong',r=>r.extra='unknown',r=>r.expiresAt=999999,r=>r.evidenceHash='0'.repeat(64)]){const f=fixture(),s=await signer(f),r=receipt(f);change(r);await assert.rejects(s.sign(payload(r)));assert.equal(s.signs,0);}
 const f=fixture(),s=await signer(f,{verifyApproval:async()=>null});await assert.rejects(s.sign(payload(receipt(f))),/APPROVAL/);assert.equal(s.signs,0);
 const g=fixture(),a=await signer(g,{independentEvidence:async()=>({observerPrincipal:g.manifest.executorPrincipal})});await assert.rejects(a.sign(payload(receipt(g))),/INDEPENDENT/);assert.equal(a.signs,0);
});
test('validated payload still rejects an unverified external signature; no private key is generated',async()=>{
 const f=fixture(),s=await signer(f);await assert.rejects(s.sign(payload(receipt(f))),/SIGNATURE/);assert.equal(s.signs,1);
});
async function releaseFixture(){
 const proposal=JSON.parse(await readFile('docs/proposals/step18-training-readiness-release.json','utf8'));
 const config={env_vars:{UNRELATED_PUBLIC:{type:'plain_text',value:'preserve'}},d1_databases:{OPERATIONS_DB:{id:proposal.training.databaseId}}};
 return {proposal,publicKeys:[publicJwk],project:{name:proposal.training.project,id:proposal.training.projectId,source:{config:{preview_deployment_setting:'all'}},deployment_configs:{production:structuredClone(config),preview:structuredClone(config)}},peerEvidence:{independentlyVerified:true,databaseId:proposal.proposedPublicVariables.PEER_DATABASE_ID,audience:proposal.proposedPublicVariables.PEER_ACCESS_AUD,deploymentId:proposal.proposedPublicVariables.PEER_DEPLOYMENT_ID},observedAt:200,applicationSha:'a'.repeat(40),executionSha:'b'.repeat(40),now:200};
}
test('release preparation preserves unrelated public configuration and exact TRAINING binding in both enabled slots',async()=>{
 const f=await releaseFixture(),before=JSON.stringify(f.project),plan=await prepareTrainingRelease(f);
 assert.equal(plan.executable,false);assert.deepEqual(plan.enabledSlots,['production','preview']);assert.equal(JSON.stringify(f.project),before);
 for(const c of Object.values(plan.configurationPatch.deployment_configs)){assert.equal(c.env_vars.UNRELATED_PUBLIC.value,'preserve');assert.equal(c.env_vars.CONSOLE_ENVIRONMENT.value,'TRAINING');assert.equal(c.d1_databases.OPERATIONS_DB.id,f.proposal.training.databaseId);}
 assert.notEqual(plan.applicationSha,plan.executionSha);assert.equal(plan.requiresExactProtectedApproval,true);
});
test('unknown preview state, stale evidence, wrong DB/peer and unrecognized credential aliases stop release preparation',async()=>{
 for(const change of [f=>f.project.source.config.preview_deployment_setting='unknown',f=>f.observedAt=-500,f=>f.project.deployment_configs.preview.d1_databases.OPERATIONS_DB.id='production',f=>f.peerEvidence.independentlyVerified=false,f=>f.project.deployment_configs.production.env_vars.UNKNOWN_TOKEN={type:'secret_text',value:'fictional'}]){const f=await releaseFixture();change(f);await assert.rejects(prepareTrainingRelease(f));}
});

test('release templates remain inactive and preserve protected gates and TRAINING-only bindings',async()=>{
 const workflow=await readFile('docs/proposals/step18-training-release-workflow.yml','utf8');
 assert.match(workflow,/environment: creatorloop-acceptance/);assert.match(workflow,/contents: read/);assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/test -x \/opt\/creatorloop-approved\/bin\/training-release/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN|ADMISSION_SIGNING_KEY|revoke_tokens|wrangler pages deploy/);
 await assert.rejects(readFile('.github/workflows/step18-training-release-workflow.yml','utf8'),{code:'ENOENT'});
 const staging=await readFile('docs/proposals/step18-training-staging.toml','utf8');
 assert.match(staging,/CONSOLE_ENVIRONMENT = "TRAINING"/);assert.match(staging,/database_id = "12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0"/);assert.doesNotMatch(staging,/^ADMISSION_VERIFIER_KEYS\s*=/m);
});
