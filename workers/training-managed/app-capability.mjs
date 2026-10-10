import {boundedJson,b64} from './security.mjs';
import {TRAINING_REPOSITORY} from '../../scripts/lib/training-github-environments.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
const encoder=new TextEncoder();
export async function installationCapability(env,c,{fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
 const pem=env.GITHUB_APP_PRIVATE_KEY;
 if(typeof pem!=='string'||!pem.startsWith('-----BEGIN PRIVATE KEY-----'))refuse('PRIVATELY_PROVISIONED_APP_KEY_REQUIRED');
 const der=Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),ch=>ch.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const header=b64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'}))),payload=b64(encoder.encode(JSON.stringify({iat:now-30,exp:now+300,iss:String(c.appId)})));
 const unsigned=header+'.'+payload,signature=b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(unsigned)));
 const result=await boundedJson(await fetchImpl(`https://api.github.com/app/installations/${c.installationId}/access_tokens`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+unsigned+'.'+signature,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({repository_ids:[c.repositoryId],permissions:{actions:'write'}})}));
 const permissions=result.permissions,expiry=Math.floor(Date.parse(result.expires_at)/1000);
 if(typeof result.token!=='string'||!result.token||!permissions||Object.keys(permissions).sort().join('|')!=='actions|metadata'||permissions.actions!=='write'||permissions.metadata!=='read'||!Number.isInteger(expiry)||expiry<=now||expiry>now+3600)refuse('ACTUAL_APP_CAPABILITY_SCOPE_REFUSED');
 const repositories=await boundedJson(await fetchImpl('https://api.github.com/installation/repositories?per_page=100',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+result.token,Accept:'application/vnd.github+json'}}));
 if(repositories.total_count!==1||repositories.repositories?.length!==1||repositories.repositories[0].id!==c.repositoryId||repositories.repositories[0].full_name!==TRAINING_REPOSITORY)refuse('ACTUAL_APP_REPOSITORY_SELECTION_REFUSED');
 return {kind:'github-app-installation',appId:c.appId,installationId:c.installationId,repositories:[TRAINING_REPOSITORY],permissions,effectiveScopeVerified:true,expiresAt:expiry,token:result.token};
}
