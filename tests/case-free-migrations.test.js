import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {MIGRATION_HASHES} from '../scripts/lib/training-migrations.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const names=['0006_audit_history.sql','0007_team_governance.sql'];
const original=await Promise.all(names.map(n=>readFile('tests/fixtures/accepted-team-migrations/'+n,'utf8')));
const corrected=await Promise.all(names.map(n=>readFile('migrations/'+n,'utf8')));
const conditional=/SELECT CASE WHEN\s+([\s\S]*?)\s+THEN\s+(RAISE\(ABORT,'([^']+)'\))\s+END;/g;
const guards=original.flatMap(s=>[...s.matchAll(conditional)]);

test('only six CASE guard forms change; predicates, error text, statement order and 0005 bytes remain exact',async()=>{
 assert.equal(guards.length,6);
 for(const [i,name] of names.entries()){
  assert.equal(hash(original[i]),MIGRATION_HASHES[name]);
  assert.equal([...original[i].matchAll(conditional)].length,i===0?1:5);
  assert.equal(corrected[i],original[i].replace(conditional,(_statement,predicate,raise)=>'SELECT '+raise+' WHERE '+predicate+';'));
  assert.doesNotMatch(corrected[i],/\bCASE\b|\r/);
 }
 assert.equal(hash(await readFile('migrations/0005_team_directory.sql','utf8')),MIGRATION_HASHES['0005_team_directory.sql']);
});

test('all six guards preserve TRUE, FALSE and NULL coercion plus statement-atomic abort semantics',()=>{
 for(const guard of guards)for(const value of [1,0,null,-1,2,'','0','1']){
  const states=[];
  for(const form of ['case','where']){
   const db=new DatabaseSync(':memory:');try{
    db.exec('CREATE TABLE subject(id INTEGER PRIMARY KEY,value);CREATE TABLE effects(id INTEGER);INSERT INTO subject VALUES(1,0)');
    const raise=guard[2],sql=form==='case'?'SELECT CASE WHEN NEW.value THEN '+raise+' END;':'SELECT '+raise+' WHERE NEW.value;';
    db.exec('CREATE TRIGGER conditional_guard AFTER UPDATE ON subject BEGIN INSERT INTO effects VALUES(1);'+sql+'END;');
    let error=null;try{db.prepare('UPDATE subject SET value=? WHERE id=1').run(value);}catch(e){error=e.message;}
    states.push({error,subject:db.prepare('SELECT * FROM subject').all(),effects:db.prepare('SELECT * FROM effects').all()});
    if([1,-1,2,'1'].includes(value)){assert.equal(error,guard[3]);assert.deepEqual(states.at(-1).effects,[]);assert.equal(states.at(-1).subject[0].value,0);}
    else{assert.equal(error,null);assert.equal(states.at(-1).effects.length,1);assert.equal(states.at(-1).subject[0].value,value);}
   }finally{db.close();}
  }
  assert.deepEqual(states[0],states[1]);
 }
});

test('actual corrected migrations pass D1-relevant SQLite limits, preserve original values and roll back early/late failure',t=>{
 const r=spawnSync('python3',['tests/helpers/case-free-rehearsal.py'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.error?.message);const proof=JSON.parse(r.stdout);
 assert.equal(proof.status,'LOCAL_CASE_FREE_MIGRATIONS_PASS');assert.equal(proof.compoundSelectLimit,5);
 assert.equal(proof.pendingStatementCount,44);assert.equal(proof.migrationOrder.join(','),'0005_team_directory,0006_audit_history,0007_team_governance');
 assert.equal(proof.originalValuesPreserved,true);assert.equal(proof.earlyRollbackExact,true);assert.equal(proof.lateRollbackExact,true);
 assert.equal(proof.foreignKeyViolations,0);assert.equal(proof.providerVerified,false);t.diagnostic(JSON.stringify(proof));
});
