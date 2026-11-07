import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function consoleContext() {
  const [html,source]=await Promise.all([
    readFile('console/index.html','utf8'),
    readFile('console/app.js','utf8')
  ]);
  const teamNav=html.match(/<button[^>]*class="[^"]*team-only[^"]*"[^>]*data-view="team"[^>]*>Team &amp; Access<\/button>/);
  assert.ok(teamNav,'Team & Access must be present in the permanent console sidebar');
  assert.match(html,/<span class="eyebrow team-only" hidden>Administration<\/span>/);
  assert.match(html,/<section id="team-view" class="view" hidden><\/section>/);
  const nodes=new Map();
  const teamOnly=[{hidden:true},{hidden:true}];
  const document={
    querySelector(selector) {
      if(!nodes.has(selector))nodes.set(selector,{hidden:false,textContent:'',classList:{toggle(){}},addEventListener(){}});
      return nodes.get(selector);
    },
    querySelectorAll(selector) {
      if(selector==='.team-only')return teamOnly;
      return [];
    },
    addEventListener(){}
  };
  const context={document};
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  return {context,teamOnly,nodes};
}

test('Owner can see Team & Access and its Administration heading after console loads',async()=>{
  const {context,teamOnly}=await consoleContext();
  runInNewContext(`state.dashboard={user:{
    id:'OP-OWNER',displayName:'Owner',role:'ADMINISTRATOR',
    loginIdentity:'team@creatorloop.net',canManageTeam:true,
    canViewAudit:true,canViewReports:true,canDiagnose:false
  },campaign:{id:'CMP-100',name:'Synthetic campaign'}};
  renderChrome();`,context);
  assert.deepEqual(teamOnly.map(node=>node.hidden),[false,false]);
});

test('Non-Owner employee cannot see or open Team & Access',async()=>{
  const {context,teamOnly}=await consoleContext();
  runInNewContext(`state.dashboard={user:{
    id:'OP-EMPLOYEE',displayName:'Employee',role:'OPERATOR',
    loginIdentity:'employee@example.test',canManageTeam:false,
    canViewAudit:false,canViewReports:false,canDiagnose:false
  },campaign:{id:'CMP-100',name:'Synthetic campaign'}};
  renderChrome();show('team');`,context);
  assert.deepEqual(teamOnly.map(node=>node.hidden),[true,true]);
});
