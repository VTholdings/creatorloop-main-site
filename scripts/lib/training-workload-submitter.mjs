import {validateDispatchRequest,dispatchHash} from './training-mediated-dispatcher.mjs';
import {validateWorkloadPolicy} from './training-workload-policy.mjs';
import {refuse} from './training-execution-contract.mjs';
// No default secret resolver/network execution. Actual short-lived Access credentials
// are privately provided only by the approved VT workload context, never by Manus.
export function createWorkloadSubmitter({policy,gatewayOrigin,clientId,verifySubmissionApproval,resolveServiceCapability,fetchImpl,now=()=>Math.floor(Date.now()/1000)}){
 validateWorkloadPolicy(policy);
 if(typeof gatewayOrigin!=='string'||!gatewayOrigin.startsWith('https://')||new URL(gatewayOrigin).origin!==gatewayOrigin||!/^[a-f0-9]{32}\.access$/.test(clientId||'')||[verifySubmissionApproval,resolveServiceCapability,fetchImpl].some(p=>typeof p!=='function'))refuse('EXACT_PRIVATE_WORKLOAD_SUBMISSION_PORTS_REQUIRED');
 return async request=>{
  const r=validateDispatchRequest(request),binding={requestHash:dispatchHash(r),executorPolicyHash:dispatchHash(policy),gatewayOrigin,clientId,decisionRef:r.decisionRef};
  const approve=async()=>{let a;try{a=await verifySubmissionApproval(binding);}catch{refuse('WORKLOAD_SUBMISSION_APPROVAL_REFUSED');}if(Object.entries(binding).some(([k,v])=>a?.[k]!==v)||a.reviewerId!==policy.reviewerId||a.exceptionDecisionRef!==policy.exceptionDecisionRef||!Number.isInteger(a.expiresAt)||a.expiresAt<=now())refuse('EXACT_CURRENT_OWNER_SUBMISSION_APPROVAL_REQUIRED');return a;};
  const first=await approve();let capability;
  try{capability=await resolveServiceCapability({clientId,gatewayOrigin,requestHash:binding.requestHash});}catch{refuse('PRIVATE_WORKLOAD_SERVICE_CAPABILITY_UNAVAILABLE');}
  if(capability?.clientId!==clientId||capability.gatewayOrigin!==gatewayOrigin||capability.dispatchOnlyVerified!==true||!Number.isInteger(capability.expiresAt)||capability.expiresAt<=now()||typeof capability.clientSecret!=='string'||!capability.clientSecret)refuse('EXACT_RESTRICTED_ACCESS_SERVICE_CAPABILITY_REQUIRED');
  if(dispatchHash(await approve())!==dispatchHash(first)||first.expiresAt<=now()||capability.expiresAt<=now())refuse('WORKLOAD_SUBMISSION_AUTHORITY_CHANGED');
  let response;
  try{response=await fetchImpl(gatewayOrigin+'/v1/dispatch',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','CF-Access-Client-Id':clientId,'CF-Access-Client-Secret':capability.clientSecret},body:JSON.stringify(r)});}catch{refuse('WORKLOAD_SUBMISSION_UNKNOWN_NO_RETRY');}
  if(!response.ok||response.status>=300)refuse('WORKLOAD_SUBMISSION_REFUSED_OR_UNKNOWN_NO_RETRY');
  let value;try{const reader=response.body?.getReader();if(!reader)throw Error();let size=0,text='';const decoder=new TextDecoder();while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>32768){await reader.cancel();throw Error();}text+=decoder.decode(c.value,{stream:true});}text+=decoder.decode();value=JSON.parse(text);}catch{refuse('WORKLOAD_SUBMISSION_RESULT_UNKNOWN_NO_RETRY');}
  if(value?.dispatchId!==r.dispatchId||value.dispatchAccepted!==true||value.protectedExecutionAccepted!==false)refuse('WORKLOAD_SUBMISSION_RESULT_UNCORROBORATED');
  return {dispatchId:r.dispatchId,dispatchAccepted:true,runVerified:false,protectedExecutionAccepted:false,...(Number.isSafeInteger(value.runId)&&value.runId>0?{runId:value.runId}:{})};
 };
}
