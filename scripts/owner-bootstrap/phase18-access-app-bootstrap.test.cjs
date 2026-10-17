'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const raw=fs.readFileSync('phase18-access-app-bootstrap.cjs','utf8');
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const password='synthetic-test-only';
const encrypted=pair.privateKey.export({format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase:password});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const workflow=Buffer.from('synthetic-reviewed-workflow');
const source=raw.replace(/const KEY_HASH='[^']+';/,"const KEY_HASH='"+digest(encrypted)+"';")
 .replace(/const EXPECTED='[^']+';/,"const EXPECTED='"+digest(encrypted)+"';")
 .replace(/const SPKI='[^']+';/,"const SPKI='"+digest(pair.publicKey.export({format:'der',type:'spki'}))+"';")
 .replace(/const SPKI_HASH='[^']+';/,"const SPKI_HASH='"+digest(pair.publicKey.export({format:'der',type:'spki'}))+"';")
 .replace(/const WORKFLOW_HASH='[^']+';/,"const WORKFLOW_HASH='"+digest(workflow)+"';");
async function exercise(mode){
 const calls=[],output=[],files=new Map();let prompted=false;
 const fakefs={constants:fs.constants,fstatSync:()=>({ino:1,dev:1,mtimeMs:1}),lstatSync:p=>{if(p.endsWith('.pem')&&['missing-key','denied-key'].includes(mode)){const e=new Error('PRIVATE FILE DETAILS MUST NOT LEAK');e.code=mode==='missing-key'?'ENOENT':'EACCES';throw e;}return ({isSymbolicLink:()=>false,uid:501,ino:1,dev:1,mtimeMs:1,size:encrypted.length,isFile:()=>p.endsWith('.pem'),isDirectory:()=>!p.endsWith('.pem'),nlink:1,mode:p.endsWith('.pem')?0o400:0o700});},realpathSync:p=>p,existsSync:()=>mode==='prior',readFileSync:()=>Buffer.from(encrypted),openSync:(p,flags)=>{if(typeof flags==='number')return p;if(files.has(p))throw Error('EXISTS');files.set(p,'');return p;},writeFileSync:(p,t)=>files.set(p,t),fsyncSync:()=>{},closeSync:()=>{}};
 const sha='b122268c0c061466f3d130082dac8dbb3db98871';
 const permissions={actions:'write',metadata:'read'};
 const fakeFetch=async(url,options)=>{
  calls.push({url,method:options.method,body:options.body});
  let value;
  if(url.startsWith('https://raw.githubusercontent.com/'))value=mode==='workflow-change'?Buffer.from('changed'):workflow;
  else if(url.endsWith('/branches/team-access-directory'))value={commit:{sha}};
  else if(url==='https://api.github.com/app'){if(mode==='identity-aggregate'){const e=new TypeError('SECRET TRANSPORT DETAILS');e.cause=new AggregateError([Object.assign(new Error('SECRET HOST'),{code:'ENETUNREACH'}),Object.assign(new Error('SECRET HOST'),{code:'ETIMEDOUT'})],'SECRET');throw e;}if(mode==='identity-401')return {ok:false,status:401};value={id:5288606,slug:'vt-creatorloop-training-executor',owner:{login:'VTholdings'},permissions};}
  else if(url.endsWith('/app/installations/170669547'))value={app_id:5288606,account:{login:'VTholdings'},repository_selection:'selected',permissions,suspended_at:null};
  else if(url.endsWith('/access_tokens')){
   assert.deepEqual(JSON.parse(options.body),{repository_ids:[1298726702],permissions});
   value={token:'synthetic-token',permissions,expires_at:new Date(Date.now()+3500000).toISOString()};
  }
  else if(url.includes('/installation/repositories'))value={total_count:mode==='wide-scope'?2:1,repositories:[{id:1298726702,full_name:'VTholdings/creatorloop-main-site'}]};
  else if(url.endsWith('/dispatches')){
   assert.deepEqual(JSON.parse(options.body),{ref:'team-access-directory',inputs:{expected_execution_sha:sha}});
   if(mode==='uncertain')throw Error('network-fixture');
   return {ok:true,status:204};
  } else throw Error('UNEXPECTED_ENDPOINT');
  const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
  return {ok:true,status:200,body:(async function*(){yield b;})()};
 };
 const processMock={platform:'darwin',version:'v22.23.3',env:{HOME:'/Users/tt1'},argv:['node','helper',(mode.startsWith('identity-')||mode.startsWith('curl-identity-'))?'PHASE18_APP_IDENTITY_READ_ONLY':'PHASE18_ONE_ACCESS_SETUP_APP_DISPATCH'],getuid:()=>501,exitCode:0};
 const sandbox={require:n=>n==='node:fs'?fakefs:n==='node:crypto'?{...crypto,createPrivateKey:options=>{assert.ok(Buffer.isBuffer(options.passphrase));if(mode==='crypto-runtime'){const e=new Error('private fixture exception must not leak');e.code='ERR_OSSL_UNSUPPORTED';throw e;}return crypto.createPrivateKey(options);}}:n==='node:child_process'?{execFileSync:(file,args,options)=>{if(file==='/usr/bin/curl'){
 assert.deepEqual(Array.from(args),['-q','--config','-']);
 const lines=options.input.split('\n'),value=name=>JSON.parse(lines.find(l=>l.startsWith(name+' = ')).slice(name.length+3));
 const url=value('url'),method=value('request');calls.push({url,method});let response;
 if(url==='https://api.github.com/app'){
  if(mode==='curl-identity-401'||mode==='identity-401')return Buffer.from('{}\n401');
  response={id:5288606,slug:'vt-creatorloop-training-executor',owner:{login:'VTholdings'},permissions};
 }else if(url.endsWith('/app/installations/170669547'))response={app_id:5288606,account:{login:'VTholdings'},repository_selection:'selected',permissions,suspended_at:null};
 else if(url.endsWith('/access_tokens')){assert.deepEqual(JSON.parse(value('data-binary')),{repository_ids:[1298726702],permissions});response={token:'synthetic-token',permissions,expires_at:new Date(Date.now()+3500000).toISOString()};}
 else if(url.includes('/installation/repositories'))response={total_count:mode==='wide-scope'?2:1,repositories:[{id:1298726702,full_name:'VTholdings/creatorloop-main-site'}]};
 else if(url.endsWith('/branches/team-access-directory'))response={commit:{sha}};
 else if(url.endsWith('/dispatches')){assert.deepEqual(JSON.parse(value('data-binary')),{ref:'team-access-directory',inputs:{expected_execution_sha:sha}});if(mode==='uncertain'){const e=new Error('private fixture');e.status=56;throw e;}return Buffer.from('\n204');}
 else throw Error('UNEXPECTED_CURL_FIXTURE_ENDPOINT');
 return Buffer.from(JSON.stringify(response)+'\n200');
 }prompted=true;if(mode==='cancel')throw Error('private cancel details');return (mode==='wrong-password'?'wrong-synthetic-passphrase':password)+'\n';}}:null,process:processMock,fetch:fakeFetch,Buffer,AbortSignal,console:{log:t=>output.push(t),error:t=>output.push(t)}};
 vm.runInNewContext(source,sandbox);
 for(let n=0;n<30;n++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(!output.join('\n').includes(password));
 assert.ok(!output.join('\n').includes('synthetic-token'));
 assert.ok([...files.values()].every(v=>!v.includes(password)&&!v.includes('synthetic-token')));
 return {calls,output:output.join('\n'),files,prompted,code:processMock.exitCode};
}
test('one exact App dispatch; public receipts; original Owner gate remains required',async()=>{
 const r=await exercise('ok');assert.equal(r.code,0);assert.equal(r.calls.filter(c=>c.url.endsWith('/dispatches')).length,1);assert.match(r.output,/"ownerReviewStillRequired": true/);assert.equal(r.files.size,2);
});
test('existing attempt refuses before private prompt or network',async()=>{const r=await exercise('prior');assert.equal(r.prompted,false);assert.equal(r.calls.length,0);assert.equal(r.code,1);});
test('changed reviewed source refuses before private prompt',async()=>{const r=await exercise('workflow-change');assert.equal(r.prompted,false);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.equal(r.code,1);});
test('widened repository scope refuses before workflow dispatch',async()=>{const r=await exercise('wide-scope');assert.equal(r.calls.filter(c=>c.url.endsWith('/dispatches')).length,0);assert.equal(r.files.size,1);assert.equal(r.code,1);});
test('uncertain POST is never retried and attempt marker remains',async()=>{const r=await exercise('uncertain');assert.equal(r.calls.filter(c=>c.url.endsWith('/dispatches')).length,1);assert.equal(r.files.size,1);assert.equal(r.code,1);assert.match(r.output,/POST_OUTCOME_UNCERTAIN_DO_NOT_RERUN/);});

test('retained V3 custody baseline is pinned exactly',()=>{assert.ok(raw.includes("const KEY_HASH='f54b4e20bfb1d0c1666319fea7a37d8d2ca94c293cf4bf74bc67933d3045b3ed';"));});

 test('embedded component is byte-identical to extracted reviewed component',()=>{
 const start=raw.indexOf("const verifiedV3Unlock=(()=>{const module={exports:{}};\n")+"const verifiedV3Unlock=(()=>{const module={exports:{}};\n".length;
 const end=raw.indexOf("\nreturn module.exports;})();",start);
 assert.equal(raw.slice(start,end),fs.readFileSync('phase18-v3-unlock-component.cjs','utf8'));
 });
 test('verified unlock component feeds key directly into one exact App dispatch',async()=>{const r=await exercise('ok');assert.equal(r.code,0);assert.equal(r.calls.filter(c=>c.url.endsWith('/dispatches')).length,1);assert.match(r.output,/EXISTING_V3_UNLOCK_AND_PUBLIC_PAIR_VERIFIED/);});
 test('verified unlock bad-decrypt refuses before token mint or dispatch with safe code',async()=>{const r=await exercise('wrong-password');assert.equal(r.code,1);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.match(r.output,/SUPPLIED_VALUE_DOES_NOT_UNLOCK_VERIFIED_V3/);assert.match(r.output,/ERR_OSSL_BAD_DECRYPT/);});
 test('verified unlock runtime crypto failure is distinguishable and sanitized',async()=>{const r=await exercise('crypto-runtime');assert.equal(r.code,1);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.match(r.output,/DECRYPTION_IMPLEMENTATION_OR_RUNTIME_ERROR/);assert.match(r.output,/ERR_OSSL_UNSUPPORTED/);assert.ok(!r.output.includes('private fixture exception'));});
 test('verified unlock cancellation refuses without mutation',async()=>{const r=await exercise('cancel');assert.equal(r.code,1);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.match(r.output,/PRIVATE_INPUT_CANCELLED_OR_UNAVAILABLE/);});
 test('verified unlock dispatch still preserves uncertainty marker and never retries',async()=>{const r=await exercise('uncertain');assert.equal(r.code,1);assert.equal(r.calls.filter(c=>c.url.endsWith('/dispatches')).length,1);assert.equal(r.files.size,1);assert.match(r.output,/POST_OUTCOME_UNCERTAIN_DO_NOT_RERUN/);});

test('missing V3 local file reports exact sanitized stage before prompt or POST',async()=>{const r=await exercise('missing-key');assert.equal(r.prompted,false);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.match(r.output,/LOCAL_KEY_NOT_FOUND/);assert.match(r.output,/KEY_STAT/);assert.ok(!r.output.includes('PRIVATE FILE DETAILS'));});
test('denied V3 local file reports access failure before prompt or POST',async()=>{const r=await exercise('denied-key');assert.equal(r.prompted,false);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.match(r.output,/LOCAL_KEY_ACCESS_DENIED/);assert.match(r.output,/KEY_STAT/);assert.ok(!r.output.includes('PRIVATE FILE DETAILS'));});

test('identity HTTP rejection distinguished from transport',async()=>{const r=await exercise('identity-401');assert.equal(r.code,1);assert.match(r.output,/GITHUB_HTTP_401/);assert.match(r.output,/HTTP_RESPONSE/);assert.match(r.output,/APP_IDENTITY/);assert.equal(r.files.size,0);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);});
test('identity read only succeeds without token mint markers or dispatch',async()=>{const r=await exercise('identity-ok');assert.equal(r.code,0);assert.match(r.output,/PHASE18_APP_IDENTITY_AUTHENTICATED_READ_PASS/);assert.equal(r.files.size,0);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.equal(r.calls.filter(c=>c.url==='https://api.github.com/app').length,1);assert.equal(r.calls.filter(c=>c.url.includes('/app/installations/')).length,0);});

test('curl identity-only integration stops before installation token or files',async()=>{const r=await exercise('curl-identity-ok');assert.equal(r.code,0);assert.equal(r.files.size,0);assert.match(r.output,/PHASE18_APP_IDENTITY_AUTHENTICATED_READ_PASS/);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);});
test('curl identity-only integration retains HTTP authentication rejection',async()=>{const r=await exercise('curl-identity-401');assert.equal(r.code,1);assert.equal(r.files.size,0);assert.match(r.output,/GITHUB_HTTP_401/);assert.match(r.output,/HTTP_RESPONSE/);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);});
