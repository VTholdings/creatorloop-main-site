import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture,call} from './helpers/operator-fixture.js';
test('audit migration preserves old events; new snapshots survive role and identity changes',async()=>{
 const {db,env}=await fixture();
 db.prepare("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id) VALUES('OLD','OP-OPERATOR','CMP-100','OLD','Creator','CR-200')").run();
 const before=db.prepare('SELECT * FROM audit_events').all();
 db.exec(await readFile('migrations/0005_team_directory.sql','utf8'));
 db.exec(await readFile('migrations/0006_audit_history.sql','utf8'));
 assert.deepEqual(db.prepare('SELECT * FROM audit_events').all(),before);
 assert.equal(db.prepare('SELECT count(*) n FROM console_audit_actor_snapshots').get().n,0);
 db.prepare("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id) VALUES('NEW','OP-OPERATOR','CMP-100','NEW','Creator','CR-200')").run();
 const snapshot=db.prepare("SELECT * FROM console_audit_actor_snapshots WHERE event_id='NEW'").get();
 assert.equal(snapshot.actor_role,'OPERATOR');
 assert.equal(JSON.parse(snapshot.scope_json)[0].recordId,'CR-200');
 db.prepare("UPDATE operators SET role='QA_REVIEWER',display_name='Changed',account_status='DISABLED' WHERE id='OP-OPERATOR'").run();
 assert.deepEqual(db.prepare("SELECT * FROM console_audit_actor_snapshots WHERE event_id='NEW'").get(),snapshot);
 const events=(await call(env,'ADMINISTRATOR','GET','audit?campaignId=CMP-100')).body.events;
 assert.equal(events.find(e=>e.id==='NEW').role_at_action,'OPERATOR');
 assert.equal(events.find(e=>e.id==='OLD').role_at_action,null);
 for(const sql of ["UPDATE audit_events SET action='rewritten'","DELETE FROM audit_events","UPDATE console_audit_actor_snapshots SET actor_role='ADMINISTRATOR'","DELETE FROM console_audit_actor_snapshots", "INSERT OR REPLACE INTO audit_events SELECT * FROM audit_events WHERE id='NEW'", "INSERT OR REPLACE INTO console_audit_actor_snapshots SELECT * FROM console_audit_actor_snapshots"])
  assert.throws(()=>db.exec(sql),/append-only/);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});
test('failed automatic snapshot rolls back the audited operation',async()=>{
 const {db,env}=await fixture();
 db.exec(await readFile('migrations/0005_team_directory.sql','utf8'));
 db.exec(await readFile('migrations/0006_audit_history.sql','utf8'));
 db.exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON console_audit_actor_snapshots BEGIN SELECT RAISE(ABORT,'snapshot failed'); END;");
 const result=await call(env,'OPERATOR','POST','escalations',{campaignId:'CMP-100',creatorId:'CR-200',type:'Creator Rights',severity:'Yellow',description:'Fictional test',evidenceLink:'https://example.com/test',eventId:'test-snapshot-rollback'});
 assert.equal(result.status,500);
 assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM console_source_outbox').get().n,0);
 db.close();
});
