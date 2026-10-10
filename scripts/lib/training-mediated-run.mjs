import {EXECUTOR_ACCOUNT,DISPATCH_WORKFLOWS,validateDispatchRequest,dispatchHash} from './training-mediated-dispatcher.mjs';
import {validateGithubHostedContext} from '../execution/github-training-preflight.mjs';
import {refuse} from './training-execution-contract.mjs';
export async function verifyMediatedWorkflowRun({context,inputs,lane,policy,verifyRunApproval,now=()=>Math.floor(Date.now()/1000)}) {
 validateGithubHostedContext(context);
 if(!Object.hasOwn(DISPATCH_WORKFLOWS,lane)||policy?.protocol!=='CREATORLOOP_MEDIATED_RUN_POLICY_V1'||!Number.isSafeInteger(policy.appBotId)||policy.appBotId<=0||typeof policy.appBotLogin!=='string'||!policy.appBotLogin.endsWith('[bot]')||context.actorId!==String(policy.appBotId)||context.actorLogin!==policy.appBotLogin||policy.executorAccountId!==EXECUTOR_ACCOUNT.id||!Number.isSafeInteger(policy.reviewerId)||policy.reviewerId<=0||policy.reviewerId===EXECUTOR_ACCOUNT.id||typeof verifyRunApproval!=='function')refuse('PINNED_MEDIATED_RUN_AUTHORITY_REQUIRED');
 const {dispatch_id,expected_execution_sha,...workflowInputs}=inputs;
 if(expected_execution_sha!==context.executionSha||workflowInputs.owner_reviewer_id!==String(policy.reviewerId))refuse('MEDIATED_RUN_INPUT_BINDING_MISMATCH');
 const request=validateDispatchRequest({dispatchId:dispatch_id,decisionRef:workflowInputs.owner_decision_ref,lane,executionSha:expected_execution_sha,inputs:workflowInputs});
 let proof;try{proof=await verifyRunApproval({runId:context.runId,dispatchId:dispatch_id,requestHash:dispatchHash(request),workflowFile:DISPATCH_WORKFLOWS[lane]});}catch{refuse('MEDIATED_RUN_APPROVAL_READ_FAILED');}
 if(proof?.runId!==context.runId||proof.dispatchId!==dispatch_id||proof.requestHash!==dispatchHash(request)||proof.executionSha!==context.executionSha||proof.workflowFile!==DISPATCH_WORKFLOWS[lane]||proof.callerId!==EXECUTOR_ACCOUNT.id||proof.appBotId!==policy.appBotId||!Number.isInteger(proof.expiresAt)||proof.expiresAt<=now())refuse('CURRENT_MEDIATED_RUN_APPROVAL_REQUIRED');
 return {dispatchId:dispatch_id,requestHash:dispatchHash(request),runId:context.runId,executionSha:context.executionSha,mediatedRunVerified:true,protectedExecutionAccepted:false};
}
