import {DurableObject} from 'cloudflare:workers';
import {createCapability} from './capability-core.mjs';
import {createManagedState} from './state.mjs';
import {captureCustodySnapshot,validateCustodySnapshot} from './custody-snapshot.mjs';
import {CUSTODY_BODY_LIMIT} from './custody-export.mjs';
import {dispatchHash} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';

export default createCapability();
export class TrainingExecutionState extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  this.store=createManagedState({sql:ctx.storage.sql,transactionSync:fn=>ctx.storage.transactionSync(fn),bucket:env.EVIDENCE});
  this.custodyContext=ctx;this.custodyBucket=env.EVIDENCE;
 }
 putDecision(value){return this.store.putDecision(value);}
 decision(id){return this.store.decision(id);}
 claimOnce(value){return this.store.claimOnce(value);}
 claimJob(value){return this.store.claimJob(value);}
 appendAudit(value){return this.store.appendAudit(value);}
 retainedEvents(id){return this.store.retainedEvents(id);}
 async exportCustody({request,authority}){
  if(!authority||authority.requestHash!==dispatchHash(request)||authority.versionId!==request.expectedVersionId||!Number.isSafeInteger(authority.ownerId)||authority.expiresAt<=Math.floor(Date.now()/1000))refuse('BOUND_OWNER_EXPORT_AUTHORITY_REQUIRED');
  const snapshot=captureCustodySnapshot({sql:this.custodyContext.storage.sql,transactionSync:fn=>this.custodyContext.storage.transactionSync(fn)});
  const summary=validateCustodySnapshot(snapshot);
  const receipt={protocol:'CREATORLOOP_OWNER_CUSTODY_EXPORT_RECEIPT_V1',exportId:request.exportId,decisionRef:request.decisionRef,ownerId:authority.ownerId,versionId:authority.versionId,configHash:authority.configHash,requestHash:authority.requestHash,approvalHash:authority.approvalHash,snapshotHash:snapshot.snapshotHash,observedAt:snapshot.observedAt,counts:summary.counts};
  const result={snapshot,receipt:{...receipt,receiptHash:dispatchHash(receipt)}};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>CUSTODY_BODY_LIMIT)refuse('COMPLETE_EXPORT_TOO_LARGE_NO_PARTIAL_COPY');
  const ack=await this.custodyBucket.put(`training-custody/${request.exportId}.json`,JSON.stringify(result.receipt),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{sha256:result.receipt.receiptHash}});
  if(!ack||authority.expiresAt<=Math.floor(Date.now()/1000))refuse('CUSTODY_EXPORT_RECEIPT_NOT_RETAINED');
  return result;
 }
 // No public fetch handler, key storage, generic SQL, delete, reset or approval-writing API.
}
