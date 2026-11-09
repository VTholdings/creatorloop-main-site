import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {blockedTokenCustodyReport,preflightSourceToken,TOKEN_PREFLIGHT_TIMEOUT_MS,TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES} from '../scripts/lib/cloudflare-token-custody-preflight.mjs';
import {runPrivateTokenPreflight} from '../scripts/diagnostics/private-cloudflare-token-preflight.mjs';
const targets=JSON.parse(await readFile(new URL('../scripts/acceptance/cloudflare-targets.json',import.meta.url),'utf8'));
const secret='FICTIONAL-NOT-A-LIVE-SOURCE-TOKEN';
const tokenId='1'.repeat(32),base='https://api.cloudflare.com/client/v4';
const endpoints={account:base+'/accounts/'+targets.accountId+'/tokens/verify',user:base+'/user/tokens/verify'};
const current=Date.parse('2026-11-09T17:40:00.000Z');
const realFetch=globalThis.fetch;
let unmockedCalls=0;
globalThis.fetch=async()=>{unmockedCalls++;throw Error('UNMOCKED_NETWORK_FORBIDDEN');};
after(()=>{globalThis.fetch=realFetch;assert.equal(unmockedCalls,0,'all tests must remain credential-free and mocked');});
const active=(extra={})=>({success:true,errors:[],messages:[],result:{id:tokenId,status:'active',...extra}});
function fixture({tokenType='account',body=active(),status=200,token=secret,response}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method,authorization:options.headers.Authorization,accept:options.headers.Accept,
   redirect:options.redirect,credentials:options.credentials,cache:options.cache,body:options.body,signal:options.signal,headers:options.headers});
  return response||new Response(JSON.stringify(body),{status});
 };
 return {calls,fetcher,run:changes=>preflightSourceToken({tokenType,executeReadOnly:true,token,fetcher,now:()=>current,...changes})};
}
function held(report){
 for(const field of ['scopeVerified','resourceAccessVerified','installedGitHubSecretVerified','backupApproved','releaseApproved','ownerAuthorizationVerified','changesMade'])assert.equal(report[field],false,field);
 assert.equal(report.existingVerifier,'ACCOUNT_ONLY_UNCHANGED');
 assert.doesNotMatch(JSON.stringify(report),/\bPASS\b|FICTIONAL-NOT-A-LIVE|https?:|Bearer|Set-Cookie|private-person/);
 assert.equal(JSON.stringify(report).includes(targets.accountId),false);
 assert.equal(JSON.stringify(report).includes(tokenId),false);
}
function blocked(report,code){
 held(report);assert.equal(report.status,'TOKEN_CUSTODY_BLOCKED');assert.equal(report.code,code);
 assert.equal(report.sourceTokenVerified,false);assert.equal(report.tokenActive,false);
}
test('dependency performs zero network and never reads credential without explicit boolean execution and known type',async()=>{
 for(const executeReadOnly of [undefined,false,'true',1]){
  let reads=0;
  const f=fixture(),options={tokenType:'account',executeReadOnly,fetcher:f.fetcher,get token(){reads++;throw Error(secret);}};
  blocked(await preflightSourceToken(options),'EXECUTION_NOT_AUTHORIZED');assert.equal(reads,0);assert.equal(f.calls.length,0);
 }
 for(const tokenType of [undefined,null,'unknown','ACCOUNT',' account','user\n','cfat_'+secret]){
  const f=fixture();blocked(await f.run({tokenType}),tokenType===undefined?'TOKEN_TYPE_REQUIRED':'UNKNOWN_TOKEN_TYPE');assert.equal(f.calls.length,0);
 }
});
test('CLI zero-network offline and malformed-argument modes never read environment values and promptly remove the reference',async()=>{
 const cases=[
  [[], 'TOKEN_TYPE_REQUIRED'],[['--token-type','account'],'EXECUTION_NOT_AUTHORIZED'],
  [['--token-type','user'],'EXECUTION_NOT_AUTHORIZED'],[['--execute-read-only'],'TOKEN_TYPE_REQUIRED'],
  [['--token-type'],'TOKEN_TYPE_REQUIRED'],[['--token-type','wrong'],'UNKNOWN_TOKEN_TYPE'],
  [['--token-type','account','--token',secret,'--execute-read-only'],'INVALID_CLI_ARGUMENTS'],
  [['--token-type','account','--token-file','private.key'],'INVALID_CLI_ARGUMENTS'],
  [['--token-type','account','--account-id',targets.accountId],'INVALID_CLI_ARGUMENTS'],
  [['--token-type','account','--endpoint',endpoints.user],'INVALID_CLI_ARGUMENTS'],
  [['--token-type','account','--token-type','user'],'INVALID_CLI_ARGUMENTS'],
  [['--token-type','account','--execute-read-only','--execute-read-only'],'INVALID_CLI_ARGUMENTS'],
  [['--token-type=account'],'INVALID_CLI_ARGUMENTS'],[['--help',secret],'INVALID_CLI_ARGUMENTS']
 ];
 for(const [argv,code] of cases){
  let reads=0;const environment={};
  Object.defineProperty(environment,'CLOUDFLARE_API_TOKEN',{configurable:true,get(){reads++;throw Error(secret);}});
  const f=fixture(),report=await runPrivateTokenPreflight(argv,{environment,fetcher:f.fetcher,now:()=>current});
  blocked(report,code);assert.equal(f.calls.length,0);assert.equal(reads,0);assert.equal(Object.hasOwn(environment,'CLOUDFLARE_API_TOKEN'),false);
 }
});
test('each explicit type permits exactly one fixed GET with no cookies, request body, resource calls or retained authorization header',async()=>{
 assert.equal(targets.accountId,'2a3b96a0b37850cd03107131baa66b6d');
 for(const tokenType of ['account','user']){
  const f=fixture({tokenType}),report=await f.run();held(report);
  assert.equal(report.status,'SOURCE_TOKEN_ACTIVE_ONLY');assert.equal(report.sourceTokenVerified,true);assert.equal(report.tokenActive,true);
  assert.equal(report.verificationAttempted,true);assert.equal(report.httpStatus,200);assert.equal(f.calls.length,1);
  const call=f.calls[0];assert.equal(call.url,endpoints[tokenType]);assert.equal(call.method,'GET');
  assert.equal(call.authorization,'Bearer '+secret);assert.equal(call.accept,'application/json');
  assert.equal(call.redirect,'error');assert.equal(call.credentials,'omit');assert.equal(call.cache,'no-store');assert.equal(call.body,undefined);
  assert.equal(call.signal instanceof AbortSignal,true);assert.equal(Object.hasOwn(call.headers,'Authorization'),false);
  assert.equal(report.existingVerifierCompatibility,tokenType==='user'?'USER_TOKEN_TYPE_INCOMPATIBLE':'ACCOUNT_TOKEN_TYPE_ONLY_SCOPE_UNVERIFIED');
  assert.equal(report.code,tokenType==='user'?'USER_SOURCE_TOKEN_ACTIVE_ACCOUNT_VERIFIER_INCOMPATIBLE':'ACCOUNT_SOURCE_TOKEN_ACTIVE_ONLY');
 }
});
test('mocked CLI reads only the private environment once and deletes the credential before the single request starts',async()=>{
 for(const tokenType of ['account','user']){
  let reads=0;const environment={UNRELATED_SECRET:secret},calls=[];
  Object.defineProperty(environment,'CLOUDFLARE_API_TOKEN',{configurable:true,get(){reads++;return secret;}});
  const fetcher=async(url,options)=>{
   assert.equal(Object.hasOwn(environment,'CLOUDFLARE_API_TOKEN'),false);
   calls.push(url);assert.equal(options.headers.Authorization,'Bearer '+secret);return new Response(JSON.stringify(active()));
  };
  const report=await runPrivateTokenPreflight(['--token-type',tokenType,'--execute-read-only'],{environment,fetcher,now:()=>current});
  held(report);assert.equal(report.sourceTokenVerified,true);assert.equal(reads,1);assert.deepEqual(calls,[endpoints[tokenType]]);
  assert.equal(environment.UNRELATED_SECRET,secret);assert.equal(Object.hasOwn(environment,'CLOUDFLARE_API_TOKEN'),false);
 }
 const environment={},f=fixture();
 blocked(await runPrivateTokenPreflight(['--token-type','account','--execute-read-only'],{environment,fetcher:f.fetcher,now:()=>current}),'MISSING_ENVIRONMENT_SECRET');
 assert.equal(f.calls.length,0);
 const lockedEnvironment=new Proxy({CLOUDFLARE_API_TOKEN:secret},{deleteProperty(){throw Error(secret+' '+endpoints.account);}});
 blocked(await runPrivateTokenPreflight(['--token-type','account','--execute-read-only'],{environment:lockedEnvironment,fetcher:f.fetcher,now:()=>current}),'PREFLIGHT_BLOCKED');
 assert.equal(f.calls.length,0);
});
test('caller account/endpoint/method/resource substitutions are refused before network rather than prefix-allowed',async()=>{
 const extras=[
  {accountId:targets.accountId},{accountId:'f'.repeat(32)},{targets},{base:'https://untrusted.example'},
  {endpoint:endpoints.user},{url:endpoints.account},{path:'/user/tokens/verify'},
  {path:'/accounts/'+targets.accountId+'/tokens'},{path:'/accounts/'+targets.accountId+'/tokens/'+tokenId+'/value'},
  {path:'/accounts/'+targets.accountId+'/d1/database/'+targets.production.databaseId+'/export'},
  {method:'POST'},{retry:1},{redirect:'follow'},{timeoutMs:999999},{maxResponseBytes:999999},{tokenFile:'private.key'}
 ];
 for(const extra of extras){const f=fixture();blocked(await f.run(extra),'INVALID_PREFLIGHT_OPTIONS');assert.equal(f.calls.length,0);}
 for(const options of [null,[],secret])blocked(await preflightSourceToken(options),'INVALID_PREFLIGHT_OPTIONS');
});
test('credential whitespace/control framing is refused without trimming, repair or prefix authority',async()=>{
 for(const token of [undefined,null,0,'']){const f=fixture({token});blocked(await f.run({token}),'MISSING_ENVIRONMENT_SECRET');assert.equal(f.calls.length,0);}
 for(const token of [' '+secret,secret+' ',secret+'\n',secret+'\r',secret+'\t',secret+'\0',secret+'\x7f',secret+'\x85',secret+'\u00a0',secret+'\u200b',secret+'\u2028','x'.repeat(4097)]){
  const f=fixture({token});blocked(await f.run(),'MALFORMED_CREDENTIAL');assert.equal(f.calls.length,0);
 }
 for(const tokenType of ['account','user']){
  const f=fixture({tokenType,token:'cfat_'+secret}),report=await f.run();held(report);assert.equal(report.sourceTokenVerified,true);
  assert.equal(f.calls[0].url,endpoints[tokenType]);assert.equal(f.calls[0].authorization,'Bearer cfat_'+secret);
 }
});
test('denied verification never retries, enumerates, reads metadata or falls back to the other token endpoint',async()=>{
 for(const tokenType of ['account','user']){
  const f=fixture({tokenType,status:401,body:{success:false,errors:[{code:1000,message:secret}],result:{id:tokenId,status:'active'}}});
  const report=await f.run();blocked(report,'CLOUDFLARE_HTTP_ERROR');assert.equal(report.httpStatus,401);assert.deepEqual(report.providerCodes,[1000]);
  assert.deepEqual(f.calls.map(call=>call.url),[endpoints[tokenType]]);
 }
 for(const status of [403,429,500,503]){const f=fixture({status,body:{success:false,errors:[{code:10000,message:secret}]}});blocked(await f.run(),'CLOUDFLARE_HTTP_ERROR');assert.equal(f.calls.length,1);}
});
test('redirects, substituted response URLs and thrown network errors are blocked with no retry or disclosure',async()=>{
 for(const tokenType of ['account','user']){
  for(const status of [301,302,307,308]){
   const f=fixture({tokenType,response:new Response(secret,{status,headers:{location:'https://untrusted.example/'+secret,'set-cookie':secret}})});
   blocked(await f.run(),'REDIRECT_OR_ENDPOINT_BLOCKED');assert.equal(f.calls.length,1);
  }
  for(const properties of [{redirected:true},{url:'https://untrusted.example/'+secret},{url:endpoints[tokenType]+ '?value='+secret},{url:endpoints[tokenType==='account'?'user':'account']}]){
   const response=new Response(JSON.stringify(active()));
   for(const [key,value] of Object.entries(properties))Object.defineProperty(response,key,{value});
   const f=fixture({tokenType,response});blocked(await f.run(),'REDIRECT_OR_ENDPOINT_BLOCKED');assert.equal(f.calls.length,1);
  }
  let calls=0;
  const report=await preflightSourceToken({tokenType,executeReadOnly:true,token:secret,fetcher:async()=>{calls++;throw Error(secret+' '+endpoints[tokenType]+' Set-Cookie');}});
  blocked(report,'NETWORK_OR_REDIRECT_BLOCKED');assert.equal(calls,1);
 }
});
test('all provider text, IDs, cookies and malformed status/code values stay out of success and failure reports',async()=>{
 const errors=[{code:1000,message:secret},{code:1000,message:endpoints.account},
  {code:secret,message:'private-person@example.com'},{code:-1},{code:999},{code:1000000},{code:1000.5},
  ...Array.from({length:15},(_,index)=>({code:2000+index,message:secret}))];
 const f=fixture({status:401,body:{success:false,errors,result:{id:tokenId,token:secret},messages:[secret],url:endpoints.account}});
 const report=await f.run();blocked(report,'CLOUDFLARE_HTTP_ERROR');assert.deepEqual(report.providerCodes,[1000,...Array.from({length:9},(_,index)=>2000+index)]);
 const success=fixture({body:{...active(),messages:[secret],privateToken:secret,extraId:targets.accountId},response:new Response(JSON.stringify({...active(),privateToken:secret}),{headers:{'set-cookie':secret,'cf-ray':secret,date:secret}})});
 held(await success.run());
 const invalid=fixture({response:{status:secret}});blocked(await invalid.run(),'INVALID_API_RESPONSE');
 blocked(blockedTokenCustodyReport(secret,secret),'PREFLIGHT_BLOCKED');
});
test('malformed envelopes, IDs, states and contradictory success/error evidence never establish source validity',async()=>{
 const cases=[
  [null,'CLOUDFLARE_API_REJECTED'],[[],'CLOUDFLARE_API_REJECTED'],[{},'CLOUDFLARE_API_REJECTED'],
  [{...active(),success:'true'},'CLOUDFLARE_API_REJECTED'],[{...active(),errors:{}},'CLOUDFLARE_API_REJECTED'],
  [{...active(),errors:[{code:1000,message:secret}]},'CLOUDFLARE_API_REJECTED'],
  [{success:true,result:null},'INVALID_API_RESPONSE'],[{success:true,result:[]},'INVALID_API_RESPONSE'],
  [{success:true,result:{status:'active'}},'INVALID_API_RESPONSE'],[active({id:secret}),'INVALID_API_RESPONSE'],
  [active({id:tokenId+'\n'}),'INVALID_API_RESPONSE'],[active({id:tokenId.toUpperCase().replace('1','A')}),'INVALID_API_RESPONSE'],
  [active({status:'disabled'}),'TOKEN_DISABLED'],[active({status:'expired'}),'TOKEN_EXPIRED'],
  [active({status:'ACTIVE'}),'INVALID_TOKEN_STATE'],[active({status:secret}),'INVALID_TOKEN_STATE'],
  [active({status:null}),'INVALID_TOKEN_STATE']
 ];
 for(const [body,code] of cases){const f=fixture({body});blocked(await f.run(),code);assert.equal(f.calls.length,1);}
 for(const response of [new Response(secret),new Response('{'),new Response(new Uint8Array([0xff]))]){
  const f=fixture({response});blocked(await f.run(),'INVALID_API_RESPONSE');assert.equal(f.calls.length,1);
 }
 const f=fixture({response:new Response(null,{status:204})});blocked(await f.run(),'CLOUDFLARE_HTTP_ERROR');assert.equal(f.calls.length,1);
});
test('response window uses the completion clock and rejects expired, future, inverted or malformed bounds',async()=>{
 const past='2026-11-09T17:39:59Z',present='2026-11-09T17:40:00Z',future='2026-11-09T17:40:01Z';
 const cases=[
  [{expires_on:past},'TOKEN_EXPIRED'],[{expires_on:present},'TOKEN_EXPIRED'],[{not_before:future},'TOKEN_NOT_YET_VALID'],
  [{not_before:'2026-11-09T17:40:00.000000001Z'},'TOKEN_NOT_YET_VALID'],
  [{expires_on:'2026-11-09T17:40:00.000000001Z'},'TOKEN_EXPIRED'],
  [{not_before:future,expires_on:past},'INVALID_TOKEN_WINDOW'],[{not_before:present,expires_on:present},'INVALID_TOKEN_WINDOW']
 ];
 for(const value of ['',secret,'2026-02-30T17:40:00Z','2026-11-09','2026-11-09T24:00:00Z','2026-11-09T17:60:00Z','2026-11-09T17:40:60Z','2026-11-09T17:40:00+24:00',future+'\n',' '+future,123,{},true]){
  cases.push([{not_before:value},'INVALID_TOKEN_WINDOW'],[{expires_on:value},'INVALID_TOKEN_WINDOW']);
 }
 for(const [window,code] of cases){const f=fixture({body:active(window)});blocked(await f.run(),code);assert.equal(f.calls.length,1);}
 for(const window of [{},{not_before:null,expires_on:null},{not_before:past,expires_on:future},{not_before:present,expires_on:future},
  {not_before:'2026-11-09T07:39:59-10:00',expires_on:'2026-11-09T17:40:01.000000000Z'}]){
  const f=fixture({body:active(window)}),report=await f.run();held(report);assert.equal(report.sourceTokenVerified,true);
 }
 let clock=current;
 const report=await preflightSourceToken({tokenType:'account',executeReadOnly:true,token:secret,now:()=>clock,
  fetcher:async()=>{clock=Date.parse(future);return new Response(JSON.stringify(active({expires_on:future})));}});
 blocked(report,'TOKEN_EXPIRED');
 for(const now of [()=>NaN,()=>Infinity,()=>-1,()=>current+0.5,()=>present,()=>new Date(current),()=>{throw Error(secret);}]){
  const f=fixture();blocked(await f.run({now}),'INVALID_CURRENT_TIME');assert.equal(f.calls.length,1);
 }
});
test('bounded streaming rejects declared and actual oversized responses rather than reading an unbounded text body',async()=>{
 assert.equal(TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES,16384);
 for(const response of [
  new Response('{}',{headers:{'content-length':String(TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES+1)}}),
  new Response('{}',{headers:{'content-length':'not-a-length'}}),
  new Response('x'.repeat(TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES+1)),
  new Response(JSON.stringify(active({privatePadding:'x'.repeat(TOKEN_PREFLIGHT_MAX_RESPONSE_BYTES)})))
 ]){const f=fixture({response});blocked(await f.run(),'RESPONSE_TOO_LARGE');assert.equal(f.calls.length,1);}
 const response=new Response(JSON.stringify(active()));
 Object.defineProperty(response,'text',{value:()=>{throw Error('UNBOUNDED_TEXT_FORBIDDEN '+secret);}});
 const report=await fixture({response}).run();held(report);assert.equal(report.sourceTokenVerified,true);
});
test('total request/body deadline is enforced even when mocked transport ignores abort, and never retries',async()=>{
 assert.equal(TOKEN_PREFLIGHT_TIMEOUT_MS,5000);
 let fetchCalls=0,bodyCalls=0,bodyCancelled=false,fetchSignal,bodySignal;
 const network=preflightSourceToken({tokenType:'account',executeReadOnly:true,token:secret,fetcher:async(url,options)=>{
  fetchCalls++;fetchSignal=options.signal;return new Promise(()=>{});
 }});
 const streaming=preflightSourceToken({tokenType:'user',executeReadOnly:true,token:secret,fetcher:async(url,options)=>{
  bodyCalls++;bodySignal=options.signal;return new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){bodyCancelled=true;}}));
 }});
 const reports=await Promise.all([network,streaming]);
 for(const report of reports)blocked(report,'REQUEST_TIMED_OUT');
 assert.equal(fetchCalls,1);assert.equal(bodyCalls,1);assert.equal(fetchSignal.aborted,true);assert.equal(bodySignal.aborted,true);assert.equal(bodyCancelled,true);
});
test('actual CLI subprocess remains offline, prints only sanitized JSON, writes no evidence files and works outside repo cwd',()=>{
 const path=resolve('scripts/diagnostics/private-cloudflare-token-preflight.mjs');
 for(const argv of [[],['--token-type','account'],['--token-type','user'],['--token-type','account','--token',secret]]){
  const result=spawnSync(process.execPath,[path,...argv],{cwd:'/tmp',env:{PATH:process.env.PATH,CLOUDFLARE_API_TOKEN:secret},encoding:'utf8',timeout:3000});
  assert.equal(result.status,1);assert.equal(result.stderr,'');assert.doesNotMatch(result.stdout,new RegExp(secret));
  const report=JSON.parse(result.stdout);held(report);assert.equal(report.verificationAttempted,false);assert.equal(report.sourceTokenVerified,false);
 }
});
test('new source has only fixed verify routes and the private CLI exposes no prompt, file-key, provider or argument output',async()=>{
 const library=await readFile(new URL('../scripts/lib/cloudflare-token-custody-preflight.mjs',import.meta.url),'utf8');
 const cli=await readFile(new URL('../scripts/diagnostics/private-cloudflare-token-preflight.mjs',import.meta.url),'utf8');
 assert.match(library,/\.\.\/acceptance\/cloudflare-targets\.json/);
 assert.match(library,/const approvedAccount='2a3b96a0b37850cd03107131baa66b6d'/);
 assert.equal((library.match(/await fetcher\(/g)||[]).length,1);
 assert.doesNotMatch(library,/\/tokens\/\$|\/tokens\/\{|'\/tokens'|\/d1\/|\/pages\/|\/access\//);
 assert.doesNotMatch(cli,/readFile|readline|prompt\(|writeFile|mkdir|appendFile/);
 assert.equal((cli.match(/environment\.CLOUDFLARE_API_TOKEN;/g)||[]).length,3);
 assert.match(cli,/delete environment\.CLOUDFLARE_API_TOKEN/);
 assert.match(cli,/console\.log\(JSON\.stringify\(report\)\)/);
});
