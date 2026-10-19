import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateGithubHostedContext} from './github-training-preflight.mjs';
import {refuse} from '../lib/training-execution-contract.mjs';

export async function verifyManagedJob({context,inputs,lane,policy,getOidc,postManaged}){
 validateGithubHostedContext(context);
 if(!['provider','release'].includes(lane)||policy?.protocol!=='CREATORLOOP_MANAGED_JOB_POLICY_V1'||typeof policy.gatewayOrigin!=='string'||new URL(policy.gatewayOrigin).origin!==policy.gatewayOrigin||!policy.gatewayOrigin.startsWith('https://')||typeof policy.oidcAudience!=='string'||!policy.oidcAudience||inputs.expected_execution_sha!==context.executionSha||!/^[-a-f0-9]{36}$/.test(inputs.dispatch_id||'')||typeof getOidc!=='function'||typeof postManaged!=='function')refuse('EXACT_COMMISSIONED_MANAGED_JOB_REQUIRED');
 const token=await getOidc(policy.oidcAudience);
 const proof=await postManaged({url:policy.gatewayOrigin+'/v1/run-check',token,body:{dispatchId:inputs.dispatch_id,lane,executionSha:context.executionSha}});
 if(proof?.dispatchId!==inputs.dispatch_id||proof.runId!==context.runId||proof.executionSha!==context.executionSha||proof.mediatedRunVerified!==true)refuse('MANAGED_RUN_CHECK_REFUSED');
 return {dispatchId:inputs.dispatch_id,runId:context.runId,managedRunVerified:true,protectedExecutionAccepted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [lane,...extra]=process.argv.slice(2);if(extra.length)refuse('EXACT_MANAGED_JOB_LANE_REQUIRED');
  const env=process.env,context={repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,eventName:env.GITHUB_EVENT_NAME,runAttempt:env.GITHUB_RUN_ATTEMPT,runnerEnvironment:env.RUNNER_ENVIRONMENT,executionSha:env.GITHUB_SHA,workflowSha:env.GITHUB_WORKFLOW_SHA,runId:env.GITHUB_RUN_ID};
  const policy=JSON.parse(await readFile('scripts/execution/approved-managed-job-policy.json','utf8'));
  const getOidc=async audience=>{
   if(!env.ACTIONS_ID_TOKEN_REQUEST_URL?.startsWith('https://')||!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)refuse('PROTECTED_JOB_OIDC_REQUIRED');
   const url=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience',audience);
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});if(!response.ok)refuse('JOB_OIDC_READ_REFUSED');
   const body=await response.json();if(typeof body.value!=='string')refuse('JOB_OIDC_TOKEN_REQUIRED');return body.value;
  };
  const postManaged=async({url,token,body})=>{
   const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)refuse('MANAGED_RUN_CHECK_REFUSED');return response.json();
  };
  const result=await verifyManagedJob({context,inputs:JSON.parse(env.MEDIATED_WORKFLOW_INPUTS_JSON||'null'),lane,policy,getOidc,postManaged});
  process.stdout.write(JSON.stringify(result)+'\n');
  // Actual provider/release operation stays behind separately reviewed protected port.
 }catch{process.stderr.write('MANAGED TRAINING JOB BLOCKED: real policy/OIDC/current approval required; no protected operation performed.\n');process.exitCode=1;}
}
