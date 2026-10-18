import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

class Element {
  constructor() {
    this.events={};this.hidden=false;this.disabled=false;this.classes=new Set();
    this.classList={contains:key=>this.classes.has(key),toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
  }
  addEventListener(type,handler) {(this.events[type]||=[]).push(handler);}
  async emit(type) {for(const handler of this.events[type]||[])await handler({preventDefault(){},currentTarget:this});}
}
class Input extends Element {
  constructor(name,value,disabled=false) {
    super();Object.assign(this,{name,value,disabled});
    this.label={childNodes:[{textContent:name}],classList:{toggle(){}},querySelector:()=>this.marker||null,append:marker=>{this.marker=marker;}};
  }
  closest() {return this.label;}
}
class Review extends Element {
  set innerHTML(value) {
    this.html=value;
    this.nodes=new Map(['[data-safe-back]','[data-safe-commit]','[data-safe-confirm]'].map(key=>[key,new Element()]));
  }
  get innerHTML() {return this.html;}
  querySelector(key) {return this.nodes.get(key);}
}
class Form extends Element {
  constructor(existing=false) {
    super();this.id='creator-form';this.dataset={};this.isConnected=true;this.submit=new Element();
    this.inputs=Object.entries({
      ...(existing?{}:{campaignId:'CMP-FICTIONAL'}),creatorName:existing?'Existing fictional creator':'',
      primaryPlatform:'Meta',handle:existing?'fictional-handle':'',contact:existing?'fictional@example.invalid':'',
      creatorStatus:existing?'Active':'Not Started',compensationModel:existing?'N/A':'Performance',
      rightsStatus:existing?'Paid Usage Approved':'Not Reviewed',evidenceLink:existing?'https://example.invalid/old-proof':'',
      productFocus:existing?'Fictional product':'',notes:existing?'Original notes':''
    }).map(([name,value])=>new Input(name,value));
    this.nodes=new Map([['[type="submit"]',this.submit]]);
  }
  field(name) {return this.inputs.find(input=>input.name===name);}
  reportValidity() {return true;}
  querySelectorAll(selector) {return selector==='button'?[this.submit,...[...this.nodes.entries()].filter(([key])=>key.startsWith('[data-safe-')).map(([,node])=>node)]:this.inputs;}
  querySelector(key) {return this.nodes.get(key)||null;}
  insertAdjacentHTML() {
    for(const key of ['.edit-state','[data-safe-edit]','[data-safe-discard]','[data-safe-escalate]'])this.nodes.set(key,new Element());
    this.nodes.set('.save-review',new Review());
  }
}
async function setup({discard=true}={}) {
  const source=await readFile('console/app.js','utf8');
  let clickHandler,currentForm=new Form(true),confirmations=0,refreshes=0;
  const writes=[],notice=new Element(),fallback=new Element();
  const editor={
    html:'',
    set innerHTML(value) {this.html=value;currentForm.isConnected=false;currentForm=new Form();},
    get innerHTML() {return this.html;},
    insertAdjacentHTML(_position,value) {this.html=value+this.html;},
    querySelectorAll() {return [...currentForm.inputs,currentForm.submit];}
  };
  const context={
    document:{
      addEventListener(type,handler) {if(type==='click')clickHandler=handler;},
      querySelector(selector) {
        if(selector==='#creator-form')return currentForm;
        if(selector==='#editor')return editor;
        if(selector==='#notice')return notice;
        if(['#new-assignment','#submit-qa','#qa-form'].includes(selector))return null;
        return fallback;
      },
      querySelectorAll() {return [];},createElement:()=>new Element()
    },
    window:{addEventListener(){},confirm(){confirmations++;return discard;}},setTimeout(){},
    fetch:async(path,options)=>{writes.push({path,method:options.method,body:JSON.parse(options.body)});return {ok:true,json:async()=>({})};},
    onRefresh:()=>{refreshes++;}
  };
  runInNewContext(source.replace(/start\(\);\s*$/,''),context);
  runInNewContext(`state.dashboard={campaign:{id:'CMP-FICTIONAL'},system:{schemaReady:true,governedEditingReady:true},
    user:{role:'OPERATOR',capabilities:{captureFacts:true}},options:{productFocus:['Fictional product']}};
    state.campaigns=[{id:'CMP-FICTIONAL',name:'Fictional campaign'}];
    state.current={creator:{id:'CR-FICTIONAL',campaign_id:'CMP-FICTIONAL',rights_status:'Paid Usage Approved',version:7}};
    bindCreatorForm(state.current.creator);
    reload=async()=>onRefresh();`,context);
  return {
    context,editor,notice,writes,get form(){return currentForm;},get confirmations(){return confirmations;},get refreshes(){return refreshes;},
    current:()=>runInNewContext('state.current',context),
    clickNew:()=>clickHandler({target:{id:'new-creator',closest(){return null;}}})
  };
}

test('existing paid-rights creator keeps governed fields locked during factual editing',async()=>{
  const f=await setup();
  await f.form.querySelector('[data-safe-edit]').emit('click');
  for(const name of ['evidenceLink','productFocus','compensationModel','rightsStatus','creatorStatus'])assert.equal(f.form.field(name).disabled,true,name);
  for(const name of ['creatorName','handle','contact','notes'])assert.equal(f.form.field(name).disabled,false,name);
  assert.equal(f.current().creator.id,'CR-FICTIONAL');
  assert.equal(f.writes.length,0);
});

test('New Creator clears stale selection before binding and keeps unauthorized fields locked',async()=>{
  const f=await setup();
  await f.clickNew();
  assert.equal(f.current(),null);
  assert.match(f.editor.innerHTML,/New creator enrollment/);
  assert.equal(f.form.dataset.safeMode,'EDIT');
  for(const name of ['campaignId','evidenceLink','productFocus','creatorName','handle','contact','notes'])assert.equal(f.form.field(name).disabled,false,name);
  for(const [name,value] of [['compensationModel','N/A'],['rightsStatus','Not Reviewed'],['creatorStatus','Not Started']]){
    assert.equal(f.form.field(name).disabled,true,name);assert.equal(f.form.field(name).value,value,name);
  }
  assert.equal(f.confirmations,0);assert.equal(f.writes.length,0);
});

test('declining unsaved-change discard preserves the existing record and draft',async()=>{
  const f=await setup({discard:false}),original=f.form;
  await original.querySelector('[data-safe-edit]').emit('click');
  original.field('notes').value='Keep this fictional draft';await original.emit('input');
  await f.clickNew();
  assert.equal(f.form,original);assert.equal(f.current().creator.id,'CR-FICTIONAL');
  assert.equal(original.field('notes').value,'Keep this fictional draft');assert.equal(original.dataset.safeMode,'EDIT');
  assert.equal(f.confirmations,1);assert.equal(f.writes.length,0);
});

test('accepting discard restores the old draft before initializing a clean New Creator form',async()=>{
  const f=await setup(),original=f.form;
  await original.querySelector('[data-safe-edit]').emit('click');
  original.field('notes').value='Discard this fictional draft';await original.emit('input');
  await f.clickNew();
  assert.notEqual(f.form,original);assert.equal(original.field('notes').value,'Original notes');
  assert.equal(f.current(),null);assert.equal(f.form.field('notes').value,'');
  assert.equal(f.form.field('productFocus').disabled,false);
  assert.equal(f.confirmations,1);assert.equal(f.writes.length,0);
});

test('New Creator still requires reviewed confirmation and duplicate confirmation cannot create twice',async()=>{
  const f=await setup();await f.clickNew();
  const form=f.form;
  for(const [name,value] of Object.entries({creatorName:'New fictional creator',handle:'new-fictional',contact:'new@example.invalid',productFocus:'Fictional product',evidenceLink:'https://example.invalid/new-proof'}))form.field(name).value=value;
  for(const event of ['input','change','blur'])await form.emit(event);
  assert.equal(f.writes.length,0);
  await form.emit('submit');assert.equal(form.dataset.safeMode,'REVIEW');assert.equal(f.writes.length,0);
  const review=form.querySelector('.save-review'),commit=review.querySelector('[data-safe-commit]');
  await commit.emit('click');assert.equal(f.writes.length,0);
  review.querySelector('[data-safe-confirm]').checked=true;
  await commit.emit('click');await commit.emit('click');
  assert.equal(f.writes.length,1);assert.equal(f.refreshes,1);
  assert.equal(f.writes[0].path,'/api/console/creators');assert.equal(f.writes[0].method,'POST');
  assert.equal(f.writes[0].body.productFocus,'Fictional product');assert.equal(f.writes[0].body.evidenceLink,'https://example.invalid/new-proof');
  assert.equal(f.writes[0].body.saveIntent,'REVIEWED_RECORD_EDIT');
  for(const name of ['version','authorizationId','compensationModel','rightsStatus','creatorStatus'])assert.equal(name in f.writes[0].body,false,name);
});
