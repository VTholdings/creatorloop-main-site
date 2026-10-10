import {dispatchHash} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';

export function createManagedState({sql,transactionSync,bucket,now=()=>Math.floor(Date.now()/1000)}) {
 if(!sql||typeof transactionSync!=='function'||typeof bucket?.put!=='function')refuse('MANAGED_DURABLE_STORAGE_REQUIRED');
 sql.exec(`CREATE TABLE IF NOT EXISTS claims (dispatch_id TEXT PRIMARY KEY, decision_ref TEXT NOT NULL, request_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS decisions (dispatch_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, decision_json TEXT NOT NULL, retained INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, dispatch_id TEXT NOT NULL, record_hash TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL, retained INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS jobs (key TEXT PRIMARY KEY, dispatch_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS claims_no_update BEFORE UPDATE ON claims BEGIN SELECT RAISE(ABORT,'Immutable claim'); END;
 CREATE TRIGGER IF NOT EXISTS claims_no_delete BEFORE DELETE ON claims BEGIN SELECT RAISE(ABORT,'Immutable claim'); END;
 CREATE TRIGGER IF NOT EXISTS jobs_no_update BEFORE UPDATE ON jobs BEGIN SELECT RAISE(ABORT,'Immutable job'); END;
 CREATE TRIGGER IF NOT EXISTS jobs_no_delete BEFORE DELETE ON jobs BEGIN SELECT RAISE(ABORT,'Immutable job'); END;
 CREATE TRIGGER IF NOT EXISTS decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT,'Immutable decision'); END;
 CREATE TRIGGER IF NOT EXISTS decisions_body_immutable BEFORE UPDATE ON decisions WHEN NEW.dispatch_id!=OLD.dispatch_id OR NEW.request_hash!=OLD.request_hash OR NEW.decision_json!=OLD.decision_json OR NEW.retained<OLD.retained BEGIN SELECT RAISE(ABORT,'Immutable decision'); END;
 CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Immutable audit'); END;
 CREATE TRIGGER IF NOT EXISTS events_body_immutable BEFORE UPDATE ON events WHEN NEW.sequence!=OLD.sequence OR NEW.dispatch_id!=OLD.dispatch_id OR NEW.record_hash!=OLD.record_hash OR NEW.record_json!=OLD.record_json OR NEW.retained<OLD.retained BEGIN SELECT RAISE(ABORT,'Immutable audit'); END;`);
 const rows=(query,...args)=>sql.exec(query,...args).toArray();
 return {
  async putDecision({request,approval}){
   const requestHash=dispatchHash(request);
   if(approval?.requestHash!==requestHash||approval.dispatchId!==request.dispatchId||approval.expiresAt<=now())refuse('CURRENT_BOUND_MANAGED_DECISION_REQUIRED');
   transactionSync(()=>{
    if(rows('SELECT 1 FROM decisions WHERE dispatch_id=?',request.dispatchId).length)refuse('IMMUTABLE_MANAGED_DECISION_EXISTS');
    sql.exec('INSERT INTO decisions (dispatch_id,request_hash,decision_json) VALUES (?,?,?)',request.dispatchId,requestHash,JSON.stringify({request,approval}));
   });
   const projection={protocol:'CREATORLOOP_MANAGED_OWNER_DECISION_AUDIT_V1',dispatchId:request.dispatchId,decisionRef:request.decisionRef,requestHash,approvalHash:dispatchHash(approval),reviewerId:approval.reviewerId,observedAt:now()},hash=dispatchHash(projection);
   const stored=await bucket.put(`training-decisions/${request.dispatchId}/${hash}.json`,JSON.stringify({...projection,recordHash:hash}),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{sha256:hash}});
   if(!stored)refuse('OWNER_DECISION_AUDIT_NOT_RETAINED');
   transactionSync(()=>sql.exec('UPDATE decisions SET retained=1 WHERE dispatch_id=?',request.dispatchId));
   return {dispatchId:request.dispatchId,requestHash,decisionRecorded:true};
  },
  async decision(dispatchId){
   const row=rows('SELECT decision_json,retained FROM decisions WHERE dispatch_id=?',dispatchId)[0];
   if(!row||row.retained!==1)refuse('MANAGED_RETAINED_DECISION_NOT_FOUND');return JSON.parse(row.decision_json);
  },
  async claimOnce(claim){
   return transactionSync(()=>{
    if(!claim||typeof claim.dispatchId!=='string'||typeof claim.decisionRef!=='string'||!/^[a-f0-9]{64}$/.test(claim.requestHash||''))refuse('BOUND_DURABLE_CLAIM_REQUIRED');
    if(rows('SELECT 1 FROM claims WHERE dispatch_id=?',claim.dispatchId).length)return null;
    sql.exec('INSERT INTO claims VALUES (?,?,?)',claim.dispatchId,claim.decisionRef,claim.requestHash);
    return {...claim,claimRef:'durable-claim:'+claim.dispatchId};
   });
  },
  async claimJob({key,dispatchId,expiresAt}){
   if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||typeof dispatchId!=='string'||!Number.isInteger(expiresAt)||expiresAt<=now())refuse('EXACT_ONE_TIME_JOB_REQUIRED');
   return transactionSync(()=>{
    if(rows('SELECT 1 FROM jobs WHERE key=?',key).length)refuse('MANAGED_JOB_REPLAY_REFUSED');
    sql.exec('INSERT INTO jobs VALUES (?,?,?)',key,dispatchId,expiresAt);return {claimed:true};
   });
  },
  async appendAudit(record){
   const {recordHash,...projection}=record||{};
   const fields=['protocol','dispatchId','decisionRef','requestHash','bodyHash','workflowFile','branch','executionSha','callerLogin','callerId','humanCustodianRef','claimRef','observedAt','outcome','previousHash',...(Object.hasOwn(projection,'runId')?['runId']:[])];
   if(Object.keys(projection).sort().join('|')!==fields.sort().join('|')||projection.protocol!=='CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1'||recordHash!==dispatchHash(projection)||!Number.isInteger(projection.observedAt)||projection.observedAt>now())refuse('EXACT_SANITIZED_AUDIT_REQUIRED');
   const sequence=transactionSync(()=>{
    const claim=rows('SELECT * FROM claims WHERE dispatch_id=?',projection.dispatchId)[0];
    if(!claim||claim.request_hash!==projection.requestHash||claim.decision_ref!==projection.decisionRef)refuse('MANAGED_AUDIT_CLAIM_MISMATCH');
    const previous=rows('SELECT record_hash FROM events WHERE dispatch_id=? ORDER BY sequence DESC LIMIT 1',projection.dispatchId)[0];
    if(projection.previousHash!==(previous?.record_hash||null))refuse('MANAGED_AUDIT_CHAIN_MISMATCH');
    sql.exec('INSERT INTO events (dispatch_id,record_hash,record_json) VALUES (?,?,?)',projection.dispatchId,recordHash,JSON.stringify(record));
    return rows('SELECT sequence FROM events WHERE record_hash=?',recordHash)[0].sequence;
   });
   // Durable Object state is committed first. R2 failure leaves an explicit retained=0
   // record and prevents the caller from proceeding; mutation must never be retried.
   const key=`training-audit/${projection.dispatchId}/${sequence}-${recordHash}.json`;
   const stored=await bucket.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{sha256:recordHash}});
   if(!stored)refuse('RESTRICTED_R2_AUDIT_NOT_RETAINED');
   transactionSync(()=>sql.exec('UPDATE events SET retained=1 WHERE record_hash=?',recordHash));
   return {recordHash,auditRef:'r2:'+key};
  },
  async retainedEvents(dispatchId){
   const entries=rows('SELECT record_json,retained FROM events WHERE dispatch_id=? ORDER BY sequence',dispatchId);
   if(entries.some(row=>row.retained!==1))refuse('MANAGED_AUDIT_RETENTION_INCOMPLETE');
   return entries.map(row=>JSON.parse(row.record_json));
  }
 };
}
