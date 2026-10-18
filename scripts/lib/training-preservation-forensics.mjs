// Read-only recovery of the failed preservation check. Never calls a mutation port.
import {createHash} from 'node:crypto';
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export const configurationHash=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
const config=p=>({id:p.id,name:p.name,domains:p.domains||[],source:p.source||null,production_branch:p.production_branch,build_config:p.build_config||{},deployment_configs:p.deployment_configs||{},canonicalDeploymentId:p.canonical_deployment?.id||null});
const sha=/^[0-9a-f]{40}$/;
const approvedKeys=new Set(['CLOUDFLARE_ACCESS_AUD','CLOUDFLARE_ACCESS_TEAM_DOMAIN','OPERATIONS_DB']);
const publicKeys=new Set(['deployment_configs','production','preview','env_vars','d1_databases','id','type','value','CONSOLE_ENVIRONMENT',...approvedKeys,'compatibility_date','compatibility_flags','always_use_latest_compatibility_date','build_image_major_version','fail_open','usage_model','limits','cpu_ms','wrangler_config_hash','source','config','preview_deployment_setting','production_deployments_enabled','deployments_enabled','production_branch','build_config','domains','name','canonicalDeploymentId']);
function scalar(v,path){
 if(v===undefined)return {state:'absent'};
 if(v===null||typeof v==='boolean'||(Number.isSafeInteger(v)&&Math.abs(v)<100000))return {value:v};
 if(typeof v==='string'&&(/^(standard|bundled|TRAINING|PRODUCTION|plain_text|secret_text|all|none|custom|20\d\d-\d\d-\d\d)$/.test(v)||(path.includes('CLOUDFLARE_ACCESS_AUD')&&/^[0-9a-f]{64}$/.test(v))||(path.includes('CLOUDFLARE_ACCESS_TEAM_DOMAIN')&&/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(v))||(path.includes('OPERATIONS_DB')&&/^[0-9a-f-]{36}$/.test(v))))return {value:v};
 if(Array.isArray(v)&&v.length===0)return {value:[]};
 if(v&&typeof v==='object'&&!Object.keys(v).length)return {value:{}};
 return {type:typeof v,hash:configurationHash(v)};
}
export function safeDifferences(before,after,path=[]){
 if(configurationHash(before??null)===configurationHash(after??null)&&((before===undefined)===(after===undefined)))return [];
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(k=>safeDifferences(before[k],after[k],[...path,k]));
 const hidden=path.some(k=>!publicKeys.has(k));
 const entry={field:hidden?'REDACTED_FIELD_'+configurationHash(path).slice(0,12):path.join('.'),before:hidden?{hash:configurationHash(before??null)}:scalar(before,path),after:hidden?{hash:configurationHash(after??null)}:scalar(after,path),approvedField:path.some(k=>approvedKeys.has(k))&&!hidden};
 const object=before&&typeof before==='object'&&!Array.isArray(before)?before:after&&typeof after==='object'&&!Array.isArray(after)?after:null;
 return [entry,...(!hidden&&object?Object.keys(object).flatMap(k=>safeDifferences(before?.[k],after?.[k],[...path,k])):[])];
}
function restoreApprovedFields(current,targets){
 const p=structuredClone(config(current));
 p.deployment_configs.production.env_vars.CLOUDFLARE_ACCESS_AUD={type:'plain_text',value:targets.production.audience};
 const preview=p.deployment_configs.preview;
 if(preview&&typeof preview==='object'){
  for(const k of ['CLOUDFLARE_ACCESS_AUD','CLOUDFLARE_ACCESS_TEAM_DOMAIN'])if(preview.env_vars)delete preview.env_vars[k];
  if(preview.d1_databases)delete preview.d1_databases.OPERATIONS_DB;
 }
 return p;
}
export function recoverBeforeConfiguration(current,targets,expectedHash){
 if(!/^[0-9a-f]{64}$/.test(expectedHash||''))return null;
 const base=restoreApprovedFields(current,targets),candidates=[base];
 for(const preview of [null,{},undefined]){const p=structuredClone(base);if(preview===undefined)delete p.deployment_configs.preview;else p.deployment_configs.preview=preview;candidates.push(p);}
 // Only enumerate structural null/empty-map representation candidates; never
 // guess changed booleans, dates, secret values or runtime settings.
 const fields=Object.entries(base.deployment_configs.preview||{}).filter(([,v])=>v===null||(v&&typeof v==='object'&&!Object.keys(v).length)).map(([k])=>k).slice(0,10);
 for(let mask=0;mask<(1<<fields.length);mask++){
  const p=structuredClone(base);for(let i=0;i<fields.length;i++)if(mask&(1<<i))delete p.deployment_configs.preview[fields[i]];candidates.push(p);
 }
 return candidates.find(p=>configurationHash(p)===expectedHash)||null;
}
export async function inspectPreservation({token,targets,correction,baseline,fetcher=fetch}){
 const report={protocol:'CREATORLOOP_PRESERVATION_FORENSICS_V1',status:'PRESERVATION_UNRESOLVED',requests:[],blockers:[],changesMade:false,productionCertified:false,operatorReadinessCertified:false};
 try{
  if(!token||targets.accountId!=='2a3b96a0b37850cd03107131baa66b6d'||targets.training.projectCandidates[0]!=='creatorloop-operator-training'||correction?.protocol!=='CREATORLOOP_TRAINING_CORRECTION_V1'||!sha.test(correction.releaseSha||'')||correction.patchStatus!==200||!correction.blockers?.some(b=>b.code==='UNAPPROVED_TRAINING_CONFIGURATION_CHANGED')||baseline?.protocol!=='CREATORLOOP_READONLY_V1'||baseline.accountId!==targets.accountId)throw Error('INVALID_FORENSIC_INPUT');
  const root='/accounts/'+targets.accountId,trainingPath=root+'/pages/projects/'+targets.training.projectCandidates[0],productionPath=root+'/pages/projects/'+targets.production.projectCandidates[0];
  const times=correction.requests.map(r=>Date.parse(r.serverTime)).filter(Number.isFinite);if(!times.length||Math.max(...times)-Math.min(...times)>120000)throw Error('CORRECTION_TIME_UNAVAILABLE');
  const since=new Date(Math.min(...times)-30000).toISOString(),before=new Date(Math.max(...times)+30000).toISOString();
  const query='?since='+encodeURIComponent(since)+'&before='+encodeURIComponent(before);
  const auditV1=root+'/audit_logs'+query+'&page=1&per_page=1000',auditV2=root+'/logs/audit'+query+'&limit=1000';
  const allowed=new Set([root+'/tokens/verify',trainingPath,productionPath,auditV1,auditV2]);let active=false;
  const get=async path=>{
   if(!allowed.has(path)||(!active&&path!==root+'/tokens/verify'))throw Error('FORENSIC_ENDPOINT_REFUSED');
   let response;try{response=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('FORENSIC_NETWORK_BLOCKED');}
   report.requests.push({method:'GET',path,status:response.status});
   const raw=await response.text();if(raw.length>4000000)throw Error('FORENSIC_RESPONSE_LIMIT');
   let body;try{body=JSON.parse(raw);}catch{throw Error('FORENSIC_RESPONSE_INVALID');}
   if(!response.ok||body.success===false){const e=Error('FORENSIC_READ_DENIED');e.status=response.status;e.providerCodes=(body.errors||[]).map(x=>x.code).filter(Number.isSafeInteger);throw e;}
   return body;
  };
  active=(await get(root+'/tokens/verify')).result?.status==='active';if(!active)throw Error('TOKEN_NOT_ACTIVE');
  const current=(await get(trainingPath)).result,production=(await get(productionPath)).result;
  if(current?.name!==targets.training.projectCandidates[0]||production?.name!==targets.production.projectCandidates[0]||current.id===production.id)throw Error('FORENSIC_PROJECT_IDENTITY_MISMATCH');
  report.currentTrainingConfigurationHash=configurationHash(config(current));
  const old=baseline.observations.production,vars=production.deployment_configs?.production?.env_vars||{},previewVars=production.deployment_configs?.preview?.env_vars||{};
  report.productionObservedFieldsUnchanged=production.id===old.projectId&&production.canonical_deployment?.id===old.canonicalDeploymentId&&production.canonical_deployment?.deployment_trigger?.metadata?.commit_hash===old.deployedSha&&['production','preview'].every(slot=>{
   const c=production.deployment_configs?.[slot]||{},v=slot==='production'?vars:previewVars,b=old[slot];return c.d1_databases?.OPERATIONS_DB?.id===b.databaseId&&v.CLOUDFLARE_ACCESS_AUD?.value===b.audience&&v.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.value===b.teamDomain;
  });
  let recovered=recoverBeforeConfiguration(current,targets,correction.beforeConfigurationHash);
  report.audit={};
  for(const [name,path] of [['v1',auditV1],['v2',auditV2]]){
   try{
    const body=await get(path);if(!Array.isArray(body.result))throw Error('AUDIT_RESPONSE_INVALID');
    const selected=body.result.filter(e=>e.resource?.id===current.id||e.resource?.id===current.name||e.raw?.uri===trainingPath||e.metadata?.project_name===current.name||e.metadata?.projectName===current.name);
    const prodEntries=body.result.filter(e=>e.resource?.id===production.id||e.resource?.id===production.name||e.raw?.uri===productionPath);
    const info=body.result_info||{};
    const complete=info.total_pages!==undefined?info.total_pages===1:info.total_count!==undefined?info.total_count===body.result.length:!info.cursor&&body.result.length<1000;
    report.audit[name]={readable:true,entryCount:body.result.length,trainingEntries:selected.length,productionWriteEntries:prodEntries.filter(e=>['PATCH','POST','PUT','DELETE'].includes(e.raw?.method)||/update|change|delete|create/i.test(e.action?.type||'')).length,complete};
    for(const e of selected){
     for(const raw of [e.oldValue,e.metadata?.oldValue]){
      try{const p=typeof raw==='string'?JSON.parse(raw):raw;const candidate=p&&config({...current,...p});if(candidate&&configurationHash(candidate)===correction.beforeConfigurationHash)recovered=candidate;}catch{}
     }
    }
   }catch(e){report.audit[name]={readable:false,code:/^[A-Z_]+$/.test(e.message)?e.message:'AUDIT_READ_BLOCKED',status:e.status||0,providerCodes:e.providerCodes||[]};}
  }
  if(recovered){
   report.beforeConfigurationRecovered=true;report.beforeHashVerified=true;
   report.differences=safeDifferences(recovered,config(current));
   report.status='EXACT_CONFIGURATION_DIFFERENCES_RECOVERED';
   // Recovery never itself authorizes normalization or clears the original hold.
  }else{report.beforeConfigurationRecovered=false;report.blockers.push({code:'FULL_BEFORE_CONFIGURATION_NOT_RECOVERED'});}
  if(!report.productionObservedFieldsUnchanged)report.blockers.push({code:'PRODUCTION_OBSERVED_FIELDS_CHANGED'});
 }catch(e){report.blockers.push({code:/^[A-Z_]+$/.test(e.message)?e.message:'FORENSIC_READ_BLOCKED'});}
 return report;
}
