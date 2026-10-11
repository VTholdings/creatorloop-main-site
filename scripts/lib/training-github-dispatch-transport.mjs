import {TRAINING_REPOSITORY,TRAINING_BRANCH} from './training-github-environments.mjs';
import {DISPATCH_WORKFLOWS,dispatchHash,validateDispatchRequest} from './training-mediated-dispatcher.mjs';
import {refuse} from './training-execution-contract.mjs';

export function createGithubDispatchTransport({verifyDispatchAuthorization,resolveAppCapability,fetchImpl,now=()=>Math.floor(Date.now()/1000)}) {
 for(const port of [verifyDispatchAuthorization,resolveAppCapability,fetchImpl])if(typeof port!=='function')refuse('PRIVATE_GITHUB_APP_TRANSPORT_PORTS_REQUIRED');
 return async call=>{
  const lane=Object.keys(DISPATCH_WORKFLOWS).find(k=>call?.path===`/repos/${TRAINING_REPOSITORY}/actions/workflows/${DISPATCH_WORKFLOWS[k]}/dispatches`);
  if(!lane||call.method!=='POST'||call.redirect!=='error'||!call.body||Object.keys(call.body).sort().join('|')!=='inputs|ref'||call.body.ref!==TRAINING_BRANCH)refuse('EXACT_GITHUB_DISPATCH_ENDPOINT_REQUIRED');
  const {dispatch_id,expected_execution_sha,...inputs}=call.body.inputs||{};
  const request=validateDispatchRequest({dispatchId:dispatch_id,decisionRef:call.decisionRef,lane,executionSha:expected_execution_sha,inputs});
  if(call.dispatchId!==request.dispatchId||call.requestHash!==dispatchHash(request)||call.bodyHash!==dispatchHash(call.body)||!Number.isInteger(call.expiresAt)||call.expiresAt<=now()||call.expiresAt>now()+300)refuse('EXACT_GITHUB_DISPATCH_BINDING_REQUIRED');
  let authority;try{authority=await verifyDispatchAuthorization({dispatchId:call.dispatchId,requestHash:call.requestHash,bodyHash:call.bodyHash,method:'POST',path:call.path});}catch{refuse('PRIVATE_DISPATCH_AUTHORIZATION_FAILED');}
  if(authority?.requestHash!==call.requestHash||authority.bodyHash!==call.bodyHash||authority.decisionRef!==call.decisionRef||authority.expiresAt!==call.expiresAt||typeof authority.capabilityRef!=='string'||!authority.capabilityRef)refuse('CURRENT_PRIVATE_DISPATCH_AUTHORIZATION_REQUIRED');
  let capability;try{capability=await resolveAppCapability(authority.capabilityRef);}catch{refuse('PRIVATE_GITHUB_APP_CAPABILITY_UNAVAILABLE');}
  // Installation capability, not the Read collaborator's user token. Never returned/logged.
  if(capability?.kind!=='github-app-installation'||!Number.isSafeInteger(capability.appId)||capability.appId<=0||!Number.isSafeInteger(capability.installationId)||capability.installationId<=0||authority.appId!==capability.appId||authority.installationId!==capability.installationId||capability.repositories?.length!==1||capability.repositories[0]!==TRAINING_REPOSITORY||Object.keys(capability.permissions||{}).sort().join('|')!=='actions|metadata'||capability.permissions.actions!=='write'||capability.permissions.metadata!=='read'||capability.effectiveScopeVerified!==true||!Number.isInteger(capability.expiresAt)||capability.expiresAt<=now()||capability.expiresAt>now()+3600||typeof capability.token!=='string'||!capability.token)refuse('EXACT_REPOSITORY_ACTIONS_ONLY_CAPABILITY_REQUIRED');
  if(call.expiresAt<=now()||capability.expiresAt<=now())refuse('DISPATCH_AUTHORITY_EXPIRED_BEFORE_SEND');
  let response;
  try{
   response=await fetchImpl('https://api.github.com'+call.path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+capability.token},body:JSON.stringify(call.body)});
  }catch{refuse('GITHUB_DISPATCH_TRANSPORT_OUTCOME_UNKNOWN_NO_RETRY');}
  // Ignore provider error text and response headers; neither may enter audit logs.
  if(response.status===204)return {status:204};
  if(response.status!==200)return {status:response.status};
  let raw;
  try{
   const reader=response.body?.getReader();if(!reader)refuse('GITHUB_RESPONSE_BODY_REQUIRED');
   let size=0,parts=[];
   while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16384){await reader.cancel();refuse('GITHUB_RESPONSE_TOO_LARGE');}parts.push(Buffer.from(chunk.value));}
   raw=JSON.parse(Buffer.concat(parts).toString('utf8'));
  }catch{refuse('GITHUB_DISPATCH_RESPONSE_UNKNOWN_NO_RETRY');}
  if(!Number.isSafeInteger(raw.workflow_run_id)||raw.workflow_run_id<=0)refuse('GITHUB_DISPATCH_RUN_ID_NOT_CORROBORATED');
  return {status:200,runId:raw.workflow_run_id};
 };
}
