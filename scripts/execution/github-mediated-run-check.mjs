import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyMediatedWorkflowRun} from '../lib/training-mediated-run.mjs';
import {refuse} from '../lib/training-execution-contract.mjs';

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [lane,...extra]=process.argv.slice(2);if(extra.length||!['provider','release'].includes(lane))refuse('EXACT_MEDIATED_LANE_REQUIRED');
  const policy=JSON.parse(await readFile('scripts/execution/approved-mediated-run-policy.json','utf8'));
  // Required adapter is intentionally not installed under preparation authority.
  // No dynamic plugin loading or local booleans substitute for run authorization.
  const verifyRunApproval=async()=>refuse('PRIVATE_AUTHENTICATED_RUN_APPROVAL_ADAPTER_NOT_INSTALLED');
  const env=process.env;
  const context={repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,eventName:env.GITHUB_EVENT_NAME,runAttempt:env.GITHUB_RUN_ATTEMPT,runnerEnvironment:env.RUNNER_ENVIRONMENT,executionSha:env.GITHUB_SHA,workflowSha:env.GITHUB_WORKFLOW_SHA,runId:env.GITHUB_RUN_ID,actorId:env.GITHUB_ACTOR_ID,actorLogin:env.GITHUB_ACTOR};
  const inputs=JSON.parse(env.MEDIATED_WORKFLOW_INPUTS_JSON||'null');
  const result=await verifyMediatedWorkflowRun({context,inputs,lane,policy,verifyRunApproval});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch{
  process.stderr.write('MEDIATED TRAINING RUN BLOCKED: exact bot policy and independent run-approval adapter are not provisioned; no protected execution.\n');process.exitCode=1;
 }
}
