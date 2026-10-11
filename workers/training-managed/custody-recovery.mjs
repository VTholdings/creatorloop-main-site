import {captureCustodySnapshot,validateCustodySnapshot,compareCustodySnapshots} from './custody-snapshot.mjs';
import {dispatchHash} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
const COLUMNS={claims:['dispatch_id','decision_ref','request_hash'],decisions:['dispatch_id','request_hash','decision_json','retained'],events:['sequence','dispatch_id','record_hash','record_json','retained'],jobs:['key','dispatch_id','expires_at']};
// Caller supplies an isolated empty database initialized by the reviewed state.mjs.
// No imported SQL, delete, drop, existing-state overwrite or provider/activation port.
export function recoverIsolatedCustody({snapshot,expectedHash,sql,transactionSync,now=()=>Math.floor(Date.now()/1000)}){
 validateCustodySnapshot(snapshot);
 if(!/^[a-f0-9]{64}$/.test(expectedHash||'')||snapshot.snapshotHash!==expectedHash)refuse('OWNER_HELD_ORIGINAL_SNAPSHOT_HASH_REQUIRED');
 const empty=captureCustodySnapshot({sql,transactionSync,now});
 if(Object.values(empty.tables).some(rows=>rows.length)||empty.sqliteSequence.length)refuse('RECOVERY_REQUIRES_NEW_EMPTY_ISOLATED_TARGET');
 if(dispatchHash(empty.schema)!==dispatchHash(snapshot.schema))refuse('PINNED_SCHEMA_MISMATCH_IMPORTED_SQL_NEVER_EXECUTED');
 return transactionSync(()=>{
  // Recheck emptiness inside the write transaction.
  for(const table of Object.keys(COLUMNS))if(sql.exec(`SELECT COUNT(*) AS count FROM ${table}`).toArray()[0].count!==0)refuse('RECOVERY_TARGET_CHANGED');
  for(const [table,columns] of Object.entries(COLUMNS))for(const row of snapshot.tables[table])sql.exec(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,...columns.map(column=>row[column]));
  // sqlite_sequence is internal replay-safe event numbering, not a claim expiry reset.
  if(snapshot.sqliteSequence.length){
   const seq=snapshot.sqliteSequence[0];
   if(sql.exec("SELECT name FROM sqlite_sequence WHERE name='events'").toArray().length)sql.exec("UPDATE sqlite_sequence SET seq=? WHERE name='events'",seq.seq);
   else sql.exec('INSERT INTO sqlite_sequence (name,seq) VALUES (?,?)',seq.name,seq.seq);
  }
  const payload={protocol:'CREATORLOOP_MANAGED_CUSTODY_SNAPSHOT_V1',environment:'TRAINING',observedAt:now(),tables:{},schema:empty.schema,sqliteSequence:sql.exec("SELECT name,seq FROM sqlite_sequence WHERE name='events' ORDER BY name").toArray()};
  for(const [table,columns] of Object.entries(COLUMNS))payload.tables[table]=sql.exec(`SELECT ${columns.join(',')} FROM ${table} ORDER BY ${table==='events'?'sequence':columns[0]}`).toArray();
  const recovered={...payload,snapshotHash:dispatchHash(payload)},comparison=compareCustodySnapshots(snapshot,recovered);
  return {snapshot:recovered,result:{...comparison,isolatedRecoveryVerified:true,liveExecutorRestored:false,activationAuthorized:false}};
 });
}
