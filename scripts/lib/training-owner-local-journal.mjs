import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {dispatchHash} from './training-mediated-dispatcher.mjs';
import {refuse} from './training-execution-contract.mjs';
export function createOwnerLocalJournal(directory){
 const s=lstatSync(directory);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077)||realpathSync(directory)!==directory)refuse('OWNER_LOCAL_JOURNAL_DIRECTORY_REQUIRED');
 const path=join(directory,'owner-response-claims.sqlite');
 try{const fd=openSync(path,'wx',0o600);closeSync(fd);}catch(e){if(e.code!=='EEXIST')throw e;}
 const f=lstatSync(path);if(f.isSymbolicLink()||!f.isFile()||f.uid!==process.getuid()||(f.mode&0o077))refuse('OWNER_LOCAL_JOURNAL_FILE_REQUIRED');
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS responses(id TEXT PRIMARY KEY,nonce TEXT NOT NULL UNIQUE,pending_hash TEXT NOT NULL,decision_ref TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS evidence(sequence INTEGER PRIMARY KEY AUTOINCREMENT,previous_hash TEXT,record_hash TEXT NOT NULL UNIQUE,body TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS response_no_update BEFORE UPDATE ON responses BEGIN SELECT RAISE(ABORT,'Immutable Owner claim');END;
 CREATE TRIGGER IF NOT EXISTS response_no_delete BEFORE DELETE ON responses BEGIN SELECT RAISE(ABORT,'Immutable Owner claim');END;
 CREATE TRIGGER IF NOT EXISTS evidence_no_update BEFORE UPDATE ON evidence BEGIN SELECT RAISE(ABORT,'Immutable Owner evidence');END;
 CREATE TRIGGER IF NOT EXISTS evidence_no_delete BEFORE DELETE ON evidence BEGIN SELECT RAISE(ABORT,'Immutable Owner evidence');END;`);
 return {
  async claimLocalOnce(v){db.exec('BEGIN IMMEDIATE');try{if(db.prepare('SELECT 1 FROM responses WHERE id=? OR nonce=?').get(v.id,v.nonce)){db.exec('ROLLBACK');return null;}db.prepare('INSERT INTO responses VALUES(?,?,?,?)').run(v.id,v.nonce,v.pendingHash,v.ownerDecisionRef);db.exec('COMMIT');return {claimed:true};}catch{db.exec('ROLLBACK');refuse('OWNER_LOCAL_DURABLE_CLAIM_FAILED');}},
  async retainLocalEvidence(value){const previous=db.prepare('SELECT record_hash FROM evidence ORDER BY sequence DESC LIMIT 1').get()?.record_hash||null;const body=JSON.stringify({previousHash:previous,value}),hash=dispatchHash({previousHash:previous,value});db.prepare('INSERT INTO evidence(previous_hash,record_hash,body) VALUES(?,?,?)').run(previous,hash,body);return {recordHash:hash};},
  exportCustody(){const snapshot={protocol:'CREATORLOOP_OWNER_LOCAL_JOURNAL_V1',claims:db.prepare('SELECT * FROM responses ORDER BY rowid').all(),evidence:db.prepare('SELECT * FROM evidence ORDER BY sequence').all()};return {...snapshot,snapshotHash:dispatchHash(snapshot)};},
  close(){db.close();}
 };
}
