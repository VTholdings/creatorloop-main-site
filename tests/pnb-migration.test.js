import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

test('PNB migration preserves every record and foreign key while accepting exact source values',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const name of ['0001_bm01','0002_operations_console_v2'])db.exec(await readFile('migrations/'+name+'.sql','utf8'));
  db.exec("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('OP-QA','qa@example.com','QA','ADMINISTRATOR','ACTIVE'); INSERT INTO qa_reviews(id,enrollment_id,reviewer_id,result,checklist_json) VALUES('QA-1','CR-100','OP-QA','PASS','{}'); INSERT INTO creator_assignments(id,environment,creator_id,campaign_id,status,paid_usage_rights,evidence_status,last_updated) VALUES('ASG-100','TEST','CR-100','CMP-100','Active','Pending','Planned','2026-10-01');");
  const tables=['campaigns','operators','creator_enrollments','creator_assignments','qa_reviews','audit_events','control_system_outbox'];
  const before=tables.map(t=>db.prepare('SELECT * FROM '+t).all());
  db.exec('BEGIN'); db.exec(await readFile('migrations/0003_pnb_source_contract.sql','utf8')); db.exec('COMMIT');
  assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t).all()),before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  db.exec("UPDATE creator_enrollments SET primary_platform='TikTok + Instagram',creator_status='Live',rights_status='N/A' WHERE id='CR-100'; UPDATE creator_assignments SET status='Paused' WHERE id='ASG-100';");
  db.exec("INSERT INTO creator_enrollments(id,creator_name,primary_platform,handle,contact,creator_status,compensation_model,rights_status,product_focus,workflow_status,enrollment_date,last_updated) VALUES('CR-101','Unassigned','Meta','','','Not Started','N/A','N/A','','AVAILABLE','2026-10-01','2026-10-01')");
  assert.equal(db.prepare("SELECT campaign_id FROM creator_enrollments WHERE id='CR-101'").get().campaign_id,null);
  assert.throws(()=>db.exec("UPDATE creator_enrollments SET workflow_status='BYPASS'"));
  assert.throws(()=>db.exec("UPDATE creator_assignments SET paid_usage_rights='Approved'"));
 }finally{db.close();}
});
