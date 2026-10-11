import {accessPrincipal,githubJob,verifyJwt,boundedJson,noRedirectFetch,exact} from './security.mjs';
import {validateOwnerRead,ownerPendingHash,OWNER_EVIDENCE_AUDIENCE} from '../../scripts/lib/training-owner-approval-protocol.mjs';
import {validatePublicVerifierKeys} from '../../scripts/lib/creatorloop-training-signer.mjs';
import {DISPATCH_WORKFLOWS} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createOwnerApprovalRelay({fetchImpl=fetch,now=()=>Math.floor(Date.now()/1000),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 fetchImpl=noRedirectFetch(fetchImpl);
 return {async fetch(request,env){try{
  const c=JSON.parse(env.OWNER_MAILBOX_CONFIG_JSON||'null');
  if(c?.protocol!=='CREATORLOOP_OWNER_OUTBOUND_MAILBOX_CONFIG_V1'||c.environment!=='TRAINING'||typeof c.origin!=='string'||!c.origin.startsWith('https://')||new URL(c.origin).origin!==c.origin||typeof c.issuer!=='string'||!c.issuer||!c.identityConfig||!Array.isArray(c.publicKeys)||!c.publicKeys.length||Object.keys(env).some(k=>/PRIVATE_KEY|PROVIDER_TOKEN|DEPLOY_TOKEN|CLOUDFLARE_API_TOKEN/.test(k)))refuse('OWNER_PUBLIC_ONLY_MAILBOX_CONFIG_REQUIRED');
  const controls=c.identityConfig.workloadControls;
  if(!/^[a-f0-9]{64}$/.test(c.ownerAccessAudience||'')||c.ownerAccessAudience===c.identityConfig.accessAudience||c.ownerAccessAudience===c.identityConfig.oidcAudience)refuse('DEDICATED_OWNER_MAILBOX_AUDIENCE_REQUIRED');
  if(c.origin===c.identityConfig.gatewayOrigin||typeof c.administrationRef!=='string'||!c.administrationRef||c.administrationRef!==controls?.approvalEvidenceCustodyRef||c.administrationRef===c.identityConfig.approvedExecutor?.workloadRef)refuse('OWNER_MAILBOX_SEPARATE_CUSTODY_REQUIRED');
  await validatePublicVerifierKeys(c.publicKeys);
  const url=new URL(request.url);if(url.origin!==c.origin||url.search||request.method!=='POST'||!['/v1/read','/v1/owner/pending','/v1/owner/respond','/v1/owner/export'].includes(url.pathname))return json({error:'Owner mailbox route refused'},404);
  const body=await boundedJson(new Response(request.body,{status:200}),32768);
  const accessToken=request.headers.get('Cf-Access-Jwt-Assertion'),jobToken=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  const state=env.MAILBOX_STATE.get(env.MAILBOX_STATE.idFromName('creatorloop-training-owner-mailbox-v1'));
  if(url.pathname.startsWith('/v1/owner/')){
   const principal=await accessPrincipal(accessToken,{...c.identityConfig,accessAudience:c.ownerAccessAudience},{fetchImpl,now:now()});if(principal.role!=='owner'||principal.id!==c.identityConfig.approvedExecutor.reviewerId)refuse('OWNER_ONLY_MAILBOX_OPERATION');
   if(url.pathname==='/v1/owner/pending'){if(!exact(body,[]))refuse('EMPTY_OWNER_POLL_REQUIRED');return json({pending:await state.pending()});}
   if(url.pathname==='/v1/owner/export'){if(!exact(body,[]))refuse('EMPTY_OWNER_EXPORT_REQUIRED');return json(await state.exportCustody());}
   if(!exact(body,['id','jws']))refuse('EXACT_OWNER_RESPONSE_REQUIRED');
   const pending=await state.request(body.id),proof=await verifyJwt(body.jws,{issuer:c.issuer,audience:OWNER_EVIDENCE_AUDIENCE,jwks:c.publicKeys,now:now()});
   if(proof.pendingHash!==ownerPendingHash(pending)||proof.purpose!==pending.read.purpose||proof.nonce!==pending.read.nonce||proof.queryHash!==pending.read.queryHash||proof.exp-proof.iat>300||proof.iat<now()-300||!Object.hasOwn(proof,'value')||typeof proof.ownerDecisionRef!=='string'||!proof.ownerDecisionRef)refuse('EXACT_MAC_SIGNED_OWNER_RESPONSE_REQUIRED');
   return json(await state.complete({id:pending.id,pendingHash:ownerPendingHash(pending),jws:body.jws}));
  }
  const read=validateOwnerRead(body);let actor;
  if(accessToken){const p=await accessPrincipal(accessToken,c.identityConfig,{fetchImpl,now:now()});actor={role:p.role,principalRef:'github:'+p.id};}
  else if(jobToken){
   const hints=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jobToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0))));
   const lane=Object.keys(DISPATCH_WORKFLOWS).find(l=>String(hints.workflow_ref||'').includes('/'+DISPATCH_WORKFLOWS[l]+'@'));
   // Untrusted hints select only the fixed verification branch. githubJob verifies
   // every claim/signature against the exact reviewed configuration afterward.
   const sha=c.identityConfig.workloadControls?.expectedSourceSha;
   const job=await githubJob(jobToken,c.identityConfig,lane,sha,{fetchImpl,now:now()});actor={role:'job',principalRef:'github-run:'+job.runId};
  }
  else if(['commissioning','runApproval','runtime'].includes(read.purpose))actor={role:'metadata-reader',principalRef:'unauthenticated-no-authorization'};
  else refuse('AUTHENTICATED_OWNER_READ_REQUIRED');
  const pending=await state.enqueue({read,actor});
  // Keeps existing 10-second consumer contract: Owner Mac must be online and finish
  // independent local validation/signing within this window or the read refuses.
  for(let i=0;i<18;i++){const response=await state.response(pending.id);if(response)return json(response);await sleep(400);}
  return json({error:'Owner Mac did not return a signed response in time; execution held'},503);
 }catch{return json({error:'Owner evidence mailbox refused'},403);}}};
}
