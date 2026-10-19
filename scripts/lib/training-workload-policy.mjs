import {refuse} from './training-execution-contract.mjs';
export const WORKLOAD_EXCEPTION_DECISION='VT-OWNER-2026-10-10-164433-HST';
export const WORKLOAD_POLICY_PROTOCOL='CREATORLOOP_APPROVED_TRAINING_WORKLOAD_POLICY_V2';
const reference=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(v);
const exact=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...fields].sort().join('|');
export const isWorkloadPolicy=p=>p?.protocol===WORKLOAD_POLICY_PROTOCOL;
export function validateWorkloadPolicy(p){
 if(!exact(p,['protocol','environment','repository','branch','account','reviewerId','workloadRef','signerCustodianRef','exceptionDecisionRef','ownerOverrideRiskAccepted','separationControlsRef'])||p.protocol!==WORKLOAD_POLICY_PROTOCOL||p.environment!=='TRAINING'||p.repository!=='VTholdings/creatorloop-main-site'||p.branch!=='team-access-directory'||!exact(p.account,['login','id'])||!Number.isSafeInteger(p.account.id)||p.account.id<=0||typeof p.account.login!=='string'||!/^[-A-Za-z0-9]+\[bot\]$/.test(p.account.login)||!Number.isSafeInteger(p.reviewerId)||p.reviewerId<=0||p.reviewerId===p.account.id||!reference(p.workloadRef)||!reference(p.signerCustodianRef)||p.workloadRef===p.signerCustodianRef||p.exceptionDecisionRef!==WORKLOAD_EXCEPTION_DECISION||p.ownerOverrideRiskAccepted!==true||!reference(p.separationControlsRef))refuse('EXACT_OWNER_APPROVED_TRAINING_WORKLOAD_POLICY_REQUIRED');
 return structuredClone(p);
}
export function executorAuthorityBinding(policy){
 return isWorkloadPolicy(policy)?{workloadRef:policy.workloadRef,exceptionDecisionRef:policy.exceptionDecisionRef}:{humanCustodianRef:policy.humanCustodianRef};
}
export function authorityBindingMatches(proof,policy){
 const binding=executorAuthorityBinding(policy);
 return Object.entries(binding).every(([k,v])=>proof?.[k]===v)&&(isWorkloadPolicy(policy)?!Object.hasOwn(proof||{},'humanCustodianRef'):!Object.hasOwn(proof||{},'workloadRef'));
}
export const approvalProtocol=p=>isWorkloadPolicy(p)?'CREATORLOOP_MEDIATED_WORKLOAD_APPROVAL_V2':'CREATORLOOP_MEDIATED_DISPATCH_APPROVAL_V1';
export const auditProtocol=p=>isWorkloadPolicy(p)?'CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2':'CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1';
export function auditProjectionFields(p){
 const authority=p?.protocol==='CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2'?['workloadRef','exceptionDecisionRef']:p?.protocol==='CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1'?['humanCustodianRef']:null;
 if(!authority)refuse('VERSIONED_SANITIZED_AUDIT_REQUIRED');
 if(p.protocol==='CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2'&&(!reference(p.workloadRef)||p.exceptionDecisionRef!==WORKLOAD_EXCEPTION_DECISION||p.branch!=='team-access-directory'||typeof p.callerLogin!=='string'||!/^[-A-Za-z0-9]+\[bot\]$/.test(p.callerLogin)))refuse('EXACT_TRAINING_WORKLOAD_AUDIT_REQUIRED');
 return ['protocol','dispatchId','decisionRef','requestHash','bodyHash','workflowFile','branch','executionSha','callerLogin','callerId',...authority,'claimRef','observedAt','outcome','previousHash',...(Object.hasOwn(p,'runId')?['runId']:[])];
}
