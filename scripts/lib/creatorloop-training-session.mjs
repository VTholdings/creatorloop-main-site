import {webcrypto} from 'node:crypto';
import {TRAINING_TARGET,validateManifest,validateRequest,refuse} from './training-execution-contract.mjs';
const issuer='https://shiny-wildflower-143c.cloudflareaccess.com';
const decode=part=>JSON.parse(Buffer.from(part,'base64url').toString('utf8'));
export function createTrainingSessionObserver({manifest,obtainIndividualToken,fetchAccessPublicKeys,corroborateIdentity,probeRevokedSessions,now=()=>Math.floor(Date.now()/1000)}) {
 const m=structuredClone(manifest);validateManifest(m,now());
 for(const port of [obtainIndividualToken,fetchAccessPublicKeys,corroborateIdentity,probeRevokedSessions])if(typeof port!=='function')refuse('PRIVATE_SESSION_PORTS_REQUIRED');
 return async request=>{
  validateRequest(request,m,now());
  if(request.operation==='REVOKE'){
   // Private observer must actively test both the old application session and a new
   // individual authentication attempt, not merely inspect a token's expiry.
   const result=await probeRevokedSessions({email:m.subject.email,subject:m.subject.subject,appId:TRAINING_TARGET.appId,requestId:request.id,requestedAt:request.requestedAt});
   if(!result||result.observerPrincipal!==m.signerPrincipal||result.email!==m.subject.email||result.subject!==m.subject.subject||result.appId!==TRAINING_TARGET.appId||result.oldSessionDenied!==true||result.freshLoginDenied!==true||result.independentlyVerified!==true||!Number.isInteger(result.revokedBefore)||result.revokedBefore<request.requestedAt||result.revokedBefore>now())refuse('ACTIVE_INDIVIDUAL_DENIAL_PROOF_REQUIRED');
   return {operation:'REVOKE',email:m.subject.email,subject:m.subject.subject,environment:'TRAINING',audience:TRAINING_TARGET.audience,issuer,identityBased:true,independentlyVerified:true,observedAt:now(),oldSessionDenied:true,freshLoginDenied:true,revokedBefore:result.revokedBefore};
  }
  let token=await obtainIndividualToken({email:m.subject.email,subject:m.subject.subject,requestId:request.id});
  try{
   if(typeof token!=='string'||token.length>16384||token.split('.').length!==3)refuse('INDIVIDUAL_TOKEN_REQUIRED');
   const parts=token.split('.');if(parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))refuse('TOKEN_ENCODING_REFUSED');
   const header=decode(parts[0]),claims=decode(parts[1]),time=now();
   if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(TRAINING_TARGET.audience)||claims.email!==m.subject.email||claims.sub!==m.subject.subject||claims.type!=='app'||typeof claims.identity_nonce!=='string'||!claims.identity_nonce||claims.common_name!==undefined||!Number.isInteger(claims.exp)||claims.exp<=time||!Number.isInteger(claims.iat)||claims.iat<request.requestedAt||claims.iat>time||claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>time))refuse('FRESH_INDIVIDUAL_ACCESS_CLAIMS_REFUSED');
   const keys=await fetchAccessPublicKeys({issuer,endpoint:issuer+'/cdn-cgi/access/certs'});
   if(!Array.isArray(keys)||keys.filter(k=>k.kid===header.kid).length!==1)refuse('ACCESS_PUBLIC_KEY_NOT_CORROBORATED');
   const jwk=keys.find(k=>k.kid===header.kid);
   if(jwk.kty!=='RSA'||['d','p','q','dp','dq','qi','oth'].some(k=>Object.hasOwn(jwk,k)))refuse('ACCESS_PUBLIC_KEY_REFUSED');
   const key=await webcrypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
   if(!await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5',key,Buffer.from(parts[2],'base64url'),Buffer.from(parts[0]+'.'+parts[1],'ascii')))refuse('ACCESS_SIGNATURE_INVALID');
   const identity=await corroborateIdentity({endpoint:issuer+'/cdn-cgi/access/get-identity',token});
   if(!identity||identity.email!==m.subject.email||identity.user_uuid!==m.subject.subject||identity.account_id!==TRAINING_TARGET.accountId||identity.service_token_status===true||identity.service_token_id||identity.independentlyVerified!==true)refuse('EDGE_IDENTITY_NOT_CORROBORATED');
   return {operation:'ADMIT',email:m.subject.email,subject:m.subject.subject,environment:'TRAINING',audience:TRAINING_TARGET.audience,issuer,identityBased:true,independentlyVerified:true,observedAt:now(),freshLoginVerified:true,signatureVerified:true,issuedAt:claims.iat,expiresAt:claims.exp};
  }catch(error){
   // Never propagate raw token/identity/provider error text to logs.
   if(error instanceof Error&&/^(INDIVIDUAL_TOKEN_REQUIRED|TOKEN_ENCODING_REFUSED|FRESH_INDIVIDUAL_ACCESS_CLAIMS_REFUSED|ACCESS_PUBLIC_KEY_NOT_CORROBORATED|ACCESS_PUBLIC_KEY_REFUSED|ACCESS_SIGNATURE_INVALID|EDGE_IDENTITY_NOT_CORROBORATED)$/.test(error.message))throw error;
   refuse('PRIVATE_SESSION_VERIFICATION_FAILED');
  }finally{token=null;}
 };
}
