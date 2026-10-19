import {webcrypto} from 'node:crypto';
import {TRAINING_TARGET,validateManifest,fence,sha256,verifyRuntime,verifySession,refuse} from './training-execution-contract.mjs';

export async function validatePublicVerifierKeys(keys) {
 if(!Array.isArray(keys)||!keys.length||new Set(keys.map(k=>k?.kid)).size!==keys.length)refuse('PUBLIC_KEY_SET_REFUSED');
 const normalized=[];
 for(const k of keys){
  if(!k||typeof k.kid!=='string'||!k.kid||k.kty!=='RSA'||['d','p','q','dp','dq','qi','oth'].some(f=>Object.hasOwn(k,f))||!(/^[A-Za-z0-9_-]+$/.test(k.n||''))||k.e!=='AQAB')refuse('PUBLIC_ONLY_RSA_KEY_REQUIRED');
  const modulus=Buffer.from(k.n,'base64url');if(modulus.length<256||BigInt('0x'+modulus.toString('hex')).toString(2).length<2048)refuse('RSA_KEY_TOO_SMALL');
  const jwk={kid:k.kid,kty:'RSA',n:k.n,e:k.e,alg:'RS256',key_ops:['verify'],ext:true};
  try{await webcrypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);}catch{refuse('RSA_PUBLIC_IMPORT_FAILED');}
  normalized.push(jwk);
 }
 return normalized;
}
export async function createTrainingSigner({manifest,publicJwk,readCurrentRequest,verifyApproval,independentEvidence,externalSign,now=()=>Math.floor(Date.now()/1000)}) {
 for(const port of [readCurrentRequest,verifyApproval,independentEvidence,externalSign])if(typeof port!=='function')refuse('INDEPENDENT_SIGNER_PORTS_REQUIRED');
 const m=structuredClone(manifest);validateManifest(m,now());
 const [jwk]=await validatePublicVerifierKeys([publicJwk]);
 if(jwk.kid!==m.keyId||sha256(JSON.stringify({e:jwk.e,kty:jwk.kty,n:jwk.n}))!==m.publicJwkSha256)refuse('PUBLIC_SIGNER_FINGERPRINT_MISMATCH');
 const publicKey=await webcrypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return async payload=>{
  if(typeof payload!=='string'||payload.length>10000||!/^[A-Za-z0-9_-]+$/.test(payload))refuse('RECEIPT_PAYLOAD_INVALID');
  let r;try{r=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{refuse('RECEIPT_PAYLOAD_INVALID');}
  const fields=['protocol','requestId','operatorId','email','operation','environment','audience','databaseId','deploymentId','requestVersion','observedAt','expiresAt','evidenceHash','policyId','subject','policyVerified','sessionVerified',...(m.operation==='REVOKE'?['revokedBefore']:[])];
  if(Object.keys(r).sort().join(',')!==fields.sort().join(',')||r.protocol!=='CREATORLOOP_EDGE_V1'||r.requestId!==m.requestId||r.operation!==m.operation||r.operatorId!==m.subject.operatorId||r.email!==m.subject.email||r.subject!==m.subject.subject||r.requestVersion!==m.requestVersion||r.environment!=='TRAINING'||r.audience!==TRAINING_TARGET.audience||r.databaseId!==TRAINING_TARGET.databaseId||r.deploymentId!==TRAINING_TARGET.deploymentId||r.policyVerified!==true||r.sessionVerified!==true||!Number.isInteger(r.observedAt)||r.observedAt<now()-300||r.observedAt>now()||r.expiresAt!==r.observedAt+86400||!Number.isInteger(r.expiresAt))refuse('UNAPPROVED_RECEIPT_PAYLOAD');
  const current=await readCurrentRequest(r.operatorId);
  const request=current?.request;
  await fence(request,m,{readCurrentRequest,verifyApproval,now});
  if(r.observedAt<request.requestedAt)refuse('RECEIPT_PREDATES_REQUEST');
  // Must be independently obtained by signer principal, not supplied by executor.
  const proof=await independentEvidence(structuredClone(request));
  if(!proof||proof.observerPrincipal!==m.signerPrincipal||proof.ownerPolicyUnchanged!==true||proof.servicePoliciesUnchanged!==true||proof.policyVerified!==true||proof.policyId!==r.policyId||typeof proof.policyId!=='string'||!proof.policyId)refuse('INDEPENDENT_POLICY_PROOF_REQUIRED');
  verifyRuntime(proof.runtime,m,now());verifySession(proof.session,request,m,now());
  const projection={email:m.subject.email,operation:r.operation,environment:'TRAINING',audience:TRAINING_TARGET.audience,databaseId:TRAINING_TARGET.databaseId,deploymentId:TRAINING_TARGET.deploymentId,policyId:proof.policyId,subject:m.subject.subject,policyVerified:true,sessionVerified:true,ownerPolicyUnchanged:true,servicePoliciesUnchanged:true,...(r.operation==='REVOKE'?{revokedBefore:proof.session.revokedBefore}:{})};
  if(sha256(projection)!==r.evidenceHash||r.operation==='REVOKE'&&r.revokedBefore!==proof.session.revokedBefore)refuse('INDEPENDENT_EVIDENCE_HASH_MISMATCH');
  let result;
  try{result=await externalSign({keyRef:m.signerKeyRef,keyId:m.keyId,algorithm:'RSASSA-PKCS1-v1_5',hash:'SHA-256',payload});}catch{refuse('PRIVATE_SIGNER_FAILED');}
  if(!result||result.keyId!==m.keyId||typeof result.signature!=='string'||!/^[A-Za-z0-9_-]+$/.test(result.signature)||!await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,Buffer.from(result.signature,'base64url'),Buffer.from(payload,'ascii')))refuse('EXTERNAL_SIGNATURE_NOT_VERIFIED');
  await fence(request,m,{readCurrentRequest,verifyApproval,now});
  return {keyId:result.keyId,signature:result.signature};
 };
}
