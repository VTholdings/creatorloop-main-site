// Owner/private-custodian source-token liveness only, after separate private
// authorization. This is not the accepted ACCOUNT-only resource verifier.
import {readFileSync} from 'node:fs';
let pinnedAccount;
try{pinnedAccount=JSON.parse(readFileSync(new URL('../acceptance/cloudflare-targets.json',import.meta.url),'utf8')).accountId;}catch{}
const approvedAccount='2a3b96a0b37850cd03107131baa66b6d';
const base='https://api.cloudflare.com/client/v4';
export const TOKEN_PREFLIGHT_TIMEOUT_MS=5000;
export const TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES=16384;
const codes=new Set([
 'EXECUTION_NOT_AUTHORIZED','INVALID_CLI_ARGUMENTS','TOKEN_TYPE_REQUIRED','UNKNOWN_TOKEN_TYPE',
 'INVALID_PREFLIGHT_OPTIONS','INVALID_ACCOUNT_PIN','MISSING_ENVIRONMENT_SECRET','MALFORMED_CREDENTIAL',
 'NETWORK_OR_REDIRECT_BLOCKED','REQUEST_TIMED_OUT','REDIRECT_OR_ENDPOINT_BLOCKED',
 'RESPONSE_TOO_LARGE','INVALID_API_RESPONSE','CLOUDFLARE_HTTP_ERROR','CLOUDFLARE_API_REJECTED',
 'INVALID_TOKEN_STATE','TOKEN_DISABLED','TOKEN_EXPIRED','TOKEN_NOT_YET_VALID','INVALID_TOKEN_WINDOW',
 'INVALID_CURRENT_TIME','ACCOUNT_SOURCE_TOKEN_ACTIVE_ONLY',
 'USER_SOURCE_TOKEN_ACTIVE_ACCOUNT_VERIFIER_INCOMPATIBLE','PREFLIGHT_BLOCKED'
]);
class PreflightError extends Error {
 constructor(code){super(code);this.code=code;}
}
// Only controlled enums, booleans and bounded numeric status/codes leave this
// module. Never return response messages, IDs, dates, URLs, headers or credentials.
export function blockedTokenCustodyReport(code,tokenType=null){
 return {protocol:'CREATORLOOP_PRIVATE_TOKEN_CUSTODY_V1',status:'TOKEN_CUSTODY_BLOCKED',
  code:codes.has(code)?code:'PREFLIGHT_BLOCKED',
  sourceTokenType:['account','user'].includes(tokenType)?tokenType:null,
  verificationAttempted:false,httpStatus:0,providerCodes:[],sourceTokenVerified:false,tokenActive:false,
  scopeVerified:false,resourceAccessVerified:false,installedGitHubSecretVerified:false,
  backupApproved:false,releaseApproved:false,ownerAuthorizationVerified:false,changesMade:false,
  existingVerifier:'ACCOUNT_ONLY_UNCHANGED',existingVerifierCompatibility:'NOT_ESTABLISHED'};
}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeProviderCodes=body=>Array.isArray(body?.errors)?[...new Set(body.errors.map(e=>e?.code)
 .filter(code=>Number.isSafeInteger(code)&&code>=1000&&code<=999999))].slice(0,10):[];
function tokenTime(value,activation=false){
 if(value===undefined||value===null)return null; // An omitted/null bound is not scope evidence.
 if(typeof value!=='string'||value.length>40)throw new PreflightError('INVALID_TOKEN_WINDOW');
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
 const local=match?Date.parse(match[1]+'Z'):NaN;
 const time=match?Date.parse(value):NaN;
 if(!Number.isFinite(local)||!Number.isFinite(time)||match[0]!==value||new Date(local).toISOString().slice(0,19)!==match[1]||
  (match[2]!=='Z'&&(Number(match[3])>23||Number(match[4])>59)))throw new PreflightError('INVALID_TOKEN_WINDOW');
 // Finer provider precision cannot round a future activation down to 'now'.
 const fraction=/\.(\d+)/.exec(value)?.[1]||'';
 return time+(activation&&/[1-9]/.test(fraction.slice(3))?1:0);
}
async function boundedJson(response,signal){
 const length=response.headers.get('content-length');
 if(length!==null&&(length.length===0||length.length>8||/\D/.test(length)||Number(length)>TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES))throw new PreflightError('RESPONSE_TOO_LARGE');
 if(!response.body||typeof response.body.getReader!=='function')throw new PreflightError('INVALID_API_RESPONSE');
 const reader=response.body.getReader(),chunks=[];
 let size=0;
 const cancel=()=>{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}};
 signal.addEventListener('abort',cancel,{once:true});
 try{
  while(true){
   if(signal.aborted)throw new PreflightError('REQUEST_TIMED_OUT');
   const {done,value}=await reader.read();
   if(signal.aborted)throw new PreflightError('REQUEST_TIMED_OUT');
   if(done)break;
   if(!(value instanceof Uint8Array))throw new PreflightError('INVALID_API_RESPONSE');
   size+=value.byteLength;
   if(size>TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES){cancel();throw new PreflightError('RESPONSE_TOO_LARGE');}
   chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new PreflightError('INVALID_API_RESPONSE');}
 }finally{signal.removeEventListener('abort',cancel);try{reader.releaseLock();}catch{}}
}
// No path, account, method, retry or metadata API exists. One invocation makes
// at most one GET. Explicit type selects the endpoint; it does not grant authority.
export async function preflightSourceToken(options={}){
 let report=blockedTokenCustodyReport('PREFLIGHT_BLOCKED'),credential,headers,controller,timer;
 try{
  const allowed=new Set(['tokenType','executeReadOnly','token','fetcher','now']);
  if(!object(options)||Object.keys(options).some(key=>!allowed.has(key)))throw new PreflightError('INVALID_PREFLIGHT_OPTIONS');
  const tokenType=options.tokenType;
  report=blockedTokenCustodyReport('PREFLIGHT_BLOCKED',tokenType);
  if(tokenType===undefined)throw new PreflightError('TOKEN_TYPE_REQUIRED');
  if(!['account','user'].includes(tokenType))throw new PreflightError('UNKNOWN_TOKEN_TYPE');
  if(options.executeReadOnly!==true)throw new PreflightError('EXECUTION_NOT_AUTHORIZED');
  if(pinnedAccount!==approvedAccount)throw new PreflightError('INVALID_ACCOUNT_PIN');
  const fetcher=options.fetcher===undefined?globalThis.fetch:options.fetcher;
  const now=options.now===undefined?Date.now:options.now;
  if(typeof fetcher!=='function'||typeof now!=='function')throw new PreflightError('INVALID_PREFLIGHT_OPTIONS');
  credential=options.token;
  if(typeof credential!=='string'||credential.length===0)throw new PreflightError('MISSING_ENVIRONMENT_SECRET');
  // No trimming, decoding, prefix inference or automatic repair is permitted.
  if(credential.length>4096||/[^\x21-\x7e]/.test(credential))throw new PreflightError('MALFORMED_CREDENTIAL');
  const endpoint=base+(tokenType==='account'?'/accounts/'+approvedAccount+'/tokens/verify':'/user/tokens/verify');
  headers={Authorization:'Bearer '+credential,Accept:'application/json'};
  credential=undefined;options=undefined;
  controller=new AbortController();
  const deadline=new Promise((resolve,reject)=>{
   timer=setTimeout(()=>{controller.abort();reject(new PreflightError('REQUEST_TIMED_OUT'));},TOKEN_PREFLIGHT_TIMEOUT_MS);
  });
  report.verificationAttempted=true;
  const operation=(async()=>{
   let response;
   try{response=await fetcher(endpoint,{method:'GET',headers,redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});}
   catch{throw new PreflightError(controller.signal.aborted?'REQUEST_TIMED_OUT':'NETWORK_OR_REDIRECT_BLOCKED');}
   if(controller.signal.aborted)throw new PreflightError('REQUEST_TIMED_OUT');
   if(!object(response)||!Number.isSafeInteger(response.status)||response.status<100||response.status>599)throw new PreflightError('INVALID_API_RESPONSE');
   report.httpStatus=response.status;
   if(response.redirected===true||(response.status>=300&&response.status<400)||
    (response.url&&response.url!==endpoint))throw new PreflightError('REDIRECT_OR_ENDPOINT_BLOCKED');
   let body;
   try{body=await boundedJson(response,controller.signal);}
   catch(e){
    if(response.status!==200&&e instanceof PreflightError&&e.code==='INVALID_API_RESPONSE')throw new PreflightError('CLOUDFLARE_HTTP_ERROR');
    throw e;
   }
   report.providerCodes=safeProviderCodes(body);
   if(response.status!==200)throw new PreflightError('CLOUDFLARE_HTTP_ERROR');
   if(!object(body)||body.success!==true)throw new PreflightError('CLOUDFLARE_API_REJECTED');
   if(body.errors!==undefined&&(!Array.isArray(body.errors)||body.errors.length!==0))throw new PreflightError('CLOUDFLARE_API_REJECTED');
   if(!object(body.result)||typeof body.result.id!=='string'||body.result.id.length!==32||!/^[0-9a-f]{32}$/.test(body.result.id))throw new PreflightError('INVALID_API_RESPONSE');
   const result=body.result;
   if(!['active','disabled','expired'].includes(result.status))throw new PreflightError('INVALID_TOKEN_STATE');
   const notBefore=tokenTime(result.not_before,true),expiresAt=tokenTime(result.expires_on);
   let currentTime;
   try{currentTime=now();}catch{throw new PreflightError('INVALID_CURRENT_TIME');}
   if(typeof currentTime!=='number'||!Number.isSafeInteger(currentTime)||currentTime<0)throw new PreflightError('INVALID_CURRENT_TIME');
   if(notBefore!==null&&expiresAt!==null&&notBefore>=expiresAt)throw new PreflightError('INVALID_TOKEN_WINDOW');
   if(result.status==='disabled')throw new PreflightError('TOKEN_DISABLED');
   if(result.status==='expired'||(expiresAt!==null&&expiresAt<=currentTime))throw new PreflightError('TOKEN_EXPIRED');
   if(notBefore!==null&&notBefore>currentTime)throw new PreflightError('TOKEN_NOT_YET_VALID');
  })();
  await Promise.race([operation,deadline]);
  report.status='SOURCE_TOKEN_ACTIVE_ONLY';report.sourceTokenVerified=true;report.tokenActive=true;
  report.code=tokenType==='user'?'USER_SOURCE_TOKEN_ACTIVE_ACCOUNT_VERIFIER_INCOMPATIBLE':'ACCOUNT_SOURCE_TOKEN_ACTIVE_ONLY';
  report.existingVerifierCompatibility=tokenType==='user'?'USER_TOKEN_TYPE_INCOMPATIBLE':'ACCOUNT_TOKEN_TYPE_ONLY_SCOPE_UNVERIFIED';
 }catch(e){report.code=e instanceof PreflightError&&codes.has(e.code)?e.code:'INVALID_API_RESPONSE';}
 finally{
  if(timer!==undefined)clearTimeout(timer);
  if(controller)controller.abort();
  if(headers)delete headers.Authorization;
  credential=undefined;options=undefined;
  // JavaScript strings cannot be zeroized; references are released, never persisted.
 }
 return report;
}
