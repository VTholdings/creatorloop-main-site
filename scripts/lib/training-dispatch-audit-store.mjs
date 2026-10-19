import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync,openSync,closeSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {dispatchHash} from './training-mediated-dispatcher.mjs';
import {refuse} from './training-execution-contract.mjs';
import {auditProjectionFields} from './training-workload-policy.mjs';

// Explicit private-store provisioning only. No import side effects or default path.
// SQLite transactions enforce durable uniqueness; hash links detect accidental changes,
// not an administrator rewriting the DB. Owner retention/access controls remain required.
export function openDispatchAuditStore(path) {
 const file=resolve(path),parent=dirname(file);
 if(realpathSync(parent)!==parent)refuse('REAL_PRIVATE_AUDIT_DIRECTORY_REQUIRED');
 const directory=lstatSync(parent);
 if(!directory.isDirectory()||directory.uid!==process.getuid()||(directory.mode&0o777)!==0o700)refuse('OWNER_ONLY_AUDIT_DIRECTORY_REQUIRED');
 let exists=false;
 try{lstatSync(file);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!exists){const fd=openSync(file,'wx',0o600);closeSync(fd);chmodSync(file,0o600);}
 const stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o600)refuse('OWNER_ONLY_REGULAR_AUDIT_DB_REQUIRED');
 const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
 db.exec(`CREATE TABLE IF NOT EXISTS dispatch_claims (dispatch_id TEXT PRIMARY KEY, decision_ref TEXT NOT NULL, request_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS dispatch_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, dispatch_id TEXT NOT NULL, request_hash TEXT NOT NULL, record_hash TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS dispatch_audit_dispatch ON dispatch_audit(dispatch_id,sequence);`);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
 return {
  claimOnce:async claim=>transaction(()=>{
   if(!claim||Object.keys(claim).sort().join('|')!=='decisionRef|dispatchId|requestHash'||typeof claim.dispatchId!=='string'||typeof claim.decisionRef!=='string'||!/^[a-f0-9]{64}$/.test(claim.requestHash||''))refuse('EXACT_AUDIT_CLAIM_REQUIRED');
   if(db.prepare('SELECT 1 FROM dispatch_claims WHERE dispatch_id=?').get(claim.dispatchId))return null;
   db.prepare('INSERT INTO dispatch_claims VALUES (?,?,?)').run(claim.dispatchId,claim.decisionRef,claim.requestHash);
   return {...claim,claimRef:'sqlite-claim:'+claim.dispatchId};
  }),
  appendAudit:async record=>transaction(()=>{
   const {recordHash,...projection}=record||{};
   const fields=auditProjectionFields(projection);
   if(Object.keys(projection).sort().join('|')!==fields.sort().join('|')||recordHash!==dispatchHash(projection))refuse('EXACT_HASHED_DISPATCH_AUDIT_REQUIRED');
   const claim=db.prepare('SELECT * FROM dispatch_claims WHERE dispatch_id=?').get(projection.dispatchId);
   if(!claim||claim.request_hash!==projection.requestHash||claim.decision_ref!==projection.decisionRef)refuse('DURABLE_AUDIT_CLAIM_BINDING_REQUIRED');
   const previous=db.prepare('SELECT record_hash FROM dispatch_audit WHERE dispatch_id=? ORDER BY sequence DESC LIMIT 1').get(projection.dispatchId);
   if(projection.previousHash!==(previous?.record_hash||null))refuse('DURABLE_AUDIT_CHAIN_MISMATCH');
   const row=db.prepare('INSERT INTO dispatch_audit (dispatch_id,request_hash,record_hash,record_json) VALUES (?,?,?,?)').run(projection.dispatchId,projection.requestHash,recordHash,JSON.stringify(record));
   return {recordHash,auditRef:'sqlite-audit:'+String(row.lastInsertRowid)};
  }),
  readDispatch:dispatchId=>db.prepare('SELECT record_json FROM dispatch_audit WHERE dispatch_id=? ORDER BY sequence').all(dispatchId).map(row=>JSON.parse(row.record_json)),
  close:()=>db.close()
 };
}
