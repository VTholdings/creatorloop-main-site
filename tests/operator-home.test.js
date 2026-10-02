import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function client() {
  const elements = new Map();
  const context = {document:{addEventListener(){},querySelector(selector){if(!elements.has(selector))elements.set(selector,{addEventListener(){},textContent:'',innerHTML:''});return elements.get(selector);},querySelectorAll(){return [];}}};
  runInNewContext((await readFile('console/app.js','utf8')).replace(/start\(\);\s*$/,''),context);
  return {context,elements};
}

test('the daily queue routes QA to existing review roles and keeps operators waiting',async()=>{
  const {context}=await client();
  const records=[{id:'CR-1',creator_name:'QA',workflow_status:'AWAITING_QA',sync_status:'SYNCED'},{id:'CR-2',creator_name:'Correct',workflow_status:'CORRECTION_REQUIRED',sync_status:'SYNCED'},{id:'CR-3',creator_name:'Passed',workflow_status:'PASSED',sync_status:'SYNCED'}];
  context.records=records;
  const operator=runInNewContext("dailyWork(records,[],{role:'OPERATOR'},'2026-10-01')",context);
  assert.deepEqual(Array.from(operator.actionable,x=>x.id),['CR-2']);
  assert.deepEqual(Array.from(operator.waiting,x=>x.id),['CR-1']);
  const reviewer=runInNewContext("dailyWork(records,[],{role:'QA_REVIEWER'},'2026-10-01')",context);
  assert.deepEqual(Array.from(reviewer.actionable,x=>x.id),['CR-2','CR-1']);
  assert.equal(reviewer.waiting.length,0);
});

test('Content Due surfaces overdue and today without reopening closed or future work',async()=>{
  const {context}=await client();
  context.assignments=[{id:'ASG-1',creator_id:'CR-1',status:'In Progress',content_due:'2026-09-30T10:00:00.000Z'},{id:'ASG-2',creator_id:'CR-1',status:'Complete',content_due:'2026-09-29'},{id:'ASG-3',creator_id:'CR-1',status:'Not Started',content_due:'2026-10-02'},{id:'ASG-4',creator_id:'CR-1',status:'In Progress',content_due:'2026-10-01'},{id:'ASG-5',creator_id:'CR-1',status:'Blocked',content_due:null}];
  const queue=runInNewContext("dailyWork([],assignments,{role:'OPERATOR'},'2026-10-01')",context);
  assert.deepEqual(Array.from(queue.actionable,x=>x.id),['ASG-1','ASG-4','ASG-5']);
  assert.match(queue.actionable[0].instruction,/has passed/);
  assert.match(queue.actionable[1].instruction,/today/);
  assert.equal(runInNewContext("operatingDate(new Date('2026-10-02T06:00:00Z'))",context),'2026-10-01');
  assert.equal(runInNewContext("operatingDate(new Date('2026-10-02T11:00:00Z'))",context),'2026-10-02');
});

test('Home names unavailable queues and approval limits; login identity and task content are escaped',async()=>{
  const {context,elements}=await client();
  runInNewContext("state.dashboard={user:{id:'OP-1',displayName:'Operator',loginIdentity:'person@example.com',role:'OPERATOR'},campaign:{id:'CMP-100',name:'Example',status:'IN_PROGRESS',notes:'TEST / FICTIONAL'},counts:{},system:{schemaReady:true,systemOfRecord:'Google Sheets',controlSystem:'PNB Acquisition & Launch Control System',syncConfigured:true}};state.creators=[];state.assignments=[];renderChrome();renderHome();",context);
  assert.equal(elements.get('#operator-login').textContent,'person@example.com');
  const home=elements.get('#home-view').innerHTML;
  assert.match(home,/No actionable creator records/);
  assert.match(home,/Submissions require a verified source/);
  assert.match(home,/QA PASS is not Owner Approval/);
  assert.match(home,/isolated operator training campaign has not been established/);
  assert.doesNotMatch(home,/Ready to launch/);
  const escaped=runInNewContext("dailyWorkCards([{id:'CR-1',recordId:'CR-1',name:'<script>bad</script>',status:'IN_PROGRESS',instruction:'Check <asset>'}],'')",context);
  assert.doesNotMatch(escaped,/<script>/);
  assert.match(escaped,/&lt;asset&gt;/);
});
