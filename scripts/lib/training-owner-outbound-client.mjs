import {prepareOwnerEvidence,validateOwnerPending,ownerPendingHash,OWNER_EVIDENCE_AUDIENCE} from './training-owner-approval-protocol.mjs';
import {verifyJwt} from '../../workers/training-managed/security.mjs';
import {refuse} from './training-execution-contract.mjs';
export function createOwnerOutboundResponder({issuer,keyId,publicKeys,readLocalDecision,validateIndependentObservation,claimLocalOnce,retainLocalEvidence,externalEvidenceSign,postOwnerResponse,now=()=>Math.floor(Date.now()/1000)}){
 for(const port of [readLocalDecision,validateIndependentObservation,claimLocalOnce,retainLocalEvidence,externalEvidenceSign,postOwnerResponse])if(typeof port!=='function')refuse('OWNER_ONLY_OUTBOUND_PORTS_NOT_INSTALLED');
 return async pending=>{
  const p=validateOwnerPending(pending,now());let decision;
  try{decision=await readLocalDecision({pendingHash:ownerPendingHash(p),purpose:p.read.purpose,queryHash:p.read.queryHash,actor:p.actor});}catch{refuse('OWNER_LOCAL_DECISION_READ_FAILED');}
  const input=prepareOwnerEvidence({pending:p,decision,issuer,keyId,now:now()});
  // Real Owner observer must compare active provider/request/runtime/session sources.
  // Never treat gateway-supplied value, signature, or affirmative checkbox as proof.
  let observed;try{observed=await validateIndependentObservation({pending:p,decision});}catch{refuse('OWNER_ACTIVE_OBSERVER_FAILED');}
  if(observed!==true)refuse('OWNER_ACTIVE_OBSERVER_REQUIRED');
  const claim=await claimLocalOnce({id:p.id,nonce:p.read.nonce,pendingHash:input.pendingHash,ownerDecisionRef:input.ownerDecisionRef});
  if(!claim)refuse('OWNER_LOCAL_RESPONSE_REPLAY_REFUSED');
  await retainLocalEvidence({stage:'SIGN_INTENT',pending:p,decision,signingInput:input.signingInput});
  let signature;try{signature=await externalEvidenceSign({purpose:'CREATORLOOP_TRAINING_EVIDENCE_ONLY',keyId,signingInput:input.signingInput});}catch{refuse('OWNER_EVIDENCE_SIGNER_FAILED');}
  if(typeof signature!=='string'||!/^[A-Za-z0-9_-]+$/.test(signature))refuse('OWNER_EVIDENCE_SIGNATURE_REQUIRED');
  const jws=input.signingInput+'.'+signature;
  const payload=await verifyJwt(jws,{issuer,audience:OWNER_EVIDENCE_AUDIENCE,jwks:publicKeys,now:now()});
  if(payload.pendingHash!==input.pendingHash||p.expiresAt<=now())refuse('OWNER_RESPONSE_EXPIRED_OR_SUBSTITUTED');
  await retainLocalEvidence({stage:'SIGNED_RESPONSE',pendingHash:input.pendingHash,jws});
  // No automatic retry: uncertain publication remains explicitly unresolved.
  let result;try{result=await postOwnerResponse({id:p.id,jws});}catch{refuse('OWNER_RESPONSE_PUBLICATION_UNRESOLVED_NO_RETRY');}
  await retainLocalEvidence({stage:'PUBLICATION_RESULT',pendingHash:input.pendingHash,result});return result;
 };
}
