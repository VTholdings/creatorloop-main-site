import {verifyJwt,boundedJson} from '../../workers/training-managed/security.mjs';
import {validateOwnerPending} from './training-owner-approval-protocol.mjs';
import {refuse} from './training-execution-contract.mjs';
const ORIGIN='https://approval-training.creatorloop.net';
export function createOwnerMailboxHttp({resolveOwnerSession,publicAuthentication,fetchImpl,now=()=>Math.floor(Date.now()/1000)}){
 if(typeof resolveOwnerSession!=='function'||typeof fetchImpl!=='function'||publicAuthentication?.issuer!=='https://shiny-wildflower-143c.cloudflareaccess.com'||!/^[a-f0-9]{64}$/.test(publicAuthentication?.audience||'')||publicAuthentication?.email!=='team@creatorloop.net'||typeof publicAuthentication?.subject!=='string'||!publicAuthentication.subject||!Array.isArray(publicAuthentication.publicKeys)||!publicAuthentication.publicKeys.length)refuse('OWNER_PRIVATE_SESSION_AND_EXACT_PUBLIC_AUTH_REQUIRED');
 const auth=structuredClone(publicAuthentication);
 async function post(path,body,max=1048576){
  let token;
  try{token=await resolveOwnerSession({origin:ORIGIN,audience:auth.audience});}catch{refuse('OWNER_PRIVATE_AUTH_RESOLUTION_REFUSED');}
  const payload=await verifyJwt(token,{issuer:auth.issuer,audience:auth.audience,jwks:auth.publicKeys,now:now()});
  if(payload.type!=='app'||payload.email!==auth.email||payload.sub!==auth.subject||Object.hasOwn(payload,'common_name'))refuse('EXACT_OWNER_SESSION_REQUIRED');
  // Access edge authenticates its application cookie; assertion alone is not a
  // credential for Access edge. Original signed token is reverified by the relay.
  let r;try{r=await fetchImpl(ORIGIN+path,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json',Cookie:'CF_Authorization='+token,'Cf-Access-Jwt-Assertion':token},body:JSON.stringify(body)});}catch{refuse('OWNER_OUTBOUND_REQUEST_UNRESOLVED_NO_RETRY');}
  if(r.status>=300&&r.status<400)refuse('OWNER_AUTH_REDIRECT_REFUSED');
  let result;try{result=await boundedJson(r,max);}catch{refuse('OWNER_OUTBOUND_RESPONSE_REFUSED');}
  return result;
 }
 return {
  async pollOwnerPending(){const r=await post('/v1/owner/pending',{});if(!Array.isArray(r.pending)||r.pending.length>20)refuse('BOUNDED_OWNER_PENDING_REQUIRED');return r.pending.map(p=>validateOwnerPending(p,now()));},
  async postOwnerResponse(v){if(!v||Object.keys(v).sort().join('|')!=='id|jws'||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(v.id||'')||typeof v.jws!=='string'||v.jws.length>16384||v.jws.split('.').length!==3)refuse('EXACT_OWNER_PUBLICATION_REQUIRED');return post('/v1/owner/respond',v,32768);},
  async exportOwnerCustody(){return post('/v1/owner/export',{},32*1024*1024);}
 };
}
