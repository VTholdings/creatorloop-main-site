'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {curlAuthenticatedOnce}=require('./phase18-github-curl-transport.cjs');
const secret='NONSECRET-FIXTURE-AUTH';
test('credentials only stdin; TLS verification defaults retained; no redirects/retry/config file',async()=>{
 let config;
 const r=curlAuthenticatedOnce('https://api.github.com/app',{headers:{Authorization:'Bearer '+secret}},(file,args,options)=>{
 assert.equal(file,'/usr/bin/curl');assert.deepEqual(args,['-q','--config','-']);assert(!JSON.stringify(args).includes(secret));assert.equal(options.stdio[2],'pipe');config=options.input;assert(config.includes(secret));assert(config.includes('retry = 0'));assert(!config.includes('insecure'));assert(!config.includes('location'));return Buffer.from('{"id":5288606}\n200');});
 assert.equal(r.status,200);assert.equal(r.ok,true);assert(config.includes('max-time = 15'));
});
test('HTTP 401 is an HTTP response; 302 not followed',()=>{
 for(const status of [401,302]){let calls=0;const r=curlAuthenticatedOnce('https://api.github.com/app',{},()=>{calls++;return Buffer.from('{}\n'+status);});assert.equal(r.ok,false);assert.equal(r.status,status);assert.equal(calls,1);}
});
test('socket failure sanitized and never retried for GET or POST',()=>{
 for(const method of ['GET','POST']){let calls=0;try{curlAuthenticatedOnce('https://api.github.com/app',{method},()=>{calls++;const e=new Error(secret);e.status=56;e.stderr=Buffer.from(secret);throw e;});assert.fail();}catch(e){assert.equal(e.safeCurlCode,'CURL_RECEIVE_FAILED');assert(!JSON.stringify(e).includes(secret));assert(!e.message.includes(secret));}assert.equal(calls,1);}
});
test('POST JSON uses stdin; body preserved; invalid header injection refused',()=>{
 const body=JSON.stringify({ref:'team-access-directory',inputs:{expected_execution_sha:'fixture'}});
 curlAuthenticatedOnce('https://api.github.com/repos/fixture/dispatches',{method:'POST',body},(file,args,o)=>{const line=o.input.split('\n').find(l=>l.startsWith('data-binary = '));assert.equal(JSON.parse(line.slice(14)),body);return Buffer.from('\n204');});
 assert.throws(()=>curlAuthenticatedOnce('https://api.github.com/app',{headers:{Authorization:'x\nleak'}},()=>assert.fail()),/HEADER_FORMAT_REFUSED/);
});
