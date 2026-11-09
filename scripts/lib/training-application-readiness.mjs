// GET-only TRAINING metadata. No D1 query, application login, executor or deployment.
import {createHash} from 'node:crypto';
import {VerificationError} from './cloudflare-readonly.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha=/^[0-9a-f]{40}$/;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const publicValue=(config,key,pattern)=>{
 const v=config?.env_vars?.[key];return v?.type==='plain_text'&&typeof v.value==='string'&&pattern.test(v.value)?v.value:null;
};
export async function trainingApplicationMetadata({client,targets,releaseSha,now=()=>new Date().toISOString()}){
 const root='/accounts/'+targets.accountId,project=targets.training.projectCandidates[0],database=targets.training.databaseId;
 const report={protocol:'CREATORLOOP_TRAINING_APPLICATION_METADATA_V1',releaseSha,observedAt:now(),mode:'GET_ONLY',requests:client.requests,observations:{},blockers:[],step18Complete:false,step19Ready:false,productionCertified:false};
 const block=(code,details={})=>report.blockers.push({code,...details});
 // A narrower second allowlist prevents accidental reuse of production capabilities.
 let applicationId=null;
 const get=path=>{
  const allowed=path===root+'/tokens/verify'||path===root+'/pages/projects/'+project||path===root+'/d1/database/'+database||/^\?page=[1-9][0-9]*&per_page=50$/.test(path.slice((root+'/access/apps').length))&&path.startsWith(root+'/access/apps?')||applicationId&&path.startsWith(root+'/access/apps/'+applicationId+'/policies?')&&/^\?page=[1-9][0-9]*&per_page=50$/.test(path.slice((root+'/access/apps/'+applicationId+'/policies').length));
  if(!allowed)throw new VerificationError('TRAINING_ENDPOINT_NOT_ALLOWED');
  return client.get(path);
 };
 const list=async path=>{
  const out=[];
  for(let page=1;page<=20;page++){
   const body=await get(path+'?page='+page+'&per_page=50');
   if(!Array.isArray(body.result))throw new VerificationError('INVALID_LIST_RESPONSE');
   out.push(...body.result);
   if(body.result_info?.total_pages!==undefined? page>=body.result_info.total_pages:body.result_info?.total_count!==undefined?out.length>=body.result_info.total_count:body.result.length<50)return out;
  }
  throw new VerificationError('INCOMPLETE_PAGINATION');
 };
 try{
  if(!sha.test(releaseSha)||targets.training.databaseId===targets.production.databaseId||targets.training.audience===targets.production.audience)throw new VerificationError('INVALID_ISOLATION_PINS');
  if((await get(root+'/tokens/verify')).result?.status!=='active')throw new VerificationError('TOKEN_NOT_ACTIVE');
  const p=(await get(root+'/pages/projects/'+project)).result;
  if(p?.name!==project||!uuid.test(p.id||''))throw new VerificationError('PROJECT_IDENTITY_MISMATCH');
  const canonical=p.canonical_deployment;
  report.observations.project={name:project,id:p.id,canonicalDeploymentId:uuid.test(canonical?.id||'')?canonical.id:null,deployedSha:sha.test(canonical?.deployment_trigger?.metadata?.commit_hash||'')?canonical.deployment_trigger.metadata.commit_hash:null,previewDeploymentSetting:['all','none','custom'].includes(p.source?.config?.preview_deployment_setting)?p.source.config.preview_deployment_setting:'unknown'};
  if(report.observations.project.deployedSha!==releaseSha)block('TRAINING_DEPLOYED_SHA_DIFFERS_FROM_REVIEWED_RELEASE');
  report.observations.slots={};
  for(const slot of ['production','preview']){
   if(slot==='preview'&&report.observations.project.previewDeploymentSetting==='none')continue;
   const c=p.deployment_configs?.[slot],variables=c?.env_vars||{},observed={
    consoleEnvironment:publicValue(c,'CONSOLE_ENVIRONMENT',/^TRAINING$/),audience:publicValue(c,'CLOUDFLARE_ACCESS_AUD',/^[0-9a-f]{64}$/),teamDomain:publicValue(c,'CLOUDFLARE_ACCESS_TEAM_DOMAIN',/^[a-z0-9-]+\.cloudflareaccess\.com$/),
    bindingDatabaseId:uuid.test(c?.d1_databases?.OPERATIONS_DB?.id||'')?c.d1_databases.OPERATIONS_DB.id:null,
    consoleDatabaseId:publicValue(c,'CONSOLE_DATABASE_ID',uuid),consoleDeploymentId:publicValue(c,'CONSOLE_DEPLOYMENT_ID',/^[a-zA-Z0-9._-]{1,200}$/),peerDatabaseId:publicValue(c,'PEER_DATABASE_ID',uuid),peerDeploymentId:publicValue(c,'PEER_DEPLOYMENT_ID',/^[a-zA-Z0-9._-]{1,200}$/),peerAudience:publicValue(c,'PEER_ACCESS_AUD',/^[0-9a-f]{64}$/),
    verifierKeysPresent:Boolean(variables.ADMISSION_VERIFIER_KEYS),syncCredentialPresent:Boolean(variables.CONTROL_SYSTEM_SYNC_SECRET),bootstrapPresent:Boolean(variables.BOOTSTRAP_ADMIN_EMAIL),cloudflareCredentialPresent:Boolean(variables.CLOUDFLARE_API_TOKEN),signingCredentialPresent:Boolean(variables.ADMISSION_SIGNING_KEY)
   };
   report.observations.slots[slot]=observed;
   if(observed.consoleEnvironment!=='TRAINING'||observed.bindingDatabaseId!==database||observed.consoleDatabaseId!==database||observed.audience!==targets.training.audience||observed.teamDomain!==targets.teamDomain)block('TRAINING_RUNTIME_PIN_MISMATCH',{slot});
   if(observed.peerDatabaseId!==targets.production.databaseId||observed.peerAudience!==targets.production.audience||!observed.consoleDeploymentId||!observed.peerDeploymentId||observed.consoleDeploymentId===observed.peerDeploymentId)block('TRAINING_PEER_PIN_MISSING_OR_SHARED',{slot});
   if(!observed.verifierKeysPresent)block('ADMISSION_PUBLIC_VERIFIER_KEYS_MISSING',{slot});
   if(observed.syncCredentialPresent||observed.bootstrapPresent||observed.cloudflareCredentialPresent||observed.signingCredentialPresent)block('TRAINING_FORBIDDEN_CREDENTIAL_OR_BOOTSTRAP_PRESENT',{slot});
  }
  if((await get(root+'/d1/database/'+database)).result?.uuid!==database)block('TRAINING_DATABASE_IDENTITY_MISMATCH');
  const matches=(await list(root+'/access/apps')).filter(a=>a.aud===targets.training.audience);
  if(matches.length!==1||!uuid.test(matches[0]?.id||''))throw new VerificationError('TRAINING_ACCESS_APPLICATION_AMBIGUOUS');
  const a=matches[0];applicationId=a.id;
  const policies=await list(root+'/access/apps/'+applicationId+'/policies');
  const domains=[a.domain,...(a.self_hosted_domains||[]),...(a.destinations||[]).map(d=>d.uri)].filter(x=>typeof x==='string'),expected=project+'.pages.dev';
  const domainPresent=domains.some(x=>x===expected||x.startsWith(expected+'/')||x==='*.'+expected);
  report.observations.access={applicationId,audience:targets.training.audience,expectedDomainPresent:domainPresent,policyConfigurationHash:hash(policies),policies:policies.map(p=>({id:uuid.test(p.id||'')?p.id:null,decision:['allow','deny','bypass','non_identity'].includes(p.decision)?p.decision:'unknown',configurationHash:hash(p),ownerExplicitlyIncluded:(p.include||[]).some(x=>x.email?.email?.toLowerCase()==='team@creatorloop.net'),retiredIdentityExplicitlyIncluded:(p.include||[]).some(x=>x.email?.email?.toLowerCase()==='support@creatorloop.net')}))};
  if(!domainPresent)block('TRAINING_ACCESS_DOMAIN_MISMATCH');
  if(!report.observations.access.policies.some(p=>p.decision==='allow'&&p.ownerExplicitlyIncluded))block('TRAINING_OWNER_ALLOW_NOT_CORROBORATED');
  if(report.observations.access.policies.some(p=>p.decision==='bypass'||p.decision==='allow'&&p.retiredIdentityExplicitlyIncluded))block('TRAINING_ACCESS_POLICY_REQUIRES_REVIEW');
 }catch(e){block(e instanceof VerificationError?e.code:'METADATA_RESPONSE_INVALID',e instanceof VerificationError?{status:e.status,providerCodes:e.providerCodes,providerEvidence:e.providerEvidence}:{});}
 report.status=report.blockers.length?'TRAINING_METADATA_BLOCKED':'TRAINING_METADATA_MATCH';
 report.limits=['Metadata does not prove public-key validity, deployed application behavior, absence of every possible credential name, provider adapter availability, or individual lifecycle acceptance.','GET app routes may update last_activity_at or bootstrap an Owner; this diagnostic never visits those routes.'];
 return report;
}
