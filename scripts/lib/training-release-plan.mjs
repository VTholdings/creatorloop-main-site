import {TRAINING_TARGET,sha256,refuse} from './training-execution-contract.mjs';
import {validatePublicVerifierKeys} from './creatorloop-training-signer.mjs';
const peer={databaseId:'c4993a97-5835-4c6c-af06-7020fa8d4f2a',audience:'c54a2a0bc9a1ae7ccde868a309822a6fadf74f6c04e7b34b48a32bab839757d9',deploymentId:'28239f49-aedc-448e-978d-36b0b9359fa0'};
export async function prepareTrainingRelease({proposal,publicKeys,project,peerEvidence,observedAt,applicationSha,executionSha,now=Math.floor(Date.now()/1000)}) {
 if(!Number.isInteger(observedAt)||observedAt>now||observedAt<now-300)refuse('FRESH_METADATA_REQUIRED');
 if(!/^[a-f0-9]{40}$/.test(applicationSha||'')||!/^([a-f0-9]{40})$/.test(executionSha||'')||proposal?.repository!=='VTholdings/creatorloop-main-site'||proposal.training?.projectId!==TRAINING_TARGET.projectId||project?.name!==TRAINING_TARGET.project||project.id!==TRAINING_TARGET.projectId)refuse('TRAINING_RELEASE_TARGET_REFUSED');
 if(!peerEvidence||peerEvidence.independentlyVerified!==true||Object.entries(peer).some(([key,value])=>peerEvidence[key]!==value))refuse('PEER_IDENTITIES_UNVERIFIED');
 const setting=project.source?.config?.preview_deployment_setting;
 if(!['none','all','custom'].includes(setting))refuse('PREVIEW_SLOT_ENABLEMENT_UNKNOWN');
 const keys=await validatePublicVerifierKeys(publicKeys),slots=setting==='none'?['production']:['production','preview'];
 const patch={deployment_configs:{}};
 for(const slot of slots){
  const config=project.deployment_configs?.[slot];
  if(config?.d1_databases?.OPERATIONS_DB?.id!==TRAINING_TARGET.databaseId)refuse('TRAINING_DATABASE_BINDING_REFUSED');
  const vars=config.env_vars||{};
  if(Object.keys(vars).some(k=>/SECRET|TOKEN|PRIVATE|SIGNING|BOOTSTRAP|CREDENTIAL/i.test(k)&&k!=='ADMISSION_VERIFIER_KEYS'))refuse('UNRECONCILED_TRAINING_CREDENTIAL_ALIAS');
  const desired={...proposal.proposedPublicVariables,ADMISSION_VERIFIER_KEYS:JSON.stringify(keys)};
  if(desired.CONSOLE_ENVIRONMENT!=='TRAINING'||desired.CONSOLE_DATABASE_ID!==TRAINING_TARGET.databaseId||desired.CLOUDFLARE_ACCESS_AUD!==TRAINING_TARGET.audience||desired.CONSOLE_DEPLOYMENT_ID!==TRAINING_TARGET.deploymentId||desired.PEER_DATABASE_ID!==peer.databaseId||desired.PEER_ACCESS_AUD!==peer.audience||desired.PEER_DEPLOYMENT_ID!==peer.deploymentId)refuse('PUBLIC_RELEASE_PINS_REFUSED');
  patch.deployment_configs[slot]={...structuredClone(config),env_vars:{...structuredClone(vars),...Object.fromEntries(Object.entries(desired).map(([key,value])=>[key,{type:'plain_text',value}]))}};
 }
 return {protocol:'CREATORLOOP_TRAINING_RELEASE_PLAN_V1',executable:false,requiresExactProtectedApproval:true,applicationSha,executionSha,project:TRAINING_TARGET.project,projectId:TRAINING_TARGET.projectId,observedDeployedSha:project.canonical_deployment?.deployment_trigger?.metadata?.commit_hash||null,enabledSlots:slots,configurationPatch:patch,configurationHash:sha256(patch),publicJwkFingerprints:keys.map(k=>({kid:k.kid,sha256:sha256(JSON.stringify({e:k.e,kty:k.kty,n:k.n}))})),deployment:{project:TRAINING_TARGET.project,sourceSha:applicationSha,stagingRequirement:'Use a clean immutable TRAINING-only staging tree; exclude root production-pinned wrangler.toml, .git, tests, scripts and private files. Exact assets and configuration must be reviewed before upload.'},holds:['No configuration write','No deployment','No migration','No production operation','No identity/admission action']};
}
