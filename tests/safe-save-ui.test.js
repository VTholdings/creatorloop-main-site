import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

class Element {
 constructor(){this.events={};this.hidden=false;this.disabled=false;this.classes=new Set();this.classList={contains:key=>this.classes.has(key),toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};}
 addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
 async emit(type){for(const handler of this.events[type]||[])await handler({preventDefault(){},currentTarget:this});}
}
class Label extends Element {
 constructor(name){super();this.childNodes=[{textContent:name}];}
 querySelector(){return this.marker||null;}
 append(marker){this.marker=marker;}
}
class Input extends Element {
 constructor(name,value,disabled=false){super();Object.assign(this,{name,value,disabled,label:new Label(name)});}
 closest(){return this.label;}
}
class Review extends Element {
 set innerHTML(value){this.html=value;this.nodes=new Map(['[data-safe-back]','[data-safe-commit]','[data-safe-confirm]'].map(key=>[key,new Element()]));}
 get innerHTML(){return this.html;}
 querySelector(key){return this.nodes.get(key);}
}
class Form extends Element {
 constructor(fields){super();this.id='isolated-record-form';this.dataset={};this.inputs=fields;this.isConnected=true;this.submit=new Element();this.nodes=new Map([['[type="submit"]',this.submit]]);}
 reportValidity(){return true;}
 querySelectorAll(){return this.inputs;}
 querySelector(key){return this.nodes.get(key);}
 insertAdjacentHTML(){for(const key of ['.edit-state','[data-safe-edit]','[data-safe-discard]','[data-safe-escalate]'])this.nodes.set(key,new Element());this.nodes.set('.save-review',new Review());}
}
async function setup(options={}) {
 const source=await readFile('console/app.js','utf8'),notice=new Element();
 const context={document:{addEventListener(){},querySelector:key=>key==='#notice'?notice:new Element(),createElement:()=>new Element()},window:{addEventListener(){},confirm:()=>false},setTimeout(){}};
 runInNewContext(source.replace(/start\(\);\s*$/,''),context);
 const form=new Form([new Input('notes','Original'),new Input('lockedId','CR-200',true)]),writes=[];
 const editor=context.bindSafeSave(form,{save:async body=>{writes.push(JSON.parse(JSON.stringify(body)));},...options});
 return {context,form,editor,writes,notice,notes:form.inputs[0],review:form.querySelector('.save-review')};
}
test('View → Edit → Review → Confirm commits once; input/change/blur do not save',async()=>{
 const f=await setup();assert.equal(f.notes.disabled,true);
 await f.form.querySelector('[data-safe-edit]').emit('click');assert.equal(f.notes.disabled,false);assert.equal(f.form.inputs[1].disabled,true);
 f.notes.value='Pending';for(const event of ['input','change','blur'])await f.form.emit(event);
 assert.equal(f.writes.length,0);assert.equal(f.editor.dirty,true);assert.equal(f.notes.classes.has('modified-field'),true);assert.match(f.form.querySelector('.edit-state').textContent,/Unsaved/);
 await f.form.emit('submit');assert.equal(f.writes.length,0);assert.equal(f.notes.disabled,true);assert.match(f.review.innerHTML,/Original/);assert.match(f.review.innerHTML,/Pending/);
 await f.review.querySelector('[data-safe-commit]').emit('click');await f.review.querySelector('[data-safe-commit]').emit('click');assert.deepEqual(f.writes,[{notes:'Pending'}]);assert.equal(f.editor.dirty,false);
});
test('Cancel/discard restores the original record without a write, including from Review',async()=>{
 for(const reviewFirst of [false,true]){const f=await setup();await f.form.querySelector('[data-safe-edit]').emit('click');f.notes.value='Discard me';await f.form.emit('input');if(reviewFirst)await f.form.emit('submit');await f.form.querySelector('[data-safe-discard]').emit('click');assert.equal(f.notes.value,'Original');assert.equal(f.editor.dirty,false);assert.equal(f.notes.disabled,true);assert.equal(f.writes.length,0);}
});
test('governed changes require explicit confirmation; review cannot add authority to the payload',async()=>{
 const f=await setup({governed:['notes']});await f.form.querySelector('[data-safe-edit]').emit('click');f.notes.value='<script>Governed</script>';await f.form.emit('input');await f.form.emit('submit');
 assert.match(f.review.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(f.review.innerHTML,/<script>/);
 await f.review.querySelector('[data-safe-commit]').emit('click');assert.equal(f.writes.length,0);
 f.review.querySelector('[data-safe-confirm]').checked=true;await f.review.querySelector('[data-safe-commit]').emit('click');assert.deepEqual(f.writes,[{notes:'<script>Governed</script>'}]);
});
test('failed/revoked/stale Save preserves local changes for review or discard',async()=>{
 for(const message of ['Permissions changed','Record changed']){const f=await setup({save:async()=>{throw Error(message);}});await f.form.querySelector('[data-safe-edit]').emit('click');f.notes.value='Keep draft';await f.form.emit('input');await f.form.emit('submit');await f.review.querySelector('[data-safe-commit]').emit('click');assert.equal(f.form.dataset.safeMode,'EDIT');assert.equal(f.notes.value,'Keep draft');assert.equal(f.editor.dirty,true);assert.match(f.notice.textContent,new RegExp(message));assert.equal(f.writes.length,0);}
});
test('read-only users cannot enter Edit or commit; locked fields stay disabled',async()=>{
 const f=await setup({canEdit:false});await f.form.querySelector('[data-safe-edit]').emit('click');assert.equal(f.notes.disabled,true);await f.form.emit('submit');assert.equal(f.writes.length,0);
});
test('review uses a fixed payload; a second confirmation during saving cannot duplicate it',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});let writes=0,value;
 const f=await setup({save:async body=>{writes++;value=body.notes;await pending;}});await f.form.querySelector('[data-safe-edit]').emit('click');f.notes.value='Reviewed';await f.form.emit('input');await f.form.emit('submit');f.notes.value='Unreviewed injection';
 const first=f.review.querySelector('[data-safe-commit]').emit('click');await f.review.querySelector('[data-safe-commit]').emit('click');assert.equal(writes,1);assert.equal(value,'Reviewed');assert.equal(f.context.leavePendingEdits(),false);release();await first;
 assert.equal(f.notes.value,'Reviewed');
});
test('refresh failure after a successful Save does not reopen the draft or repeat the commit',async()=>{
 const f=await setup({onSaved:async()=>{throw Error('View unavailable');}});await f.form.querySelector('[data-safe-edit]').emit('click');f.notes.value='Committed';await f.form.emit('input');await f.form.emit('submit');await f.review.querySelector('[data-safe-commit]').emit('click');
 assert.equal(f.writes.length,1);assert.equal(f.form.dataset.safeMode,'SAVED');assert.equal(f.editor.dirty,false);assert.match(f.notice.textContent,/Changes were saved/);assert.equal(f.notes.disabled,true);
});
