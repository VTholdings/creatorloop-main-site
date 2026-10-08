import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

async function setup() {
  const source=await readFile('console/app.js','utf8'),timers=[],requests=[];
  let now=0,fail=true;
  const notice={hidden:true,textContent:'',className:''},reports={hidden:true,innerHTML:''};
  const fallback={addEventListener(){},classList:{remove(){}}};
  const context={
    document:{addEventListener(){},querySelector(selector){return selector==='#notice'?notice:selector==='#reports-view'?reports:selector==='#finalize-report-form'||selector==='#report-download'?null:fallback;},querySelectorAll(){return []; }},
    setTimeout(callback,delay){timers.push({callback,at:now+delay});},
    fetch:async(path,options)=>{requests.push({path,options});return {ok:!fail,status:fail?503:200,json:async()=>fail?{error:'Fictional report load failure'}:{reports:[]}};}
  };
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  context.notice=runInNewContext('notice',context);
  runInNewContext("state.dashboard={campaign:{id:'CMP-FICTIONAL'},user:{canViewReports:true,canManageTeam:false,exportDatasets:[]}}",context);
  const tick=milliseconds=>{
    const end=now+milliseconds;
    while(true){const next=timers.filter(timer=>!timer.fired&&timer.at<=end).sort((a,b)=>a.at-b.at)[0];if(!next)break;now=next.at;next.fired=true;next.callback();}
    now=end;
  };
  const navigate=async()=>{context.show('reports');await new Promise(resolve=>setImmediate(resolve));};
  return {context,notice,reports,requests,tick,navigate,recover(){fail=false;}};
}

test('an individual notice still displays its text and class for the existing six-second duration',async()=>{
  const f=await setup();f.context.notice('Fictional action completed');
  assert.equal(f.notice.textContent,'Fictional action completed');assert.equal(f.notice.className,'notice');assert.equal(f.notice.hidden,false);
  f.tick(5999);assert.equal(f.notice.hidden,false);
  f.tick(1);assert.equal(f.notice.hidden,true);
});

test('a near-expired success notice cannot prematurely dismiss a new error',async()=>{
  const f=await setup();f.context.notice('Previous fictional action completed');f.tick(5999);
  f.context.notice('New fictional load failure',true);f.tick(1);
  assert.equal(f.notice.textContent,'New fictional load failure');assert.equal(f.notice.className,'notice error');assert.equal(f.notice.hidden,false);
  f.tick(5998);assert.equal(f.notice.hidden,false);f.tick(1);assert.equal(f.notice.hidden,true);
});

test('identical repeated errors each receive a fresh lifetime and older timers cannot hide the newest notice',async()=>{
  const f=await setup();f.context.notice('Repeated fictional error',true);f.tick(3000);
  f.context.notice('Repeated fictional error',true);f.tick(3000);
  assert.equal(f.notice.hidden,false);
  f.context.notice('Repeated fictional error',true);f.tick(3000);
  assert.equal(f.notice.hidden,false);
  f.tick(2999);assert.equal(f.notice.hidden,false);f.tick(1);assert.equal(f.notice.hidden,true);
});

test('actual report navigation failure stays visible after an older timeout and retry loads the view without a write',async()=>{
  const f=await setup();f.context.notice('Previous fictional operation completed');f.tick(5999);
  await f.navigate();
  assert.equal(f.reports.hidden,false);assert.equal(f.notice.textContent,'Fictional report load failure');assert.equal(f.notice.className,'notice error');
  f.tick(1);assert.equal(f.notice.hidden,false);
  f.recover();await f.navigate();
  assert.match(f.reports.innerHTML,/No finalized Console reports/);
  assert.equal(f.requests.length,2);assert.ok(f.requests.every(request=>request.path==='/api/console/reports?campaignId=CMP-FICTIONAL'&&!request.options.method));
  f.tick(5999);assert.equal(f.notice.hidden,true);
});
