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
