import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const nextId='CMP-NEXT-FICTIONAL';
const nextDashboard={campaign:{id:nextId},user:{role:'OPERATOR',canViewAudit:false,canViewReports:false,canManageTeam:false,capabilities:{captureFacts:true}},system:{training:true,governedEditingReady:true}};
const nextCreators=[{id:'CR-NEXT-FICTIONAL',campaign_id:nextId}];
const nextAssignments=[{id:'ASG-NEXT-FICTIONAL',campaign_id:nextId}];
const nextQueues={stages:[],missingSources:[]};

async function setup({failAt,fetcher,confirm=false}={}) {
  const source=await readFile('console/app.js','utf8'),calls=[],notice={};
  let clickHandler,renders=0,views=0,confirmations=0;
  const fallback={addEventListener(){}};
  const context={
    document:{addEventListener(type,handler){if(type==='click')clickHandler=handler;},querySelector(selector){return selector==='#notice'?notice:fallback;}},
    window:{addEventListener(){},confirm(){confirmations++;return confirm;}},setTimeout(){},
    renderProbe(){renders++;},viewProbe(){views++;},
    fetch:async(path,options)=>{
      const route=path.slice('/api/console/'.length).split('?')[0];calls.push({route,path,options});
      if(fetcher)return fetcher(route);
      if(route===failAt)return {ok:false,status:503,json:async()=>({error:'Fictional '+route+' load failure'})};
      const data=route==='dashboard'?nextDashboard:route==='creators'?{creators:nextCreators}:route.startsWith('campaigns/')?{assignments:nextAssignments}:nextQueues;
      return {ok:true,json:async()=>data};
    }
  };
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  runInNewContext(`state.dashboard={campaign:{id:'CMP-OLD-FICTIONAL'},user:{role:'OPERATOR'}};
    state.creators=[{id:'CR-OLD-FICTIONAL',campaign_id:'CMP-OLD-FICTIONAL'}];
    state.assignments=[{id:'ASG-OLD-FICTIONAL',campaign_id:'CMP-OLD-FICTIONAL'}];
    state.queues={stages:[{name:'Old fictional queue',items:[]}]};
    state.current={creator:state.creators[0]};state.currentCampaign={campaign:state.dashboard.campaign};
    renderAll=()=>renderProbe();show=()=>viewProbe();`,context);
  const snapshot=()=>JSON.parse(runInNewContext('JSON.stringify(state)',context));
  return {context,calls,notice,snapshot,get renders(){return renders;},get views(){return views;},get confirmations(){return confirmations;},
    clickWork:()=>clickHandler({target:{id:'',closest(selector){return selector==='[data-open-work]'?{dataset:{openWork:nextId}}:null;}}})};
}

for(const route of ['dashboard','creators','campaigns/'+nextId]) {
  test('required '+route+' failure preserves the entire previous campaign state and shows an error',async()=>{
    const f=await setup({failAt:route}),before=f.snapshot();
    await f.clickWork();
    assert.deepEqual(f.snapshot(),before);
    assert.match(f.notice.textContent,/Fictional .* load failure/);
    assert.equal(f.notice.className,'notice error');
    assert.equal(f.renders,0);assert.equal(f.views,0);
    assert.equal(f.calls.filter(call=>call.route===route).length,1);
    assert.ok(f.calls.every(call=>!call.options.method));
  });
}

test('campaign state stays coherent while a required request is pending, then updates together',async()=>{
  let release,signal;
  const pending=new Promise(resolve=>{release=resolve;});
  const requested=new Promise(resolve=>{signal=resolve;});
  const f=await setup({fetcher:async route=>{
    if(route==='creators'){signal();await pending;}
    return {ok:true,json:async()=>route==='dashboard'?nextDashboard:route==='creators'?{creators:nextCreators}:route.startsWith('campaigns/')?{assignments:nextAssignments}:nextQueues};
  }}),before=f.snapshot();
  const loading=f.context.loadCampaign(nextId);
  await requested;
  assert.ok(f.calls.some(call=>call.route==='creators'));
  const during=f.snapshot();release();await loading;
  assert.deepEqual(during,before);
  const after=f.snapshot();
  assert.deepEqual(after.dashboard,nextDashboard);assert.deepEqual(after.creators,nextCreators);
  assert.deepEqual(after.assignments,nextAssignments);assert.deepEqual(after.queues,nextQueues);
  assert.equal(after.current,null);assert.equal(after.currentCampaign,null);
  assert.deepEqual(f.calls.map(call=>call.route),['dashboard','creators','campaigns/'+nextId,'queues']);
});

test('optional queue failure keeps successful campaign data and existing unavailable-source messaging',async()=>{
  const f=await setup({failAt:'queues'});await f.clickWork();
  const after=f.snapshot();
  assert.deepEqual(after.dashboard,nextDashboard);assert.deepEqual(after.creators,nextCreators);
  assert.deepEqual(after.assignments,nextAssignments);
  assert.deepEqual(after.queues,{stages:[],missingSources:['Operational queue synchronization'],error:'Fictional queues load failure'});
  assert.equal(after.current,null);assert.equal(after.currentCampaign,null);
  assert.equal(f.renders,1);assert.equal(f.views,1);
});

test('successful campaign load retains the existing empty-assignment default',async()=>{
  const f=await setup({fetcher:async route=>({ok:true,json:async()=>route==='dashboard'?nextDashboard:route==='creators'?{creators:nextCreators}:route.startsWith('campaigns/')?{}:nextQueues})});
  await f.context.loadCampaign(nextId);
  assert.deepEqual(f.snapshot().assignments,[]);
});

for(const saving of [false,true]) {
  test((saving?'in-flight save':'declined unsaved-change discard')+' blocks campaign reads and preserves selection',async()=>{
    const f=await setup({confirm:false}),before=f.snapshot();
    runInNewContext(`recordEditors.add({form:{isConnected:true},dirty:true,saving:${saving},discard(){throw Error('Unexpected discard');}});`,f.context);
    assert.equal(await f.context.loadCampaign(nextId),false);
    assert.deepEqual(f.snapshot(),before);assert.equal(f.calls.length,0);
    assert.equal(f.confirmations,saving?0:1);
    if(saving)assert.match(f.notice.textContent,/Wait for the reviewed save/);
  });
}
