'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const ACCOUNT='2a3b96a0b37850cd03107131baa66b6d';
const APP='e26c0d01-fc6f-4f98-ab3e-76643e56c695';
const AUD='b930eec3bb50c1e652a267e2ec83ee4a0a1532f8a341829bed54fa8eb9a39a35';
const HOST='execution-training.creatorloop.net';
const NAME='CreatorLoop TRAINING Dispatch 20261013 V1';
const CONTEXT={protocol:'CREATORLOOP_DISPATCH_ENCRYPTED_CUSTODY_V1',environment:'TRAINING',accountId:ACCOUNT,applicationId:APP,applicationAud:AUD,hostname:HOST,name:NAME};
function refuse(code){throw Object.assign(new Error(),{safeCode:code});}
function seal(payload,password){
 if(typeof password!=='string'||password.length<32)refuse('CUSTODY_PASSWORD_REQUIRED');
 const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12),key=crypto.scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 let plain;
 try{
  plain=Buffer.from(JSON.stringify(payload));
  const aad=Buffer.from(JSON.stringify(CONTEXT)),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
  const check=crypto.createDecipheriv('aes-256-gcm',key,iv);check.setAAD(aad);check.setAuthTag(tag);
  const recovered=Buffer.concat([check.update(ciphertext),check.final()]);
  try{if(!crypto.timingSafeEqual(plain,recovered))refuse('ENCRYPTION_READBACK_FAILED');}finally{recovered.fill(0);}
  return {...CONTEXT,kdf:{name:'scrypt',N:32768,r:8,p:1,salt:salt.toString('base64')},cipher:'AES-256-GCM',iv:iv.toString('base64'),tag:tag.toString('base64'),ciphertext:ciphertext.toString('base64')};
 }finally{key.fill(0);plain?.fill(0);}
}
async function createOne({api,password,write,now=Date.now}){
 // Verify encryption readiness before any provider mutation.
 seal({nonsecretPreflight:true},password);
 const app=await api('GET','/apps/'+APP);
 if(app.id!==APP||app.domain!==HOST||app.aud!==AUD||app.type!=='self_hosted')refuse('EXACT_ACCESS_APPLICATION_REQUIRED');
 const policies=await api('GET','/apps/'+APP+'/policies?per_page=100&page=1');
 if(!Array.isArray(policies)||policies.length!==1||policies[0].id!=='acf8040e-eb75-4c25-8282-517d9b5e2f58'||policies[0].decision!=='allow'||JSON.stringify(policies[0].include)!==JSON.stringify([{email:{email:'team@creatorloop.net'}}]))refuse('OWNER_POLICY_CHANGED');
 const before=[];
 for(let page=1;page<=100;page++){
  const value=await api('GET','/service_tokens?per_page=100&page='+page,true);
  if(!Array.isArray(value.result)||!Number.isSafeInteger(value.result_info?.total_pages))refuse('SERVICE_INVENTORY_FORMAT_REFUSED');
  before.push(...value.result);
  if(page>=value.result_info.total_pages)break;
  if(page===100)refuse('INVENTORY_LIMIT_REFUSED');
 }
 if(before.some(t=>t.name===NAME||/^CreatorLoop TRAINING Dispatch\b/.test(t.name||'')))refuse('EXISTING_DISPATCH_CREDENTIAL_REQUIRES_RECONCILIATION');
 const started=now();
 const credential=await api('POST','/service_tokens',false,{name:NAME,duration:'744h'});
 const expires=Date.parse(credential.expires_at),created=Date.parse(credential.created_at);
 if(typeof credential.id!=='string'||typeof credential.client_id!=='string'||typeof credential.client_secret!=='string'||credential.name!==NAME||!Number.isFinite(expires)||!Number.isFinite(created)||Math.abs(created-started)>60000||expires<=now()||expires-created>31*86400000)refuse('CREATED_CREDENTIAL_UNEXPECTED_PRESERVE_NO_RETRY');
 const encrypted=seal({id:credential.id,clientId:credential.client_id,clientSecret:credential.client_secret,expiresAt:credential.expires_at},password);
 await write(encrypted);
 credential.client_secret=undefined;
 const current=await api('GET','/service_tokens/'+credential.id);
 if(current.id!==credential.id||current.name!==NAME||current.expires_at!==credential.expires_at)refuse('CREDENTIAL_READBACK_FAILED_NO_RETRY');
 const afterApp=await api('GET','/apps/'+APP);
 const afterPolicies=await api('GET','/apps/'+APP+'/policies?per_page=100&page=1');
 if(JSON.stringify(afterApp)!==JSON.stringify(app)||JSON.stringify(afterPolicies)!==JSON.stringify(policies))refuse('ACCESS_PROTECTION_CHANGED_NO_RETRY');
 return {...CONTEXT,credentialId:credential.id,clientId:credential.client_id,expiresAt:credential.expires_at,encryptedCustodyCreated:true,ownerProtectionUnchanged:true,dispatchCredentialCountCreated:1,hostnameBound:false,workerActivated:false};
}
async function main(){
 if(process.version!=='v22.23.3'||process.env.GITHUB_REPOSITORY!=='VTholdings/creatorloop-main-site'||process.env.GITHUB_REF!=='refs/heads/team-access-directory'||process.env.GITHUB_ACTOR!=='vt-creatorloop-training-executor[bot]'||process.env.GITHUB_SHA!==process.env.EXPECTED_SHA)refuse('EXACT_PROTECTED_TRAINING_CONTEXT_REQUIRED');
 const token=process.env.CF_SETUP_TOKEN,password=process.env.CUSTODY_PASSWORD;delete process.env.CF_SETUP_TOKEN;delete process.env.CUSTODY_PASSWORD;
 if(!token)refuse('SETUP_TOKEN_REQUIRED');
 const output=path.join(process.env.RUNNER_TEMP,'phase18-dispatch-custody.enc.json');
 if(fs.existsSync(output))refuse('CUSTODY_OUTPUT_ALREADY_EXISTS');
 const api=async(method,suffix,envelope=false,body)=>{
  let r;
  try{r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/access'+suffix,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}catch{refuse(method==='POST'?'CREATE_OUTCOME_UNCERTAIN_DO_NOT_RETRY':'PROVIDER_READ_TRANSPORT_FAILED');}
  if(!r.ok)refuse('CLOUDFLARE_HTTP_'+r.status+'_DO_NOT_RETRY');
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>2000000)refuse('PROVIDER_RESPONSE_SIZE_REFUSED');
  let value;try{value=JSON.parse(bytes);}catch{refuse('PROVIDER_RESPONSE_FORMAT_REFUSED');}finally{bytes.fill(0);}
  if(value.success!==true)refuse('PROVIDER_REFUSED_DO_NOT_RETRY');
  return envelope?value:value.result;
 };
 const receipt=await createOne({api,password,write:encrypted=>fs.writeFileSync(output,JSON.stringify(encrypted)+'\n',{flag:'wx',mode:0o600})});
 console.log(JSON.stringify({...receipt,sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID}));
}
module.exports={seal,createOne,CONTEXT};
if(require.main===module)main().catch(e=>{console.error(e.safeCode||'UNEXPECTED_FAILURE_PRESERVE_CREDENTIAL_NO_RETRY');process.exitCode=1;});
