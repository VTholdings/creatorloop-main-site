// GET-only discovery for the held acceptance architecture. No SQL, provisioning,
// session revocation, deployment, policy mutation or receipt signing exists here.
import {createHash} from 'node:crypto';
const base='https://api.cloudflare.com/client/v4';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const aud=/^[0-9a-f]{64}$/;
const sha=/^[0-9a-f]{40}$/;
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class VerificationError extends Error {
 constructor(code,path='',status=0){super(code);Object.assign(this,{code,path,status});}
}
export function readOnlyClient({token,targets,fetcher=fetch}) {
 if(typeof token!=='string'||!token.trim())throw new VerificationError('MISSING_ENVIRONMENT_SECRET');
 if(!/^[0-9a-f]{32}$/.test(targets.accountId))throw new VerificationError('INVALID_ACCOUNT_PIN');
 for(const key of ['production','training']){
  const pin=targets[key];
  if(!uuid.test(pin?.databaseId||'')||!aud.test(pin?.audience||'')||!Array.isArray(pin?.projectCandidates)||!pin.projectCandidates.length||pin.projectCandidates.some(p=>typeof p!=='string'||!/^[a-z0-9-]+$/.test(p)))throw new VerificationError('INVALID_RESOURCE_PINS');
 }
 if(targets.production.databaseId===targets.training.databaseId||targets.production.audience===targets.training.audience)throw new VerificationError('SHARED_ENVIRONMENT_PINS');
 const root='/accounts/'+targets.accountId;
 const projects=new Set([...targets.production.projectCandidates,...targets.training.projectCandidates]);
 const databases=new Set([targets.production.databaseId,targets.training.databaseId]);
 const requests=[];
 const allowed=path=>{
  if(path==='/user/tokens/verify')return true;
  if(path.startsWith(root+'/pages/projects/'))return projects.has(path.slice((root+'/pages/projects/').length));
  if(path.startsWith(root+'/d1/database/'))return databases.has(path.slice((root+'/d1/database/').length));
  if(path.startsWith(root+'/access/apps')){
   const tail=path.slice((root+'/access/apps').length);
   return /^\?page=[1-9][0-9]*&per_page=50$/.test(tail)||/^\/[0-9a-f-]{36}\/policies\?page=[1-9][0-9]*&per_page=50$/.test(tail);
  }
  return false;
 };
 return {requests,async get(path){
  if(!allowed(path))throw new VerificationError('ENDPOINT_NOT_ALLOWED');
  let response;
  try{response=await fetcher(base+path,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new VerificationError('NETWORK_OR_REDIRECT_BLOCKED',path);}
  requests.push({method:'GET',path,status:response.status});
  if(!response.ok)throw new VerificationError('CLOUDFLARE_HTTP_ERROR',path,response.status);
  let body;
  try{const text=await response.text();if(text.length>4000000)throw Error();body=JSON.parse(text);}
  catch{throw new VerificationError('INVALID_API_RESPONSE',path,response.status);}
  if(body?.success!==true)throw new VerificationError('CLOUDFLARE_API_REJECTED',path,response.status);
  return body;
 }};
}
async function listAll(client,path) {
 const results=[];
 for(let page=1;page<=20;page++){
  const body=await client.get(path+'?page='+page+'&per_page=50');
  if(!Array.isArray(body.result))throw new VerificationError('INVALID_LIST_RESPONSE',path);
  results.push(...body.result);
  const info=body.result_info;
  if(info?.total_pages!==undefined){if(page>=info.total_pages)return results;}
  else if(info?.total_count!==undefined){if(results.length>=info.total_count)return results;}
  else if(body.result.length<50)return results;
 }
 throw new VerificationError('INCOMPLETE_PAGINATION',path);
}
const envPins=config=>{
 const variables=config?.env_vars||{};
 const value=(name,pattern)=>variables[name]?.type==='plain_text'&&typeof variables[name].value==='string'&&pattern.test(variables[name].value)?variables[name].value:null;
 return {
  audience:value('CLOUDFLARE_ACCESS_AUD',aud),
  teamDomain:value('CLOUDFLARE_ACCESS_TEAM_DOMAIN',/^[a-z0-9-]+\.cloudflareaccess\.com$/),
  consoleEnvironment:value('CONSOLE_ENVIRONMENT',/^(TRAINING|PRODUCTION)$/),
  databaseId:uuid.test(config?.d1_databases?.OPERATIONS_DB?.id||'')?config.d1_databases.OPERATIONS_DB.id:null,
  verifierKeysPresent:Boolean(variables.ADMISSION_VERIFIER_KEYS),
  syncCredentialPresent:Boolean(variables.CONTROL_SYSTEM_SYNC_SECRET),
  bootstrapPresent:Boolean(variables.BOOTSTRAP_ADMIN_EMAIL)
 };
};
const explicitEmail=(rules,email)=>rules.some(rule=>rule?.email?.email?.toLowerCase()===email);
const policyProjection=policies=>policies.map(p=>({
 policyId:uuid.test(p.id||'')?p.id:null,
 decision:['allow','deny','bypass','non_identity'].includes(p.decision)?p.decision:'unknown',
 configurationHash:fingerprint(p),
 ownerExplicitlyIncluded:explicitEmail(p.include||[],'team@creatorloop.net'),
 retiredIdentityExplicitlyIncluded:explicitEmail(p.include||[],'support@creatorloop.net'),
 ruleKinds:[...new Set(['include','require','exclude'].flatMap(k=>(p[k]||[]).flatMap(r=>Object.keys(r))))].sort()
}));
export async function verifyCloudflare({client,targets,releaseSha,mainSha,now=()=>new Date().toISOString()}) {
 const report={protocol:'CREATORLOOP_READONLY_V1',mode:'READ_ONLY',releaseSha,mainSha,observedAt:now(),accountId:targets.accountId,
  observations:{},blockers:[],requests:client.requests,liveLifecycleVerified:false,operatorReadinessCertified:false,productionCertified:false,
  notExecuted:['D1 queries or migrations','Cloudflare configuration changes','deployments','admission or revocation','receipt signing','source synchronization','backup export or restore']};
 const block=(code,details={})=>report.blockers.push({code,...details});
 const root='/accounts/'+targets.accountId;
 try{
  if(!sha.test(releaseSha)||!sha.test(mainSha))throw new VerificationError('INVALID_CODE_REFERENCE');
  const token=(await client.get('/user/tokens/verify')).result;
  report.observations.tokenActive=token?.status==='active';
  if(!report.observations.tokenActive)throw new VerificationError('TOKEN_NOT_ACTIVE');
  const selected={};
  for(const environment of ['production','training']){
   const pin=targets[environment],projects=[];
   for(const name of pin.projectCandidates){
    try{
     const p=(await client.get(root+'/pages/projects/'+name)).result;
     if(p?.name!==name)throw new VerificationError('PROJECT_IDENTITY_MISMATCH');
     if(environment==='production'&&!(p.domains||[]).includes(pin.domain))continue;
     projects.push(p);
    }catch(e){if(e instanceof VerificationError&&e.status===404)continue;throw e;}
   }
   if(projects.length!==1){block('MISSING_OR_AMBIGUOUS_PROJECT',{environment});continue;}
   const p=projects[0];selected[environment]=p;
   const canonical=p.canonical_deployment,metadata=canonical?.deployment_trigger?.metadata;
   report.observations[environment]={
    project:p.name,projectId:uuid.test(p.id||'')?p.id:null,
    canonicalDeploymentId:uuid.test(canonical?.id||'')?canonical.id:null,
    deployedSha:sha.test(metadata?.commit_hash||'')?metadata.commit_hash:null,
    productionBranch:/^[a-zA-Z0-9_/-]{1,100}$/.test(p.production_branch||'')?p.production_branch:null,
    production:envPins(p.deployment_configs?.production),
    preview:envPins(p.deployment_configs?.preview)
   };
   const observed=report.observations[environment];
   for(const slot of ['production','preview']){
    if(observed[slot].databaseId!==pin.databaseId)block('DATABASE_BINDING_MISMATCH',{environment,slot});
    if(observed[slot].audience!==pin.audience)block('ACCESS_AUDIENCE_MISMATCH',{environment,slot});
    if(observed[slot].teamDomain!==targets.teamDomain)block('ACCESS_TEAM_MISMATCH',{environment,slot});
    if(environment==='training'&&observed[slot].syncCredentialPresent)block('TRAINING_HAS_SYNC_CREDENTIAL',{slot});
    if(observed[slot].bootstrapPresent)block('BOOTSTRAP_CONFIGURATION_PRESENT',{environment,slot});
   }
   const db=(await client.get(root+'/d1/database/'+pin.databaseId)).result;
   if(db?.uuid!==pin.databaseId)block('DATABASE_IDENTITY_MISMATCH',{environment});
   observed.databaseMetadataReadable=db?.uuid===pin.databaseId;
   if(environment==='production'&&observed.deployedSha!==mainSha)block('PRODUCTION_SHA_REQUIRES_RECONCILIATION');
  }
  if(selected.production&&selected.training&&selected.production.id===selected.training.id)block('SHARED_PAGES_PROJECT');
  if(targets.production.databaseId===targets.training.databaseId||targets.production.audience===targets.training.audience)block('SHARED_ENVIRONMENT_PINS');
  const apps=await listAll(client,root+'/access/apps');
  report.observations.access={};
  for(const environment of ['production','training']){
   const pin=targets[environment],matches=apps.filter(a=>a.aud===pin.audience);
   if(matches.length!==1||!uuid.test(matches[0]?.id||'')){block('MISSING_OR_AMBIGUOUS_ACCESS_APPLICATION',{environment});continue;}
   const app=matches[0],policies=await listAll(client,root+'/access/apps/'+app.id+'/policies');
   const safePolicies=policyProjection(policies);
   const domains=[app.domain,...(app.self_hosted_domains||[]),...(app.destinations||[]).map(d=>d.uri)].filter(d=>typeof d==='string');
   const expected=environment==='production'?pin.domain:targets.training.projectCandidates[0]+'.pages.dev';
   const domainMatch=domains.some(d=>d===expected||d.startsWith(expected+'/')||(environment==='training'&&d==='*.'+expected));
   report.observations.access[environment]={
    applicationId:app.id,audience:pin.audience,policyConfigurationHash:fingerprint(policies),policies:safePolicies,
    expectedDomainPresent:domainMatch
   };
   if(!domainMatch)block('ACCESS_DOMAIN_MISMATCH',{environment});
   if(!safePolicies.some(p=>p.decision==='allow'&&p.ownerExplicitlyIncluded))block('OWNER_EXPLICIT_ALLOW_NOT_CORROBORATED',{environment});
   if(safePolicies.some(p=>p.decision==='allow'&&p.retiredIdentityExplicitlyIncluded))block('RETIRED_IDENTITY_EXPLICITLY_ALLOWED',{environment});
   if(safePolicies.some(p=>p.decision==='bypass'))block('ACCESS_BYPASS_REQUIRES_REVIEW',{environment});
  }
 }catch(e){
  block(e instanceof VerificationError?e.code:'VERIFICATION_RESPONSE_INVALID',e instanceof VerificationError?{path:e.path,status:e.status}:{});
 }
 report.status=report.blockers.length?'READ_ONLY_VERIFICATION_BLOCKED':'READ_ONLY_METADATA_MATCH';
 return report;
}
