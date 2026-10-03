import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("imported optional fields and ISO dates render valid editable assignment values",async () => {
  const source = await readFile("console/app.js","utf8");
  const context = { document:{addEventListener(){},querySelector(){return {addEventListener(){}};}} };
  // Exercise the actual render functions without starting network/UI bootstrap.
  runInNewContext(source.replace(/start\(\);\s*$/,""),context);
  const html = runInNewContext(`state.dashboard={campaign:{id:'CMP-100'}};
    state.campaigns=[{id:'CMP-100',name:'Synthetic'}];
    assignmentForm({id:'ASG-TEST',creator_id:'CR-TEST',campaign_id:'CMP-100',signed_rights_evidence_link:null,
      notes:null,start_date:'2026-09-20T10:00:00.000Z',content_due:'2026-09-30'});`,context);
  assert.match(html,/name="signedRightsEvidenceLink" type="url" value=""/);
  assert.match(html,/name="startDate" type="date" value="2026-09-20"/);
  assert.match(html,/name="contentDue" type="date" value="2026-09-30"/);
  assert.match(html,/<textarea name="notes"><\/textarea>/);
  assert.equal(runInNewContext(`esc('<script>')`,context),'&lt;script&gt;');
});

test("assignment Product Scope and Platform use locked campaign-derived fields",async () => {
  const source=await readFile('console/app.js','utf8');
  const context={document:{addEventListener(){},querySelector(){return {addEventListener(){}};}}};
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  const html=runInNewContext(`state.dashboard={campaign:{id:'CMP-100'}};state.campaigns=[{id:'CMP-100',name:'Test'}];assignmentForm({id:'ASG-1',creator_id:'CR-1',campaign_id:'CMP-100',product_scope:'Scope from campaign',platform:'TikTok'});`,context);
  assert.match(html,/<label>Product Scope <textarea disabled>Scope from campaign<\/textarea>/);
  assert.match(html,/<label>Platform <input disabled value="TikTok">/);
  assert.doesNotMatch(html,/name="productScope"|name="platform"/);
});

test("an imported Primary Platform renders selected without choosing a substitute",async () => {
  const source=await readFile('console/app.js','utf8');
  const context={document:{addEventListener(){},querySelector(){return {addEventListener(){}};}}};
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  const html=runInNewContext(`optionList(['Meta','TikTok'],'TikTok + Instagram')`,context);
  assert.match(html,/<option selected>TikTok \+ Instagram<\/option>/);
  assert.doesNotMatch(html,/<option selected>TikTok<\/option>/);
});

async function approvalContext(role,reference='') {
  const source=await readFile('console/app.js','utf8');
  const fields=['creatorId','campaignId','status','paidUsageRights','evidenceStatus','signedRightsEvidenceLink','startDate','contentDue','fixedContentFee','commissionRate','attributionWindowDays','notes','authorizationId',''];
  const controls=fields.map(name=>({name,value:name==='authorizationId'?reference:'existing',disabled:['campaignId',''].includes(name)}));
  const form={dataset:{},querySelector(selector){return selector.includes('authorizationId')?controls.find(c=>c.name==='authorizationId'):null;},querySelectorAll(selector){return selector==='button'?[]:controls;}};
  const context={document:{addEventListener(){},querySelector(selector){return selector==='#creator-form'||selector==='#new-assignment'?null:{addEventListener(){}};},querySelectorAll(){return [form];}}};
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  runInNewContext(`state.dashboard={user:{role:'${role}',capabilities:{captureFacts:${['OPERATOR','OPERATIONS','ADMINISTRATOR'].includes(role)}}},campaign:{id:'CMP-100'}};`,context);
  return {context,controls,form};
}

test('authorization reference is a role-limited Console control, not a source field',async()=>{
  for(const role of ['OPERATOR','OPERATIONS','QA_REVIEWER','APPROVAL_AUTHORITY','ADMINISTRATOR']) {
    const {context}=await approvalContext(role);
    const assignment=runInNewContext("approvalReference('ASSIGNMENT')",context);
    assert.equal(assignment.includes('name="authorizationId"'),['OPERATOR','OPERATIONS'].includes(role));
    const creator=runInNewContext("approvalReference('CREATOR')",context);
    assert.equal(creator.includes('name="authorizationId"'),role==='OPERATIONS');
    if(assignment)assert.match(assignment,/server checks this record, the exact values and the decision validity/);
  }
});

test('operator reference permits scheduling entry while compensation, rights and Status remain locked',async()=>{
  const {context,controls}=await approvalContext('OPERATOR','unverified-reference');
  runInNewContext('applyRoleControls()',context);
  const disabled=name=>controls.find(c=>c.name===name).disabled;
  for(const field of ['startDate','contentDue','notes','authorizationId'])assert.equal(disabled(field),false,field);
  for(const field of ['status','paidUsageRights','evidenceStatus','signedRightsEvidenceLink','fixedContentFee','commissionRate','attributionWindowDays','campaignId',''])assert.equal(disabled(field),true,field);
});

test('Operations entry requires a reference and clearing it relocks controlled assignment fields',async()=>{
  const {context,controls}=await approvalContext('OPERATIONS');
  const approved=['startDate','contentDue','fixedContentFee','commissionRate','attributionWindowDays','paidUsageRights','evidenceStatus','signedRightsEvidenceLink'];
  for(const value of ['','AUTH-recorded-decision','   ']) {
    controls.find(c=>c.name==='authorizationId').value=value;
    runInNewContext('applyRoleControls()',context);
    for(const name of approved)assert.equal(controls.find(c=>c.name===name).disabled,!value.trim(),name);
    for(const name of ['campaignId','status',''])assert.equal(controls.find(c=>c.name===name).disabled,true,name);
  }
});

test('QA and delegated approval roles cannot use a supplied reference to capture facts',async()=>{
  for(const role of ['QA_REVIEWER','APPROVAL_AUTHORITY']) {
    const {context,controls}=await approvalContext(role,'AUTH-anything');
    runInNewContext('applyRoleControls()',context);
    assert.ok(controls.every(c=>c.disabled));
  }
});

test('creator and assignment forms include the existing authorization payload key where applicable',async()=>{
  const {context}=await approvalContext('OPERATIONS');
  runInNewContext("state.campaigns=[{id:'CMP-100',name:'Synthetic'}];state.current={creator:{id:'CR-200'},assignments:[],creatives:[]};",context);
  const creator=runInNewContext("creatorForm()",context);
  const assignment=runInNewContext("assignmentForm({id:'ASG-200',creator_id:'CR-200',campaign_id:'CMP-100'})",context);
  for(const html of [creator,assignment])assert.match(html,/name="authorizationId"/);
  assert.match(assignment,/<select name="campaignId" disabled>/);
});


test('Team & Access distinguishes Operations Manager, enforces environment messaging and preserves UTC expiry',async()=>{
  const source=await readFile('console/app.js','utf8');
  const context={document:{addEventListener(){},querySelector(){return {addEventListener(){}};}}};
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  const html=runInNewContext(`teamActionFields('manageAuthority',{profile:null,delegations:[{campaign_id:'CMP-100',field_key:'fixedContentFee',expires_at:'2099-01-01T01:02:03Z'}],scope:[],assignedRecords:[]},{campaigns:[{id:'CMP-100',name:'Fictional'}],authorityFields:['fixedContentFee']})`,context);
  assert.match(html,/Expires \(UTC\)/);assert.match(html,/value="2099-01-01T01:02:03"/);assert.match(html,/step="1"/);
  const choices=runInNewContext(`roleChoices({approvedRoles:['OPERATIONS','OPERATIONS_MANAGER'],roleCatalog:{OPERATIONS:'Operations — record authorized decisions',OPERATIONS_MANAGER:'Operations Manager'}},'OPERATIONS_MANAGER')`,context);
  assert.match(choices,/Operations — record authorized decisions/);assert.match(choices,/value="OPERATIONS_MANAGER" selected>Operations Manager/);
  const production=runInNewContext(`teamActionFields('startTraining',{profile:null,delegations:[],scope:[],assignedRecords:[]},{environment:'PRODUCTION'})`,context);
  assert.match(production,/production access remains disabled/);
});
test('invalid Team scope is caught and never submitted; UI can show actionable error',async()=>{
  const source=await readFile('console/app.js','utf8');let handler,requestCount=0;
  const button={disabled:false},editor={innerHTML:''},form={addEventListener(event,callback){handler=callback;},querySelector(){return button;}},notice={hidden:true,className:'',textContent:''};
  const context={document:{addEventListener(){},querySelector(selector){return selector==='#team-action-editor'?editor:selector==='#team-action-form'?form:selector==='#notice'?notice:{addEventListener(){}};}},FormData:class{*[Symbol.iterator](){yield ['reason','Fictional test'];yield ['scopes','CMP-100,CR-200,unexpected'];}},fetch:async()=>{requestCount++;throw new Error('Unexpected request');},setTimeout(){}};
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  runInNewContext(`state.teamPerson={id:'OP-FICTIONAL',profile:null,scope:[],assignedRecords:[],role:'OPERATOR'};state.teamMeta={};editTeamAction('editScope');`,context);
  await handler({preventDefault(){}});assert.equal(requestCount,0);assert.match(notice.textContent,/one Campaign ID, Creator ID/);assert.equal(button.disabled,false);
});
test('report snapshots escape content and preserve Product Focus versus Product Scope',async()=>{
 const source=await readFile('console/app.js','utf8'),context={document:{addEventListener(){},querySelector(){return {addEventListener(){}};}}};
 runInNewContext(source.replace(/start\(\);\s*$/,''),context);
 const creator=runInNewContext(`reportSnapshot([{id:'CR-FICTIONAL',creator_name:'<script>',product_focus:'Creator focus'}],'creators')`,context);
 const campaign=runInNewContext(`reportSnapshot([{id:'CMP-FICTIONAL',product_scope:'Campaign scope'}],'campaigns')`,context);
 assert.match(creator,/Product Focus/);assert.doesNotMatch(creator,/Product Scope|<script>/);assert.match(creator,/&lt;script&gt;/);assert.match(campaign,/Product Scope/);assert.doesNotMatch(campaign,/Product Focus/);
});
