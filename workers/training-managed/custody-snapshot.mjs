import {dispatchHash,validateDispatchRequest} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
const TABLES={claims:['dispatch_id','decision_ref','request_hash'],decisions:['dispatch_id','request_hash','decision_json','retained'],events:['sequence','dispatch_id','record_hash','record_json','retained'],jobs:['key','dispatch_id','expires_at']};
const sameKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export function validateCustodySnapshot(snapshot){
 if(!sameKeys(snapshot,['protocol','environment','observedAt','tables','schema','sqliteSequence','snapshotHash'])||snapshot.protocol!=='CREATORLOOP_MANAGED_CUSTODY_SNAPSHOT_V1'||snapshot.environment!=='TRAINING'||!Number.isSafeInteger(snapshot.observedAt)||snapshot.observedAt<0||!sameKeys(snapshot.tables,Object.keys(TABLES))||!Array.isArray(snapshot.schema)||!Array.isArray(snapshot.sqliteSequence))refuse('EXACT_TRAINING_CUSTODY_SNAPSHOT_REQUIRED');
 const {snapshotHash,...payload}=snapshot;
 if(snapshotHash!==dispatchHash(payload))refuse('CUSTODY_SNAPSHOT_HASH_MISMATCH');
 for(const [table,keys] of Object.entries(TABLES))if(!Array.isArray(snapshot.tables[table])||snapshot.tables[table].some(row=>!sameKeys(row,keys)))refuse('COMPLETE_CUSTODY_TABLES_REQUIRED');
 const {claims,decisions,events,jobs}=snapshot.tables;
 const unique=(rows,key)=>new Set(rows.map(r=>r[key])).size===rows.length;
 if(!unique(claims,'dispatch_id')||!unique(decisions,'dispatch_id')||!unique(events,'sequence')||!unique(events,'record_hash')||!unique(jobs,'key'))refuse('CUSTODY_DUPLICATE_STATE_REFUSED');
 const claimMap=new Map(claims.map(r=>[r.dispatch_id,r]));
 for(const d of decisions){
  const value=JSON.parse(d.decision_json),r=validateDispatchRequest(value.request);
  if(r.dispatchId!==d.dispatch_id||dispatchHash(r)!==d.request_hash||value.approval?.dispatchId!==d.dispatch_id||value.approval.requestHash!==d.request_hash||![0,1].includes(d.retained))refuse('IMMUTABLE_CUSTODY_DECISION_INVALID');
 }
 for(const c of claims)if(typeof c.dispatch_id!=='string'||typeof c.decision_ref!=='string'||!/^[a-f0-9]{64}$/.test(c.request_hash))refuse('CUSTODY_REPLAY_CLAIM_INVALID');
 const last=new Map();let sequence=0;
 for(const row of events){
  const record=JSON.parse(row.record_json),{recordHash,...projection}=record,claim=claimMap.get(row.dispatch_id);
  if(!Number.isSafeInteger(row.sequence)||row.sequence<=sequence||!claim||record.dispatchId!==row.dispatch_id||record.requestHash!==claim.request_hash||record.decisionRef!==claim.decision_ref||recordHash!==row.record_hash||dispatchHash(projection)!==recordHash||record.previousHash!==(last.get(row.dispatch_id)||null)||![0,1].includes(row.retained))refuse('CUSTODY_AUDIT_CHAIN_INVALID');
  last.set(row.dispatch_id,recordHash);sequence=row.sequence;
 }
 for(const j of jobs)if(!/^[a-f0-9]{64}$/.test(j.key)||!claimMap.has(j.dispatch_id)||!Number.isSafeInteger(j.expires_at))refuse('CUSTODY_JOB_REPLAY_STATE_INVALID');
 const seq=snapshot.sqliteSequence;
 if(seq.some(r=>!sameKeys(r,['name','seq'])||r.name!=='events'||!Number.isSafeInteger(r.seq)||r.seq<0)||seq.length>1||events.length&&(!seq.length||seq[0].seq<sequence))refuse('CUSTODY_SQLITE_SEQUENCE_INVALID');
 const names=snapshot.schema.map(r=>r.name);
 const guards=['claims_no_update','claims_no_delete','jobs_no_update','jobs_no_delete','decisions_no_delete','decisions_body_immutable','events_no_delete','events_body_immutable'];
 if(snapshot.schema.some(r=>!sameKeys(r,['type','name','tbl_name','sql'])||!['table','trigger','index'].includes(r.type)||typeof r.sql!=='string')||names.length!==new Set(names).size||[...Object.keys(TABLES),...guards].some(name=>!names.includes(name)))refuse('CUSTODY_SCHEMA_GUARDS_MISSING');
 return {protocol:snapshot.protocol,environment:'TRAINING',snapshotHash,observedAt:snapshot.observedAt,counts:Object.fromEntries(Object.entries(snapshot.tables).map(([t,rows])=>[t,rows.length])),unretainedDecisions:decisions.filter(r=>r.retained===0).length,unretainedEvents:events.filter(r=>r.retained===0).length,readOnlyValidated:true,recoveryAccepted:false};
}
export function captureCustodySnapshot({sql,transactionSync,now=()=>Math.floor(Date.now()/1000)}){
 if(!sql||typeof transactionSync!=='function')refuse('ACTUAL_CUSTODY_READ_PORT_REQUIRED');
 return transactionSync(()=>{
  const payload={protocol:'CREATORLOOP_MANAGED_CUSTODY_SNAPSHOT_V1',environment:'TRAINING',observedAt:now(),tables:{},schema:[],sqliteSequence:[]};
  for(const [table,columns] of Object.entries(TABLES))payload.tables[table]=sql.exec(`SELECT ${columns.join(',')} FROM ${table} ORDER BY ${table==='events'?'sequence':columns[0]}`).toArray();
  payload.schema=sql.exec("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('claims','decisions','events','jobs') AND sql IS NOT NULL ORDER BY type,name").toArray();
  payload.sqliteSequence=sql.exec("SELECT name,seq FROM sqlite_sequence WHERE name='events' ORDER BY name").toArray();
  const result={...payload,snapshotHash:dispatchHash(payload)};validateCustodySnapshot(result);return result;
 });
}
export function compareCustodySnapshots(original,recovered){
 validateCustodySnapshot(original);validateCustodySnapshot(recovered);
 const project=s=>({tables:s.tables,schema:s.schema,sqliteSequence:s.sqliteSequence});
 if(dispatchHash(project(original))!==dispatchHash(project(recovered)))refuse('CUSTODY_RECOVERY_CONTENT_MISMATCH');
 return {contentMatched:true,environment:'TRAINING',originalHash:original.snapshotHash,recoveredHash:recovered.snapshotHash,protectedRestorePerformed:false,hostedRecoveryAccepted:false};
}
