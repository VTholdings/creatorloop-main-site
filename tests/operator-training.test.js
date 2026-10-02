import test from 'node:test';
import assert from 'node:assert/strict';
import {walkthrough} from '../training/walkthrough.mjs';
test('isolated training covers normal processing, required escalation, blocked launch, monitoring and verified closeout',async()=>{
 const result=await walkthrough();assert.equal(result.steps.length,8);assert.equal(result.productionWrites,0);assert.equal(result.externalActions,0);
});
