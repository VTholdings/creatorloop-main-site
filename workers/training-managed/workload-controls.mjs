import {validateWorkloadPolicy,isWorkloadPolicy} from '../../scripts/lib/training-workload-policy.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
export const WORKLOAD_RESOURCES=['creatorloop-training-execution-gateway','creatorloop-training-execution-capability'];
// Nonsecret reviewed plan, NOT a Cloudflare configuration change or effective-permission proof.
export function validateWorkloadControls(plan,policy){
 validateWorkloadPolicy(policy);
 if(plan?.protocol!=='CREATORLOOP_TRAINING_WORKLOAD_CONTROLS_V1'||plan.environment!=='TRAINING'||plan.accountId!=='2a3b96a0b37850cd03107131baa66b6d'||!Array.isArray(plan.workers)||[...plan.workers].sort().join('|')!==[...WORKLOAD_RESOURCES].sort().join('|')||plan.repository!=='VTholdings/creatorloop-main-site'||plan.branch!=='team-access-directory'||plan.releaseEnvironment!=='creatorloop-training-release'||plan.preventSelfReview!==true||plan.allowAdminBypass!==false||plan.ownerReviewerId!==policy.reviewerId||plan.deploymentCredentialScope!=='selected-workers-editor'||plan.runtimeManagementCredentials!==false||plan.runtimeApprovalSigningCredentials!==false||plan.automaticCloudflareBuilds!==false||plan.alternateDeploymentCredentials!==false||plan.capabilityPublicRoute!==false||plan.ownerOverrideRiskAccepted!==true||plan.freezePrivilegedChangesWhenCommissioningExpires!==true||typeof plan.expectedSourceSha!=='string'||!/^[a-f0-9]{40}$/.test(plan.expectedSourceSha)||['ownerOverrideAuditRef','configVersionReconciliationRef','vtRecoveryCopyRef','approvalEvidenceCustodyRef'].some(k=>typeof plan[k]!=='string'||!plan[k].trim()))refuse('EXACT_TRAINING_OVERRIDE_MITIGATION_PLAN_REQUIRED');
 return {planValid:true,effectiveCloudflareControlsVerified:false,protectedExecutionAuthorized:false};
}
export function refuseRuntimeManagementBindings(env,c){
 if(!isWorkloadPolicy(c.approvedExecutor))return;
 const forbidden=/(CLOUDFLARE.*(?:TOKEN|KEY)|DEPLOY.*(?:TOKEN|KEY)|WRANGLER.*(?:TOKEN|KEY)|EVIDENCE.*PRIVATE.*KEY|APPROVAL.*PRIVATE.*KEY|ADMISSION.*PRIVATE.*KEY)/i;
 if(Object.keys(env).some(k=>forbidden.test(k)))refuse('RUNTIME_MANAGEMENT_OR_SIGNING_BINDING_REFUSED');
}
