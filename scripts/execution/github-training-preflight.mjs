import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {TRAINING_REPOSITORY,TRAINING_BRANCH,TRAINING_GITHUB_ENVIRONMENTS,verifyGithubEnvironment} from '../lib/training-github-environments.mjs';
import {refuse,sha256} from '../lib/training-execution-contract.mjs';
export function validateGithubHostedContext(context){
 if(context.repository!==TRAINING_REPOSITORY||context.ref!==`refs/heads/${TRAINING_BRANCH}`||context.eventName!=='workflow_dispatch'||context.runAttempt!=='1'||context.runnerEnvironment!=='github-hosted'||!/^[a-f0-9]{40}$/.test(context.executionSha||'')||context.workflowSha!==context.executionSha||!/^\d+$/.test(context.runId||''))refuse('EXACT_GITHUB_HOSTED_EXECUTION_REQUIRED');
 return context;
}
export async function githubTrainingPreflight({context,lane,reviewerId,readGithub,now=()=>Math.floor(Date.now()/1000)}){
 validateGithubHostedContext(context);
 const environmentName=TRAINING_GITHUB_ENVIRONMENTS[lane];if(!environmentName||typeof readGithub!=='function')refuse('EXACT_TRAINING_LANE_REQUIRED');
 const root=`/repos/${TRAINING_REPOSITORY}`;
 const ref=await readGithub(root+`/git/ref/heads/${TRAINING_BRANCH}`);
 if(ref?.object?.sha!==context.executionSha)refuse('STALE_EXECUTION_SHA_REFUSED');
 const snapshot=await readGithub(root+'/environments/'+environmentName);
 const branchPolicies=await readGithub(root+'/environments/'+environmentName+'/deployment-branch-policies');
 const controls=verifyGithubEnvironment({environmentName,snapshot,branchPolicies,reviewerId,observedAt:now(),now:now()});
 return {...controls,executionSha:context.executionSha,runId:context.runId,lane,protectedExecutionReady:false};
}
export async function verifyReviewedPortFile({lane,portBytes,approvedPortSha256}){
 if(!TRAINING_GITHUB_ENVIRONMENTS[lane]||!Buffer.isBuffer(portBytes)||!portBytes.length||!/^[a-f0-9]{64}$/.test(approvedPortSha256||'')||sha256(portBytes.toString('utf8'))!==approvedPortSha256)refuse('EXACT_REVIEWED_PORT_NOT_AVAILABLE');
 return {lane,portSha256:approvedPortSha256,portFileVerified:true,executionAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [lane,mode,...extra]=process.argv.slice(2);if(extra.length||!['preflight','check-port'].includes(mode))refuse('PREFLIGHT_USAGE_REQUIRED');
  const env=process.env;
  const context={repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,eventName:env.GITHUB_EVENT_NAME,runAttempt:env.GITHUB_RUN_ATTEMPT,runnerEnvironment:env.RUNNER_ENVIRONMENT,executionSha:env.GITHUB_SHA,workflowSha:env.GITHUB_WORKFLOW_SHA,runId:env.GITHUB_RUN_ID};
  validateGithubHostedContext(context);
  const reviewerId=Number(env.APPOINTED_OWNER_REVIEWER_ID);
  const readGithub=async path=>{
   // Public repository GET only. No secret resolution, writes, token logging or redirects.
   const response=await fetch('https://api.github.com'+path,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
   if(!response.ok)refuse('GITHUB_PUBLIC_SETTINGS_READ_BLOCKED');return response.json();
  };
  await githubTrainingPreflight({context,lane,reviewerId,readGithub});
  if(mode==='check-port'){
   const port=resolve(`scripts/execution/approved-github-${lane}-port.mjs`);
   await verifyReviewedPortFile({lane,portBytes:await readFile(port),approvedPortSha256:env.APPROVED_PORT_SHA256});
   // Preparation deliberately cannot dispatch a port or obtain credentials.
   refuse('PREPARATION_ONLY_PROTECTED_PORT_EXECUTION_NOT_ENABLED');
  }
  process.stdout.write('TRAINING GitHub environment preflight PASS; no protected operation authorized or performed.\n');
 }catch{
  process.stderr.write('TRAINING GitHub preflight BLOCKED: exact run/settings/reviewed port must be established; no protected operation performed.\n');process.exitCode=1;
 }
}
