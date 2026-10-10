import {dispatchHash,validateApprovedExecutorPolicy,TRANSFERRED_EXECUTOR_ACCOUNT,DISPATCH_WORKFLOWS} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {TRAINING_REPOSITORY,TRAINING_BRANCH} from '../../scripts/lib/training-github-environments.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
export const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export const b64=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const enc=new TextEncoder();
export const exact=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...names].sort().join('|');
export function noRedirectFetch(fetchImpl){
 return async(input,options={})=>{
  const response=await fetchImpl(input,{...options,redirect:'manual'});
  if(response.status>=300&&response.status<400)refuse('MANAGED_REDIRECT_REFUSED');
  return response;
 };
}
export async function boundedJson(response,max=65536){
 if(!response.ok)refuse('MANAGED_REMOTE_READ_REFUSED');
 const reader=response.body?.getReader();if(!reader)refuse('MANAGED_BODY_REQUIRED');
 let size=0,text='';const decoder=new TextDecoder();
 while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>max){await reader.cancel();refuse('MANAGED_BODY_TOO_LARGE');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);
}
export function configuration(env){
 const c=JSON.parse(env.MANAGED_CONFIG_JSON||'null');
 if(c?.protocol!=='CREATORLOOP_MANAGED_TRAINING_V1'||c.environment!=='TRAINING'||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(c.accessIssuer||'')||typeof c.accessAudience!=='string'||!c.accessAudience||!Array.isArray(c.identities)||c.identities.length!==2||!Number.isSafeInteger(c.appId)||c.appId<=0||!Number.isSafeInteger(c.installationId)||c.installationId<=0||!Number.isSafeInteger(c.repositoryId)||c.repositoryId<=0||!Number.isSafeInteger(c.ownerId)||c.ownerId<=0||!Number.isSafeInteger(c.appBotId)||c.appBotId<=0||typeof c.appBotLogin!=='string'||!c.appBotLogin.endsWith('[bot]')||typeof c.gatewayOrigin!=='string'||new URL(c.gatewayOrigin).origin!==c.gatewayOrigin||!c.gatewayOrigin.startsWith('https://'))refuse('EXACT_MANAGED_COMMISSIONING_CONFIG_REQUIRED');
 validateApprovedExecutorPolicy(c.approvedExecutor);
 if(c.approvedExecutor.account.id!==TRANSFERRED_EXECUTOR_ACCOUNT.id||c.approvedExecutor.account.login!==TRANSFERRED_EXECUTOR_ACCOUNT.login)refuse('EXACT_TRANSFERRED_EXECUTOR_REQUIRED');
 for(const role of ['owner','executor']){
  const identity=c.identities.find(i=>i.role===role);
  if(!identity||typeof identity.subject!=='string'||!identity.subject||typeof identity.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)||identity.email!==identity.email.toLowerCase()||identity.githubId!==(role==='owner'?c.approvedExecutor.reviewerId:c.approvedExecutor.account.id))refuse('ACTUAL_MANAGED_IDENTITY_MAPPING_REQUIRED');
 }
 if(c.identities[0].subject===c.identities[1].subject||c.identities[0].email===c.identities[1].email)refuse('MANAGED_IDENTITY_SEPARATION_REQUIRED');
 if(typeof c.oidcAudience!=='string'||!c.oidcAudience||c.oidcAudience===c.accessAudience)refuse('DEDICATED_JOB_AUDIENCE_REQUIRED');
 return c;
}
async function keys(url,fetchImpl){return (await boundedJson(await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(10000)}))).keys;}
export async function verifyJwt(token,{issuer,audience,jwks,now}){
 if(typeof token!=='string'||token.length>16384)refuse('BOUNDED_SIGNED_TOKEN_REQUIRED');
 const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))refuse('SIGNED_TOKEN_REQUIRED');
 const header=JSON.parse(new TextDecoder().decode(bytes(parts[0]))),payload=JSON.parse(new TextDecoder().decode(bytes(parts[1])));
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.jku||header.x5u||header.crit||payload.iss!==issuer||!(Array.isArray(payload.aud)?payload.aud:[payload.aud]).includes(audience)||!Number.isInteger(payload.exp)||payload.exp<=now||!Number.isInteger(payload.iat)||payload.iat>now||payload.nbf!==undefined&&(!Number.isInteger(payload.nbf)||payload.nbf>now))refuse('SIGNED_TOKEN_CLAIMS_REFUSED');
 const matches=(jwks||[]).filter(k=>k.kid===header.kid);
 if(matches.length!==1||matches[0].kty!=='RSA'||['d','p','q','dp','dq','qi','oth'].some(k=>Object.hasOwn(matches[0],k))||!matches[0].n||bytes(matches[0].n).length<256)refuse('EXACT_PUBLIC_VERIFICATION_KEY_REQUIRED');
 const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),enc.encode(parts[0]+'.'+parts[1])))refuse('SIGNED_TOKEN_SIGNATURE_REFUSED');
 return payload;
}
export async function accessPrincipal(token,c,{fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
 const payload=await verifyJwt(token,{issuer:c.accessIssuer,audience:c.accessAudience,jwks:await keys(c.accessIssuer+'/cdn-cgi/access/certs',fetchImpl),now});
 const match=c.identities.find(i=>i.subject===payload.sub&&i.email===payload.email);
 if(!match)refuse('INDIVIDUAL_MANAGED_IDENTITY_REQUIRED');
 return {role:match.role,id:match.githubId,login:match.role==='executor'?c.approvedExecutor.account.login:undefined,authenticationRef:'access:'+dispatchHash({sub:payload.sub,iat:payload.iat}),authenticatedAt:now};
}
export async function githubJob(token,c,lane,executionSha,{fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
 if(!Object.hasOwn(DISPATCH_WORKFLOWS,lane))refuse('EXACT_JOB_LANE_REQUIRED');
 const issuer='https://token.actions.githubusercontent.com';
 const p=await verifyJwt(token,{issuer,audience:c.oidcAudience,jwks:await keys(issuer+'/.well-known/jwks',fetchImpl),now});
 const environment=lane==='provider'?'creatorloop-training-provider-execution':'creatorloop-training-release';
 const expectedWorkflow=`${TRAINING_REPOSITORY}/.github/workflows/${DISPATCH_WORKFLOWS[lane]}@refs/heads/${TRAINING_BRANCH}`;
 if(p.repository!==TRAINING_REPOSITORY||p.repository_id!==String(c.repositoryId)||p.repository_owner_id!==String(c.ownerId)||p.ref!==`refs/heads/${TRAINING_BRANCH}`||p.sha!==executionSha||p.workflow_sha!==executionSha||p.workflow_ref!==expectedWorkflow||p.event_name!=='workflow_dispatch'||p.run_attempt!=='1'||p.actor_id!==String(c.appBotId)||p.actor!==c.appBotLogin||p.runner_environment!=='github-hosted'||p.environment!==environment||typeof p.jti!=='string'||!p.jti||!/^\d+$/.test(p.run_id||'')||!Number.isSafeInteger(Number(p.run_id))||Number(p.run_id)<=0||!Array.isArray(c.allowedOidcSubjects)||!c.allowedOidcSubjects.includes(p.sub)||p.exp-p.iat>600)refuse('EXACT_PROTECTED_JOB_IDENTITY_REQUIRED');
 return {runId:p.run_id,jtiHash:dispatchHash(p.jti),expiresAt:p.exp,actorId:p.actor_id,lane};
}
// Fixed, independently administered evidence endpoints. Response signature binds
// purpose, query, freshness and nonce; HTTPS alone or executor booleans do not qualify.
export async function independentEvidence(c,purpose,query,{fetchImpl=fetch,now=Math.floor(Date.now()/1000),identityToken,identityType}={}){
 const port=c.evidencePorts?.[purpose];
 if(!port||typeof port.url!=='string'||!port.url.startsWith('https://')||new URL(port.url).username||new URL(port.url).password||!Array.isArray(port.publicKeys)||!port.publicKeys.length||typeof port.issuer!=='string'||!port.issuer)refuse('ACTUAL_INDEPENDENT_EVIDENCE_PORT_REQUIRED');
 const sensitive=!['commissioning','runApproval','runtime'].includes(purpose);
 if(sensitive&&(typeof identityToken!=='string'||!identityToken||!['access','oidc'].includes(identityType)))refuse('AUTHENTICATED_INDEPENDENT_READ_REQUIRED');
 const nonce=crypto.randomUUID(),queryHash=dispatchHash(query);
 const response=await fetchImpl(port.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(identityToken?identityType==='access'?{'Cf-Access-Jwt-Assertion':identityToken}:{Authorization:'Bearer '+identityToken}:{})},body:JSON.stringify({protocol:'CREATORLOOP_INDEPENDENT_READ_V1',purpose,query,queryHash,nonce})});
 const envelope=await boundedJson(response);
 const p=await verifyJwt(envelope?.jws,{issuer:port.issuer,audience:'CREATORLOOP_TRAINING_EVIDENCE',jwks:port.publicKeys,now});
 if(p.purpose!==purpose||p.nonce!==nonce||p.queryHash!==queryHash||p.exp-p.iat>300||p.iat<now-300||!Object.hasOwn(p,'value'))refuse('FRESH_BOUND_INDEPENDENT_EVIDENCE_REQUIRED');
 return p.value;
}
