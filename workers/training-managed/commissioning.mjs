import {independentEvidence} from './security.mjs';
import {dispatchHash} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
export async function verifyManagedCommissioning(env,c,{fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
 const version=env.WORKER_VERSION_METADATA?.id;
 if(typeof version!=='string'||!version)refuse('EXACT_COMMISSIONED_WORKER_VERSION_REQUIRED');
 const proof=await independentEvidence(c,'commissioning',{configHash:dispatchHash(c),capabilityVersionId:version,appId:c.appId,installationId:c.installationId,executorPolicyHash:dispatchHash(c.approvedExecutor)},{fetchImpl,now});
 if(proof?.configHash!==dispatchHash(c)||proof.capabilityVersionId!==version||proof.independentDeploymentAuthorityEnforced!==true||proof.signingCustodyExcluded!==true||proof.appCapabilityScopeVerified!==true||proof.auditRetentionVerified!==true||proof.approvalObserverAdministrationSeparated!==true||proof.executorPolicyHash!==dispatchHash(c.approvedExecutor)||typeof proof.evidenceRef!=='string'||!proof.evidenceRef)refuse('ACTUAL_MANAGED_AUTHORITY_SEPARATION_REQUIRED');
 return proof;
}
