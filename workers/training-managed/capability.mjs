import {DurableObject} from 'cloudflare:workers';
import {createCapability} from './capability-core.mjs';
import {createManagedState} from './state.mjs';

export default createCapability();
export class TrainingExecutionState extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  this.store=createManagedState({sql:ctx.storage.sql,transactionSync:fn=>ctx.storage.transactionSync(fn),bucket:env.EVIDENCE});
 }
 putDecision(value){return this.store.putDecision(value);}
 decision(id){return this.store.decision(id);}
 claimOnce(value){return this.store.claimOnce(value);}
 claimJob(value){return this.store.claimJob(value);}
 appendAudit(value){return this.store.appendAudit(value);}
 retainedEvents(id){return this.store.retainedEvents(id);}
 // No public fetch handler, key storage, generic SQL, delete, reset or approval-writing API.
}
