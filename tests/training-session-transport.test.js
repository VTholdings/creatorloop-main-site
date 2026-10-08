import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingTransport} from '../scripts/lib/creatorloop-training-transport.mjs';
import {createTrainingSessionObserver} from '../scripts/lib/creatorloop-training-session.mjs';
import {sha256} from '../scripts/lib/training-execution-contract.mjs';
import {fixture,publicJwk} from './helpers/training-execution-fixture.js';
function transportFixture(){
 const f=fixture(),calls=[];
 const options={now:f.now,verifyHostAuthorization:async({method,path,body})=>({requestHash:sha256({method,path,...(body?{body}:{})}),authorized:true,environment:'TRAINING',targetAppId:f.manifest.targets.appId,expiresAt:500,credentialRef:'FICTIONAL'}),resolveShortLivedCapability:async()=>({token:'FICTIONAL-NOT-A-CREDENTIAL',accountId:f.manifest.targets.accountId,expiresAt:500,permissionAcceptanceVerified:true}),fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({success:true,result:[]}));}};
 return {...f,calls,options,path:`/accounts/${f.manifest.targets.accountId}/access/apps/${f.manifest.targets.appId}/policies?page=1&per_page=50`};
}
test('private transport requires approved short-lived capability and fixed TRAINING endpoint without default network access',async()=>{
 const f=transportFixture(),transport=createTrainingTransport(f.options);assert.equal(f.calls.length,0);
 const r=await transport({method:'GET',path:f.path,redirect:'error'});assert.equal(r.success,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.redirect,'error');assert.ok(f.calls[0].options.signal);assert.equal(f.calls[0].options.body,undefined);
 for(const path of [f.path.replace(f.manifest.targets.appId,'production'),f.path.split('/access')[0]+'/d1/database/query',f.path.replace('/policies?page=1&per_page=50','/revoke_tokens')])await assert.rejects(transport({method:'POST',path,redirect:'error'}),/ENDPOINT/);
 assert.equal(f.calls.length,1);
});
test('missing or unverified/expired/overlong capability cannot reach transport; errors are sanitized',async()=>{
 for(const change of [o=>o.verifyHostAuthorization=async()=>null,o=>o.resolveShortLivedCapability=async()=>({token:'fictional',expiresAt:199}),o=>o.resolveShortLivedCapability=async()=>({token:'fictional',accountId:fixture().manifest.targets.accountId,expiresAt:99999,permissionAcceptanceVerified:true})]){const f=transportFixture();change(f.options);await assert.rejects(createTrainingTransport(f.options)({method:'GET',path:f.path,redirect:'error'}));assert.equal(f.calls.length,0);}
 const f=transportFixture();f.options.fetcher=async()=>{throw Error('FICTIONAL-RAW-SECRET');};await assert.rejects(createTrainingTransport(f.options)({method:'GET',path:f.path,redirect:'error'}),error=>!error.message.includes('SECRET'));
});
function sessionFixture(operation='ADMIT'){
 const f=fixture(operation);let tokenCalls=0;
 const options={...f,obtainIndividualToken:async()=>{tokenCalls++;return 'invalid';},fetchAccessPublicKeys:async()=>[publicJwk],corroborateIdentity:async()=>null,probeRevokedSessions:async()=>({observerPrincipal:f.manifest.signerPrincipal,email:f.request.email,subject:f.manifest.subject.subject,appId:f.manifest.targets.appId,oldSessionDenied:true,freshLoginDenied:true,independentlyVerified:true,revokedBefore:190})};
 return {...f,options,get tokenCalls(){return tokenCalls;}};
}
test('REVOKE requires active independent old-session and fresh-login denial, not HTTP success',async()=>{
 const f=sessionFixture('REVOKE'),observe=createTrainingSessionObserver(f.options),proof=await observe(f.request);assert.equal(proof.revokedBefore,190);assert.equal(f.tokenCalls,0);
 f.options.probeRevokedSessions=async()=>({success:true});await assert.rejects(createTrainingSessionObserver(f.options)(f.request),/DENIAL/);
});
test('malformed or wrong subject/issuer/service/expired JWT cannot establish individual session proof',async()=>{
 const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
 const f=sessionFixture();await assert.rejects(createTrainingSessionObserver(f.options)(f.request));
 const claims={iss:'https://shiny-wildflower-143c.cloudflareaccess.com',aud:[f.manifest.targets.audience],email:f.request.email,sub:f.manifest.subject.subject,type:'app',identity_nonce:'fictional',iat:120,exp:500};
 for(const override of [{sub:'wrong'},{iss:'wrong'},{common_name:'service'},{exp:199},{iat:100}]){f.options.obtainIndividualToken=async()=>encode({alg:'RS256',kid:publicJwk.kid})+'.'+encode({...claims,...override})+'.invalid';await assert.rejects(createTrainingSessionObserver(f.options)(f.request),/CLAIMS/);}
 f.options.obtainIndividualToken=async()=>encode({alg:'RS256',kid:publicJwk.kid})+'.'+encode(claims)+'.invalid';await assert.rejects(createTrainingSessionObserver(f.options)(f.request),/SIGNATURE/);
});
