import {TRAINING_TARGET,sha256,refuse} from './training-execution-contract.mjs';
// Factory invocation alone does not resolve a credential or send an HTTP request.
export function createTrainingTransport({fetcher,resolveShortLivedCapability,verifyHostAuthorization,now=()=>Math.floor(Date.now()/1000)}) {
 for(const port of [fetcher,resolveShortLivedCapability,verifyHostAuthorization])if(typeof port!=='function')refuse('PRIVATE_TRANSPORT_PORTS_REQUIRED');
 const root=`/accounts/${TRAINING_TARGET.accountId}`,policy=root+`/access/apps/${TRAINING_TARGET.appId}/policies`;
 return async ({method,path,body,redirect})=>{
  const list=method==='GET'&&path.startsWith(policy+'?')&&/^\?page=([1-9]|1[0-9]|20)&per_page=50$/.test(path.slice(policy.length));
  const create=method==='POST'&&path===policy;
  const remove=method==='DELETE'&&path.startsWith(policy+'/')&&/^[a-f0-9-]{36}$/.test(path.slice(policy.length+1));
  const revoke=method==='POST'&&path===root+'/access/organizations/revoke_user';
  if(![list,create,remove,revoke].some(Boolean)||redirect!=='error')refuse('TRAINING_TRANSPORT_ENDPOINT_REFUSED');
  const authorization=await verifyHostAuthorization({method,path,body});
  if(!authorization||authorization.authorized!==true||authorization.requestHash!==sha256({method,path,...(body?{body}:{})})||authorization.environment!=='TRAINING'||authorization.targetAppId!==TRAINING_TARGET.appId||!Number.isInteger(authorization.expiresAt)||authorization.expiresAt<=now()||typeof authorization.credentialRef!=='string'||!authorization.credentialRef)refuse('PRIVATE_HOST_AUTHORITY_MISSING');
  let capability=await resolveShortLivedCapability(authorization.credentialRef);
  if(!capability||typeof capability.token!=='string'||!capability.token||capability.accountId!==TRAINING_TARGET.accountId||!Number.isInteger(capability.expiresAt)||capability.expiresAt<=now()||capability.expiresAt>now()+3600||capability.permissionAcceptanceVerified!==true)refuse('SHORT_LIVED_CAPABILITY_NOT_VERIFIED');
  try{
   const response=await fetcher('https://api.cloudflare.com/client/v4'+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+capability.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(response.status>=300||response.status<200)return {success:false,status:response.status};
   if(Number(response.headers.get('content-length')||0)>1048576)refuse('PROVIDER_RESPONSE_TOO_LARGE');
   const reader=response.body?.getReader();if(!reader)refuse('PROVIDER_RESPONSE_INVALID');
   let text='',bytes=0;const decoder=new TextDecoder();
   while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>1048576){await reader.cancel();refuse('PROVIDER_RESPONSE_TOO_LARGE');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
   const parsed=JSON.parse(text);
   if(parsed.success!==true)return {success:false,status:response.status};
   return {success:true,status:response.status,result:parsed.result,...(parsed.result_info?{result_info:{total_pages:parsed.result_info.total_pages,total_count:parsed.result_info.total_count}}:{})};
  }catch{refuse(method==='GET'?'PRIVATE_PROVIDER_READ_FAILED':'PRIVATE_PROVIDER_MUTATION_OUTCOME_UNKNOWN');}
  finally{capability=null;}
 };
}
