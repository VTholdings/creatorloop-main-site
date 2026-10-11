import {dispatchHash} from './training-mediated-dispatcher.mjs';
import {refuse} from './training-execution-contract.mjs';
export const OWNER_EVIDENCE_AUDIENCE='CREATORLOOP_TRAINING_EVIDENCE';
export const OWNER_READ_PURPOSES=['commissioning','dispatchApproval','runApproval','executionBundle','providerApproval','providerCapability','providerScope','currentRequest','runtime','session','custodyExport'];
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...k].sort().join('|');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function validateOwnerRead(read){
 if(!exact(read,['protocol','purpose','query','queryHash','nonce'])||read.protocol!=='CREATORLOOP_INDEPENDENT_READ_V1'||!OWNER_READ_PURPOSES.includes(read.purpose)||!uuid(read.nonce)||!read.query||typeof read.query!=='object'||Array.isArray(read.query)||read.queryHash!==dispatchHash(read.query)||JSON.stringify(read).length>32768)refuse('EXACT_EXISTING_OWNER_READ_REQUIRED');
 return structuredClone(read);
}
export function validateOwnerPending(p,now){
 if(!exact(p,['protocol','environment','id','read','actor','createdAt','expiresAt'])||p.protocol!=='CREATORLOOP_OWNER_OUTBOUND_PENDING_V1'||p.environment!=='TRAINING'||!uuid(p.id)||!Number.isInteger(p.createdAt)||!Number.isInteger(p.expiresAt)||p.createdAt>now||p.expiresAt<=now||p.expiresAt-p.createdAt>30||!exact(p.actor,['role','principalRef'])||!['owner','executor','job','metadata-reader'].includes(p.actor.role)||typeof p.actor.principalRef!=='string'||!p.actor.principalRef)refuse('BOUNDED_TRAINING_OWNER_PENDING_REQUIRED');
 validateOwnerRead(p.read);return structuredClone(p);
}
export function ownerPendingHash(p){return dispatchHash(p);}
export function prepareOwnerEvidence({pending,decision,issuer,keyId,now}){
 const p=validateOwnerPending(pending,now),r=p.read;
 if(!exact(decision,['protocol','environment','pendingHash','purpose','queryHash','nonce','actor','ownerDecisionRef','observedAt','expiresAt','value'])||decision.protocol!=='CREATORLOOP_OWNER_LOCAL_EVIDENCE_DECISION_V1'||decision.environment!=='TRAINING'||decision.pendingHash!==ownerPendingHash(p)||decision.purpose!==r.purpose||decision.queryHash!==r.queryHash||decision.nonce!==r.nonce||dispatchHash(decision.actor)!==dispatchHash(p.actor)||typeof decision.ownerDecisionRef!=='string'||!decision.ownerDecisionRef||!Number.isInteger(decision.observedAt)||decision.observedAt>now||decision.observedAt<now-300||!Number.isInteger(decision.expiresAt)||decision.expiresAt<=now||decision.expiresAt-decision.observedAt>300||!Object.hasOwn(decision,'value')||typeof issuer!=='string'||!issuer||typeof keyId!=='string'||!keyId||keyId.length>100)refuse('OWNER_INDEPENDENT_CURRENT_DECISION_REQUIRED');
 const payload={iss:issuer,aud:OWNER_EVIDENCE_AUDIENCE,iat:now,exp:Math.min(now+300,decision.expiresAt),purpose:r.purpose,queryHash:r.queryHash,nonce:r.nonce,value:structuredClone(decision.value),ownerDecisionRef:decision.ownerDecisionRef,pendingHash:ownerPendingHash(p)};
 const header={alg:'RS256',kid:keyId};
 const signingInput=Buffer.from(JSON.stringify(header)).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
 if(signingInput.length>14000)refuse('OWNER_EVIDENCE_EXCEEDS_EXISTING_VERIFIER_LIMIT');
 return {signingInput,payload,pendingHash:ownerPendingHash(p),ownerDecisionRef:decision.ownerDecisionRef};
}
