// One Owner-approved Pages configuration PATCH. No deployment or D1 writes.
import {createHash} from 'node:crypto';
import {readOnlyClient,VerificationError} from './cloudflare-readonly.mjs';
const approved={accountId:'2a3b96a0b37850cd03107131baa66b6d',project:'creatorloop-operator-training',audience:'a6b7d2d9e2a0bbe45ac1f1155cbd32593467eac2d66c01aa67d36fb290b7a38d',databaseId:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',teamDomain:'shiny-wildflower-143c.cloudflareaccess.com'};
const vars=['CLOUDFLARE_ACCESS_AUD','CLOUDFLARE_ACCESS_TEAM_DOMAIN'];
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const fail=code=>{throw new VerificationError(code);};
export const trainingPreviewsDisabled=p=>p?.source?.config?.preview_deployment_setting==='none';
function validatePins(t){
 if(t.accountId!==approved.accountId||t.teamDomain!==approved.teamDomain||t.training?.audience!==approved.audience||t.training?.databaseId!==approved.databaseId||t.training?.projectCandidates?.length!==1||t.training.projectCandidates[0]!==approved.project||t.production?.projectCandidates?.includes(approved.project)||t.production?.audience===approved.audience||t.production?.databaseId===approved.databaseId)fail('APPROVED_TRAINING_TARGET_REQUIRED');
}
function identity(p){
 if(p?.name!==approved.project||!/^[0-9a-f-]{36}$/.test(p.id||'')||p.deployment_configs?.production?.env_vars?.CONSOLE_ENVIRONMENT?.value!=='TRAINING'||p.domains?.includes('ops.creatorloop.net'))fail('TRAINING_PROJECT_IDENTITY_REQUIRED');
}
function configuration(p){return {id:p.id,name:p.name,domains:p.domains||[],source:p.source||null,production_branch:p.production_branch,build_config:p.build_config||{},deployment_configs:p.deployment_configs||{},canonicalDeploymentId:p.canonical_deployment?.id||null};}
function unrelated(p,slots){
 const copy=structuredClone(configuration(p));
 for(const slot of slots){
  const c=copy.deployment_configs[slot]||={};
  c.env_vars||={};c.d1_databases||={};
  for(const key of vars)delete c.env_vars[key];
  delete c.d1_databases.OPERATIONS_DB;
 }
 return copy;
}
export function planTrainingCorrection(project,targets){
 validatePins(targets);identity(project);
 const slots=trainingPreviewsDisabled(project)?['production']:['production','preview'];
 const deployment_configs={};
 for(const slot of slots){
  const c=project.deployment_configs?.[slot]||{},env_vars={};
  for(const [key,value] of [['CLOUDFLARE_ACCESS_AUD',approved.audience],['CLOUDFLARE_ACCESS_TEAM_DOMAIN',approved.teamDomain]]){
   if(c.env_vars?.[key]?.type!=='plain_text'||c.env_vars[key].value!==value)env_vars[key]={type:'plain_text',value};
  }
  const patch={};
  if(Object.keys(env_vars).length)patch.env_vars=env_vars;
  if(c.d1_databases?.OPERATIONS_DB?.id!==approved.databaseId)patch.d1_databases={...c.d1_databases,OPERATIONS_DB:{id:approved.databaseId}};
  if(Object.keys(patch).length)deployment_configs[slot]=patch;
 }
 return {slots,previewDisabled:slots.length===1,payload:Object.keys(deployment_configs).length?{deployment_configs}:null};
}
export async function correctTrainingPages({token,targets,fetcher=fetch}){
 const report={protocol:'CREATORLOOP_TRAINING_CORRECTION_V1',status:'TRAINING_CORRECTION_BLOCKED',writeAttempted:false,writeVerified:false,productionUnchanged:false,blockers:[],notExecuted:['deployments','D1 queries or migrations','Access changes','token changes','backup export or restore']};
 try{
  validatePins(targets);
  const client=readOnlyClient({token,targets,fetcher});report.requests=client.requests;
  const root='/accounts/'+approved.accountId;
  if((await client.get(root+'/tokens/verify')).result?.status!=='active')fail('TOKEN_NOT_ACTIVE');
  const trainingPath=root+'/pages/projects/'+approved.project;
  const productionPath=root+'/pages/projects/'+targets.production.projectCandidates[0];
  const production=(await client.get(productionPath)).result;
  if(production?.name!==targets.production.projectCandidates[0]||!production.domains?.includes(targets.production.domain))fail('PRODUCTION_REFERENCE_REQUIRED');
  const before=(await client.get(trainingPath)).result;
  if(before?.id===production.id)fail('SHARED_PAGES_PROJECT');
  const plan=planTrainingCorrection(before,targets);
  report.previewDisabled=plan.previewDisabled;report.slots=plan.slots;
  report.beforeConfigurationHash=hash(configuration(before));
  report.approvedChanges=plan.payload?Object.entries(plan.payload.deployment_configs).map(([slot,c])=>({slot,variables:Object.keys(c.env_vars||{}),databaseBinding:Boolean(c.d1_databases)})):[];
  // Refuse a changed target immediately before sending the one permitted PATCH.
  const fresh=(await client.get(trainingPath)).result;
  if(hash(configuration(fresh))!==report.beforeConfigurationHash)fail('STALE_TRAINING_CONFIGURATION');
  if(hash(configuration((await client.get(productionPath)).result))!==hash(configuration(production)))fail('PRODUCTION_REFERENCE_CHANGED');
  if(plan.payload){
   report.writeAttempted=true;
   let response;
   try{response=await fetcher('https://api.cloudflare.com/client/v4'+trainingPath,{method:'PATCH',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(plan.payload),redirect:'error',signal:AbortSignal.timeout(20000)});}
   catch{fail('PATCH_OUTCOME_UNKNOWN_NO_RETRY');}
   report.patchStatus=response.status;
   let body;
   try{const raw=await response.text();if(raw.length>4000000)throw Error();body=JSON.parse(raw);}catch{fail('PATCH_RESPONSE_INVALID_NO_RETRY');}
   if(!response.ok||body?.success!==true)fail('TRAINING_PATCH_REJECTED_NO_RETRY');
  }
  const after=(await client.get(trainingPath)).result;identity(after);
  if(planTrainingCorrection(after,targets).payload)fail('TRAINING_VALUES_NOT_VERIFIED');
  if(hash(unrelated(before,plan.slots))!==hash(unrelated(after,plan.slots)))fail('UNAPPROVED_TRAINING_CONFIGURATION_CHANGED');
  report.afterConfigurationHash=hash(configuration(after));
  report.productionUnchanged=hash(configuration((await client.get(productionPath)).result))===hash(configuration(production));
  if(!report.productionUnchanged)fail('PRODUCTION_REFERENCE_CHANGED');
  report.writeVerified=report.writeAttempted;
  report.status=plan.payload?'TRAINING_CORRECTION_VERIFIED':'TRAINING_CONFIGURATION_ALREADY_MATCHES';
 }catch(e){report.blockers.push({code:e instanceof VerificationError?e.code:'CORRECTION_RESPONSE_INVALID',...(e instanceof VerificationError&&e.status?{status:e.status,providerCodes:e.providerCodes}:{})});}
 return report;
}
