const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {seal,createOne,CONTEXT}=require('./phase18-dispatch-credential-custody.cjs');
const password='NONSECRET-FIXTURE-PASSWORD-32-CHARS-ONLY';
test('encrypted envelope independently decrypts',()=>{
 const payload={clientSecret:'NONSECRET-FAKE-TOKEN'},e=seal(payload,password);
 assert(!JSON.stringify(e).includes(payload.clientSecret));
 const key=crypto.scryptSync(password,Buffer.from(e.kdf.salt,'base64'),32,{N:e.kdf.N,r:e.kdf.r,p:e.kdf.p,maxmem:64*1024*1024});
 const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));d.setAAD(Buffer.from(JSON.stringify(CONTEXT)));d.setAuthTag(Buffer.from(e.tag,'base64'));
 assert.deepEqual(JSON.parse(Buffer.concat([d.update(Buffer.from(e.ciphertext,'base64')),d.final()])),payload);key.fill(0);
});
function fixture(existing=false){let posts=0,saved;const now=Date.now(),app={id:CONTEXT.applicationId,aud:CONTEXT.applicationAud,domain:CONTEXT.hostname,type:'self_hosted'},policies=[{id:'acf8040e-eb75-4c25-8282-517d9b5e2f58',decision:'allow',include:[{email:{email:'team@creatorloop.net'}}]}],credential={id:'fixture-id',name:CONTEXT.name,client_id:'fixture-client',client_secret:'NONSECRET-FAKE-TOKEN',created_at:new Date(now).toISOString(),expires_at:new Date(now+31*86400000).toISOString()};
 const api=async(method,suffix,envelope,body)=>{if(method==='POST'){posts++;assert.deepEqual(body,{name:CONTEXT.name,duration:'744h'});return {...credential};}if(suffix.includes('/policies'))return policies;if(suffix.startsWith('/apps/'))return app;if(suffix.includes('?'))return {result:existing?[{name:CONTEXT.name}]:[],result_info:{total_pages:1}};return credential;};
 return {args:{api,password,now:()=>now,write:e=>{saved=e;}},get posts(){return posts;},get saved(){return saved;}};
}
test('one credential created and only encrypted content retained',async()=>{const f=fixture();const r=await createOne(f.args);assert.equal(f.posts,1);assert.equal(r.dispatchCredentialCountCreated,1);assert(!JSON.stringify(f.saved).includes('NONSECRET-FAKE-TOKEN'));assert(!JSON.stringify(r).includes('NONSECRET-FAKE-TOKEN'));});
test('existing dispatch credential refuses without creation',async()=>{const f=fixture(true);await assert.rejects(createOne(f.args),e=>e.safeCode==='EXISTING_DISPATCH_CREDENTIAL_REQUIRES_RECONCILIATION');assert.equal(f.posts,0);});
test('missing custody password refuses before provider calls',async()=>{let calls=0;await assert.rejects(createOne({api:()=>{calls++;},password:'short'}),e=>e.safeCode==='CUSTODY_PASSWORD_REQUIRED');assert.equal(calls,0);});
test('uncertain credential creation makes only one POST',async()=>{let posts=0;const f=fixture();const old=f.args.api;f.args.api=async(...a)=>{if(a[0]==='POST'){posts++;throw Object.assign(new Error(),{safeCode:'CREATE_OUTCOME_UNCERTAIN_DO_NOT_RETRY'});}return old(...a);};await assert.rejects(createOne(f.args));assert.equal(posts,1);});
