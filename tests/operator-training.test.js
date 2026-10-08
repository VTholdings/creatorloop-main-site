import {verifier} from './helpers/admission-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {walkthrough} from '../training/walkthrough.mjs';
import {fixture,call} from './helpers/operator-fixture.js';
test('training identity is server configured and a production query parameter cannot enable it',async()=>{
 const {db,env}=await fixture();
 try{
  const production=await call(env,'OPERATOR','GET','dashboard?campaignId=CMP-100&training=true');
  assert.equal(production.body.system.training,false);assert.equal(production.body.system.systemOfRecord,'Google Sheets');
  await verifier({env},'TRAINING');
  const training=await call(env,'OPERATOR','GET','dashboard?campaignId=CMP-100');
  assert.equal(training.body.system.training,true);assert.match(training.body.system.systemOfRecord,/Isolated training database/);
 }finally{db.close();}
});
test('isolated training covers normal processing, required escalation, blocked launch, monitoring and verified closeout',async()=>{
 const result=await walkthrough();assert.equal(result.steps.length,8);assert.equal(result.productionWrites,0);assert.equal(result.externalActions,0);
});
test('training cannot export or import production sync even with a mistakenly configured signing secret',async()=>{
 const {onRequest}=await import('../functions/api/integrations/control-system.js');
 const {env}=await fixture();env.CONSOLE_ENVIRONMENT='TRAINING';env.CONTROL_SYSTEM_SYNC_SECRET='fictional-bound-secret';
 for(const method of ['GET','POST']){
  const r=await onRequest({env,request:new Request('https://ops.creatorloop.net/api/integrations/control-system',{method,...(method==='POST'?{body:JSON.stringify({mode:'import',eventId:'DO-NOT-IMPORT'})}:{})})});assert.equal(r.status,403);
 }
});

test('invalid explicit environment cannot fall back to production reads, edits or signed synchronization',async()=>{
 const {onRequest}=await import('../functions/api/integrations/control-system.js');
 const {db,env}=await fixture();
 try{for(const name of ['',null,'training','TRAIINING']){
  env.CONSOLE_ENVIRONMENT=name;
  assert.equal((await call(env,'ADMINISTRATOR','GET','dashboard')).status,503);
  assert.equal((await call(env,'OPERATOR','PATCH','creators/CR-200',{version:1,notes:'blocked'})).status,503);
  for(const method of ['GET','POST']){
   const r=await onRequest({env,request:new Request('https://ops.creatorloop.net/api/integrations/control-system',{method,...(method==='POST'?{body:'{}'}:{})})});assert.equal(r.status,503);
  }
 }assert.notEqual(db.prepare("SELECT notes FROM creator_enrollments WHERE id='CR-200'").get().notes,'blocked');}finally{db.close();}
});
test('invalid or unverified TRAINING isolation is rejected before any database lookup, bootstrap or activity write',async()=>{
 const {onRequest}=await import('../functions/api/console/[[path]].js');
 let touches=0;
 const db={prepare(){touches++;throw Error('Database must not be reached');},batch(){touches++;throw Error('Database must not be reached');}};
 for(const environment of ['TRAINING','',null,'training','TRAIINING'])for(const method of ['GET','POST']){
  const env={OPERATIONS_DB:db,CONSOLE_ENVIRONMENT:environment,BOOTSTRAP_ADMIN_EMAIL:'team@creatorloop.net'};
  const result=await onRequest({env,data:{loginEmail:'team@creatorloop.net'},params:{path:['team']},request:new Request('https://creatorloop-operator-training.pages.dev/api/console/team',{method,headers:method==='POST'?{Origin:'https://creatorloop-operator-training.pages.dev'}:{},...(method==='POST'?{body:'{}'}:{})})});
  assert.equal(result.status,503,environment);assert.equal(touches,0);
 }
});
