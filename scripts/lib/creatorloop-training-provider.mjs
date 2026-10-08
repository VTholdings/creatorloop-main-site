import {TRAINING_TARGET,validateManifest,validateRequest,fence,policyTemplate,ownPolicy,preservedHash,verifySession,verifyRuntime,refuse} from './training-execution-contract.mjs';

// External custody host supplies transports and independently authenticated proof ports.
// Importing this module never reads a token, calls a provider or performs admission.
export function createTrainingProvider({manifest,transport,readCurrentRequest,verifyApproval,observeSession,observeRuntime,now=()=>Math.floor(Date.now()/1000)}) {
 for(const port of [transport,readCurrentRequest,verifyApproval,observeSession,observeRuntime])if(typeof port!=='function')refuse('EXTERNAL_PROVIDER_PORTS_REQUIRED');
 const m=structuredClone(manifest);validateManifest(m,now());
 const policyRoot=`/accounts/${TRAINING_TARGET.accountId}/access/apps/${TRAINING_TARGET.appId}/policies`;
 let ownedPolicyId=m.ownedPolicyId||null,mutationAttempted=false;
 const guard=r=>fence(r,m,{readCurrentRequest,verifyApproval,now});
 const call=async(method,path,body)=>{
  let result;
  try{result=await transport({method,path,...(body?{body:structuredClone(body)}:{}),redirect:'error'});}catch{refuse(method==='GET'?'PROVIDER_READ_FAILED':'PROVIDER_MUTATION_OUTCOME_UNKNOWN_NO_RETRY');}
  if(!result||result.success!==true)refuse(method==='GET'?'PROVIDER_READ_REFUSED':'PROVIDER_MUTATION_REFUSED_NO_RETRY');
  return result;
 };
 const policies=async()=>{
  const out=[];
  for(let page=1;page<=20;page++){
   const result=await call('GET',policyRoot+`?page=${page}&per_page=50`);
   if(!Array.isArray(result.result))refuse('POLICY_LIST_INVALID');out.push(...result.result);
   const pages=result.result_info?.total_pages;
   if(pages!==undefined?Number.isInteger(pages)&&pages>=1&&page>=pages:result.result.length<50)return out;
  }
  refuse('POLICY_LIST_INCOMPLETE');
 };
 const inspect=async r=>{
  await guard(r);
  const list=await policies();
  if(preservedHash(list,m)!==m.preservedPoliciesHash)refuse('OWNER_SERVICE_POLICIES_CHANGED');
  const matches=list.filter(p=>ownPolicy(p,m));
  if(matches.length>1||list.some(p=>p.name===policyTemplate(m).name&&!ownPolicy(p,m)))refuse('DEDICATED_POLICY_COLLISION');
  if(matches[0]&&!/^[a-f0-9-]{36}$/.test(matches[0].id||''))refuse('POLICY_ID_INVALID');
  if(ownedPolicyId&&matches[0]&&matches[0].id!==ownedPolicyId)refuse('POLICY_OWNERSHIP_MISMATCH');
  return {list,policy:matches[0]};
 };
 return {
  async currentRequest(operatorId){
   if(operatorId!==m.subject.operatorId)refuse('SUBJECT_LOOKUP_REFUSED');
   const current=await readCurrentRequest(operatorId);validateRequest(current?.request,m,now());
   if(current.personnelVersion!==m.requestVersion)refuse('PERSONNEL_VERSION_CHANGED');
   await guard(current.request);return current.request;
  },
  async ensureApprovedIndividualAdmission(r){
   validateRequest(r,m,now());if(r.operation!=='ADMIT')refuse('ADMIT_OPERATION_REFUSED');
   const before=await inspect(r);
   verifyRuntime(await observeRuntime(),m,now());
   if(before.policy){ownedPolicyId=before.policy.id;return;}
   if(mutationAttempted)refuse('MUTATION_REPLAY_REFUSED');
   await guard(r);mutationAttempted=true;
   const created=await call('POST',policyRoot,policyTemplate(m));
   if(!ownPolicy(created.result,m)||!/^[a-f0-9-]{36}$/.test(created.result?.id||''))refuse('CREATED_POLICY_UNVERIFIED_NO_RETRY');
   ownedPolicyId=created.result.id;
   const after=await inspect(r);if(after.policy?.id!==ownedPolicyId)refuse('ADMISSION_POLICY_NOT_CORROBORATED');
  },
  async revokeIndividualAdmissionAndSessions(r){
   validateRequest(r,m,now());if(r.operation!=='REVOKE')refuse('REVOKE_OPERATION_REFUSED');
   const before=await inspect(r);verifyRuntime(await observeRuntime(),m,now());
   if(mutationAttempted)refuse('MUTATION_REPLAY_REFUSED');
   await guard(r);mutationAttempted=true;
   if(before.policy){
    if(before.policy.id!==m.ownedPolicyId)refuse('REVOKE_POLICY_NOT_OWNED');
    await call('DELETE',policyRoot+'/'+m.ownedPolicyId);
   }
   const removed=await inspect(r);if(removed.policy)refuse('POLICY_REMOVAL_NOT_CORROBORATED');
   await guard(r);
   await call('POST',`/accounts/${TRAINING_TARGET.accountId}/access/organizations/revoke_user`,{email:m.subject.email,user_uid:m.subject.subject,devices:false,warp_session_reauth:false});
   // Provider success is not denial evidence; independent old/fresh session proof follows.
  },
  async verifyIndividualState(r){
   const observed=await inspect(r);const runtime=await observeRuntime();verifyRuntime(runtime,m,now());
   const session=verifySession(await observeSession(structuredClone(r)),r,m,now());
   if(r.operation==='ADMIT'&&!observed.policy)refuse('ADMISSION_POLICY_MISSING');
   if(r.operation==='REVOKE'&&observed.policy)refuse('REVOCATION_POLICY_PRESENT');
   await guard(r);
   return {email:m.subject.email,subject:m.subject.subject,environment:'TRAINING',audience:TRAINING_TARGET.audience,databaseId:TRAINING_TARGET.databaseId,deploymentId:TRAINING_TARGET.deploymentId,operation:r.operation,policyId:ownedPolicyId||m.ownedPolicyId,policyVerified:true,sessionVerified:true,ownerPolicyUnchanged:true,servicePoliciesUnchanged:true,...(r.operation==='REVOKE'?{revokedBefore:session.revokedBefore}:{})};
  }
 };
}
