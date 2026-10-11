import {DurableObject} from 'cloudflare:workers';
import {createOwnerApprovalRelay} from './owner-approval-relay.mjs';
import {createOwnerApprovalState} from './owner-approval-state.mjs';
export class OwnerApprovalMailbox extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.store=createOwnerApprovalState({sql:ctx.storage.sql,transactionSync:fn=>ctx.storage.transactionSync(fn)});}
 enqueue(value){return this.store.enqueue(value);}
 pending(){return this.store.pending();}
 request(id){return this.store.request(id);}
 complete(value){return this.store.complete(value);}
 response(id){return this.store.response(id);}
 exportCustody(){return this.store.exportCustody();}
}
export default createOwnerApprovalRelay();
