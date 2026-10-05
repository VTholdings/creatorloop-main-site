// Fixed, training-only diagnostic. Never submit migration SQL or arbitrary caller SQL.
import {createHash} from 'node:crypto';
export const TRAINING_PARSER_DB='12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0';
const account='2a3b96a0b37850cd03107131baa66b6d';
const fail=c=>{throw Error(c);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fp=v=>hash(JSON.stringify(canonical(v)));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const PARSER_MIGRATION_HASHES=freeze({
 '0005_team_directory.sql':'2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693',
 '0006_audit_history.sql':'4caafd074663b4125d8af552c2e35653c26feaaa3458c92906d6b8c0856d9d02',
 '0007_team_governance.sql':'521b61fd348277116dcb0af55a803f057c64cc97b065ff00fdf244dcdea0c382'
});
const tables=['audit_events','campaigns','console_access_grants','console_approval_delegations','console_authorizations','console_source_outbox','console_source_records','control_system_imports','control_system_outbox','creatives','creator_assignments','creator_enrollments','operators','qa_reviews','schema_migrations'];
const schemaSQL="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name LIMIT 513";
export const PARSER_SNAPSHOT=freeze([
 {sql:schemaSQL,limit:512},
 {sql:tables.map(t=>"SELECT '"+t+"' AS name,count(*) AS n FROM \""+t+'"').join(' UNION ALL '),limit:15},
 {sql:'SELECT version FROM schema_migrations ORDER BY version LIMIT 33',limit:32},
 {sql:schemaSQL,limit:512}
]);
const header='EXPLAIN CREATE TRIGGER cl_parser_explain_only BEFORE UPDATE ON operators';
const bodies={
 simple:"SELECT RAISE(ABORT,'Team history is append-only');",
 case:"SELECT CASE WHEN NEW.id IS NULL THEN RAISE(ABORT,'DIAGNOSTIC_ONLY') END;",
 multi_case:"SELECT NEW.id; SELECT CASE WHEN NEW.id IS NULL THEN RAISE(ABORT,'DIAGNOSTIC_ONLY') END;"
};
export const PARSER_VARIANTS=freeze(Object.entries(bodies).flatMap(([kind,body])=>[
 {id:kind+'_multiline',sql:header+'\n BEGIN '+body+' END;'},
 {id:kind+'_singleline',sql:header+' BEGIN '+body+' END;'}
]));
export const PARSER_REQUESTS=freeze(PARSER_VARIANTS.flatMap(v=>[
 {id:v.id+':single_sql',variant:v.id,shape:'single_sql',body:{sql:v.sql,params:[]},results:1},
 {id:v.id+':single_batch',variant:v.id,shape:'single_batch',body:{batch:[{sql:v.sql,params:[]}]},results:1},
 {id:v.id+':separate_batch',variant:v.id,shape:'separate_batch',body:{batch:[{sql:'EXPLAIN SELECT 1;',params:[]},{sql:v.sql,params:[]}]},results:2},
 {id:v.id+':joined_batch',variant:v.id,shape:'joined_batch',body:{batch:[{sql:'EXPLAIN SELECT 1;\n'+v.sql,params:[]}]},results:2}
]));
export function verifyParserMigrations(migrations){
 if(fp(Object.keys(migrations??{}))!==fp(Object.keys(PARSER_MIGRATION_HASHES))||Object.entries(PARSER_MIGRATION_HASHES).some(([n,h])=>typeof migrations[n]!=='string'||hash(migrations[n])!==h))fail('PARSER_MIGRATION_BYTES_CHANGED');
 return PARSER_MIGRATION_HASHES;
}
export function verifyParserSource(raw){
 // The caller uses a fixed exact receipt digest; no fetched SQL or receipt field is executable.
 if(hash(raw)!=='551758939c0792d995197afb652204e33f7993395490c6bda32e600c65d4fa2e')fail('PARSER_SOURCE_RECEIPT_HASH_REQUIRED');
 const r=JSON.parse(raw);
 if(r.runId!=='37358040555'||r.releaseSha!=='aca4234650ac4507d8c1f6c68ed9e9ec8f8768da'||r.environment!=='TRAINING'||r.databaseId!==TRAINING_PARSER_DB||r.rollbackStatus!=='VERIFIED_ATOMIC_ROLLBACK'||r.remoteMigrationsApplied!==false||r.productionAccessed!==false||r.blockers?.length!==1||r.blockers[0].code!=='MIGRATION_SQL_FAILED_ROLLBACK_VERIFIED'||r.checks?.length!==185||r.checks.some(x=>x.matched!==true)||fp(r.beforeSnapshot)!==fp(r.rollbackSnapshot)||fp(r.migrationSha256)!==fp(PARSER_MIGRATION_HASHES)||fp(Object.keys(r.beforeSnapshot.data).sort())!==fp(tables))fail('PARSER_ACCEPTED_ROLLBACK_REQUIRED');
 return freeze({sourceRunId:r.runId,sourceReceiptSha256:hash(raw),schemaSha256:r.beforeSnapshot.schemaSha256,counts:tables.map(name=>({name,n:r.beforeSnapshot.data[name].count})),registration:['0002_operations_console_v2','0003_pnb_source_contract','0004_operator_permissions'].map(version=>({version}))});
}
function errorEvidence(body){
 const errors=Array.isArray(body?.errors)?body.errors:[],results=Array.isArray(body?.result)?body.result:[];
 const text=[...errors.map(e=>e?.message),...results.map(r=>r?.error)].filter(x=>typeof x==='string').join('\n');
 const category=text==='incomplete input: SQLITE_ERROR'?'INCOMPLETE_INPUT':/A prepared SQL statement must contain only one statement\.?/.test(text)?'STATEMENT_COUNT':/not authorized|Authentication error/i.test(text)?'AUTHORIZATION':/EXPLAIN.*(?:not supported|unsupported)/i.test(text)?'EXPLAIN_UNSUPPORTED':'OTHER_PROVIDER_ERROR';
 return {category,errorSha256:hash(text),providerCodes:[...new Set(errors.map(e=>e?.code).filter(Number.isSafeInteger))].slice(0,8)};
}
export function parserClient({token,authorization:a,runId,releaseSha,fetcher=fetch,now=()=>Date.now()}){
 if(typeof token!=='string'||!token.trim()||a?.scope!=='TRAINING_EXPLAIN_ONLY'||a.databaseId!==TRAINING_PARSER_DB||a.runId!==runId||a.releaseSha!==releaseSha||a.attempt!==1||!/^\d{1,20}$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(releaseSha||''))fail('PARSER_CREDENTIAL_OR_TARGET_REFUSED');
 const used=new Set();let reads=0;
 return async (id)=>{
  if(!Number.isFinite(Date.parse(a.windowExpiresAt))||now()>=Date.parse(a.windowExpiresAt))fail('PARSER_WINDOW_ATTESTATION_EXPIRED');
  const read=id==='snapshot',q=PARSER_REQUESTS.find(x=>x.id===id);
  if(!read&&!q)fail('PARSER_SQL_REFUSED');
  if(read&&++reads>25)fail('PARSER_READ_BOUND_EXCEEDED');
  if(!read&&used.has(id))fail('PARSER_REQUEST_REPLAY_REFUSED');
  if(!read)used.add(id);
  const body=read?{batch:PARSER_SNAPSHOT.map(x=>({sql:x.sql,params:[]}))}:q.body;
  const path='/accounts/'+account+'/d1/database/'+TRAINING_PARSER_DB+'/query';
  const evidence={requestId:id,method:'POST',path,requestBodySha256:fp(body)};
  let response,data;
  try{
   response=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
   const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
   try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>1024*1024)throw Error();chunks.push(Buffer.from(v.value));}}finally{await reader.cancel().catch(()=>{});}
   data=JSON.parse(Buffer.concat(chunks).toString());
  }catch{fail('PARSER_RESPONSE_UNAVAILABLE_NO_RETRY');}
  evidence.httpStatus=response.status;
  if(!response.ok||data.success!==true){
   if(read)fail('PARSER_SNAPSHOT_REJECTED');
   const sanitized=errorEvidence(data);
   const expected=[200,400].includes(response.status)&&data.success===false&&sanitized.providerCodes.includes(7500)&&['INCOMPLETE_INPUT','STATEMENT_COUNT'].includes(sanitized.category);
   return {outcome:expected?'PARSER_REJECTION_OBSERVED':'UNEXPECTED_PROVIDER_RESPONSE',evidence:{...evidence,...sanitized,zeroWriteMetadataAvailable:false}};
  }
  const expected=read?PARSER_SNAPSHOT.length:q.results;
  if(!Array.isArray(data.result)||data.result.length!==expected||data.result.some((r,i)=>r.success!==true||!Array.isArray(r.results)||r.results.length>(read?PARSER_SNAPSHOT[i].limit:512)||r.meta?.rows_written!==0||r.meta.changed_db!==false))fail('PARSER_ZERO_WRITE_OR_RESPONSE_BOUND_REQUIRED');
  if(!read&&data.result.some(r=>!r.results.length||r.results.some(x=>!Number.isSafeInteger(x?.addr)||typeof x?.opcode!=='string')))fail('PARSER_EXPLAIN_VM_EVIDENCE_REQUIRED');
  return {outcome:'EXPLAIN_ACCEPTED',...(read?{rows:data.result.map(r=>r.results)}:{}),evidence:{...evidence,resultCount:data.result.length,resultRowCounts:data.result.map(r=>r.results.length),rowsWritten:0,changedDatabase:false,zeroWriteMetadataAvailable:true}};
 };
}
export async function executeParserDiagnostic({source,request,fence,runId,releaseSha,now=()=>Date.now()}){
 const receipt={protocol:'CREATORLOOP_TRAINING_PARSER_DIAGNOSTIC_V1',environment:'TRAINING',databaseId:TRAINING_PARSER_DB,runId,releaseSha,status:'PARSER_DIAGNOSTIC_BLOCKED',source,migrationSha256:PARSER_MIGRATION_HASHES,startedAt:new Date(now()).toISOString(),observations:[],snapshots:[],blockers:[],remoteMigrationsApplied:false,productionAccessed:false,remoteRestorePerformed:false,productionDeployed:false,executorActivated:false,operatorAdmitted:false};
 const snapshot=async()=>{
  await fence();const r=await request('snapshot');
  const [schema,counts,registration,end]=r.rows;
  const matched=fp(schema)===source.schemaSha256&&fp(schema)===fp(end)&&fp(counts)===fp(source.counts)&&fp(registration)===fp(source.registration);
  receipt.snapshots.push({...r.evidence,schemaSha256:fp(schema),endSchemaSha256:fp(end),countsSha256:fp(counts),registrationSha256:fp(registration),matched});
  if(!matched)fail('PARSER_SCHEMA_OR_COUNTS_PRESERVATION_DISCREPANCY');
 };
 try{
  await snapshot();
  for(const q of PARSER_REQUESTS){
   await fence();const r=await request(q.id);
   const o={id:q.id,variant:q.variant,shape:q.shape,outcome:r.outcome,...r.evidence,schemaPreserved:false};receipt.observations.push(o);
   await snapshot();o.schemaPreserved=true;
   if(r.outcome==='UNEXPECTED_PROVIDER_RESPONSE')fail('PARSER_UNEXPECTED_PROVIDER_RESPONSE');
  }
  receipt.status='PARSER_DIAGNOSTIC_COMPLETE';
 }catch(e){receipt.blockers.push({code:/^[A-Z_0-9]+$/.test(e.message)?e.message:'PARSER_DIAGNOSTIC_BLOCKED'});}
 receipt.completedAt=new Date(now()).toISOString();return receipt;
}
