'use strict';
// Owner-Mac administrative bootstrap only. Not an executor/runtime replacement.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const HOME='/Users/tt1';
const ROOT=HOME+'/.vt-creatorloop';
const KEY=ROOT+'/private-signing/training-executor-github-app-5288606-v3-resecured.pem';
const ATTEMPT=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-attempt.json';
const RECEIPT=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-receipt.json';
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
async function http(url,{method='GET',auth,body,raw=false}={}){
 const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'VT-Phase18-Owner-Administrative-Bootstrap'};
 if(auth)headers.Authorization='Bearer '+auth;
 if(body)headers['Content-Type']='application/json';
 let r;
 try{r=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers,body:body?JSON.stringify(body):undefined});}
 catch(error){
  const stage=url==='https://api.github.com/app'?'APP_IDENTITY':url==='https://api.github.com/app/installations/170669547'?'APP_INSTALLATION':url.endsWith('/access_tokens')?'INSTALLATION_TOKEN':url.endsWith('/dispatches')?'WORKFLOW_DISPATCH':url.includes('/installation/repositories')?'REPOSITORY_SCOPE':'REVIEWED_SOURCE';
  const allowed=['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET','UND_ERR_INVALID_ARG','ERR_INVALID_CHAR','ERR_INVALID_ARG_VALUE','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT'];
  const candidate=error?.cause?.code||error?.code;
  const code=allowed.includes(candidate)?candidate:error?.name==='TimeoutError'?'REQUEST_TIMEOUT':'UNCLASSIFIED_TRANSPORT_ERROR';
  const safe=new Error(method==='POST'?'POST_OUTCOME_UNCERTAIN_DO_NOT_RERUN':'GITHUB_READ_TRANSPORT_FAILED');
  safe.safeNetwork={stage,method,code};throw safe;
 }
 if(!r.ok)stop('GITHUB_HTTP_'+r.status+'_DO_NOT_RERUN');
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
 const result={protocol:'VT_PHASE18_V3_UNLOCK_DIAGNOSTIC_V1',ciphertextVerified:false,encryptionMetadataVerified:false,unlockVerified:false,publicPairVerified:false,cryptoCode:null,networkRequests:0,filesChanged:false,dispatchAttempted:false};
 try{
  if(process.platform!=='darwin'||process.version!=='v22.23.3'||process.env.HOME!=='/Users/tt1')refuse('EXACT_OWNER_MAC_REQUIRED');
  const stat=fs.lstatSync(KEY);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||stat.nlink!==1||(stat.mode&0o777)!==0o400||fs.realpathSync(KEY)!==KEY||stat.size>65536)refuse('PRIVATE_KEY_CUSTODY_GUARD_REFUSED');
  const fd=fs.openSync(KEY,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const opened=fs.fstatSync(fd);if(opened.ino!==stat.ino||opened.dev!==stat.dev||opened.mtimeMs!==stat.mtimeMs)refuse('FILE_CHANGED_DURING_READ');encrypted=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
  if(sha(encrypted)!==EXPECTED)refuse('VERIFIED_V3_CIPHERTEXT_MISMATCH');
  result.ciphertextVerified=true;
  try{result.encryption=encryptionInfo(encrypted);}catch{refuse('ENCRYPTION_METADATA_INCOMPATIBLE');}
  if(!crypto.getCiphers().includes('aes-256-cbc')||!crypto.getHashes().includes(result.encryption.prf==='HMAC-SHA256'?'sha256':'sha1'))refuse('CRYPTO_ALGORITHM_UNAVAILABLE');
  result.encryptionMetadataVerified=true;
  let input;
  try{input=execFileSync('/usr/bin/osascript',['-e','activate','-e','text returned of (display dialog "Enter the confirmed saved LOCAL ENCRYPTION passphrase recorded for the resecured App 5288606 V3 key on October 16. Not a Cloudflare token, GitHub password, or private-key contents. Cancel if unavailable. After verified unlock, submit only the reviewed Access setup as the App; Owner approval remains required." with title "CreatorLoop — Verified V3 App Setup" default answer "" buttons {"Cancel", "Check saved V3 passphrase"} default button "Check saved V3 passphrase" cancel button "Cancel" with hidden answer)'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:300000,maxBuffer:8192}).replace(/\r?\n$/,'');}catch{refuse('PRIVATE_INPUT_CANCELLED_OR_UNAVAILABLE');}
  if(!input)refuse('SAVED_PASSPHRASE_UNAVAILABLE');
  if(input.startsWith('cfat_')){input=undefined;refuse('CLOUDFLARE_TOKEN_SUPPLIED_NOT_V3_PASSPHRASE');}
  if(input.includes('-----BEGIN ')){input=undefined;refuse('KEY_CONTENT_SUPPLIED_NOT_V3_PASSPHRASE');}
  secretBytes=Buffer.from(input,'utf8');input=undefined;
  try{key=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase:secretBytes});}
  catch(e){
   const allowed=['ERR_OSSL_BAD_DECRYPT','ERR_OSSL_EVP_BAD_DECRYPT','ERR_OSSL_UNSUPPORTED','ERR_OSSL_EVP_UNSUPPORTED'];
   result.cryptoCode=allowed.includes(e.code)?e.code:'OTHER_CRYPTO_ERROR';
   if(['ERR_OSSL_BAD_DECRYPT','ERR_OSSL_EVP_BAD_DECRYPT'].includes(e.code))refuse('SUPPLIED_VALUE_DOES_NOT_UNLOCK_VERIFIED_V3');
   refuse('DECRYPTION_IMPLEMENTATION_OR_RUNTIME_ERROR');
  }finally{secretBytes.fill(0);secretBytes=undefined;}
  result.unlockVerified=true;
  publicDer=crypto.createPublicKey(key).export({format:'der',type:'spki'});
  if(sha(publicDer)!==SPKI)refuse('UNLOCKED_PUBLIC_KEY_MISMATCH');
  result.publicPairVerified=true;
  const final=fs.readFileSync(KEY);const unchanged=sha(final)===EXPECTED;final.fill(0);
  if(!unchanged)refuse('V3_CHANGED_DURING_DIAGNOSTIC');
  result.status='EXISTING_V3_UNLOCK_AND_PUBLIC_PAIR_VERIFIED';
  return {privateKey:key,proof:result};
 }catch(e){const error=new Error();error.safeCode=e.safeCode||'UNEXPECTED_LOCAL_UNLOCK_FAILURE';error.safeCryptoCode=result.cryptoCode;throw error;}
 finally{encrypted?.fill(0);secretBytes?.fill(0);publicDer?.fill(0);key=undefined;}
}
module.exports={unlockVerifiedV3};

return module.exports;})();
// END VERIFIED V3 UNLOCK COMPONENT
async function main(){
 if(process.platform!=='darwin'||process.env.HOME!==HOME||process.version!=='v22.23.3'||process.argv[2]!=='PHASE18_ONE_ACCESS_SETUP_APP_DISPATCH')stop('EXACT_APPROVED_MAC_NODE_AND_MARKER_REQUIRED');
 for(const p of [ROOT,ROOT+'/private-signing',ROOT+'/evidence'])privatePath(p,'directory');
 if(fs.existsSync(ATTEMPT)||fs.existsSync(RECEIPT))stop('PRIOR_ATTEMPT_PRESENT_DO_NOT_RERUN');
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
 const installation=await http('https://api.github.com/app/installations/170669547',{auth:jwt});
 if(installation.app_id!==5288606||installation.account?.login!=='VTholdings'||installation.repository_selection!=='selected'||!exactPermissions(installation.permissions)||installation.suspended_at)stop('INSTALLATION_SCOPE_REFUSED');
 exclusiveJson(ATTEMPT,{protocol:'VT_PHASE18_ACCESS_SETUP_APP_BOOTSTRAP_V1',environment:'TRAINING',appId:5288606,installationId:170669547,repository:REPO,workflow:WORKFLOW,executionSha:SHA,workflowSha256:WORKFLOW_HASH,createdAt:new Date().toISOString(),automaticRetryAllowed:false});
 let capability=await http('https://api.github.com/app/installations/170669547/access_tokens',{method:'POST',auth:jwt,body:{repository_ids:[1298726702],permissions:{actions:'write',metadata:'read'}}});
 jwt=undefined;
 const expiry=Date.parse(capability.expires_at);
 if(!exactPermissions(capability.permissions)||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+3_660_000||typeof capability.token!=='string')stop('INSTALLATION_CAPABILITY_SCOPE_OR_EXPIRY_REFUSED');
 const repos=await http('https://api.github.com/installation/repositories?per_page=100',{auth:capability.token});
 if(repos.total_count!==1||repos.repositories?.length!==1||repos.repositories[0].id!==1298726702||repos.repositories[0].full_name!==REPO)stop('SELECTED_REPOSITORY_SCOPE_REFUSED');
 const latest=await http('https://api.github.com/repos/'+REPO+'/branches/team-access-directory');
 if(latest.commit?.sha!==SHA)stop('TRAINING_SHA_CHANGED_BEFORE_DISPATCH');
 const result=await http('https://api.github.com/repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/dispatches',{method:'POST',auth:capability.token,body:{ref:'team-access-directory',inputs:{expected_execution_sha:SHA}}});
 // No retry. Only public response metadata is retained; no credentials leave memory.
 capability=undefined;
 const receipt={protocol:'VT_PHASE18_ACCESS_SETUP_APP_BOOTSTRAP_RECEIPT_V1',environment:'TRAINING',appId:5288606,installationId:170669547,expectedActor:'vt-creatorloop-training-executor[bot]',expectedActorId:341571374,repository:REPO,workflow:WORKFLOW,executionSha:SHA,workflowSha256:WORKFLOW_HASH,dispatchAccepted:result.status===204||Number.isSafeInteger(result.workflow_run_id),runId:result.workflow_run_id||null,ownerReviewStillRequired:true,workerVersionActivated:false,cloudflareMutationPerformedByHelper:false,automaticRetryAllowed:false,completedAt:new Date().toISOString()};
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
 console.error(JSON.stringify({status,cryptoCode:known.includes(error.safeCryptoCode)?error.safeCryptoCode:null,automaticRetryAllowed:false,privateValuesIncluded:false,network:error.safeNetwork||null}));
 process.exitCode=1;
});
