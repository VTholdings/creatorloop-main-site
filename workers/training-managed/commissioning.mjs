import {independentEvidence} from './security.mjs';
import {dispatchHash} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
import {isWorkloadPolicy,WORKLOAD_EXCEPTION_DECISION} from '../../scripts/lib/training-workload-policy.mjs';
export async function verifyManagedCommissioning(env,c,{fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
 const version=env.WORKER_VERSION_METADATA?.id;
 if(typeof version!=='string'||!version)refuse('EXACT_COMMISSIONED_WORKER_VERSION_REQUIRED');
 const proof=await independentEvidence(c,'commissioning',{configHash:dispatchHash(c),capabilityVersionId:version,appId:c.appId,installationId:c.installationId,executorPolicyHash:dispatchHash(c.approvedExecutor)},{fetchImpl,now});
 if(isWorkloadPolicy(c.approvedExecutor)){
  if(proof?.workloadControlsHash!==dispatchHash(c.workloadControls)||proof.sourceSha!==c.workloadControls.expectedSourceSha||proof.ownerOverrideAuditRef!==c.workloadControls.ownerOverrideAuditRef||proof.controlsEvidenceRef!==c.approvedExecutor.separationControlsRef)refuse('BOUND_WORKLOAD_CONTROL_REFERENCES_REQUIRED');
  if(proof?.configHash!==dispatchHash(c)||proof.capabilityVersionId!==version||proof.executorPolicyHash!==dispatchHash(c.approvedExecutor)||proof.protocol!=='CREATORLOOP_TRAINING_WORKLOAD_COMMISSIONING_V2'||proof.exceptionDecisionRef!==WORKLOAD_EXCEPTION_DECISION||proof.ownerOverrideRiskAcknowledged!==true||proof.runtimeHasNoDeploymentAuthority!==true||proof.runtimeHasNoApprovalSigningAuthority!==true||proof.protectedDeploymentPathVerified!==true||proof.unapprovedCodeChangeDetectionVerified!==true||proof.directOverrideMitigationVerified!==true||proof.vtIndependentRecoveryVerified!==true||proof.signingCustodyExcluded!==true||proof.appCapabilityScopeVerified!==true||proof.auditRetentionVerified!==true||proof.approvalObserverAdministrationSeparated!==true||typeof proof.controlsEvidenceRef!=='string'||!proof.controlsEvidenceRef||typeof proof.evidenceRef!=='string'||!proof.evidenceRef)refuse('ACTUAL_TRAINING_WORKLOAD_CONTROLS_REQUIRED');
  return proof;
 }
 if(proof?.configHash!==dispatchHash(c)||proof.capabilityVersionId!==version||proof.independentDeploymentAuthorityEnforced!==true||proof.signingCustodyExcluded!==true||proof.appCapabilityScopeVerified!==true||proof.auditRetentionVerified!==true||proof.approvalObserverAdministrationSeparated!==true||proof.executorPolicyHash!==dispatchHash(c.approvedExecutor)||typeof proof.evidenceRef!=='string'||!proof.evidenceRef)refuse('ACTUAL_MANAGED_AUTHORITY_SEPARATION_REQUIRED');
 return proof;
}
