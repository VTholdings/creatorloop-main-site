import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareGithubEnvironmentConfiguration,verifyGithubEnvironment,TRAINING_GITHUB_ENVIRONMENTS,TRAINING_REPOSITORY} from '../scripts/lib/training-github-environments.mjs';
import {validateGithubHostedContext,githubTrainingPreflight,verifyReviewedPortFile} from '../scripts/execution/github-training-preflight.mjs';
import {sha256} from '../scripts/lib/training-execution-contract.mjs';
function fixture(){
 const reviewerId=999;
 const snapshot={id:123,name:TRAINING_GITHUB_ENVIRONMENTS.release,can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'User',reviewer:{id:reviewerId}}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
 const branchPolicies={total_count:1,branch_policies:[{name:'team-access-directory',type:'branch'}]};
 const context={repository:TRAINING_REPOSITORY,ref:'refs/heads/team-access-directory',eventName:'workflow_dispatch',runAttempt:'1',runnerEnvironment:'github-hosted',executionSha:'a'.repeat(40),workflowSha:'a'.repeat(40),runId:'123'};
 return {reviewerId,snapshot,branchPolicies,context,observedAt:200,now:200,environmentName:snapshot.name};
}
test('environment preparation requires a named actual reviewer and emits only isolated configuration with no secret or undocumented bypass PUT',()=>{
 assert.throws(()=>prepareGithubEnvironmentConfiguration({}),/REVIEWER/);
 const plan=prepareGithubEnvironmentConfiguration({reviewer:{id:999,login:'Fictional-Reviewer',type:'User'}});
 assert.equal(plan.executable,false);assert.equal(plan.environments.length,2);assert.equal(plan.existingAcceptanceEnvironment,'UNCHANGED');
 for(const e of plan.environments){assert.equal(e.environmentRequest.body.prevent_self_review,true);assert.equal(e.environmentRequest.body.reviewers[0].id,999);assert.equal(e.branchRequest.body.type,'branch');assert.equal(e.branchRequest.body.name,'team-access-directory');assert.equal(e.expectedReadback.can_admins_bypass,false);assert.deepEqual(e.secretsToPopulateNow,[]);assert.equal(Object.hasOwn(e.environmentRequest.body,'can_admins_bypass'),false);assert.match(e.administratorUiAction,/Deselect/);}
});
test('fresh exact review/branch/bypass settings verify without implying custody or provider authority',()=>{
 const proof=verifyGithubEnvironment(fixture());assert.equal(proof.settingsVerified,true);assert.equal(proof.custodyVerified,false);assert.equal(proof.capabilityVerified,false);assert.equal(proof.releaseOrAdmissionAuthorized,false);
});
test('missing environment, unknown/enabled bypass, weak reviewer rules, broad/tag branches or stale settings refuse',()=>{
 for(const change of [f=>f.snapshot=null,f=>delete f.snapshot.can_admins_bypass,f=>f.snapshot.can_admins_bypass=true,f=>f.snapshot.protection_rules[0].prevent_self_review=false,f=>f.snapshot.protection_rules[0].reviewers[0].reviewer.id=888,f=>f.snapshot.protection_rules[0].reviewers.push({type:'User',reviewer:{id:888}}),f=>f.branchPolicies.branch_policies[0].name='*',f=>f.branchPolicies.branch_policies[0].type='tag',f=>f.branchPolicies.total_count=2,f=>f.observedAt=-500,f=>f.environmentName='creatorloop-acceptance']){
  const f=fixture();change(f);assert.throws(()=>verifyGithubEnvironment(f));
 }
});
test('context fence rejects other repository, main, retries, private runner and changed workflow SHA',()=>{
 for(const override of [{repository:'other/repo'},{ref:'refs/heads/main'},{runAttempt:'2'},{eventName:'push'},{runnerEnvironment:'self-hosted'},{workflowSha:'b'.repeat(40)}])assert.throws(()=>validateGithubHostedContext({...fixture().context,...override}));
});
test('preflight performs three fixed reads and stops on missing environment or stale source before referencing protected job',async()=>{
 const f=fixture(),reads=[];
 const readGithub=async path=>{reads.push(path);if(path.includes('/git/ref/'))return {object:{sha:f.context.executionSha}};if(path.endsWith('/deployment-branch-policies'))return f.branchPolicies;return f.snapshot;};
 const proof=await githubTrainingPreflight({...f,lane:'release',readGithub,now:()=>200});assert.equal(reads.length,3);assert.equal(proof.protectedExecutionReady,false);
 reads.length=0;f.snapshot=null;await assert.rejects(githubTrainingPreflight({...f,lane:'release',readGithub,now:()=>200}),/NOT_PROVISIONED/);
 reads.length=0;await assert.rejects(githubTrainingPreflight({...f,lane:'release',readGithub:async path=>{reads.push(path);return {object:{sha:'b'.repeat(40)}};},now:()=>200}),/STALE/);assert.equal(reads.length,1);
});
test('reviewed-port hash check never imports or executes a port and cannot confer execution authority',async()=>{
 const bytes=Buffer.from('throw new Error("must not execute");\n');
 const result=await verifyReviewedPortFile({lane:'release',portBytes:bytes,approvedPortSha256:sha256(bytes.toString())});assert.equal(result.executionAuthorized,false);
 for(const args of [{lane:'production'},{portBytes:Buffer.alloc(0)},{approvedPortSha256:'b'.repeat(64)}])await assert.rejects(verifyReviewedPortFile({lane:'release',portBytes:bytes,approvedPortSha256:sha256(bytes.toString()),...args}));
});
test('both hosted templates remain inactive, credential-free and preflight-gated before isolated environment use',async()=>{
 for(const [lane,file] of [['provider','step18-training-provider-workflow.yml'],['release','step18-training-release-workflow.yml']]){
  const text=await readFile('docs/proposals/'+file,'utf8');assert.match(text,/runs-on: ubuntu-latest/);assert.ok(text.includes('environment: '+TRAINING_GITHUB_ENVIRONMENTS[lane]));assert.ok(text.includes(`github-training-preflight.mjs ${lane} preflight`));assert.ok(text.includes(`github-training-preflight.mjs ${lane} check-port`));assert.doesNotMatch(text,/self-hosted|secrets\.|\/opt\/creatorloop-approved|environment: creatorloop-acceptance/);await assert.rejects(readFile('.github/workflows/'+file),{code:'ENOENT'});
 }
});
