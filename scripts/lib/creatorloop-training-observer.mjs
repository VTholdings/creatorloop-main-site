import {TRAINING_TARGET,validateManifest,validateRequest,fence,policyTemplate,ownPolicy,preservedHash,verifyRuntime,verifySession,refuse} from './training-execution-contract.mjs';

// Preparation only: all reads/proofs must be privately wired by the signer Owner.
// This module has no default transport, credential resolver, key or network call.
// A supplied function/principal string alone cannot establish real custody.
export function createTrainingObserver({manifest,observerPrincipal,readPolicyPage,readCurrentRequest,verifyApproval,observeRuntime,observeSession,now=()=>Math.floor(Date.now()/1000)}) {
 for(const port of [readPolicyPage,readCurrentRequest,verifyApproval,observeRuntime,observeSession])if(typeof port!=='function')refuse('INDEPENDENT_OBSERVER_PORTS_REQUIRED');
 const m=structuredClone(manifest);validateManifest(m,now());
 if(observerPrincipal!==m.signerPrincipal||observerPrincipal===m.executorPrincipal)refuse('SIGNER_CONTROLLED_OBSERVER_REQUIRED');
 const root=`/accounts/${TRAINING_TARGET.accountId}/access/apps/${TRAINING_TARGET.appId}/policies`;
 const guard=r=>fence(r,m,{readCurrentRequest,verifyApproval,now});
 async function policies(r) {
  const list=[];let totalPages=null;
  for(let page=1;page<=20;page++) {
   await guard(r);
   let response;
   try{response=await readPolicyPage({method:'GET',path:root+`?page=${page}&per_page=50`,redirect:'error'});}catch{refuse('INDEPENDENT_POLICY_READ_FAILED');}
   if(response?.success!==true||!Array.isArray(response.result)||response.result.length>50)refuse('INDEPENDENT_POLICY_LIST_INVALID');
   const pages=response.result_info?.total_pages;
   if(pages!==undefined) {
    if(!Number.isInteger(pages)||pages<1||pages>20||page>pages||totalPages!==null&&totalPages!==pages)refuse('INDEPENDENT_POLICY_PAGINATION_INVALID');
    totalPages=pages;
   }else if(totalPages!==null)refuse('INDEPENDENT_POLICY_PAGINATION_CHANGED');
   if(response.result_info?.page!==undefined&&response.result_info.page!==page)refuse('INDEPENDENT_POLICY_PAGE_MISMATCH');
   list.push(...structuredClone(response.result));
   if(totalPages!==null?page===totalPages:response.result.length<50) {
    const ids=list.map(p=>p?.id);
    if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)refuse('INDEPENDENT_POLICY_IDS_AMBIGUOUS');
    return list;
   }
  }
  refuse('INDEPENDENT_POLICY_LIST_INCOMPLETE');
 }
 return async request=> {
  const r=structuredClone(request);validateRequest(r,m,now());await guard(r);
  const list=await policies(r);
  if(preservedHash(list,m)!==m.preservedPoliciesHash)refuse('INDEPENDENT_PRESERVATION_MISMATCH');
  const matches=list.filter(p=>ownPolicy(p,m));
  if(matches.length>1||list.some(p=>p.name===policyTemplate(m).name&&!ownPolicy(p,m)))refuse('INDEPENDENT_DEDICATED_POLICY_COLLISION');
  if(matches[0]&&!/^[a-f0-9-]{36}$/.test(matches[0].id||''))refuse('INDEPENDENT_POLICY_ID_INVALID');
  if(r.operation==='ADMIT'&&!matches[0])refuse('INDEPENDENT_ADMISSION_POLICY_MISSING');
  if(r.operation==='REVOKE'&&matches.length)refuse('INDEPENDENT_REVOKED_POLICY_PRESENT');
  // Active signer-controlled proofs; not executor-provided API success booleans.
  let runtime,session;
  try{runtime=await observeRuntime();session=await observeSession(structuredClone(r));}catch{refuse('INDEPENDENT_RUNTIME_SESSION_READ_FAILED');}
  verifyRuntime(runtime,m,now());verifySession(session,r,m,now());
  await guard(r);
  return {observerPrincipal,policyVerified:true,policyId:r.operation==='ADMIT'?matches[0].id:m.ownedPolicyId,ownerPolicyUnchanged:true,servicePoliciesUnchanged:true,runtime:structuredClone(runtime),session:structuredClone(session)};
 };
}
