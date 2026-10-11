import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createManagedState} from '../workers/training-managed/state.mjs';
import {captureCustodySnapshot,validateCustodySnapshot,compareCustodySnapshots} from '../workers/training-managed/custody-snapshot.mjs';
import {dispatchHash} from '../scripts/lib/training-mediated-dispatcher.mjs';
function fixture(){
 const db=new DatabaseSync(':memory:');
 const sql={exec:(q,...args)=>{
  if(q.includes('CREATE TABLE')){db.exec(q);return {toArray:()=>[]};}
  const stmt=db.prepare(q),rows=q.startsWith('SELECT')?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows};
 }};
 const transactionSync=fn=>{db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 createManagedState({sql,transactionSync,bucket:{put:async()=>({etag:'FICTIONAL'})},now:()=>200});
 const request={dispatchId:'11111111-1111-1111-1111-111111111111',decisionRef:'FICTIONAL-OWNER',lane:'provider',executionSha:'a'.repeat(40),inputs:{intended_operation:'ADMIT',owner_decision_ref:'FICTIONAL-OWNER',owner_reviewer_id:'77',approved_port_sha256:'b'.repeat(64)}};
 const requestHash=dispatchHash(request),approval={dispatchId:request.dispatchId,requestHash};
 db.prepare('INSERT INTO decisions VALUES (?,?,?,?)').run(request.dispatchId,requestHash,JSON.stringify({request,approval}),0);
 db.prepare('INSERT INTO claims VALUES (?,?,?)').run(request.dispatchId,request.decisionRef,requestHash);
 const record={protocol:'CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1',dispatchId:request.dispatchId,decisionRef:request.decisionRef,requestHash,previousHash:null,outcome:'OUTCOME_UNKNOWN_NO_RETRY'};
 const recordHash=dispatchHash(record);db.prepare('INSERT INTO events (dispatch_id,record_hash,record_json,retained) VALUES (?,?,?,?)').run(request.dispatchId,recordHash,JSON.stringify({...record,recordHash}),0);
 db.prepare('INSERT INTO jobs VALUES (?,?,?)').run('c'.repeat(64),request.dispatchId,100);
 return {db,sql,transactionSync};
}
const rehash=s=>{const {snapshotHash,...payload}=s;return {...payload,snapshotHash:dispatchHash(payload)};};
test('custody snapshot captures complete expired replay claims, unretained outcomes, decisions and immutable schema without changing state',()=>{
 const f=fixture();try{
  const before=f.db.prepare('SELECT total_changes() AS n').get().n;
  const snapshot=captureCustodySnapshot({...f,now:()=>200}),result=validateCustodySnapshot(snapshot);
  assert.deepEqual(result.counts,{claims:1,decisions:1,events:1,jobs:1});assert.equal(result.unretainedEvents,1);assert.equal(result.unretainedDecisions,1);assert.equal(result.recoveryAccepted,false);
  assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,before);assert.equal(snapshot.sqliteSequence[0].seq,1);
 }finally{f.db.close();}
});
test('custody snapshot refuses tampered hash, missing claim, broken chain, duplicate replay and missing schema guards',()=>{
 const f=fixture();try{
  const snapshot=captureCustodySnapshot({...f,now:()=>200});
  const tampered=structuredClone(snapshot);tampered.tables.jobs=[];assert.throws(()=>validateCustodySnapshot(tampered),/HASH/);
  for(const change of [s=>s.tables.claims=[],s=>s.tables.jobs.push(s.tables.jobs[0]),s=>s.schema=s.schema.filter(r=>r.name!=='claims_no_delete'),s=>s.sqliteSequence[0].seq=0]){
   const s=structuredClone(snapshot);change(s);assert.throws(()=>validateCustodySnapshot(rehash(s)));
  }
 }finally{f.db.close();}
});
test('custody comparison ignores capture time but rejects lost replay claims and altered immutable schema',()=>{
 const f=fixture();try{
  const original=captureCustodySnapshot({...f,now:()=>200}),second=captureCustodySnapshot({...f,now:()=>201});
  assert.equal(compareCustodySnapshots(original,second).contentMatched,true);assert.equal(compareCustodySnapshots(original,second).protectedRestorePerformed,false);
  const changed=structuredClone(second);changed.tables.jobs=[];assert.throws(()=>compareCustodySnapshots(original,rehash(changed)),/CONTENT_MISMATCH/);
 }finally{f.db.close();}
});
