// Distinct fixed corrected-trigger EXPLAIN protocol. No executable migration request.
import {createHash} from 'node:crypto';
import {PARSER_SNAPSHOT,TRAINING_PARSER_DB,verifyParserSource} from './training-parser.mjs';
import {fingerprint} from './gate2-atomicity.mjs';
export {TRAINING_PARSER_DB,verifyParserSource};
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=c=>{throw Error(c);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const CASE_FREE_MIGRATION_HASHES=freeze({"0005_team_directory.sql":"2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693","0006_audit_history.sql":"5efb5f677c082bb8bc5ad2e5a8c326b51b1894d3935adf3c1153b3be80cf58ed","0007_team_governance.sql":"f6cc901cd01a51ce9b51a022ab1ad8746197c29d5876b81557b7d7ed494b0457"});
export const CASE_FREE_VARIANTS=freeze([{"id":"0006:audit_events_snapshot","migration":"0006_audit_history.sql","trigger":"audit_events_snapshot","guardCount":1,"sourceTriggerSha256":"d238b2b2652fad742fcb40cf0eeeab46c9d135d7ac94170d635503765e93fbbe","sql":"EXPLAIN CREATE TRIGGER audit_events_snapshot AFTER INSERT ON audit_events\nBEGIN\n INSERT INTO console_audit_actor_snapshots(event_id,actor_id,actor_email,actor_name,actor_role,scope_json,authority_json)\n SELECT NEW.id,o.id,o.login_email,o.display_name,o.role,\n  (SELECT json_group_array(json_object('campaignId',campaign_id,'recordId',record_id)) FROM console_access_grants WHERE operator_id=o.id),\n  (SELECT json_group_array(json_object('campaignId',campaign_id,'fieldKey',field_key,'expiresAt',expires_at)) FROM console_approval_delegations WHERE operator_id=o.id AND expires_at>CURRENT_TIMESTAMP)\n FROM operators o WHERE o.id=NEW.operator_id;\n SELECT RAISE(ABORT,'Audit identity snapshot required') WHERE NOT EXISTS(SELECT 1 FROM console_audit_actor_snapshots WHERE event_id=NEW.id);\nEND;"},{"id":"0007:audit_events_snapshot","migration":"0007_team_governance.sql","trigger":"audit_events_snapshot","guardCount":1,"sourceTriggerSha256":"e07e1f8db29bddf229cdd0597b2269b0c89ee6d5436d99307ec3a35ea2f396d4","sql":"EXPLAIN CREATE TRIGGER audit_events_snapshot AFTER INSERT ON audit_events BEGIN\n INSERT INTO console_audit_actor_snapshots(event_id,actor_id,actor_email,actor_name,actor_role,scope_json,authority_json,membership_version,permission_snapshot_json)\n SELECT NEW.id,o.id,o.login_email,o.display_name,o.role,\n (SELECT json_group_array(json_object('campaignId',campaign_id,'recordId',record_id)) FROM console_access_grants WHERE operator_id=o.id),\n (SELECT json_group_array(json_object('campaignId',campaign_id,'fieldKey',field_key,'expiresAt',expires_at)) FROM console_approval_delegations WHERE operator_id=o.id AND datetime(expires_at)>CURRENT_TIMESTAMP),\n COALESCE(p.version,0),json_object('visibility',COALESCE(p.visibility_json,'legacy'),'exports',COALESCE(p.export_permissions_json,'legacy'),'environment',COALESCE(p.environment,'legacy'),'technicalLevel',p.technical_level,'systemScope',p.system_scope_json)\n FROM operators o LEFT JOIN console_team_profiles p ON p.operator_id=o.id WHERE o.id=NEW.operator_id;\n SELECT RAISE(ABORT,'Audit identity snapshot required') WHERE NOT EXISTS(SELECT 1 FROM console_audit_actor_snapshots WHERE event_id=NEW.id);\nEND;"},{"id":"0007:finalized_report_version_guard","migration":"0007_team_governance.sql","trigger":"finalized_report_version_guard","guardCount":4,"sourceTriggerSha256":"7480d0fdce89899bd91411e4c56cfd4e4a3948a8495360d5305881d7dc52e2ac","sql":"EXPLAIN CREATE TRIGGER finalized_report_version_guard BEFORE INSERT ON audit_events WHEN NEW.object_type='FinalizedReport' BEGIN\n SELECT RAISE(ABORT,'Finalized report requires Owner authority') WHERE NOT EXISTS(SELECT 1 FROM operators WHERE id=NEW.operator_id AND login_email='team@creatorloop.net' AND role='ADMINISTRATOR' AND account_status='ACTIVE');\n SELECT RAISE(ABORT,'Finalized report requires valid JSON') WHERE json_valid(NEW.new_value)=0;\n SELECT RAISE(ABORT,'Finalized report metadata is required') WHERE NEW.action NOT IN ('REPORT_FINALIZED','REPORT_SUPERSEDED')\n OR json_type(NEW.new_value,'$.version') IS NOT 'integer'\n OR json_type(NEW.new_value,'$.records') IS NOT 'array'\n OR COALESCE(json_extract(NEW.new_value,'$.dataset'),'') NOT IN ('creators','campaigns')\n OR COALESCE(length(trim(json_extract(NEW.new_value,'$.reason'))),0)=0\n OR COALESCE(length(trim(json_extract(NEW.new_value,'$.title'))),0)=0\n OR COALESCE(length(json_extract(NEW.new_value,'$.snapshotHash')),0)<>64;\n SELECT RAISE(ABORT,'Finalized report must supersede the latest version') WHERE NOT (\n (NEW.action='REPORT_FINALIZED' AND json_extract(NEW.new_value,'$.version')=1 AND NEW.previous_value IS NULL AND NOT EXISTS(SELECT 1 FROM audit_events WHERE object_type='FinalizedReport' AND object_id=NEW.object_id))\n OR (NEW.action='REPORT_SUPERSEDED' AND EXISTS(\n SELECT 1 FROM audit_events a WHERE a.id=NEW.previous_value AND a.object_type='FinalizedReport' AND a.object_id=NEW.object_id AND a.campaign_id=NEW.campaign_id\n AND json_extract(a.new_value,'$.dataset')=json_extract(NEW.new_value,'$.dataset')\n AND json_extract(a.new_value,'$.version')=json_extract(NEW.new_value,'$.version')-1\n AND NOT EXISTS(SELECT 1 FROM audit_events b WHERE b.object_type='FinalizedReport' AND b.object_id=a.object_id AND json_extract(b.new_value,'$.version')>json_extract(a.new_value,'$.version'))\n )));\nEND;"}]);
export const CASE_FREE_REQUESTS=freeze(CASE_FREE_VARIANTS.flatMap(v=>[
 {id:v.id+':single_sql',variant:v.id,shape:'single_sql',body:{sql:v.sql,params:[]},results:1},
 {id:v.id+':single_batch',variant:v.id,shape:'single_batch',body:{batch:[{sql:v.sql,params:[]}]},results:1},
 {id:v.id+':separate_batch',variant:v.id,shape:'separate_batch',body:{batch:[{sql:'EXPLAIN SELECT 1;',params:[]},{sql:v.sql,params:[]}]},results:2},
 {id:v.id+':joined_batch',variant:v.id,shape:'joined_batch',body:{batch:[{sql:'EXPLAIN SELECT 1;\n'+v.sql,params:[]}]},results:2}
]));

export function verifyCaseFreeParserMigrations(migrations){
 if(fingerprint(Object.keys(migrations??{}))!==fingerprint(Object.keys(CASE_FREE_MIGRATION_HASHES))||Object.entries(CASE_FREE_MIGRATION_HASHES).some(([name,digest])=>typeof migrations[name]!=='string'||hash(migrations[name])!==digest))fail('CASE_FREE_PARSER_MIGRATION_BYTES_CHANGED');
 for(const v of CASE_FREE_VARIANTS){
  const trigger=v.sql.slice('EXPLAIN '.length);
  if(!v.sql.startsWith('EXPLAIN CREATE TRIGGER '+v.trigger+' ')||hash(trigger)!==v.sourceTriggerSha256||!migrations[v.migration].includes(trigger)||/\bCASE\b/.test(trigger))fail('CASE_FREE_PARSER_TRIGGER_BYTES_CHANGED');
 }
 return CASE_FREE_MIGRATION_HASHES;
}
class EvidenceFailure extends Error{
 constructor(code,evidence){super(code);this.evidence=freeze(evidence);}
}
function responseEvidence(body,evidence,expected){
 const object=body!==null&&typeof body==='object'&&!Array.isArray(body);
 const responseEnvelope=Array.isArray(body)?'JSON_ARRAY':!object?'JSON_PRIMITIVE':body.success===true?'OBJECT_SUCCESS_TRUE':body.success===false?'OBJECT_SUCCESS_FALSE':!Object.hasOwn(body,'success')?'OBJECT_SUCCESS_MISSING':'OBJECT_SUCCESS_INVALID';
 const errors=Array.isArray(body?.errors)?body.errors:[],results=Array.isArray(body?.result)?body.result:[];
 const messages=[...errors.map(e=>e?.message),...results.map(r=>r?.error)].filter(v=>typeof v==='string').join('\n');
 const category=messages==='incomplete input: SQLITE_ERROR'?'INCOMPLETE_INPUT':/A prepared SQL statement must contain only one statement\.?/.test(messages)?'STATEMENT_COUNT':/not authorized|Authentication error/i.test(messages)?'AUTHORIZATION':/EXPLAIN.*(?:not supported|unsupported)/i.test(messages)?'EXPLAIN_UNSUPPORTED':messages?'OTHER_PROVIDER_ERROR':'NO_PROVIDER_ERROR_TEXT';
 return {...evidence,responseEnvelope,category,errorSha256:hash(messages),providerCodes:[...new Set(errors.map(e=>e?.code).filter(Number.isSafeInteger))].slice(0,8),zeroWriteMetadataAvailable:results.length===expected&&results.every(r=>r?.meta?.rows_written===0&&r?.meta?.changed_db===false)};
}
const tables=PARSER_SNAPSHOT.slice(1,16).map(v=>v.table);
export function caseFreeParserClient({token,authorization:a,runId,releaseSha,fetcher=fetch,now=()=>Date.now()}){
 if(typeof token!=='string'||!token.trim()||a?.scope!=='TRAINING_CASE_FREE_EXPLAIN_ONLY'||a.databaseId!==TRAINING_PARSER_DB||a.runId!==runId||a.releaseSha!==releaseSha||a.attempt!==1||!/^\d{1,20}$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(releaseSha||''))fail('CASE_FREE_PARSER_CREDENTIAL_OR_TARGET_REFUSED');
 const used=new Set();let reads=0;
 return async id=>{
  if(!Number.isFinite(Date.parse(a.windowExpiresAt))||now()>=Date.parse(a.windowExpiresAt))fail('PARSER_WINDOW_ATTESTATION_EXPIRED');
  const snapshot=id==='snapshot',q=CASE_FREE_REQUESTS.find(v=>v.id===id);
  if(!snapshot&&!q)fail('CASE_FREE_PARSER_SQL_REFUSED');
  if(snapshot&&++reads>13)fail('CASE_FREE_PARSER_READ_BOUND_EXCEEDED');
  if(!snapshot&&used.has(id))fail('CASE_FREE_PARSER_REQUEST_REPLAY_REFUSED');
  if(!snapshot)used.add(id);
  const body=snapshot?{batch:PARSER_SNAPSHOT.map(v=>({sql:v.sql,params:[]}))}:q.body,expected=snapshot?18:q.results;
  const path='/accounts/2a3b96a0b37850cd03107131baa66b6d/d1/database/'+TRAINING_PARSER_DB+'/query';
  let evidence={requestId:id,method:'POST',path,requestBodySha256:fingerprint(body),httpRequestAttempted:true,zeroWriteMetadataAvailable:false};
  let response,data;
  try{
   response=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
   evidence.httpStatus=response.status;
   const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
   try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>1024*1024)throw Error();chunks.push(Buffer.from(chunk.value));}}finally{await reader.cancel().catch(()=>{});}
   const raw=Buffer.concat(chunks);evidence.responseBodySha256=hash(raw);
   try{data=JSON.parse(raw.toString());}catch{throw new EvidenceFailure('CASE_FREE_PARSER_MALFORMED_RESPONSE',{...evidence,responseEnvelope:'MALFORMED_JSON',category:'MALFORMED_RESPONSE'});}
  }catch(error){
   if(error instanceof EvidenceFailure)throw error;
   throw new EvidenceFailure('CASE_FREE_PARSER_RESPONSE_UNAVAILABLE_NO_RETRY',{...evidence,category:'RESPONSE_UNAVAILABLE'});
  }
  evidence=responseEvidence(data,evidence,expected);
  if(!response.ok||data?.success!==true){
   if(snapshot)throw new EvidenceFailure('CASE_FREE_PARSER_SNAPSHOT_REJECTED',evidence);
   return {outcome:'EXPLAIN_REJECTED',evidence};
  }
  if(!Array.isArray(data.result)||data.result.length!==expected||data.result.some((r,i)=>r?.success!==true||!Array.isArray(r.results)||r.results.length>(snapshot?PARSER_SNAPSHOT[i].limit:512)||r.meta?.rows_written!==0||r.meta.changed_db!==false))throw new EvidenceFailure('CASE_FREE_PARSER_ZERO_WRITE_OR_RESPONSE_BOUND_REQUIRED',evidence);
  if(snapshot&&data.result.slice(1,16).some((r,i)=>r.results.length!==1||fingerprint(Object.keys(r.results[0]??{}).sort())!==fingerprint(['n','name'])||r.results[0].name!==tables[i]||!Number.isSafeInteger(r.results[0].n)||r.results[0].n<0))throw new EvidenceFailure('CASE_FREE_PARSER_SNAPSHOT_COUNT_RESULT_REQUIRED',evidence);
  if(!snapshot&&data.result.some(r=>!r.results.length||r.results.some(row=>!Number.isSafeInteger(row?.addr)||typeof row?.opcode!=='string')))throw new EvidenceFailure('CASE_FREE_PARSER_EXPLAIN_VM_REQUIRED',evidence);
  return {outcome:'EXPLAIN_ACCEPTED',...(snapshot?{rows:[data.result[0].results,data.result.slice(1,16).flatMap(r=>r.results),data.result[16].results,data.result[17].results]}:{}),evidence:{...evidence,resultCount:data.result.length,resultRowCounts:data.result.map(r=>r.results.length),rowsWritten:0,changedDatabase:false}};
 };
}
export async function executeCaseFreeParserDiagnostic({source,request,fence,runId,releaseSha,now=()=>Date.now()}){
 const receipt={protocol:'CREATORLOOP_TRAINING_CASE_FREE_PARSER_DIAGNOSTIC_V1',environment:'TRAINING',databaseId:TRAINING_PARSER_DB,runId,releaseSha,status:'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED',source,migrationSha256:CASE_FREE_MIGRATION_HASHES,startedAt:new Date(now()).toISOString(),observations:[],snapshots:[],blockers:[],probesAttempted:0,successfulProbes:0,remoteMigrationsApplied:false,productionAccessed:false,remoteRestorePerformed:false,productionDeployed:false,executorActivated:false,operatorAdmitted:false};
 const snapshot=async()=>{
  await fence();const result=await request('snapshot'),[schema,counts,registration,end]=result.rows;
  const matched=fingerprint(schema)===source.schemaSha256&&fingerprint(schema)===fingerprint(end)&&fingerprint(counts)===fingerprint(source.counts)&&fingerprint(registration)===fingerprint(source.registration);
  receipt.snapshots.push({...result.evidence,schemaSha256:fingerprint(schema),endSchemaSha256:fingerprint(end),countsSha256:fingerprint(counts),registrationSha256:fingerprint(registration),matched});
  if(!matched)fail('CASE_FREE_PARSER_PRESERVATION_DISCREPANCY');
 };
 try{
  await snapshot();
  for(const q of CASE_FREE_REQUESTS){
   await fence();let result;
   try{result=await request(q.id);}catch(error){
    if(error instanceof EvidenceFailure){receipt.probesAttempted+=error.evidence.httpRequestAttempted===true?1:0;receipt.observations.push({id:q.id,variant:q.variant,shape:q.shape,outcome:'PROBE_RESPONSE_BLOCKED',...error.evidence,schemaPreserved:false});}
    throw error;
   }
   receipt.probesAttempted+=result.evidence.httpRequestAttempted===true?1:0;
   if(result.outcome==='EXPLAIN_ACCEPTED')receipt.successfulProbes++;
   const observation={id:q.id,variant:q.variant,shape:q.shape,outcome:result.outcome,...result.evidence,schemaPreserved:false};receipt.observations.push(observation);
   await snapshot();observation.schemaPreserved=true;
   if(result.outcome!=='EXPLAIN_ACCEPTED')fail('CASE_FREE_PARSER_PROBE_REJECTED');
  }
  receipt.status='CASE_FREE_PARSER_DIAGNOSTIC_COMPLETE';
 }catch(error){receipt.blockers.push({code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED',...(error instanceof EvidenceFailure?{evidence:error.evidence}:{})});}
 receipt.completedAt=new Date(now()).toISOString();return receipt;
}
