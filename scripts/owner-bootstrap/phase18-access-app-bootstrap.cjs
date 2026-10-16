'use strict';
// Owner-Mac administrative bootstrap only. Not an executor/runtime replacement.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const HOME='/Users/tt1';
const ROOT=HOME+'/.vt-creatorloop';
const KEY=ROOT+'/private-signing/training-executor-github-app-5288606-v2.pem';
const ATTEMPT=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-attempt.json';
const RECEIPT=ROOT+'/evidence/phase18-access-setup-app-bootstrap-v1-receipt.json';
const REPO='VTholdings/creatorloop-main-site';
const SHA='b122268c0c061466f3d130082dac8dbb3db98871';
const REGISTRATION='9d9f116d2508df5e4ca0a00f381cf0aa0a50b6b6';
const WORKFLOW='phase18-dispatch-access-setup.yml';
const WORKFLOW_HASH='fe47d1cc23d59d5c42c326beb8cfa626c9373153d99442770b5dd8e4370b5e1b';
const KEY_HASH='c9e0a09cf18d01c8b752a718aaed0abdc626233f0faf7932310d9ef1487dbc3c';
const SPKI_HASH='bca0fe5ab36dd06d23c4722536edfc08027075361690b0ad958b99a589f72c3e';
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
 catch{stop(method==='POST'?'POST_OUTCOME_UNCERTAIN_DO_NOT_RERUN':'PUBLIC_OR_AUTHENTICATED_READ_FAILED');}
 if(!r.ok)stop('GITHUB_HTTP_'+r.status+'_DO_NOT_RERUN');
 if(r.status===204)return {status:204};
 const chunks=[];let size=0;
 for await(const part of r.body){size+=part.length;if(size>2_000_000)stop('RESPONSE_SIZE_REFUSED');chunks.push(part);}
 const bytes=Buffer.concat(chunks);
 if(raw)return bytes;
 try{return JSON.parse(bytes.toString('utf8'));}catch{stop('RESPONSE_FORMAT_REFUSED');}
}
function exactPermissions(p){return p&&Object.keys(p).sort().join('|')==='actions|metadata'&&p.actions==='write'&&p.metadata==='read';}
async function main(){
 if(process.platform!=='darwin'||process.env.HOME!==HOME||process.version!=='v22.23.3'||process.argv[2]!=='PHASE18_ONE_ACCESS_SETUP_APP_DISPATCH')stop('EXACT_APPROVED_MAC_NODE_AND_MARKER_REQUIRED');
 for(const p of [ROOT,ROOT+'/private-signing',ROOT+'/evidence'])privatePath(p,'directory');
 privatePath(KEY,'file');
 if(fs.existsSync(ATTEMPT)||fs.existsSync(RECEIPT))stop('PRIOR_ATTEMPT_PRESENT_DO_NOT_RERUN');
 const encrypted=fs.readFileSync(KEY);
 if(hash(encrypted)!==KEY_HASH)stop('EXISTING_V2_CIPHERTEXT_MISMATCH');
 for(const ref of [REGISTRATION,SHA]){
  const bytes=await http('https://raw.githubusercontent.com/'+REPO+'/'+ref+'/.github/workflows/'+WORKFLOW,{raw:true});
  if(hash(bytes)!==WORKFLOW_HASH)stop('REVIEWED_WORKFLOW_BYTES_MISMATCH');
 }
 const branch=await http('https://api.github.com/repos/'+REPO+'/branches/team-access-directory');
 if(branch.commit?.sha!==SHA)stop('REVIEWED_TRAINING_SHA_MOVED');
 let passphrase;
 try{passphrase=execFileSync('/usr/bin/osascript',['-e','text returned of (display dialog "Enter the EXISTING V2 GitHub App key encryption passphrase. This submits only the reviewed Access setup as App 5288606; Owner approval is still required in GitHub." default answer "" with hidden answer buttons {"Cancel", "Continue"} default button "Continue" with title "VT Phase 18 — Existing App Key")'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).replace(/\r?\n$/,'');}
 catch{stop('PRIVATE_INPUT_CANCELLED_NO_DISPATCH');}
 let privateKey;
 try{privateKey=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase});}
 catch{stop('EXISTING_V2_UNLOCK_FAILED_NO_DISPATCH');}
 finally{passphrase=undefined;encrypted.fill(0);}
 if(hash(crypto.createPublicKey(privateKey).export({format:'der',type:'spki'}))!==SPKI_HASH)stop('EXISTING_APP_KEY_PUBLIC_PAIR_MISMATCH');
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
main().catch(error=>{console.error('PHASE18_BOOTSTRAP_STOPPED: '+(/^[A-Z0-9_]+$/.test(error.message)?error.message:'PRIVATE_OR_UNEXPECTED_FAILURE_DO_NOT_RERUN'));process.exitCode=1;});
