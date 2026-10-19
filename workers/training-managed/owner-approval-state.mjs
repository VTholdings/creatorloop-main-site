import {dispatchHash} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {validateOwnerRead,validateOwnerPending,ownerPendingHash} from '../../scripts/lib/training-owner-approval-protocol.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
export function createOwnerApprovalState({sql,transactionSync,now=()=>Math.floor(Date.now()/1000)}){
 if(!sql||typeof transactionSync!=='function')refuse('OWNER_MAILBOX_STORAGE_REQUIRED');
 sql.exec(`CREATE TABLE IF NOT EXISTS owner_pending(id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, body TEXT NOT NULL, body_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS owner_responses(id TEXT PRIMARY KEY, pending_hash TEXT NOT NULL, jws TEXT NOT NULL, response_hash TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS owner_pending_no_update BEFORE UPDATE ON owner_pending BEGIN SELECT RAISE(ABORT,'Immutable Owner request'); END;
 CREATE TRIGGER IF NOT EXISTS owner_pending_no_delete BEFORE DELETE ON owner_pending BEGIN SELECT RAISE(ABORT,'Immutable Owner request'); END;
 CREATE TRIGGER IF NOT EXISTS owner_responses_no_update BEFORE UPDATE ON owner_responses BEGIN SELECT RAISE(ABORT,'Immutable Owner response'); END;
 CREATE TRIGGER IF NOT EXISTS owner_responses_no_delete BEFORE DELETE ON owner_responses BEGIN SELECT RAISE(ABORT,'Immutable Owner response'); END;`);
 const rows=(s,...args)=>sql.exec(s,...args).toArray();
 return {
  async enqueue({read,actor}){validateOwnerRead(read);const t=now();return transactionSync(()=>{
   if(rows('SELECT 1 FROM owner_pending WHERE nonce=?',read.nonce).length)refuse('OWNER_READ_NONCE_REPLAY');
   if(rows('SELECT COUNT(*) AS n FROM owner_pending WHERE expires_at>? AND id NOT IN(SELECT id FROM owner_responses)',t)[0].n>=100)refuse('OWNER_MAILBOX_CAPACITY_REFUSED');
   const pending={protocol:'CREATORLOOP_OWNER_OUTBOUND_PENDING_V1',environment:'TRAINING',id:crypto.randomUUID(),read,actor,createdAt:t,expiresAt:t+30};validateOwnerPending(pending,t);
   sql.exec('INSERT INTO owner_pending VALUES(?,?,?,?,?)',pending.id,read.nonce,JSON.stringify(pending),ownerPendingHash(pending),pending.expiresAt);return pending;
  });},
  async pending(){return rows('SELECT body FROM owner_pending WHERE expires_at>? AND id NOT IN(SELECT id FROM owner_responses) ORDER BY rowid LIMIT 20',now()).map(r=>JSON.parse(r.body));},
  async request(id){const r=rows('SELECT body FROM owner_pending WHERE id=?',id)[0];if(!r)refuse('OWNER_PENDING_NOT_FOUND');return JSON.parse(r.body);},
  async complete({id,pendingHash,jws}){return transactionSync(()=>{const row=rows('SELECT body,body_hash,expires_at FROM owner_pending WHERE id=?',id)[0];if(!row||row.body_hash!==pendingHash||row.expires_at<=now()||typeof jws!=='string'||jws.length>16384)refuse('OWNER_COMPLETION_BOUND_OR_FRESHNESS_REFUSED');if(rows('SELECT 1 FROM owner_responses WHERE id=?',id).length)refuse('OWNER_COMPLETION_REPLAY_REFUSED');const responseHash=dispatchHash(jws);sql.exec('INSERT INTO owner_responses VALUES(?,?,?,?)',id,pendingHash,jws,responseHash);return {id,pendingHash,responseHash};});},
  async response(id){const r=rows('SELECT jws FROM owner_responses WHERE id=?',id)[0];return r?{jws:r.jws}:null;},
  async exportCustody(){return transactionSync(()=>{const payload={protocol:'CREATORLOOP_OWNER_MAILBOX_CUSTODY_V1',environment:'TRAINING',observedAt:now(),pending:rows('SELECT * FROM owner_pending ORDER BY rowid'),responses:rows('SELECT * FROM owner_responses ORDER BY rowid')};return {...payload,snapshotHash:dispatchHash(payload)};});}
 };
}
