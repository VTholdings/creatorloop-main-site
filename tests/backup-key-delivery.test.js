import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectBackupKeyDelivery} from '../scripts/lib/backup-key-delivery.mjs';
test('key diagnostic distinguishes unavailable delivery from invalid size without exposing secret material',()=>{
 for(const [value,context,code] of [[undefined,'false','SECRET_NOT_DELIVERED'],['','false','SECRET_NOT_DELIVERED'],['fictional-short','true','SECRET_BELOW_MINIMUM'],['x'.repeat(1025),'true','SECRET_ABOVE_MAXIMUM'],['x'.repeat(32),'true','SECRET_DELIVERY_AND_VALIDATION_PASS'],['x'.repeat(1024),'true','SECRET_DELIVERY_AND_VALIDATION_PASS'],['x'.repeat(40),'false','SECRET_CONTEXT_PROCESS_MISMATCH'],['','true','SECRET_CONTEXT_PROCESS_MISMATCH']]){
  const r=inspectBackupKeyDelivery(value,context);assert.equal(r.code,code);for(const [k,v] of Object.entries(r))if(k!=='code')assert.equal(typeof v,'boolean');
  assert.doesNotMatch(JSON.stringify(r),/fictional-short|xxxxxxxx|1025|fingerprint|sha256/);
 }
});
test('diagnostic refuses an unprotected context and its workflow has no Cloudflare credential or executable export path',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-key-diagnostic-'));try{
  const r=spawnSync(process.execPath,[resolve('scripts/diagnostics/backup-secret-presence.mjs')],{cwd:dir,env:{PATH:process.env.PATH,CREATORLOOP_BACKUP_PASSPHRASE:'FICTIONAL-SENSITIVE-SECRET-AT-LEAST-32-CHARS'},encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stdout,/PROTECTED_DIAGNOSTIC_CONTEXT_REQUIRED/);assert.doesNotMatch(r.stdout+r.stderr,/FICTIONAL-SENSITIVE/);
 }finally{await rm(dir,{recursive:true,force:true});}
 const w=await readFile('.github/workflows/acceptance-secret-diagnostic.yml','utf8');assert.match(w,/environment:\n\s+name: creatorloop-acceptance/);assert.match(w,/secrets.CREATORLOOP_BACKUP_PASSPHRASE/);assert.match(w,/needs: validate/);
 assert.doesNotMatch(w,/CLOUDFLARE_API_TOKEN|d1-backup-stage|backup-envelope.mjs|backup-stage.py|wrangler|curl|pull_request_target|set -x/);
});
