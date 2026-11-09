import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../console/app.js',import.meta.url),'utf8');
const render=source.slice(source.indexOf('async function renderTeam() {'),source.indexOf('\nasync function viewTeamPerson(',source.indexOf('async function renderTeam() {')));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const data=(name='Synthetic Person')=>({notice:'TRAINING fixture',metadataReady:false,users:[{fullName:name}]});
function fixture(api){
 const notices=[],calls=[],retry={disabled:false,handler:null,addEventListener(type,fn){if(type==='click')this.handler=fn;}};
 const target={innerHTML:'OLD DIRECTORY <button>OLD ACTION</button>',attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},querySelectorAll(){return [];},querySelector(selector){return selector==='#team-load-retry'&&this.innerHTML.includes('team-load-retry')?retry:null;}};
 const state={dashboard:{user:{canManageTeam:true}},teamMeta:{old:true},teamPerson:{id:'OLD-PERSON'}};
 const context={state,Symbol,$:selector=>selector==='#team-view'?target:null,api:async(...args)=>{calls.push(args);return api(...args);},notice:(...args)=>notices.push(args),esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),teamRows:users=>users.map(p=>'<tr><td>'+p.fullName+'</td></tr>').join(''),addTeamForm:()=>'<p>Existing read-only governance state</p>',downloadDataset:()=>{throw Error('NO EXPORT IN TEST');},viewTeamPerson:()=>{throw Error('NO LIVE PERSON READ IN TEST');}};
 runInNewContext(render+'\nglobalThis.run=renderTeam;',context);
 return {run:context.run,state,target,notices,calls,retry};
}

test('Team load clears stale directory/actions and selections while the actual read is pending',async()=>{
 const pending=deferred(),f=fixture(()=>pending.promise);
 const work=f.run();
 assert.doesNotMatch(f.target.innerHTML,/OLD DIRECTORY|OLD ACTION/);
 assert.match(f.target.innerHTML,/Loading Team/);
 assert.equal(f.target.attributes['aria-busy'],'true');
 assert.equal(f.state.teamMeta,null);assert.equal(f.state.teamPerson,null);
 pending.resolve(data());await work;
 assert.match(f.target.innerHTML,/Synthetic Person/);
 assert.equal(f.target.attributes['aria-busy'],'false');
 assert.deepEqual(f.calls,[['team']]);
});

test('failed Team refresh removes stale actions, escapes error and exposes a persistent retry',async()=>{
 const f=fixture(()=>Promise.reject(new Error('<expired session>')));
 await f.run();
 assert.doesNotMatch(f.target.innerHTML,/OLD DIRECTORY|OLD ACTION|<expired session>/);
 assert.match(f.target.innerHTML,/&lt;expired session&gt;/);
 assert.match(f.target.innerHTML,/role="alert"/);assert.match(f.target.innerHTML,/team-load-retry/);
 assert.equal(f.target.attributes['aria-busy'],'false');
 assert.equal(f.state.teamMeta,null);assert.equal(f.state.teamPerson,null);
 assert.equal(f.notices.length,1);
});

test('Team retry performs only the existing directory GET and restores unchanged success rendering',async()=>{
 let attempts=0;const f=fixture(()=>++attempts===1?Promise.reject(new Error('Unavailable')):Promise.resolve(data()));
 await f.run();assert.equal(typeof f.retry.handler,'function');
 await f.retry.handler();
 assert.match(f.target.innerHTML,/Team &amp; Access/);assert.match(f.target.innerHTML,/Synthetic Person/);
 assert.match(f.target.innerHTML,/Existing read-only governance state/);
 assert.doesNotMatch(f.target.innerHTML,/team-load-retry/);
 assert.deepEqual(f.calls,[['team'],['team']]);assert.equal(f.notices.length,1);
});

test('non-Owner Team rendering clears old protected content and performs no directory read',async()=>{
 const f=fixture(()=>{throw Error('MUST NOT READ');});f.state.dashboard.user.canManageTeam=false;
 await f.run();assert.equal(f.calls.length,0);assert.equal(f.target.innerHTML,'');
 assert.equal(f.state.teamMeta,null);assert.equal(f.state.teamPerson,null);
});

test('older Team success cannot replace a newer completed directory load',async()=>{
 const first=deferred(),second=deferred();let attempts=0;
 const f=fixture(()=>++attempts===1?first.promise:second.promise);
 const one=f.run(),two=f.run();second.resolve(data('Current Synthetic Person'));await two;
 first.resolve(data('Stale Synthetic Person'));await one;
 assert.match(f.target.innerHTML,/Current Synthetic Person/);assert.doesNotMatch(f.target.innerHTML,/Stale Synthetic Person/);
 assert.equal(f.state.teamMeta.users[0].fullName,'Current Synthetic Person');
});

test('older failed Team read cannot overwrite the newer successful directory',async()=>{
 const first=deferred();let attempts=0;const f=fixture(()=>++attempts===1?first.promise:Promise.resolve(data('Current Synthetic Person')));
 const one=f.run();await f.run();first.reject(new Error('Old failure'));await one;
 assert.match(f.target.innerHTML,/Current Synthetic Person/);assert.doesNotMatch(f.target.innerHTML,/Old failure/);
 assert.equal(f.notices.length,0);
});

test('Team permission lost during a directory read prevents response rendering',async()=>{
 const pending=deferred(),f=fixture(()=>pending.promise);const work=f.run();
 f.state.dashboard.user.canManageTeam=false;pending.resolve(data());await work;
 assert.equal(f.target.innerHTML,'');assert.equal(f.state.teamMeta,null);assert.equal(f.state.teamPerson,null);
 assert.equal(f.target.attributes['aria-busy'],'false');
});
