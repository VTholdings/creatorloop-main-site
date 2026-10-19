import {createHash} from 'node:crypto';
import {TRAINING_REPOSITORY,TRAINING_BRANCH} from './training-github-environments.mjs';
import {refuse} from './training-execution-contract.mjs';
import {isWorkloadPolicy,validateWorkloadPolicy,executorAuthorityBinding,authorityBindingMatches,approvalProtocol,auditProtocol} from './training-workload-policy.mjs';

// Owner-confirmed transfer to contractor. This is an identity reference, not a
// default operational grant; reviewed custody policy and actual host controls remain required.
export const TRANSFERRED_EXECUTOR_ACCOUNT=Object.freeze({login:'kailuatester-del',id:340701664});
export const DISPATCH_WORKFLOWS=Object.freeze({provider:'step18-training-provider-workflow.yml',release:'step18-training-release-workflow.yml'});
const hex=(value,size)=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const id=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const reference=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(value);
const keys=(value,expected)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join('|')===[...expected].sort().join('|');
export function canonical(value) {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const dispatchHash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function validateApprovedExecutorPolicy(policy) {
 if(isWorkloadPolicy(policy))return validateWorkloadPolicy(policy);
 if(!keys(policy,['protocol','account','reviewerId','humanCustodianRef','signerCustodianRef','separationEvidenceRef'])||policy.protocol!=='CREATORLOOP_APPROVED_EXECUTOR_POLICY_V1'||!keys(policy.account,['login','id'])||!Number.isSafeInteger(policy.account.id)||policy.account.id<=0||typeof policy.account.login!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(policy.account.login)||!Number.isSafeInteger(policy.reviewerId)||policy.reviewerId<=0||policy.account.id===policy.reviewerId||!reference(policy.humanCustodianRef)||!reference(policy.signerCustodianRef)||policy.humanCustodianRef===policy.signerCustodianRef||!reference(policy.separationEvidenceRef))refuse('REVIEWED_INDEPENDENT_EXECUTOR_POLICY_REQUIRED');
 // References bind the contract, not proof of operational separation by themselves.
 // The private authenticated Owner approval source must corroborate this policy hash.
 return structuredClone(policy);
}
export function validateDispatchRequest(request) {
 if(!keys(request,['dispatchId','decisionRef','lane','executionSha','inputs'])||!id(request.dispatchId)||!reference(request.decisionRef)||!Object.hasOwn(DISPATCH_WORKFLOWS,request.lane)||!hex(request.executionSha,40))refuse('EXACT_TRAINING_DISPATCH_REQUEST_REQUIRED');
 const fields=request.lane==='provider'?['intended_operation','owner_decision_ref','owner_reviewer_id','approved_port_sha256']:['application_sha','configuration_hash','owner_decision_ref','owner_reviewer_id','approved_port_sha256'];
 if(!keys(request.inputs,fields)||Object.values(request.inputs).some(v=>typeof v!=='string')||request.inputs.owner_decision_ref!==request.decisionRef||!/^[1-9]\d{0,14}$/.test(request.inputs.owner_reviewer_id)||!hex(request.inputs.approved_port_sha256,64))refuse('EXACT_APPROVED_WORKFLOW_INPUTS_REQUIRED');
 if(request.lane==='provider'&&!['ADMIT','REVOKE'].includes(request.inputs.intended_operation))refuse('TRAINING_OPERATION_REFUSED');
 if(request.lane==='release'&&(!hex(request.inputs.application_sha,40)||!hex(request.inputs.configuration_hash,64)))refuse('EXACT_RELEASE_BINDING_REQUIRED');
 return structuredClone(request);
}
function approvalValid(approval,request,principal,executorPolicy,now) {
 if(approval?.executorPolicyHash!==dispatchHash(executorPolicy)||!authorityBindingMatches(approval,executorPolicy)||approval.reviewerId!==executorPolicy.reviewerId)refuse('EXECUTOR_CUSTODY_POLICY_NOT_CORROBORATED');
 if(!approval||approval.protocol!==approvalProtocol(executorPolicy)||approval.repository!==TRAINING_REPOSITORY||approval.branch!==TRAINING_BRANCH||approval.workflowFile!==DISPATCH_WORKFLOWS[request.lane]||approval.dispatchId!==request.dispatchId||approval.decisionRef!==request.decisionRef||approval.requestHash!==dispatchHash(request)||approval.executionSha!==request.executionSha||!hex(approval.workflowSha256,64)||approval.callerId!==principal.id||approval.callerLogin!==principal.login||approval.reviewerId!==Number(request.inputs.owner_reviewer_id)||approval.reviewerId===principal.id||!Number.isInteger(approval.approvedAt)||!Number.isInteger(approval.expiresAt)||approval.approvedAt>now||approval.expiresAt<=now||approval.expiresAt-approval.approvedAt>300)refuse('CURRENT_EXACT_OWNER_DISPATCH_APPROVAL_REQUIRED');
 return approval;
}
export function createMediatedDispatcher({approvedExecutor,authenticateCaller,verifyOwnerDecision,readGithub,dispatchGithub,claimOnce,appendAudit,now=()=>Math.floor(Date.now()/1000)}) {
 for(const port of [authenticateCaller,verifyOwnerDecision,readGithub,dispatchGithub,claimOnce,appendAudit])if(typeof port!=='function')refuse('PRIVATE_DISPATCHER_PORTS_REQUIRED');
 const executorPolicy=validateApprovedExecutorPolicy(approvedExecutor);
 return async({request,callerContext})=> {
  const r=validateDispatchRequest(request);
  let principal;
  try{principal=await authenticateCaller(callerContext);}catch{refuse('DISPATCH_CALLER_AUTHENTICATION_FAILED');}
  if(principal?.id!==executorPolicy.account.id||principal?.login!==executorPolicy.account.login||!reference(principal.authenticationRef)||!Number.isInteger(principal.authenticatedAt)||principal.authenticatedAt>now()||principal.authenticatedAt<now()-300)refuse('APPOINTED_EXECUTOR_AUTHENTICATION_REQUIRED');
  const decision=async()=>{
   let value;try{value=await verifyOwnerDecision({decisionRef:r.decisionRef,requestHash:dispatchHash(r),callerId:principal.id});}catch{refuse('OWNER_DISPATCH_DECISION_READ_FAILED');}
   return approvalValid(value,r,principal,executorPolicy,now());
  };
  const first=structuredClone(await decision());
  const inputs={...r.inputs,dispatch_id:r.dispatchId,expected_execution_sha:r.executionSha};
  const endpoint=`/repos/${TRAINING_REPOSITORY}/actions/workflows/${DISPATCH_WORKFLOWS[r.lane]}/dispatches`;
  const body={ref:TRAINING_BRANCH,inputs};
  const binding={method:'POST',path:endpoint,bodyHash:dispatchHash(body),requestHash:dispatchHash(r),decisionRef:r.decisionRef,dispatchId:r.dispatchId,expiresAt:first.expiresAt};
  const recheck=async()=>{
   if(principal.authenticatedAt>now()||principal.authenticatedAt<now()-300)refuse('DISPATCH_CALLER_SESSION_EXPIRED');
   if(dispatchHash(await decision())!==dispatchHash(first))refuse('DISPATCH_APPROVAL_CHANGED');
   const root=`/repos/${TRAINING_REPOSITORY}`;
   let ref,repo,trainingFile,registrationFile;
   try{
    ref=await readGithub(root+`/git/ref/heads/${TRAINING_BRANCH}`);
    repo=await readGithub(root);
    if(ref?.object?.sha!==r.executionSha||repo?.default_branch!=='main')refuse('STALE_DISPATCH_SOURCE_OR_DEFAULT_BRANCH');
    trainingFile=await readGithub(root+`/contents/.github/workflows/${DISPATCH_WORKFLOWS[r.lane]}?ref=${r.executionSha}`);
    registrationFile=await readGithub(root+`/contents/.github/workflows/${DISPATCH_WORKFLOWS[r.lane]}?ref=main`);
   }catch{refuse('EXACT_REGISTERED_DISPATCH_SOURCE_NOT_AVAILABLE');}
   for(const file of [trainingFile,registrationFile]){
    if(file?.encoding!=='base64'||typeof file.content!=='string'||file.path!==`.github/workflows/${DISPATCH_WORKFLOWS[r.lane]}`)refuse('REVIEWED_WORKFLOW_CONTENT_REQUIRED');
    const bytes=Buffer.from(file.content,'base64');
    if(createHash('sha256').update(bytes).digest('hex')!==first.workflowSha256)refuse('REVIEWED_WORKFLOW_HASH_MISMATCH');
   }
  };
  await recheck();
  let reservation;
  try{reservation=await claimOnce({dispatchId:r.dispatchId,decisionRef:r.decisionRef,requestHash:binding.requestHash});}catch{refuse('DURABLE_DISPATCH_CLAIM_FAILED_NO_RETRY');}
  if(!reservation||reservation.dispatchId!==r.dispatchId||reservation.requestHash!==binding.requestHash||!reference(reservation.claimRef))refuse('DURABLE_ONE_TIME_DISPATCH_CLAIM_REQUIRED');
  let previousHash=null;
  const audit=async(outcome,extra={})=>{
   const record={protocol:auditProtocol(executorPolicy),dispatchId:r.dispatchId,decisionRef:r.decisionRef,requestHash:binding.requestHash,bodyHash:binding.bodyHash,workflowFile:DISPATCH_WORKFLOWS[r.lane],branch:TRAINING_BRANCH,executionSha:r.executionSha,callerLogin:principal.login,callerId:principal.id,...executorAuthorityBinding(executorPolicy),claimRef:reservation.claimRef,observedAt:now(),outcome,previousHash,...extra};
   const recordHash=dispatchHash(record);let ack;
   try{ack=await appendAudit({...record,recordHash});}catch{refuse('DURABLE_DISPATCH_AUDIT_FAILED_NO_RETRY');}
   if(ack?.recordHash!==recordHash||!reference(ack.auditRef))refuse('DURABLE_DISPATCH_AUDIT_ACK_REQUIRED_NO_RETRY');
   previousHash=recordHash;
  };
  await audit('PREPARED');
  try{await recheck();}catch{await audit('REFUSED_BEFORE_SEND');refuse('DISPATCH_RECONCILIATION_CHANGED_NO_RETRY');}
  await audit('SEND_INTENT');
  let response;
  try{response=await dispatchGithub({...binding,body:structuredClone(body),redirect:'error'});}catch{await audit('OUTCOME_UNKNOWN_NO_RETRY');refuse('DISPATCH_OUTCOME_UNKNOWN_NO_RETRY');}
  // Both current (200) and legacy (204) GitHub dispatch responses are handled.
  // Neither proves job execution, approval, admission or release acceptance.
  if(response?.status===200&&Number.isSafeInteger(response.runId)&&response.runId>0){
   await audit('ACCEPTED_PENDING_RUN_VERIFICATION',{runId:response.runId});
   return {dispatchId:r.dispatchId,runId:response.runId,dispatchAccepted:true,runVerified:false,protectedExecutionAccepted:false};
  }
  if(response?.status===204){
   await audit('ACCEPTED_PENDING_RUN_CORRELATION');
   return {dispatchId:r.dispatchId,dispatchAccepted:true,runVerified:false,protectedExecutionAccepted:false};
  }
  await audit('REJECTED_OR_UNKNOWN_NO_RETRY');refuse('DISPATCH_REJECTED_OR_UNKNOWN_NO_RETRY');
 };
}
