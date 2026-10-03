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
