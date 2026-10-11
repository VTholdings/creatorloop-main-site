import {configuration,accessPrincipal,githubJob,boundedJson,noRedirectFetch} from './security.mjs';
import {validateDispatchRequest} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {CUSTODY_BODY_LIMIT} from './custody-export.mjs';
import {isWorkloadPolicy} from '../../scripts/lib/training-workload-policy.mjs';
import {refuseRuntimeManagementBindings} from './workload-controls.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createGateway({fetchImpl=fetch,now=()=>Math.floor(Date.now()/1000)}={}){
 fetchImpl=noRedirectFetch(fetchImpl);
 return {async fetch(request,env){
  try{
   const c=configuration(env),url=new URL(request.url);
   refuseRuntimeManagementBindings(env,c);
   if(url.origin!==c.gatewayOrigin||url.search||request.method!=='POST'||!['/v1/approve','/v1/dispatch','/v1/run-check','/v1/provider','/v1/custody/export'].includes(url.pathname))return json({error:'Managed TRAINING route not found'},404);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
   const body=await boundedJson(new Response(request.body,{status:200}),32768);
   const human=['/v1/approve','/v1/dispatch','/v1/custody/export'].includes(url.pathname);
   let token;
   if(human){
    const workloadDispatch=url.pathname==='/v1/dispatch'&&isWorkloadPolicy(c.approvedExecutor);
    if(workloadDispatch?request.headers.has('Origin'):request.headers.get('Origin')!==c.gatewayOrigin)return json({error:'Origin rejected'},403);
    token=request.headers.get('Cf-Access-Jwt-Assertion');
    const principal=await accessPrincipal(token,c,{fetchImpl,now:now()});
    if(principal.role!==(url.pathname==='/v1/dispatch'?'executor':'owner'))return json({error:'Role rejected'},403);
    if(url.pathname!=='/v1/custody/export')validateDispatchRequest(url.pathname==='/v1/approve'?body.request:body);
   }else{
    token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
    await githubJob(token,c,body.lane,body.executionSha,{fetchImpl,now:now()});
   }
   if(typeof env.CAPABILITY?.fetch!=='function')return json({error:'Private capability service not commissioned'},503);
   // Downstream independently verifies the original token and exact payload.
   // Access context/role headers are deliberately not forwarded as proof.
   const result=await env.CAPABILITY.fetch(new Request('https://private.invalid'+url.pathname,{method:'POST',headers:{'Content-Type':'application/json',...(human?{'Cf-Access-Jwt-Assertion':token}:{Authorization:'Bearer '+token})},body:JSON.stringify(body)}));
   const value=await boundedJson(result,url.pathname==='/v1/custody/export'?CUSTODY_BODY_LIMIT:32768);
   return json(value,result.status);
  }catch{return json({error:'Managed TRAINING request refused; no automatic retry'},403);}
 }};
}
export default createGateway();
