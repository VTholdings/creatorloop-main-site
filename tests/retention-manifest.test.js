import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
async function run(sql,files=[]) {
 const dir=await mkdtemp(join(tmpdir(),'creatorloop-retention-'));try{
  const backup=join(dir,'backup.sql');await writeFile(backup,sql);const extras=[];for(const [name,content] of files){const path=join(dir,name);await writeFile(path,content);extras.push('--external',path);}
  const r=spawnSync('python3',['scripts/retention-manifest.py',backup,'--environment','TRAINING','--release-sha','a'.repeat(40),...extras],{encoding:'utf8'});return {code:r.status,out:r.stdout,error:r.stderr};
 }finally{await rm(dir,{recursive:true,force:true});}
}
const sha=s=>createHash('sha256').update(s).digest('hex');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const records=[{id:'CR-FICTIONAL',small:1e-7,unicode:'🗺️',email:'private@example.com'}];
const report=(version=1)=>JSON.stringify({version,records,snapshotHash:sha(JSON.stringify(records))});
const schema='CREATE TABLE audit_events(id TEXT,object_type TEXT,object_id TEXT,previous_value TEXT,new_value TEXT);';
test('retention manifest restores and hashes all rows and finalized report versions without printing private contents',async()=>{
 const sql=schema+`INSERT INTO audit_events VALUES('A1','FinalizedReport','R1',NULL,${quote(report())}); INSERT INTO audit_events VALUES('A2','FinalizedReport','R1','A1',${quote(report(2))});`;
 const r=await run(sql,[['external-report.pdf','fictional external artifact']]);assert.equal(r.code,0,r.error);const m=JSON.parse(r.out);assert.equal(m.remote_verified,false);assert.equal(m.report_versions.length,2);assert.equal(m.table_inventory.audit_events.rows,2);assert.equal(m.external_artifacts[0].sha256,sha('fictional external artifact'));assert.doesNotMatch(r.out,/private@example.com/);
});
test('retention verifier rejects broken version chains and altered finalized content',async()=>{
 for(const raw of [report(2),JSON.stringify({version:1,records,snapshotHash:'0'.repeat(64)})]){
  const r=await run(schema+`INSERT INTO audit_events VALUES('A1','FinalizedReport','R1',NULL,${quote(raw)});`);assert.equal(r.code,1);assert.match(r.error,/RETENTION BLOCKED/);
 }
});
test('retention verifier rejects invalid foreign keys and leaves exports unmodified',async()=>{
 const r=await run("PRAGMA foreign_keys=OFF;CREATE TABLE p(id INTEGER PRIMARY KEY);CREATE TABLE c(pid INTEGER REFERENCES p(id));INSERT INTO c VALUES(99);");assert.equal(r.code,1);assert.match(r.error,/foreign-key/);
});

test('independent restore comparison detects changed rows, schema guards and environment while preserving the exports',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'creatorloop-restore-'));
 try{
  const backup=join(dir,'original.sql'),restored=join(dir,'restored.sql'),manifest=join(dir,'manifest.json');
  const ddl="CREATE TABLE notes(id TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER keep_notes BEFORE DELETE ON notes BEGIN SELECT RAISE(ABORT,'retained');END;";
  const sql=ddl+"INSERT INTO notes VALUES('1','private@example.com');INSERT INTO notes VALUES('2','retained');";
  await writeFile(backup,sql);
  const command=(path,args=[])=>spawnSync('python3',['scripts/retention-manifest.py',path,'--environment','TRAINING','--release-sha','a'.repeat(40),...args],{encoding:'utf8'});
  const original=command(backup);assert.equal(original.status,0,original.stderr);await writeFile(manifest,original.stdout);
  const reordered=ddl+"INSERT INTO notes VALUES('2','retained');INSERT INTO notes VALUES('1','private@example.com');";
  await writeFile(restored,reordered);
  const matched=command(restored,['--compare-manifest',manifest]);assert.equal(matched.status,0,matched.stderr);assert.equal(JSON.parse(matched.stdout).restore_comparison,'LOCAL_RESTORE_MATCH');assert.doesNotMatch(matched.stdout,/private@example.com/);
  for(const changed of [reordered.replace("'retained');","'changed');"),reordered.replace("SELECT RAISE(ABORT,'retained');","SELECT 1;")]){
   await writeFile(restored,changed);const r=command(restored,['--compare-manifest',manifest]);assert.equal(r.status,1);assert.match(r.stderr,/Restored content differs/);
  }
  await writeFile(restored,reordered);const other=command(restored,['--compare-manifest',manifest,'--environment','PRODUCTION']);assert.equal(other.status,1);assert.match(other.stderr,/environment/);
  assert.equal(await import('node:fs/promises').then(m=>m.readFile(backup,'utf8')),sql);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('retention rejects malformed and duplicated finalized versions and missing actor snapshots',async()=>{
 for(const version of [0,-1,1.5,'1',true]){
  const r=await run(schema+`INSERT INTO audit_events VALUES('A1','FinalizedReport','R1',NULL,${quote(report(version))});`);assert.equal(r.code,1);assert.match(r.error,/metadata/);
 }
 const duplicate=await run(schema+`INSERT INTO audit_events VALUES('A1','FinalizedReport','R1',NULL,${quote(report())});INSERT INTO audit_events VALUES('A2','FinalizedReport','R1',NULL,${quote(report())});`);assert.equal(duplicate.code,1);assert.match(duplicate.error,/Duplicate/);
 const missing=await run(schema+"CREATE TABLE console_audit_actor_snapshots(event_id TEXT,actor_id TEXT);INSERT INTO audit_events VALUES('A1','FinalizedReport','R1',NULL,'{}');");assert.equal(missing.code,1);assert.match(missing.error,/attribution/);
});
test('binary retained rows are hashed without exposing bytes; SQL cannot attach an external database',async()=>{
 const blob=await run("CREATE TABLE retained(value BLOB);INSERT INTO retained VALUES(X'736563726574');");assert.equal(blob.code,0,blob.error);assert.equal(JSON.parse(blob.out).table_inventory.retained.rows,1);assert.doesNotMatch(blob.out,/736563726574|secret/);
 const attach=await run("ATTACH DATABASE ':memory:' AS other;CREATE TABLE other.illegal(id TEXT);");assert.equal(attach.code,1);assert.match(attach.error,/not authorized/);
});

test('governance backup retains unsnapshotted legacy history and verifies future report attribution without fabricating roles',async()=>{
 const python=`import sqlite3,pathlib,json,hashlib
x=sqlite3.connect(':memory:')
paths=sorted(pathlib.Path('migrations').glob('*.sql'))
for p in paths[:4]:x.executescript('BEGIN;'+p.read_text()+'COMMIT;')
x.execute("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('OWNER','team@creatorloop.net','Fictional Owner','ADMINISTRATOR','ACTIVE')")
x.execute("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id) VALUES('LEGACY','OWNER','CMP-100','CREATED','Creator','CR-200')")
x.commit()
for p in paths[4:]:x.executescript('BEGIN;'+p.read_text()+'COMMIT;')
records=[]
report=json.dumps(dict(version=1,title='Fictional report',dataset='creators',reason='Evidence',snapshotHash=hashlib.sha256(b'[]').hexdigest(),records=records))
x.execute("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES('R1','OWNER','CMP-100','REPORT_FINALIZED','FinalizedReport','REPORT-1',?)",(report,))
x.commit()
print('\\n'.join(x.iterdump()))`;
 const exported=spawnSync('python3',['-c',python],{encoding:'utf8'});assert.equal(exported.status,0,exported.stderr);
 const r=await run(exported.stdout);assert.equal(r.code,0,r.error);const evidence=JSON.parse(r.out);
 assert.equal(evidence.audit_attribution.captured,1);assert.equal(evidence.audit_attribution.unattributed_legacy_events,1);assert.equal(evidence.report_versions.length,1);
});
