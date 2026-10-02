import test from 'node:test';
import assert from 'node:assert/strict';
import {walkthrough} from '../training/walkthrough.mjs';
import {fixture,call} from './helpers/operator-fixture.js';
test('training identity is server configured and a production query parameter cannot enable it',async()=>{
 const {db,env}=await fixture();
 try{
  const production=await call(env,'OPERATOR','GET','dashboard?campaignId=CMP-100&training=true');
  assert.equal(production.body.system.training,false);assert.equal(production.body.system.systemOfRecord,'Google Sheets');
  env.CONSOLE_ENVIRONMENT='TRAINING';
  const training=await call(env,'OPERATOR','GET','dashboard?campaignId=CMP-100');
  assert.equal(training.body.system.training,true);assert.match(training.body.system.systemOfRecord,/Isolated training database/);
 }finally{db.close();}
});
test('isolated training covers normal processing, required escalation, blocked launch, monitoring and verified closeout',async()=>{
 const result=await walkthrough();assert.equal(result.steps.length,8);assert.equal(result.productionWrites,0);assert.equal(result.externalActions,0);
});
