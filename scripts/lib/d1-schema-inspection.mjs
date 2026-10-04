// Exact allowlisted SQL reads only. This does not extend the GET-only client.
import {createHash} from 'node:crypto';
const account='2a3b96a0b37850cd03107131baa66b6d';
const ids={TRAINING:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',PRODUCTION:'c4993a97-5835-4c6c-af06-7020fa8d4f2a'};
const fail=code=>{throw Error(code);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const fingerprint=value=>hash(canonical(value));
const schema="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name LIMIT 257";
const registration='SELECT version FROM schema_migrations ORDER BY version LIMIT 33';
function differences(q,actual){
 // Keep object-level before/after fingerprints, never SQL/defaults/provider values.
 const key=q.key.startsWith('schema')?r=>String(r?.type)+':'+String(r?.name):q.key==='registration'||q.key==='registrationEndFence'?r=>typeof r?.version==='string'?r.version:'INVALID_ROW_'+fingerprint(r):q.key==='operators'?r=>String(r?.cid):r=>fingerprint(r);
 const expected=new Map(q.expected.map(r=>[key(r),r])),observed=new Map(actual.map(r=>[key(r),r]));
 return [...new Set([...expected.keys(),...observed.keys()])].sort().filter(k=>fingerprint(expected.get(k)??null)!==fingerprint(observed.get(k)??null)).slice(0,64).map(k=>({
  object:expected.has(k)?k:'UNRECOGNIZED_OBJECT_'+fingerprint(k),
  change:!expected.has(k)?'ADDED':!observed.has(k)?'MISSING':'CHANGED',
  expectedSha256:fingerprint(expected.get(k)??null),actualSha256:fingerprint(observed.get(k)??null)
 }));
}
export function inspectionPlan(baseline){
 const tables=Object.keys(baseline?.foreignKeys??{}).sort();
 if(baseline?.protocol!=='CREATORLOOP_D1_SCHEMA_BASELINE_V1'||ids[baseline.environment]!==baseline.databaseId||baseline.backupRunId!=='37242966914'||baseline.backupReleaseSha!=='a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46'||!tables.length||tables.length>48||tables.some(t=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t))||!tables.includes('operators')||!tables.includes('schema_migrations'))fail('SCHEMA_BASELINE_REFUSED');
 return Object.freeze([
  {key:'schema',sql:schema,limit:256,expected:baseline.schema},
  {key:'registration',sql:registration,limit:32,expected:baseline.registration},
  {key:'operators',sql:'PRAGMA table_info("operators")',limit:128,expected:baseline.operators},
  {key:'foreignKeyEnforcement',sql:'PRAGMA foreign_keys',limit:1,expected:[{foreign_keys:1}]},
  ...tables.map(table=>({key:'foreignKeys:'+table,sql:'PRAGMA foreign_key_list("'+table+'")',limit:128,expected:baseline.foreignKeys[table]})),
  {key:'schemaEndFence',sql:schema,limit:256,expected:baseline.schema},
  {key:'registrationEndFence',sql:registration,limit:32,expected:baseline.registration}
 ].map(Object.freeze));
}
export function schemaReadClient({token,environment,baseline,targets,fetcher=fetch}){
 if(typeof token!=='string'||!token.trim()||targets?.accountId!==account||targets?.training?.databaseId!==ids.TRAINING||targets?.production?.databaseId!==ids.PRODUCTION||baseline?.environment!==environment||baseline?.databaseId!==ids[environment])fail('SCHEMA_READ_TARGET_REFUSED');
 const allowed=new Map(inspectionPlan(baseline).map(q=>[q.sql,q]));
 return async sql=>{
  if(!allowed.has(sql))fail('SCHEMA_SQL_REFUSED');
  const descriptor=allowed.get(sql),path='/accounts/'+account+'/d1/database/'+ids[environment]+'/query';
  let response;
  try{response=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({sql,params:[]}),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('SCHEMA_READ_UNAVAILABLE_NO_RETRY');}
  if(!response.ok)fail('SCHEMA_READ_HTTP_'+response.status);
  let body;try{
   const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
   try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2*1024*1024)throw Error();chunks.push(Buffer.from(r.value));}}finally{await reader.cancel().catch(()=>{});}
   body=JSON.parse(Buffer.concat(chunks).toString());
  }catch{fail('SCHEMA_READ_RESPONSE_REFUSED');}
  if(body.success!==true||!Array.isArray(body.result)||body.result.length!==1||body.result[0].success!==true)fail('SCHEMA_READ_RESPONSE_REFUSED');
  const result=body.result[0];
  if(result.meta?.rows_written!==0||result.meta?.changed_db!==false)fail('SCHEMA_READ_ZERO_WRITE_EVIDENCE_REQUIRED');
  if(!Array.isArray(result.results)||result.results.length>descriptor.limit)fail('SCHEMA_READ_RESULT_BOUND_EXCEEDED');
  return {rows:result.results,evidence:{method:'POST',path,status:response.status,sqlSha256:createHash('sha256').update(sql).digest('hex'),rowsWritten:0,changedDatabase:false}};
 };
}
export async function inspectSchema({baseline,client,releaseSha,mainSha,runId,now=()=>new Date().toISOString(),fence=async()=>{}}){
 const receipt={protocol:'CREATORLOOP_D1_SCHEMA_INSPECTION_V1',environment:baseline.environment,databaseId:baseline.databaseId,releaseSha,mainSha,runId,backupRunId:baseline.backupRunId,backupReleaseSha:baseline.backupReleaseSha,backupSha256:baseline.backupSha256,exportCompletedAt:baseline.exportCompletedAt,status:'LIVE_SCHEMA_INSPECTION_BLOCKED',startedAt:now(),checks:[],blockers:[],migrationSha256:baseline.migrationSha256,acceptedRehearsalSha256:baseline.acceptedRehearsalSha256,registeredTeamMigrations:baseline.registeredTeamMigrations,pendingMigrations:baseline.pendingMigrations,remoteAppliedFileHashesStored:false,atomicExecutionCertified:false,remoteMigrationsApplied:false,remoteRestorePerformed:false,productionDeployed:false};
 try{
  for(const q of inspectionPlan(baseline)){
   await fence();const {rows,evidence}=await client(q.sql);const matched=fingerprint(rows)===fingerprint(q.expected);
   receipt.checks.push({check:q.key,matched,expectedSha256:fingerprint(q.expected),actualSha256:fingerprint(rows),rowCount:rows.length,...evidence,...(!matched?{differences:differences(q,rows)}:{})});
   if(!matched)fail('LIVE_SCHEMA_DISCREPANCY');
   if(q.key.startsWith('foreignKeys:')&&rows.some(r=>r.table==='operators'&&(r.on_update!=='NO ACTION'||r.on_delete!=='NO ACTION')))fail('UNSUPPORTED_IDENTITY_FOREIGN_KEY_ACTION');
  }
  receipt.status='LIVE_SCHEMA_INSPECTION_PASS';
 }catch(error){receipt.blockers.push({code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'SCHEMA_INSPECTION_BLOCKED'});}
 receipt.completedAt=now();return receipt;
}
