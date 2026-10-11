import {configuration,accessPrincipal,githubJob,independentEvidence,boundedJson,exact,noRedirectFetch} from './security.mjs';
import {installationCapability} from './app-capability.mjs';
import {verifyManagedCommissioning} from './commissioning.mjs';
import {authorizeCustodyExport} from './custody-export.mjs';
import {createMediatedDispatcher,validateDispatchRequest,dispatchHash,DISPATCH_WORKFLOWS} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {createGithubDispatchTransport} from '../../scripts/lib/training-github-dispatch-transport.mjs';
import {createTrainingProvider} from '../../scripts/lib/creatorloop-training-provider.mjs';
import {createTrainingTransport} from '../../scripts/lib/creatorloop-training-transport.mjs';
import {TRAINING_TARGET,validateManifest,validateRequest,sha256,refuse} from '../../scripts/lib/training-execution-contract.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createCapability({fetchImpl=fetch,now=()=>Math.floor(Date.now()/1000)}={}){
 fetchImpl=noRedirectFetch(fetchImpl);
 return {async fetch(request,env){
  try{
   const c=configuration(env),url=new URL(request.url);
   if(request.method!=='POST'||url.search||!['/v1/approve','/v1/dispatch','/v1/run-check','/v1/provider','/v1/custody/export'].includes(url.pathname))return json({error:'Private route refused'},404);
   const body=await boundedJson(new Response(request.body,{status:200}),32768);
   if(url.pathname==='/v1/custody/export'){
    const authority=await authorizeCustodyExport({request,body,env,config:c,fetchImpl,now:now()});
    if(!env.STATE?.idFromName||!env.STATE?.get)refuse('CUSTODY_STATE_NOT_PROVISIONED');
    const state=env.STATE.get(env.STATE.idFromName('creatorloop-training-execution-v1'));
    const result=await state.exportCustody({request:body,authority});
    if(authority.expiresAt<=now())refuse('CUSTODY_EXPORT_AUTHORIZATION_EXPIRED');
    return json(result);
   }
   await verifyManagedCommissioning(env,c,{fetchImpl,now:now()});
   if(!env.STATE?.idFromName||!env.STATE?.get)refuse('MANAGED_STATE_NOT_COMMISSIONED');
   const state=env.STATE.get(env.STATE.idFromName('creatorloop-training-execution-v1'));
   const human=['/v1/approve','/v1/dispatch'].includes(url.pathname);
   const identityToken=human?request.headers.get('Cf-Access-Jwt-Assertion'):request.headers.get('Authorization')?.replace(/^Bearer /,'');
   const evidence=(purpose,query)=>independentEvidence(c,purpose,query,{fetchImpl,now:now(),identityToken,identityType:human?'access':'oidc'});
   if(url.pathname==='/v1/approve'){
    const principal=await accessPrincipal(request.headers.get('Cf-Access-Jwt-Assertion'),c,{fetchImpl,now:now()});
    if(principal.role!=='owner'||!exact(body,['request']))refuse('OWNER_EXACT_APPROVAL_REQUIRED');
    const r=validateDispatchRequest(body.request);
    const approval=await evidence('dispatchApproval',{request:r,requestHash:dispatchHash(r),reviewerId:principal.id,executorPolicyHash:dispatchHash(c.approvedExecutor)});
    if(approval?.reviewerId!==principal.id||approval.requestHash!==dispatchHash(r)||approval.executorPolicyHash!==dispatchHash(c.approvedExecutor)||approval.humanCustodianRef!==c.approvedExecutor.humanCustodianRef||approval.dispatchId!==r.dispatchId||approval.decisionRef!==r.decisionRef||approval.callerId!==c.approvedExecutor.account.id||approval.callerLogin!==c.approvedExecutor.account.login||approval.expiresAt<=now())refuse('INDEPENDENT_OWNER_APPROVAL_NOT_CORROBORATED');
    return json(await state.putDecision({request:r,approval}));
   }
   if(url.pathname==='/v1/dispatch'){
    const token=request.headers.get('Cf-Access-Jwt-Assertion');
    const r=validateDispatchRequest(body);
    const stored=await state.decision(r.dispatchId);
    if(dispatchHash(stored.request)!==dispatchHash(r))refuse('IMMUTABLE_DISPATCH_DECISION_MISMATCH');
    const decision=async()=>{
     const fresh=await evidence('dispatchApproval',{request:r,requestHash:dispatchHash(r),reviewerId:stored.approval.reviewerId,executorPolicyHash:dispatchHash(c.approvedExecutor)});
     if(dispatchHash(fresh)!==dispatchHash(stored.approval))refuse('CURRENT_OWNER_DECISION_CHANGED');return fresh;
    };
    const transport=createGithubDispatchTransport({now,fetchImpl,
     verifyDispatchAuthorization:async call=>{const approved=await decision();return {...call,decisionRef:r.decisionRef,expiresAt:approved.expiresAt,capabilityRef:'managed-github-app',appId:c.appId,installationId:c.installationId};},
     resolveAppCapability:async ref=>{if(ref!=='managed-github-app')refuse('APP_CAPABILITY_REFUSED');await verifyManagedCommissioning(env,c,{fetchImpl,now:now()});return installationCapability(env,c,{fetchImpl,now:now()});}
    });
    const dispatcher=createMediatedDispatcher({approvedExecutor:c.approvedExecutor,now,
     authenticateCaller:async()=>{const p=await accessPrincipal(token,c,{fetchImpl,now:now()});if(p.role!=='executor')refuse('EXECUTOR_ROLE_REQUIRED');return p;},
     verifyOwnerDecision:decision,
     readGithub:async path=>boundedJson(await fetchImpl('https://api.github.com'+path,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/vnd.github+json'}})),
     dispatchGithub:transport,claimOnce:claim=>state.claimOnce(claim),appendAudit:event=>state.appendAudit(event)
    });
    return json(await dispatcher({request:r}));
   }
   if(!exact(body,['dispatchId','lane','executionSha']))refuse('EXACT_JOB_REQUEST_REQUIRED');
   const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
   const job=await githubJob(token,c,body.lane,body.executionSha,{fetchImpl,now:now()});
   const stored=await state.decision(body.dispatchId);
   if(stored.request.executionSha!==body.executionSha||stored.request.lane!==body.lane)refuse('JOB_DECISION_SOURCE_MISMATCH');
   const events=await state.retainedEvents(body.dispatchId);
   const accepted=events.find(e=>e.outcome==='ACCEPTED_PENDING_RUN_VERIFICATION'&&String(e.runId)===job.runId||e.outcome==='ACCEPTED_PENDING_RUN_CORRELATION');
   if(!accepted)refuse('EXACT_RETAINED_DISPATCH_RUN_REQUIRED');
   const runProof=await evidence('runApproval',{dispatchId:body.dispatchId,runId:job.runId,requestHash:dispatchHash(stored.request),executionSha:body.executionSha,executorPolicyHash:dispatchHash(c.approvedExecutor)});
   if(runProof?.dispatchId!==body.dispatchId||runProof.runId!==job.runId||runProof.executionSha!==body.executionSha||runProof.workflowFile!==DISPATCH_WORKFLOWS[body.lane]||runProof.callerId!==c.approvedExecutor.account.id||runProof.requestHash!==dispatchHash(stored.request)||runProof.executorPolicyHash!==dispatchHash(c.approvedExecutor)||runProof.appBotId!==c.appBotId||!Number.isInteger(runProof.expiresAt)||runProof.expiresAt<=now())refuse('CURRENT_INDEPENDENT_RUN_APPROVAL_REQUIRED');
   if(url.pathname==='/v1/run-check')return json({dispatchId:body.dispatchId,runId:job.runId,executionSha:body.executionSha,mediatedRunVerified:true,protectedExecutionAccepted:false});
   if(body.lane!=='provider')refuse('PROVIDER_LANE_ONLY');
   const bundle=await evidence('executionBundle',{dispatchId:body.dispatchId,runId:job.runId,requestHash:dispatchHash(stored.request)});
   const m=bundle?.manifest,r=bundle?.request;
   validateManifest(m,now());validateRequest(r,m,now());
   if(m.executionSha!==body.executionSha||m.ownerDecisionRef!==stored.request.decisionRef||m.operation!==stored.request.inputs.intended_operation)refuse('EXACT_PROVIDER_RUN_OPERATION_REQUIRED');
   await state.claimJob({key:dispatchHash({requestId:r.id,requestVersion:r.requestVersion,operation:r.operation}),dispatchId:body.dispatchId,expiresAt:Math.min(job.expiresAt,m.expiresAt)});
   const append=async(outcome)=>{
    const retained=await state.retainedEvents(body.dispatchId),last=retained.at(-1);
    const record={...accepted,runId:Number(job.runId),observedAt:now(),outcome,previousHash:last.recordHash};delete record.recordHash;
    return state.appendAudit({...record,recordHash:dispatchHash(record)});
   };
   await append('PROVIDER_SEND_INTENT');
   try{
    const verifyApproval=()=>evidence('providerApproval',{manifestHash:sha256(m),ownerDecisionRef:m.ownerDecisionRef,executionSha:m.executionSha});
    const readCurrentRequest=operatorId=>evidence('currentRequest',{operatorId,requestId:m.requestId});
    const transport=createTrainingTransport({now,fetcher:fetchImpl,
     verifyHostAuthorization:call=>evidence('providerCapability',{...call,requestId:r.id,manifestHash:sha256(m),requestHash:sha256(call)}),
     resolveShortLivedCapability:async ref=>{
      await verifyManagedCommissioning(env,c,{fetchImpl,now:now()});
      const meta=c.providerCapability;
      if(!meta||meta.credentialRef!==ref||ref!==m.providerCredentialRef||meta.accountId!==TRAINING_TARGET.accountId||!Number.isInteger(meta.expiresAt)||meta.expiresAt<=now()||meta.permissionAcceptanceVerified!==true||typeof env.TRAINING_PROVIDER_TOKEN!=='string'||!env.TRAINING_PROVIDER_TOKEN)refuse('ACTUAL_SCOPED_PROVIDER_CAPABILITY_REQUIRED');
      const scope=await evidence('providerScope',{credentialRef:ref,capabilityHash:dispatchHash(meta),manifestHash:sha256(m)});
      if(scope?.capabilityHash!==dispatchHash(meta)||scope.credentialRef!==ref||scope.effectiveScopeVerified!==true||scope.expiresAt!==meta.expiresAt)refuse('INDEPENDENT_PROVIDER_SCOPE_NOT_CORROBORATED');
      return {...meta,token:env.TRAINING_PROVIDER_TOKEN};
     }
    });
    const provider=createTrainingProvider({manifest:m,transport,verifyApproval,readCurrentRequest,now,observeRuntime:()=>evidence('runtime',{applicationSha:m.applicationSha}),observeSession:request=>evidence('session',{requestId:request.id,operation:request.operation,subject:m.subject.subject})});
    if(r.operation==='ADMIT')await provider.ensureApprovedIndividualAdmission(r);else await provider.revokeIndividualAdmissionAndSessions(r);
    await provider.verifyIndividualState(r);
    await append('PROVIDER_STATE_OBSERVED_SIGNER_ACCEPTANCE_PENDING');
    // Never generate or issue an admission receipt or expose subject/session data.
    return json({dispatchId:body.dispatchId,runId:job.runId,requestId:r.id,operation:r.operation,providerObserved:true,signerAcceptancePending:true,protectedExecutionAccepted:false});
   }catch{await append('PROVIDER_OUTCOME_UNRESOLVED_NO_RETRY');refuse('PROVIDER_OPERATION_UNRESOLVED_NO_RETRY');}
  }catch{return json({error:'Managed capability refused or outcome unresolved; no automatic retry'},403);}
 }};
}
