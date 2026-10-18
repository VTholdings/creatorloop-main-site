'use strict';
// Owner-Mac administrative bootstrap only. Not an executor/runtime replacement.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const HOME='/Users/tt1';
const ROOT=HOME+'/.vt-creatorloop';
const KEY=ROOT+'/private-signing/training-executor-github-app-5288606-v3-resecured.pem';
const PRIOR=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-attempt.json';
const PRIOR_RECEIPT=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-receipt.json';
const ATTEMPT=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-recovery-20261018-attempt.json';
const RECEIPT=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-recovery-20261018-receipt.json';
const REPO='VTholdings/creatorloop-main-site';
const SHA='b122268c0c061466f3d130082dac8dbb3db98871';
const REGISTRATION='9d9f116d2508df5e4ca0a00f381cf0aa0a50b6b6';
const WORKFLOW='phase18-dispatch-access-setup.yml';
const WORKFLOW_HASH='fe47d1cc23d59d5c42c326beb8cfa626c9373153d99442770b5dd8e4370b5e1b';
const KEY_HASH='f54b4e20bfb1d0c1666319fea7a37d8d2ca94c293cf4bf74bc67933d3045b3ed';
const SPKI_HASH='f4e8f518b9f6910e86102bf5d72a7ddcf8e9f91b4ee467daef6853e403233c97';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const stop=s=>{throw new Error(s);};
function privatePath(p,kind){
 const s=fs.lstatSync(p);
 if(s.isSymbolicLink()||s.uid!==process.getuid()||fs.realpathSync(p)!==p)stop('PRIVATE_PATH_OWNERSHIP_REFUSED');
 if(kind==='file'&&(!s.isFile()||s.nlink!==1||(s.mode&0o777)!==0o400))stop('EXISTING_KEY_MODE_REFUSED');
 if(kind==='directory'&&(!s.isDirectory()||(s.mode&0o077)!==0))stop('PRIVATE_DIRECTORY_MODE_REFUSED');
 return s;
}
function exclusiveJson(path,value){
 const fd=fs.openSync(path,'wx',0o400);
 try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
const githubCurlTransport=(()=>{const module={exports:{}};
'use strict';
// Credentials travel only in child stdin; curl defaults, redirects and retries disabled.
const {execFileSync}=require('node:child_process');
function curlAuthenticatedOnce(url,{method='GET',headers={},body}={},run=execFileSync){
 if(!url.startsWith('https://api.github.com/')||!['GET','POST'].includes(method))throw Error('EXACT_GITHUB_TRANSPORT_REQUIRED');
 const lines=['silent','show-error','proto = "=https"','connect-timeout = 10','max-time = 15','retry = 0','max-redirs = 0','request = '+JSON.stringify(method),'url = '+JSON.stringify(url),'write-out = "\\n%{http_code}"'];
 for(const [name,value]of Object.entries(headers)){if(!/^[A-Za-z0-9-]+$/.test(name)||typeof value!=='string'||/[\r\n]/.test(value))throw Error('HEADER_FORMAT_REFUSED');lines.push('header = '+JSON.stringify(name+': '+value));}
 if(body!==undefined)lines.push('data-binary = '+JSON.stringify(body));
 let output;
 try{output=run('/usr/bin/curl',['-q','--config','-'],{input:lines.join('\n')+'\n',encoding:null,stdio:['pipe','pipe','pipe'],timeout:20000,maxBuffer:2004096});}
 catch(e){const safe=new Error('CURL_TRANSPORT_FAILED');const known={5:'CURL_PROXY_RESOLUTION_FAILED',6:'CURL_HOST_RESOLUTION_FAILED',7:'CURL_CONNECTION_FAILED',28:'CURL_TIMEOUT',35:'CURL_TLS_HANDSHAKE_FAILED',52:'CURL_EMPTY_REPLY',55:'CURL_SEND_FAILED',56:'CURL_RECEIVE_FAILED',60:'CURL_CERTIFICATE_REJECTED'};safe.safeCurlCode=known[e.status]||'CURL_LOCAL_OR_TRANSPORT_FAILURE';throw safe;}
 const cut=output.lastIndexOf(10),statusText=output.subarray(cut+1).toString('ascii');
 if(cut<0||!/^\d{3}$/.test(statusText)||Number(statusText)<100||cut>2000000)throw Error('CURL_RESPONSE_FRAMING_REFUSED');
 const status=Number(statusText),bytes=output.subarray(0,cut);
 return {ok:status>=200&&status<300,status,body:(async function*(){yield bytes;})()};
}
module.exports={curlAuthenticatedOnce};

return module.exports;})();
async function http(url,{method='GET',auth,body,raw=false}={}){
 const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'VT-Phase18-Owner-Administrative-Bootstrap'};
 if(auth)headers.Authorization='Bearer '+auth;
 if(body)headers['Content-Type']='application/json';
 const stage=url==='https://api.github.com/app'?'APP_IDENTITY':url==='https://api.github.com/app/installations/170669547'?'APP_INSTALLATION':url.endsWith('/access_tokens')?'INSTALLATION_TOKEN':url.endsWith('/dispatches')?'WORKFLOW_DISPATCH':url.includes('/installation/repositories')?'REPOSITORY_SCOPE':'REVIEWED_SOURCE';
 let r;
 try{r=auth?githubCurlTransport.curlAuthenticatedOnce(url,{method,headers,body:body?JSON.stringify(body):undefined}):await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers,body:body?JSON.stringify(body):undefined});}
 catch(error){
  const stage=url==='https://api.github.com/app'?'APP_IDENTITY':url==='https://api.github.com/app/installations/170669547'?'APP_INSTALLATION':url.endsWith('/access_tokens')?'INSTALLATION_TOKEN':url.endsWith('/dispatches')?'WORKFLOW_DISPATCH':url.includes('/installation/repositories')?'REPOSITORY_SCOPE':'REVIEWED_SOURCE';
  const allowed=['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET','UND_ERR_INVALID_ARG','ERR_INVALID_CHAR','ERR_INVALID_ARG_VALUE','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT'];
  const codes=[],names=[],seen=new Set();
  function inspect(e,depth=0){if(!e||typeof e!=='object'||depth>4||seen.has(e)||seen.size>=20)return;seen.add(e);if(allowed.includes(e.code)&&!codes.includes(e.code))codes.push(e.code);if(['TypeError','AggregateError','Error','TimeoutError','AbortError'].includes(e.name)&&!names.includes(e.name))names.push(e.name);inspect(e.cause,depth+1);if(Array.isArray(e.errors))for(const child of e.errors.slice(0,8))inspect(child,depth+1);}
  inspect(error);
  const curlCodes=['CURL_PROXY_RESOLUTION_FAILED','CURL_HOST_RESOLUTION_FAILED','CURL_CONNECTION_FAILED','CURL_TIMEOUT','CURL_TLS_HANDSHAKE_FAILED','CURL_EMPTY_REPLY','CURL_SEND_FAILED','CURL_RECEIVE_FAILED','CURL_CERTIFICATE_REJECTED','CURL_LOCAL_OR_TRANSPORT_FAILURE'];
  const code=curlCodes.includes(error.safeCurlCode)?error.safeCurlCode:codes[0]|| (names.includes('TimeoutError')?'REQUEST_TIMEOUT':'UNCLASSIFIED_TRANSPORT_ERROR');
  const safe=new Error(method==='POST'?'POST_OUTCOME_UNCERTAIN_DO_NOT_RERUN':'GITHUB_READ_TRANSPORT_FAILED');
  safe.safeNetwork={stage,method,classification:'NO_HTTP_RESPONSE',code,codes,errorTypes:names};throw safe;
 }
 if(!r.ok){const safe=new Error('GITHUB_HTTP_'+r.status+'_DO_NOT_RERUN');safe.safeNetwork={stage,method,classification:'HTTP_RESPONSE',httpStatus:r.status};throw safe;}
 if(r.status===204)return {status:204};
 const chunks=[];let size=0;
 for await(const part of r.body){size+=part.length;if(size>2_000_000)stop('RESPONSE_SIZE_REFUSED');chunks.push(part);}
 const bytes=Buffer.concat(chunks);
 if(raw)return bytes;
 try{return JSON.parse(bytes.toString('utf8'));}catch{stop('RESPONSE_FORMAT_REFUSED');}
}
function exactPermissions(p){return p&&Object.keys(p).sort().join('|')==='actions|metadata'&&p.actions==='write'&&p.metadata==='read';}
// BEGIN VERIFIED V3 UNLOCK COMPONENT
const verifiedV3Unlock=(()=>{const module={exports:{}};
'use strict';
// Reuses the verified V2 unlock implementation; pins the recovered resecured V3 key.
// Unlock only: no network, writes, signing, dispatch, or key changes.
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const KEY='/Users/tt1/.vt-creatorloop/private-signing/training-executor-github-app-5288606-v3-resecured.pem';
const EXPECTED='f54b4e20bfb1d0c1666319fea7a37d8d2ca94c293cf4bf74bc67933d3045b3ed';
const SPKI='f4e8f518b9f6910e86102bf5d72a7ddcf8e9f91b4ee467daef6853e403233c97';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const refuse=code=>{const e=new Error();e.safeCode=code;throw e;};
function encryptionInfo(pem) {
  const match=pem.toString('ascii').match(/^-----BEGIN ENCRYPTED PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END ENCRYPTED PRIVATE KEY-----\r?\n?$/);
  if(!match) refuse('V3_ENCRYPTED_PKCS8_FORMAT_REFUSED');
  const der=Buffer.from(match[1].replace(/[\r\n]/g,''),'base64');
  function tlv(offset,limit) {
    let i=offset; const tag=der[i++]; let n=der[i++];
    if(n&128) { const count=n&127; if(!count || count>3) throw new Error(); n=0;
      for(let j=0;j<count;j++) n=(n*256)+der[i++]; }
    if(!Number.isInteger(n) || i+n>limit || i>limit) throw new Error();
    return {tag,start:i,end:i+n};
  }
  function children(x) { if(x.tag!==48) throw new Error(); const a=[];
    for(let i=x.start;i<x.end;) { const c=tlv(i,x.end); a.push(c); i=c.end; if(a.length>8) throw new Error(); } return a; }
  function oid(x,hex) { return x?.tag===6 && der.subarray(x.start,x.end).toString('hex')===hex; }
  function integer(x) { if(x?.tag!==2 || x.end-x.start>4 || (der[x.start]&128)) throw new Error();
    let v=0; for(let i=x.start;i<x.end;i++) v=(v*256)+der[i]; return v; }
  try {
    const top=tlv(0,der.length); if(top.end!==der.length) throw new Error();
    const [alg,ciphertext]=children(top), [pbes2,params]=children(alg);
    if(!oid(pbes2,'2a864886f70d01050d') || ciphertext?.tag!==4) throw new Error();
    const [kdf,cipher]=children(params), [pbkdf2,kparams]=children(kdf), [aes,iv]=children(cipher);
    if(!oid(pbkdf2,'2a864886f70d01050c') || !oid(aes,'60864801650304012a') ||
       iv?.tag!==4 || iv.end-iv.start!==16 || (ciphertext.end-ciphertext.start)%16) throw new Error();
    const kp=children(kparams), salt=kp[0], iterations=integer(kp[1]);
    if(salt?.tag!==4 || salt.end-salt.start<8 || iterations<1000 || iterations>10000000) throw new Error();
    let index=2; if(kp[index]?.tag===2) { if(integer(kp[index++])!==32) throw new Error(); }
    let prf='HMAC-SHA1';
    if(kp[index]) { const [p]=children(kp[index]);
      if(oid(p,'2a864886f70d0209')) prf='HMAC-SHA256';
      else if(!oid(p,'2a864886f70d0207')) throw new Error(); }
    return {format:'encrypted PKCS8',scheme:'PBES2',kdf:'PBKDF2',prf,iterations,cipher:'AES-256-CBC'};
  } finally { der.fill(0); }
}
function unlockVerifiedV3(){
 let encrypted,secretBytes,key,publicDer;
 let stage='RUNTIME_GUARD';
 const result={protocol:'VT_PHASE18_V3_UNLOCK_DIAGNOSTIC_V1',ciphertextVerified:false,encryptionMetadataVerified:false,unlockVerified:false,publicPairVerified:false,cryptoCode:null,networkRequests:0,filesChanged:false,dispatchAttempted:false};
 try{
  if(process.platform!=='darwin'||process.version!=='v22.23.3'||process.env.HOME!=='/Users/tt1')refuse('EXACT_OWNER_MAC_REQUIRED');
  stage='KEY_STAT';
  const stat=fs.lstatSync(KEY);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||stat.nlink!==1||(stat.mode&0o777)!==0o400||fs.realpathSync(KEY)!==KEY||stat.size>65536)refuse('PRIVATE_KEY_CUSTODY_GUARD_REFUSED');
  stage='KEY_OPEN';
  const fd=fs.openSync(KEY,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const opened=fs.fstatSync(fd);if(opened.ino!==stat.ino||opened.dev!==stat.dev||opened.mtimeMs!==stat.mtimeMs)refuse('FILE_CHANGED_DURING_READ');encrypted=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
  stage='CIPHERTEXT_CHECK';
  if(sha(encrypted)!==EXPECTED)refuse('VERIFIED_V3_CIPHERTEXT_MISMATCH');
  result.ciphertextVerified=true;
  stage='ENCRYPTION_METADATA';
  try{result.encryption=encryptionInfo(encrypted);}catch{refuse('ENCRYPTION_METADATA_INCOMPATIBLE');}
  if(!crypto.getCiphers().includes('aes-256-cbc')||!crypto.getHashes().includes(result.encryption.prf==='HMAC-SHA256'?'sha256':'sha1'))refuse('CRYPTO_ALGORITHM_UNAVAILABLE');
  result.encryptionMetadataVerified=true;
  stage='PRIVATE_INPUT';
  let input;
  try{input=execFileSync('/usr/bin/osascript',['-e','activate','-e','text returned of (display dialog "Enter the confirmed saved LOCAL ENCRYPTION passphrase recorded for the resecured App 5288606 V3 key on October 16. Not a Cloudflare token, GitHub password, or private-key contents. Cancel if unavailable. After verified unlock, submit only the reviewed Access setup as the App; Owner approval remains required." with title "CreatorLoop — Verified V3 App Setup" default answer "" buttons {"Cancel", "Check saved V3 passphrase"} default button "Check saved V3 passphrase" cancel button "Cancel" with hidden answer)'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:300000,maxBuffer:8192}).replace(/\r?\n$/,'');}catch{refuse('PRIVATE_INPUT_CANCELLED_OR_UNAVAILABLE');}
  if(!input)refuse('SAVED_PASSPHRASE_UNAVAILABLE');
  if(input.startsWith('cfat_')){input=undefined;refuse('CLOUDFLARE_TOKEN_SUPPLIED_NOT_V3_PASSPHRASE');}
  if(input.includes('-----BEGIN ')){input=undefined;refuse('KEY_CONTENT_SUPPLIED_NOT_V3_PASSPHRASE');}
  secretBytes=Buffer.from(input,'utf8');input=undefined;
  stage='KEY_DECRYPTION';
  try{key=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase:secretBytes});}
  catch(e){
   const allowed=['ERR_OSSL_BAD_DECRYPT','ERR_OSSL_EVP_BAD_DECRYPT','ERR_OSSL_UNSUPPORTED','ERR_OSSL_EVP_UNSUPPORTED'];
   result.cryptoCode=allowed.includes(e.code)?e.code:'OTHER_CRYPTO_ERROR';
   if(['ERR_OSSL_BAD_DECRYPT','ERR_OSSL_EVP_BAD_DECRYPT'].includes(e.code))refuse('SUPPLIED_VALUE_DOES_NOT_UNLOCK_VERIFIED_V3');
   refuse('DECRYPTION_IMPLEMENTATION_OR_RUNTIME_ERROR');
  }finally{secretBytes.fill(0);secretBytes=undefined;}
  result.unlockVerified=true;
  stage='PUBLIC_PAIR_CHECK';
  publicDer=crypto.createPublicKey(key).export({format:'der',type:'spki'});
  if(sha(publicDer)!==SPKI)refuse('UNLOCKED_PUBLIC_KEY_MISMATCH');
  result.publicPairVerified=true;
  stage='FINAL_KEY_READ';
  const final=fs.readFileSync(KEY);const unchanged=sha(final)===EXPECTED;final.fill(0);
  if(!unchanged)refuse('V3_CHANGED_DURING_DIAGNOSTIC');
  result.status='EXISTING_V3_UNLOCK_AND_PUBLIC_PAIR_VERIFIED';
  return {privateKey:key,proof:result};
 }catch(e){const error=new Error();const osCodes={ENOENT:'LOCAL_KEY_NOT_FOUND',EACCES:'LOCAL_KEY_ACCESS_DENIED',EPERM:'LOCAL_KEY_OPERATION_DENIED',ELOOP:'LOCAL_KEY_SYMLINK_REFUSED',ENOTDIR:'LOCAL_KEY_PARENT_NOT_DIRECTORY',EISDIR:'LOCAL_KEY_NOT_REGULAR_FILE'};error.safeCode=e.safeCode||osCodes[e.code]||'UNEXPECTED_LOCAL_UNLOCK_FAILURE';error.safeLocalStage=stage;error.safeCryptoCode=result.cryptoCode;throw error;}
 finally{encrypted?.fill(0);secretBytes?.fill(0);publicDer?.fill(0);key=undefined;}
}
module.exports={unlockVerifiedV3};

return module.exports;})();
// END VERIFIED V3 UNLOCK COMPONENT

function validatePriorAttempt(value,nowMs){
 if(value.protocol!=='VT_PHASE18_ACCESS_SETUP_APP_BOOTSTRAP_V1'||value.environment!=='TRAINING'||value.appId!==5288606||value.installationId!==170669547||value.repository!==REPO||value.workflow!==WORKFLOW||value.executionSha!==SHA||value.workflowSha256!==WORKFLOW_HASH||value.createdAt!=='2026-10-17T23:36:57.130Z'||value.automaticRetryAllowed!==false)stop('EXACT_PRIOR_ATTEMPT_REQUIRED');
 const age=nowMs-Date.parse(value.createdAt);
 if(!Number.isFinite(age)||age<7200000)stop('PRIOR_CAPABILITY_EXPIRY_WINDOW_NOT_ELAPSED');
 return value.createdAt;
}
function assertNoMatchingDispatch(runs,createdAt){
 const cutoff=Date.parse(createdAt)-300000;
 for(const run of runs){
  if(!Number.isFinite(Date.parse(run.created_at)))stop('RUN_TIMESTAMP_UNCORROBORATED');
  if(run.path==='.github/workflows/'+WORKFLOW&&Date.parse(run.created_at)>=cutoff)stop('EXISTING_SETUP_RUN_FOUND_DO_NOT_DISPATCH');
 }
}
async function reconcileRuns(token,createdAt){
 let all=[],expectedTotal;
 for(let page=1;page<=20;page++){
  const data=await http('https://api.github.com/repos/'+REPO+'/actions/runs?per_page=100&page='+page,{auth:token});
  if(!Number.isSafeInteger(data.total_count)||!Array.isArray(data.workflow_runs))stop('RUN_INVENTORY_FORMAT_REFUSED');
  if(expectedTotal===undefined)expectedTotal=data.total_count;
  if(data.total_count!==expectedTotal)stop('RUN_INVENTORY_CHANGED_DURING_READ');
  all.push(...data.workflow_runs);
  if(all.length>=expectedTotal){
   if(all.length!==expectedTotal||new Set(all.map(r=>r.id)).size!==all.length)stop('RUN_INVENTORY_DUPLICATE_OR_COUNT_MISMATCH');
   assertNoMatchingDispatch(all,createdAt);
   return {runsInspected:all.length,matchingSetupRuns:0};
  }
  if(data.workflow_runs.length===0)stop('RUN_INVENTORY_INCOMPLETE');
 }
 stop('RUN_INVENTORY_LIMIT_REFUSED');
}

async function main(){
 if(process.platform!=='darwin'||process.env.HOME!==HOME||process.version!=='v22.23.3'||process.argv[2]!=='PHASE18_RECONCILED_ONE_ACCESS_SETUP_APP_DISPATCH')stop('EXACT_APPROVED_MAC_NODE_AND_MARKER_REQUIRED');
 for(const p of [ROOT,ROOT+'/private-signing',ROOT+'/evidence'])privatePath(p,'directory');
 if(fs.existsSync(ATTEMPT)||fs.existsSync(RECEIPT))stop('PRIOR_ATTEMPT_PRESENT_DO_NOT_RERUN');
 if(fs.existsSync(PRIOR_RECEIPT))stop('PRIOR_COMPLETION_RECEIPT_PRESENT_RECONCILE_RUN');
 privatePath(PRIOR,'file');
 const priorBytes=fs.readFileSync(PRIOR),priorHash=hash(priorBytes);
 const priorCreatedAt=validatePriorAttempt(JSON.parse(priorBytes.toString('utf8')),Date.now());
 priorBytes.fill(0);
 for(const ref of [REGISTRATION,SHA]){
  const bytes=await http('https://raw.githubusercontent.com/'+REPO+'/'+ref+'/.github/workflows/'+WORKFLOW,{raw:true});
  if(hash(bytes)!==WORKFLOW_HASH)stop('REVIEWED_WORKFLOW_BYTES_MISMATCH');
 }
 const branch=await http('https://api.github.com/repos/'+REPO+'/branches/team-access-directory');
 if(branch.commit?.sha!==SHA)stop('REVIEWED_TRAINING_SHA_MOVED');
 const unlocked=verifiedV3Unlock.unlockVerifiedV3();
 let privateKey=unlocked.privateKey;
 unlocked.privateKey=undefined;
 console.log('EXISTING_V3_UNLOCK_AND_PUBLIC_PAIR_VERIFIED');
 const now=Math.floor(Date.now()/1000);
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const signing=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iat:now-30,exp:now+300,iss:'5288606'});
 let jwt=signing+'.'+crypto.sign('RSA-SHA256',Buffer.from(signing),privateKey).toString('base64url');
 privateKey=undefined;
 const app=await http('https://api.github.com/app',{auth:jwt});
 if(app.id!==5288606||app.slug!=='vt-creatorloop-training-executor'||app.owner?.login!=='VTholdings'||!exactPermissions(app.permissions))stop('APP_IDENTITY_OR_PERMISSION_MISMATCH');
 if(process.argv[2]==='PHASE18_APP_IDENTITY_READ_ONLY'){jwt=undefined;console.log(JSON.stringify({status:'PHASE18_APP_IDENTITY_AUTHENTICATED_READ_PASS',appId:5288606,httpStatus:200,filesChanged:false,installationTokenMinted:false,dispatchAttempted:false,ownerReviewStillRequired:true}));return;}
 const installation=await http('https://api.github.com/app/installations/170669547',{auth:jwt});
 if(installation.app_id!==5288606||installation.account?.login!=='VTholdings'||installation.repository_selection!=='selected'||!exactPermissions(installation.permissions)||installation.suspended_at)stop('INSTALLATION_SCOPE_REFUSED');
 let capability=await http('https://api.github.com/app/installations/170669547/access_tokens',{method:'POST',auth:jwt,body:{repository_ids:[1298726702],permissions:{actions:'write',metadata:'read'}}});
 jwt=undefined;
 const expiry=Date.parse(capability.expires_at);
 if(!exactPermissions(capability.permissions)||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+3_660_000||typeof capability.token!=='string')stop('INSTALLATION_CAPABILITY_SCOPE_OR_EXPIRY_REFUSED');
 const repos=await http('https://api.github.com/installation/repositories?per_page=100',{auth:capability.token});
 if(repos.total_count!==1||repos.repositories?.length!==1||repos.repositories[0].id!==1298726702||repos.repositories[0].full_name!==REPO)stop('SELECTED_REPOSITORY_SCOPE_REFUSED');
 const latest=await http('https://api.github.com/repos/'+REPO+'/branches/team-access-directory');
 if(latest.commit?.sha!==SHA)stop('TRAINING_SHA_CHANGED_BEFORE_DISPATCH');
 const reconciliation=await reconcileRuns(capability.token,priorCreatedAt);
 if(hash(fs.readFileSync(PRIOR))!==priorHash||fs.existsSync(PRIOR_RECEIPT))stop('PRIOR_EVIDENCE_CHANGED');
 exclusiveJson(ATTEMPT,{protocol:'VT_PHASE18_ACCESS_SETUP_APP_BOOTSTRAP_V1',environment:'TRAINING',appId:5288606,installationId:170669547,repository:REPO,workflow:WORKFLOW,executionSha:SHA,workflowSha256:WORKFLOW_HASH,priorAttemptSha256:priorHash,priorCreatedAt,reconciliation,createdAt:new Date().toISOString(),automaticRetryAllowed:false});
 const result=await http('https://api.github.com/repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/dispatches',{method:'POST',auth:capability.token,body:{ref:'team-access-directory',inputs:{expected_execution_sha:SHA}}});
 // No retry. Only public response metadata is retained; no credentials leave memory.
 capability=undefined;
 const receipt={protocol:'VT_PHASE18_ACCESS_SETUP_APP_BOOTSTRAP_RECEIPT_V1',environment:'TRAINING',appId:5288606,installationId:170669547,priorAttemptSha256:priorHash,priorCreatedAt,reconciliation,expectedActor:'vt-creatorloop-training-executor[bot]',expectedActorId:341571374,repository:REPO,workflow:WORKFLOW,executionSha:SHA,workflowSha256:WORKFLOW_HASH,dispatchAccepted:result.status===204||Number.isSafeInteger(result.workflow_run_id),runId:result.workflow_run_id||null,ownerReviewStillRequired:true,workerVersionActivated:false,cloudflareMutationPerformedByHelper:false,automaticRetryAllowed:false,completedAt:new Date().toISOString()};
 if(!receipt.dispatchAccepted)stop('DISPATCH_RESPONSE_UNCORROBORATED_DO_NOT_RERUN');
 exclusiveJson(RECEIPT,receipt);
 console.log('PHASE18_ACCESS_SETUP_APP_DISPATCH_SUBMITTED');
 console.log(JSON.stringify(receipt,null,2));
}
main().catch(error=>{
 const known=['ERR_OSSL_BAD_DECRYPT','ERR_OSSL_EVP_BAD_DECRYPT','ERR_OSSL_UNSUPPORTED','ERR_OSSL_EVP_UNSUPPORTED','OTHER_CRYPTO_ERROR'];
 const candidate=error.safeCode||error.message;
 const status=/^[A-Z0-9_]+$/.test(candidate)?candidate:'PRIVATE_OR_UNEXPECTED_FAILURE_DO_NOT_RERUN';
 console.error('PHASE18_BOOTSTRAP_STOPPED: '+status);
 console.error(JSON.stringify({status,cryptoCode:known.includes(error.safeCryptoCode)?error.safeCryptoCode:null,automaticRetryAllowed:false,privateValuesIncluded:false,network:error.safeNetwork||null,localStage:error.safeLocalStage||null}));
 process.exitCode=1;
});
