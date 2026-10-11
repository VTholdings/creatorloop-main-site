import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,writeFile,chmod,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createManagedState} from '../workers/training-managed/state.mjs';
import {captureCustodySnapshot} from '../workers/training-managed/custody-snapshot.mjs';
import {recoverIsolatedCustody} from '../workers/training-managed/custody-recovery.mjs';
import {recoverSavedCustody} from '../scripts/execution/recover-managed-custody-local.mjs';
import {dispatchHash} from '../scripts/lib/training-mediated-dispatcher.mjs';
function database(){
 const db=new DatabaseSync(':memory:');
 const sql={exec:(q,...args)=>{if(q.includes('CREATE TABLE')){db.exec(q);return {toArray:()=>[]};}const s=db.prepare(q),rows=q.startsWith('SELECT')?s.all(...args):(s.run(...args),[]);return {toArray:()=>rows};}};
 const transactionSync=fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const state=createManagedState({sql,transactionSync,bucket:{put:async()=>({etag:'fictional'})},now:()=>200});return {db,sql,transactionSync,state};
}
async function populated(){
 const f=database(),r={dispatchId:'11111111-1111-1111-1111-111111111111',decisionRef:'FICTIONAL-OWNER',lane:'provider',executionSha:'a'.repeat(40),inputs:{intended_operation:'ADMIT',owner_decision_ref:'FICTIONAL-OWNER',owner_reviewer_id:'77',approved_port_sha256:'b'.repeat(64)}};
 await f.state.putDecision({request:r,approval:{dispatchId:r.dispatchId,requestHash:dispatchHash(r),expiresAt:400,reviewerId:77}});
 const claim={dispatchId:r.dispatchId,decisionRef:r.decisionRef,requestHash:dispatchHash(r)};await f.state.claimOnce(claim);
 const record={protocol:'CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1',dispatchId:r.dispatchId,decisionRef:r.decisionRef,requestHash:claim.requestHash,bodyHash:'b'.repeat(64),workflowFile:'step18-training-provider-workflow.yml',branch:'team-access-directory',executionSha:r.executionSha,callerLogin:'fictional',callerId:1,humanCustodianRef:'FICTIONAL',claimRef:'fictional',observedAt:200,outcome:'OUTCOME_UNKNOWN_NO_RETRY',previousHash:null};
 await f.state.appendAudit({...record,recordHash:dispatchHash(record)});await f.state.claimJob({key:'c'.repeat(64),dispatchId:r.dispatchId,expiresAt:250});
 f.snapshot=captureCustodySnapshot({...f,now:()=>300});f.claim=claim;return f;
}
const rehash=s=>{const {snapshotHash,...p}=s;return {...p,snapshotHash:dispatchHash(p)};};
test('isolated recovery restores all tables/sequence and still rejects consumed dispatch and expired job replay',async()=>{
 const source=await populated(),target=database();try{
  const result=recoverIsolatedCustody({snapshot:source.snapshot,expectedHash:source.snapshot.snapshotHash,...target,now:()=>400});
  assert.equal(result.result.isolatedRecoveryVerified,true);assert.equal(result.result.activationAuthorized,false);
  assert.equal(await target.state.claimOnce(source.claim),null);
  await assert.rejects(target.state.claimJob({key:'c'.repeat(64),dispatchId:source.claim.dispatchId,expiresAt:500}),/REPLAY/);
  assert.equal((await target.state.retainedEvents(source.claim.dispatchId))[0].outcome,'OUTCOME_UNKNOWN_NO_RETRY');
  assert.throws(()=>target.db.exec('DELETE FROM claims'),/Immutable/);assert.throws(()=>target.db.exec('DELETE FROM events'),/Immutable/);
 }finally{source.db.close();target.db.close();}
});
test('recovery refuses altered imported schema without executing SQL or losing the empty target',async()=>{
 const source=await populated(),target=database();try{
  const s=structuredClone(source.snapshot);s.schema[0].sql+='; DROP TABLE claims;';const changed=rehash(s);
  assert.throws(()=>recoverIsolatedCustody({snapshot:changed,expectedHash:changed.snapshotHash,...target}),/PINNED_SCHEMA/);
  assert.equal(target.db.prepare('SELECT COUNT(*) AS n FROM claims').get().n,0);
 }finally{source.db.close();target.db.close();}
});
test('recovery refuses substituted Owner hash and nonempty target without overwriting',async()=>{
 const source=await populated(),target=database();try{
  assert.throws(()=>recoverIsolatedCustody({snapshot:source.snapshot,expectedHash:'f'.repeat(64),...target}),/OWNER_HELD/);
  await target.state.claimOnce(source.claim);
  assert.throws(()=>recoverIsolatedCustody({snapshot:source.snapshot,expectedHash:source.snapshot.snapshotHash,...target}),/EMPTY/);
  assert.equal(target.db.prepare('SELECT COUNT(*) AS n FROM claims').get().n,1);
 }finally{source.db.close();target.db.close();}
});
test('Owner offline file drill produces restricted SQLite copy and never overwrites an existing destination',async()=>{
 const source=await populated(),root=await mkdtemp(join(tmpdir(),'vt-custody-new-drill-'));await chmod(root,0o700);
 try{
  const input=join(root,'source.json'),output=join(root,'isolated.sqlite');await writeFile(input,JSON.stringify(source.snapshot),{mode:0o600});
  const result=await recoverSavedCustody({input,output,expectedHash:source.snapshot.snapshotHash});assert.equal(result.isolatedRecoveryVerified,true);assert.equal((await stat(output)).mode&0o777,0o600);
  await assert.rejects(recoverSavedCustody({input,output,expectedHash:source.snapshot.snapshotHash}),/EEXIST/);
  const copy=new DatabaseSync(output,{readOnly:true});assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,1);copy.close();
 }finally{source.db.close();await rm(root,{recursive:true,force:true});}
});
