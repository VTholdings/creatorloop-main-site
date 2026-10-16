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
 .replace(/const SPKI_HASH='[^']+';/,"const SPKI_HASH='"+digest(pair.publicKey.export({format:'der',type:'spki'}))+"';")
 .replace(/const WORKFLOW_HASH='[^']+';/,"const WORKFLOW_HASH='"+digest(workflow)+"';");
async function exercise(mode){
 const calls=[],output=[],files=new Map();let prompted=false;
 const fakefs={lstatSync:p=>({isSymbolicLink:()=>false,uid:501,isFile:()=>p.endsWith('.pem'),isDirectory:()=>!p.endsWith('.pem'),nlink:1,mode:p.endsWith('.pem')?0o400:0o700}),realpathSync:p=>p,existsSync:()=>mode==='prior',readFileSync:()=>Buffer.from(encrypted),openSync:(p)=>{if(files.has(p))throw Error('EXISTS');files.set(p,'');return p;},writeFileSync:(p,t)=>files.set(p,t),fsyncSync:()=>{},closeSync:()=>{}};
 const sha='b122268c0c061466f3d130082dac8dbb3db98871';
 const permissions={actions:'write',metadata:'read'};
 const fakeFetch=async(url,options)=>{
  calls.push({url,method:options.method,body:options.body});
  let value;
  if(url.startsWith('https://raw.githubusercontent.com/'))value=mode==='workflow-change'?Buffer.from('changed'):workflow;
  else if(url.endsWith('/branches/team-access-directory'))value={commit:{sha}};
  else if(url==='https://api.github.com/app')value={id:5288606,slug:'vt-creatorloop-training-executor',owner:{login:'VTholdings'},permissions};
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
 const processMock={platform:'darwin',version:'v22.23.3',env:{HOME:'/Users/tt1'},argv:['node','helper','PHASE18_ONE_ACCESS_SETUP_APP_DISPATCH'],getuid:()=>501,exitCode:0};
 const sandbox={require:n=>n==='node:fs'?fakefs:n==='node:crypto'?crypto:n==='node:child_process'?{execFileSync:()=>{prompted=true;return password+'\n';}}:null,process:processMock,fetch:fakeFetch,Buffer,AbortSignal,console:{log:t=>output.push(t),error:t=>output.push(t)}};
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

test('retained V2 custody baseline is pinned exactly',()=>{assert.ok(raw.includes("const KEY_HASH='c9e0a09cf18d01c8b752a718aaed0abdb626233f0faf7932310d9ef1487dbc3c';"));});
