import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {dispatchHash,TRANSFERRED_EXECUTOR_ACCOUNT} from '../scripts/lib/training-mediated-dispatcher.mjs';
import {validateCustodySnapshot} from '../workers/training-managed/custody-snapshot.mjs';
import {recoverSavedCustody} from '../scripts/execution/recover-managed-custody-local.mjs';
import {mkdtemp,chmod,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const tools=process.env.MANAGED_TOOL_ROOT,bundles=process.env.MANAGED_BUNDLE_ROOT;
test('native Owner export reauthenticates, retains receipt and captures complete ledger without provider commissioning',{skip:!tools||!bundles},async()=>{
 const {Miniflare}=await import(pathToFileURL(join(tools,'node_modules/miniflare/dist/src/index.js')).href);
 const now=Math.floor(Date.now()/1000),calls=[];
 // In-memory fictional test-only keys, never operational credentials.
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'FICTIONAL-EXPORT'};
 const b64=b=>Buffer.from(b).toString('base64url');
 const sign=async payload=>{const raw=b64(JSON.stringify({alg:'RS256',kid:jwk.kid}))+'.'+b64(JSON.stringify(payload));return raw+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(raw)));};
 const c={protocol:'CREATORLOOP_MANAGED_TRAINING_V1',environment:'TRAINING',accessIssuer:'https://fictional.cloudflareaccess.com',accessAudience:'FICTIONAL-EXPORT-AUD',gatewayOrigin:'https://fictional.example',oidcAudience:'FICTIONAL-JOB-AUD',appId:22,installationId:33,repositoryId:44,ownerId:55,appBotId:66,appBotLogin:'fictional[bot]',approvedExecutor:{protocol:'CREATORLOOP_APPROVED_EXECUTOR_POLICY_V1',account:{...TRANSFERRED_EXECUTOR_ACCOUNT},reviewerId:77,humanCustodianRef:'FICTIONAL-CONTRACTOR',signerCustodianRef:'FICTIONAL-OWNER',separationEvidenceRef:'FICTIONAL-HANDOFF'},identities:[{role:'owner',subject:'owner-sub',email:'owner@example.test',githubId:77},{role:'executor',subject:'executor-sub',email:'executor@example.test',githubId:TRANSFERRED_EXECUTOR_ACCOUNT.id}],evidencePorts:{custodyExport:{url:'https://independent.example.test/custody-export',issuer:'FICTIONAL-INDEPENDENT',publicKeys:[jwk]}}};
 const ownerToken=await sign({iss:c.accessIssuer,aud:c.accessAudience,sub:'owner-sub',email:'owner@example.test',iat:now-10,exp:now+240});
 const executorToken=await sign({iss:c.accessIssuer,aud:c.accessAudience,sub:'executor-sub',email:'executor@example.test',iat:now-10,exp:now+240});
 const exportRequest={protocol:'CREATORLOOP_OWNER_CUSTODY_EXPORT_V1',exportId:'11111111-1111-1111-1111-111111111111',decisionRef:'FICTIONAL-EXPORT-DECISION',expectedVersionId:'FICTIONAL-VERSION'};
 let proofAllowed=true;
 const outbound=async request=>{
  const u=new URL(request.url);calls.push(u.hostname+u.pathname);
  if(u.hostname==='fictional.cloudflareaccess.com')return new Response(JSON.stringify({keys:[jwk]}));
  if(u.href===c.evidencePorts.custodyExport.url){
   assert.equal(request.headers.get('Cf-Access-Jwt-Assertion'),ownerToken);
   const q=await request.json();assert.equal(q.purpose,'custodyExport');
   const value={protocol:'CREATORLOOP_OWNER_CUSTODY_EXPORT_APPROVAL_V1',...q.query,decisionRef:exportRequest.decisionRef,exportId:exportRequest.exportId,dataExportAuthorized:proofAllowed,approvedAt:now-10,expiresAt:now+240};
   return new Response(JSON.stringify({jws:await sign({iss:'FICTIONAL-INDEPENDENT',aud:'CREATORLOOP_TRAINING_EVIDENCE',iat:now-10,exp:now+240,purpose:q.purpose,nonce:q.nonce,queryHash:q.queryHash,value})}));
  }
  throw Error('LOCAL CUSTODY TEST FORBIDS OTHER NETWORK');
 };
 // Harness exists only in local test runtime, never exported as a deployed Worker.
 const ledgerRequest={dispatchId:'22222222-2222-2222-2222-222222222222',decisionRef:'FICTIONAL',lane:'provider',executionSha:'a'.repeat(40),inputs:{intended_operation:'ADMIT',owner_decision_ref:'FICTIONAL',owner_reviewer_id:'77',approved_port_sha256:'b'.repeat(64)}};
 const claim={dispatchId:ledgerRequest.dispatchId,decisionRef:ledgerRequest.decisionRef,requestHash:dispatchHash(ledgerRequest)};
 const event={protocol:'CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1',...claim,bodyHash:'b'.repeat(64),workflowFile:'step18-training-provider-workflow.yml',branch:'team-access-directory',executionSha:ledgerRequest.executionSha,callerLogin:'FICTIONAL',callerId:1,humanCustodianRef:'FICTIONAL',claimRef:'FICTIONAL',observedAt:now,outcome:'OUTCOME_UNKNOWN_NO_RETRY',previousHash:null};
 const harness=`export default {async fetch(request,env){const state=env.STATE.get(env.STATE.idFromName('creatorloop-training-execution-v1'));await state.putDecision(${JSON.stringify({request:ledgerRequest,approval:{dispatchId:ledgerRequest.dispatchId,requestHash:claim.requestHash,expiresAt:now+240,reviewerId:77}})});await state.claimOnce(${JSON.stringify(claim)});await state.appendAudit(${JSON.stringify({...event,recordHash:dispatchHash(event)})});await state.claimJob(${JSON.stringify({key:'c'.repeat(64),dispatchId:ledgerRequest.dispatchId,expiresAt:now+240})});return new Response('{}');}};`;
 const mf=new Miniflare({rootPath:bundles,workers:[
  {name:'gateway',modules:true,modulesRoot:bundles,scriptPath:join(bundles,'gateway-build/gateway.js'),compatibilityDate:'2025-10-08',compatibilityFlags:['nodejs_compat'],bindings:{MANAGED_CONFIG_JSON:JSON.stringify(c)},serviceBindings:{CAPABILITY:'capability'},outboundService:outbound},
  {name:'capability',modules:true,modulesRoot:bundles,scriptPath:join(bundles,'capability-build/capability.js'),compatibilityDate:'2025-10-08',compatibilityFlags:['nodejs_compat'],bindings:{MANAGED_CONFIG_JSON:JSON.stringify(c),WORKER_VERSION_METADATA:{id:'FICTIONAL-VERSION'}},durableObjects:{STATE:{className:'TrainingExecutionState',useSQLite:true}},r2Buckets:['EVIDENCE'],outboundService:outbound},
  {name:'local-harness',modules:true,script:harness,compatibilityDate:'2025-10-08',durableObjects:{STATE:{className:'TrainingExecutionState',scriptName:'capability',useSQLite:true}}}
 ]});
 try{
  const harnessService=await mf.getWorker('local-harness');await harnessService.fetch('https://fixture.invalid/populate');
  const call=(body=exportRequest,token=ownerToken)=>mf.dispatchFetch(c.gatewayOrigin+'/v1/custody/export',{method:'POST',headers:{'Content-Type':'application/json',Origin:c.gatewayOrigin,'Cf-Access-Jwt-Assertion':token},body:JSON.stringify(body)});
  assert.equal((await call(exportRequest,executorToken)).status,403);
  assert.equal((await call({...exportRequest,expectedVersionId:'wrong'})).status,403);
  proofAllowed=false;assert.equal((await call()).status,403);proofAllowed=true;
  const response=await call();const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(validateCustodySnapshot(result.snapshot).counts.claims,1);assert.equal(result.receipt.snapshotHash,result.snapshot.snapshotHash);
  const {receiptHash,...receipt}=result.receipt;assert.equal(receiptHash,dispatchHash(receipt));
  const bucket=await mf.getR2Bucket('EVIDENCE','capability');const objects=await bucket.list();assert.equal(objects.objects.length,3);const exportReceipt=objects.objects.find(o=>o.key.startsWith('training-custody/'));const retained=await (await bucket.get(exportReceipt.key)).text();assert.equal(retained.includes('decision_json'),false);assert.equal(retained.includes(ownerToken),false);
  const directory=await mkdtemp(join(tmpdir(),'vt-native-custody-drill-'));await chmod(directory,0o700);
  try{
   const input=join(directory,'native-export.json'),output=join(directory,'offline-recovered.sqlite');await writeFile(input,JSON.stringify(result),{mode:0o600});
   const drill=await recoverSavedCustody({input,output,expectedHash:result.snapshot.snapshotHash});assert.equal(drill.isolatedRecoveryVerified,true);assert.equal(drill.activationAuthorized,false);
   const db=new DatabaseSync(output,{readOnly:true});try{for(const table of ['claims','decisions','events','jobs'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,1);}finally{db.close();}
  }finally{await rm(directory,{recursive:true,force:true});}
  // Duplicate exportId cannot overwrite its retained receipt.
  assert.equal((await call()).status,403);
  assert.ok(calls.every(c=>c.startsWith('fictional.cloudflareaccess.com/')||c.startsWith('independent.example.test/')));
 }finally{await mf.dispose();}
});
