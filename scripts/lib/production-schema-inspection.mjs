// Production Gate 1 preparation. Existing training logic remains unchanged.
import {createHash} from 'node:crypto';
import {inspectionPlan,inspectSchema} from './d1-schema-inspection.mjs';
import {assertCurrentRelease} from './backup-authorization.mjs';
const repository='VTholdings/creatorloop-main-site';
const databaseId='c4993a97-5835-4c6c-af06-7020fa8d4f2a';
const providerSha='7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686';
const fail=code=>{throw Error(code);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fingerprint=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export function verifyTrainingPass(training,baseline){
 if(training?.protocol!=='CREATORLOOP_D1_SCHEMA_INSPECTION_V1'||training.environment!=='TRAINING'||training.databaseId!=='12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0'||training.runId!=='37248108426'||training.releaseSha!=='adfaadbdaa1d7348670761083f71da39a5d725ff'||training.status!=='LIVE_SCHEMA_INSPECTION_PASS'||training.blockers?.length!==0||training.checks?.length!==21||training.checks.some(c=>c.matched!==true||c.rowsWritten!==0||c.changedDatabase!==false)||training.authorization?.scope!=='TRAINING_ONLY'||training.authorization?.approvedBy!=='Creatorloopzone'||training.remoteMigrationsApplied!==false||training.remoteRestorePerformed!==false||training.productionDeployed!==false||fingerprint(training.migrationSha256)!==fingerprint(baseline.migrationSha256))fail('ACCEPTED_TRAINING_PASS_REQUIRED');
 const schemas=training.checks.filter(c=>c.check==='schema'||c.check==='schemaEndFence');
 if(schemas.length!==2||schemas.some(c=>c.providerNormalization?.actualMetadataSha256!==providerSha||c.providerNormalization.excluded!==true||c.providerNormalization.definitionMatched!==true))fail('ACCEPTED_PROVIDER_CLASSIFICATION_REQUIRED');
 return {runId:training.runId,releaseSha:training.releaseSha,artifactId:'11320388581',artifactArchiveSha256:'93b451071b27bcfd948a36998cc17eae46aa5426ca1caf479a6cb0ddcae03e65',completedAt:training.completedAt};
}
export async function authorizeProductionInspection({context:e,fetcher=fetch}){
 if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!==repository||e.GITHUB_REF!=='refs/heads/team-access-directory'||e.GITHUB_EVENT_NAME!=='push'||e.GITHUB_RUN_ATTEMPT!=='1'||e.ACCEPTANCE_ENVIRONMENT!=='creatorloop-acceptance'||e.SCHEMA_INSPECTION_SCOPE!=='PRODUCTION_ONLY'||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||!e.GITHUB_TOKEN)fail('PROTECTED_PRODUCTION_INSPECTION_REQUIRED');
 const get=async suffix=>{
  let r;try{r=await fetcher('https://api.github.com/repos/'+repository+'/actions/runs/'+e.GITHUB_RUN_ID+suffix,{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('INSPECTION_APPROVAL_EVIDENCE_UNAVAILABLE');}
  if(!r.ok)fail('INSPECTION_APPROVAL_EVIDENCE_UNAVAILABLE');try{return await r.json();}catch{fail('INSPECTION_APPROVAL_EVIDENCE_UNAVAILABLE');}
 };
 const run=await get('');
 if(String(run.id)!==e.GITHUB_RUN_ID||run.run_attempt!==1||run.head_sha!==e.GITHUB_SHA||run.head_branch!=='team-access-directory'||run.event!=='push'||run.repository?.full_name!==repository||run.path!=='.github/workflows/acceptance-production-schema.yml')fail('INSPECTION_RUN_EVIDENCE_MISMATCH');
 const reviews=await get('/approvals');
 if(!Array.isArray(reviews)||reviews.some(r=>r.state==='rejected'&&r.environments?.some(x=>x.name==='creatorloop-acceptance'))||!reviews.some(r=>r.state==='approved'&&r.user?.login==='Creatorloopzone'&&r.user?.id===245245322&&r.environments?.some(x=>x.name==='creatorloop-acceptance')))fail('OWNER_ENVIRONMENT_APPROVAL_REQUIRED');
 await assertCurrentRelease({context:e,fetcher});
 return {approvedBy:'Creatorloopzone',environment:'creatorloop-acceptance',scope:'PRODUCTION_ONLY',reviewCommentUsed:false,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,firstAttempt:true};
}
export async function inspectProductionSchema({baseline,client,normalizeProvider=false,...context}){
 if(baseline?.environment!=='PRODUCTION'||baseline.databaseId!==databaseId)fail('PRODUCTION_INSPECTION_TARGET_REFUSED');
 const plan=inspectionPlan(baseline);
 if(normalizeProvider&&(baseline.schema.some(r=>r.name==='_cf_KV'||r.tbl_name==='_cf_KV')||Object.hasOwn(baseline.foreignKeys,'_cf_KV')))fail('PRODUCTION_PROVIDER_BASELINE_REFUSED');
 const providerChecks=[];let initialState;
 const wrapped=async sql=>{
  const result=await client(sql);
  if(!normalizeProvider||sql!==plan[0].sql)return result;
  const rows=result.rows,candidates=rows.filter(r=>r?.name==='_cf_KV');
  const valid=candidates.length===0||(candidates.length===1&&candidates[0].type==='table'&&candidates[0].tbl_name==='_cf_KV'&&fingerprint(candidates[0])===providerSha);
  const comparisonRows=valid?rows.filter(r=>r!==candidates[0]):rows,state=fingerprint(candidates);
  const check=providerChecks.length===0?'schema':'schemaEndFence';
  providerChecks.push({check,actualSha256:fingerprint(rows),rowCount:rows.length,comparisonSha256:fingerprint(comparisonRows),comparisonRowCount:comparisonRows.length,...result.evidence,providerNormalization:{rule:'PRODUCTION_CF_KV_EXACT_V1',object:'table:_cf_KV',classification:valid?'CLOUDFLARE_MANAGED_EXPORT_EXCLUDED':'UNVERIFIED',count:candidates.length,present:candidates.length>0,excluded:valid&&candidates.length===1,requiredMetadataSha256:providerSha,actualMetadataSha256:candidates.length===1?fingerprint(candidates[0]):null,definitionMatched:valid}});
  if(!valid)fail('PROVIDER_OBJECT_DEFINITION_DISCREPANCY');
  if(check==='schema')initialState=state;
  else if(state!==initialState)fail('PROVIDER_OBJECT_END_FENCE_DISCREPANCY');
  return {...result,rows:comparisonRows};
 };
 const receipt=await inspectSchema({baseline,client:wrapped,...context});
 if(normalizeProvider){
  receipt.providerChecks=providerChecks;
  receipt.checks=receipt.checks.map(c=>{const p=providerChecks.find(p=>p.check===c.check);return p?{...c,...p}:c;});
 }
 return receipt;
}
