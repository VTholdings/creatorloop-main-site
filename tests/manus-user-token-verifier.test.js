import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readOnlyClient,verifyCloudflare} from '../scripts/lib/cloudflare-readonly.mjs';
import {trainingApplicationMetadata} from '../scripts/lib/training-application-readiness.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const root='/accounts/'+targets.accountId,base='https://api.cloudflare.com/client/v4';
const token='FICTIONAL-LOCAL-TEST-NOT-A-CREDENTIAL',tokenId='7'.repeat(32),otherId='8'.repeat(32);
const releaseSha='a'.repeat(40),mainSha='b'.repeat(40);
function fixture(tokenType='user'){
 const calls=[],responses=new Map();
 responses.set('/user/tokens/verify',{status:200,result:{status:'active',id:tokenId}});
 responses.set(root+'/tokens/verify',{status:200,result:{status:'active',id:tokenId}});
 const fetcher=async(url,options)=>{
  const path=url.slice(base.length);calls.push({path,options});
  const response=responses.get(path)||{status:403};
  return new Response(JSON.stringify(response.status===200?{success:true,result:response.result}:{success:false,errors:[{code:response.status===401?1000:10000,message:token}]}),{status:response.status});
 };
 const client=readOnlyClient({token,targets,tokenType,fetcher});
 return {calls,responses,client,run:()=>verifyCloudflare({client,targets,releaseSha,mainSha})};
}
test('explicit user ownership selects only user verification before pinned resources and never account fallback',async()=>{
 const f=fixture(),r=await f.run();
 assert.equal(f.calls[0].path,'/user/tokens/verify');
 assert.equal(r.observations.tokenType,'user');assert.equal(r.observations.tokenActive,true);
 assert.equal(r.status,'READ_ONLY_VERIFICATION_BLOCKED','missing resource permission remains a blocker');
 assert.ok(r.blockers.some(b=>b.status===403));
 assert.equal(f.calls.some(c=>c.path===root+'/tokens/verify'),false);
 assert.equal(r.productionCertified,false);assert.equal(r.operatorReadinessCertified,false);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(token+'|'+tokenId));
});
test('unknown or null token ownership fails before network rather than endpoint guessing',()=>{
 for(const tokenType of ['auto','USER','other','',null]){
  let calls=0;
  assert.throws(()=>readOnlyClient({token,targets,tokenType,fetcher:async()=>{calls++;}}),/INVALID_TOKEN_TYPE/);
  assert.equal(calls,0);
 }
});
test('legacy default and explicit account ownership keep account endpoint and never user fallback',async()=>{
 for(const tokenType of [undefined,'account']){
  const calls=[];
  const client=readOnlyClient({token,targets,tokenType,fetcher:async(url)=>{calls.push(url);return new Response(JSON.stringify({success:false,errors:[{code:1000,message:token}]}),{status:401});}});
  const r=await verifyCloudflare({client,targets,releaseSha,mainSha});
  assert.deepEqual(calls,[base+root+'/tokens/verify']);assert.equal(r.blockers[0].status,401);
  assert.equal(r.observations.tokenType,'account');assert.doesNotMatch(JSON.stringify(r),new RegExp(token));
 }
});
test('user 401 has one request only, sanitized failure and no resource read or fallback',async()=>{
 const f=fixture();f.responses.set('/user/tokens/verify',{status:401});const r=await f.run();
 assert.equal(r.status,'READ_ONLY_VERIFICATION_BLOCKED');assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].path,'/user/tokens/verify');assert.equal(r.blockers[0].status,401);
 assert.deepEqual(r.blockers[0].providerCodes,[1000]);assert.doesNotMatch(JSON.stringify(r),new RegExp(token));
});
test('selected ownership and verification path cannot be replaced on the client',()=>{
 const f=fixture();assert.equal(f.client.tokenType,'user');assert.equal(f.client.tokenVerificationPath,'/user/tokens/verify');
 assert.throws(()=>{f.client.tokenType='account';},TypeError);
 assert.throws(()=>{f.client.tokenVerificationPath=root+'/tokens/verify';},TypeError);
});
test('user transport rejects other-owner verification, enumeration, values, arbitrary tokens and query extensions',async()=>{
 const f=fixture();
 for(const path of [root+'/tokens/verify','/user/tokens','/user/tokens/'+tokenId,'/user/tokens/verify?x=1','/user/tokens/verify/extra','/accounts/'+'f'.repeat(32)+'/tokens/verify'])await assert.rejects(f.client.get(path),/ENDPOINT_NOT_ALLOWED/);
 assert.equal(f.calls.length,0);
 await assert.rejects(f.client.selfTokenMetadata(),/AUTHENTICATED_TOKEN_METADATA_UNAVAILABLE/);
 await f.client.get('/user/tokens/verify');
 for(const path of ['/user/tokens/'+otherId,'/user/tokens/'+tokenId+'/value','/user/tokens/'+tokenId+'?x=1',root+'/tokens/'+tokenId])await assert.rejects(f.client.get(path),/ENDPOINT_NOT_ALLOWED/);
 assert.equal(f.calls.length,1);
});
test('user self-metadata is bound to authenticated id and redacted, not token enumeration',async()=>{
 const f=fixture();f.responses.set('/user/tokens/'+tokenId,{status:200,result:{id:tokenId,status:'active',policies:[]}});
 await f.client.get('/user/tokens/verify');const detail=await f.client.selfTokenMetadata();
 assert.equal(detail.result.id,tokenId);assert.equal(f.calls[1].path,'/user/tokens/'+tokenId);
 assert.equal(f.client.requests[1].path,'/user/tokens/{authenticated-token}');
 assert.doesNotMatch(JSON.stringify(f.client.requests),new RegExp(token+'|'+tokenId));
 for(const c of f.calls){assert.equal(c.options.method,'GET');assert.equal(c.options.body,undefined);assert.equal(c.options.redirect,'error');}
});
test('denied user self-metadata remains unknown without requiring more token management permission',async()=>{
 const f=fixture(),r=await f.run(),d=r.observations.pagesAuthorizationDiagnostics;
 assert.equal(d.checks.authenticatedTokenMetadata.readable,false);
 assert.equal(d.checks.authenticatedTokenMetadata.status,403);
 assert.equal(d.classification,'AUTHORIZATION_CONDITION_UNRESOLVED');assert.equal(d.changesMade,false);
 assert.ok(f.calls.some(c=>c.path==='/user/tokens/'+tokenId));
 assert.equal(f.calls.some(c=>c.path===root+'/tokens/'+tokenId),false);
 assert.doesNotMatch(JSON.stringify(r),new RegExp(token+'|'+tokenId));
});
test('inactive user and redirect failures stop at selected endpoint without account retry',async()=>{
 for(const mode of ['expired','disabled','redirect']){
  let calls=0;
  const client=readOnlyClient({token,targets,tokenType:'user',fetcher:async(url)=>{
   calls++;assert.equal(url,base+'/user/tokens/verify');
   if(mode==='redirect')throw Error(token);
   return new Response(JSON.stringify({success:true,result:{id:tokenId,status:mode}}));
  }});
  const r=await verifyCloudflare({client,targets,releaseSha,mainSha});
  assert.equal(r.status,'READ_ONLY_VERIFICATION_BLOCKED');assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(r),new RegExp(token+'|'+tokenId));
 }
});
test('TRAINING second allowlist selects user verification and never visits production resources',async()=>{
 const f=fixture(),project=targets.training.projectCandidates[0],r=await trainingApplicationMetadata({client:f.client,targets,releaseSha});
 assert.equal(f.calls[0].path,'/user/tokens/verify');
 assert.equal(f.calls[1].path,root+'/pages/projects/'+project);assert.equal(f.calls.length,2);
 assert.equal(r.status,'TRAINING_METADATA_BLOCKED');assert.equal(r.blockers[0].status,403);
 assert.equal(r.step18Complete,false);assert.equal(r.step19Ready,false);
 assert.equal(f.calls.some(c=>c.path.includes(targets.production.databaseId)),false);
});
test('user ownership preserves pinned resource refusal, database isolation and transport restrictions',async()=>{
 const f=fixture();await f.client.get('/user/tokens/verify');
 for(const path of [root+'/d1/database/'+targets.training.databaseId+'/query',root+'/d1/database/'+targets.production.databaseId+'/export',root+'/workers/scripts',root+'/pages/projects/unapproved','https://example.invalid/',root+'/access/users'])await assert.rejects(f.client.get(path),/ENDPOINT_NOT_ALLOWED/);
 assert.equal(f.calls.length,1);
 assert.throws(()=>readOnlyClient({token,targets:{...targets,training:{...targets.training,databaseId:targets.production.databaseId}},tokenType:'user'}),/SHARED_ENVIRONMENT_PINS/);
});
test('three protected acceptance entrypoints explicitly pin reviewed user ownership without changing workflow gates',async()=>{
 for(const name of ['cloudflare-readonly','training-application-readiness','d1-backup-stage']){
  const text=await readFile('scripts/acceptance/'+name+'.mjs','utf8');
  assert.match(text,/readOnlyClient\(\{token:[^,]+,targets,tokenType:'user'\}\)/);
  assert.doesNotMatch(text,/process\.argv.*token.type|CLOUDFLARE_TOKEN_TYPE|\/user\/tokens\//);
 }
 const workflow=await readFile('.github/workflows/acceptance-readonly.yml','utf8');
 assert.match(workflow,/name: creatorloop-acceptance/);assert.match(workflow,/persist-credentials: false/);
 assert.match(workflow,/refs\/remotes\/origin\/team-access-directory/);
 assert.doesNotMatch(workflow,/workflow_dispatch|pull_request_target/);
});
