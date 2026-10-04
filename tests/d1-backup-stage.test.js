import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {exportDatabase,validateDownload,windowApproved,digest} from '../scripts/lib/d1-backup-export.mjs';
import {encryptBundle,decryptBundle} from '../scripts/lib/backup-envelope.mjs';
const targets=JSON.parse(await readFile('scripts/acceptance/cloudflare-targets.json','utf8'));
const passphrase='FICTIONAL-BACKUP-KEY-FOR-LOCAL-TESTS-ONLY';
const sql='CREATE TABLE fictional(v TEXT); INSERT INTO fictional VALUES(\'private@example.com\');';
test('backup export polls one pinned task, downloads without forwarding credentials, and retains only safe evidence',async()=>{
 const calls=[];let posts=0;
 const result=await exportDatabase({token:'FICTIONAL-CF-TOKEN',targets,environment:'TRAINING',pause:async()=>{},fetcher:async(url,options)=>{
  calls.push({url,options});if(options.method==='POST')return new Response(JSON.stringify({success:true,result:++posts===1?{at_bookmark:'fictional-bookmark'}:{status:'complete',result:{signed_url:'https://fictional.r2.cloudflarestorage.com/backup?signature=FICTIONAL-PRIVATE-URL'}}}));
  return new Response(sql);
 }});
 assert.equal(result.bytes.toString(),sql);assert.equal(result.evidence.sha256,digest(Buffer.from(sql)));
 assert.equal(posts,2);assert.deepEqual(JSON.parse(calls[0].options.body),{output_format:'polling'});
 assert.deepEqual(JSON.parse(calls[1].options.body),{output_format:'polling',current_bookmark:'fictional-bookmark'});
 assert.equal(calls[2].options.headers.Authorization,undefined);assert.equal(calls.every(c=>c.options.redirect==='error'),true);
 assert.doesNotMatch(JSON.stringify(result.evidence),/FICTIONAL|private@example.com|signature|bookmark/);
});
test('backup refuses substituted identities and never retries uncertain initiation, changed bookmarks or denied downloads',async()=>{
 for(const changed of [{...targets,accountId:'f'.repeat(32)},{...targets,training:{...targets.training,databaseId:targets.production.databaseId}}]){
  let calls=0;await assert.rejects(exportDatabase({token:'fictional',targets:changed,environment:'TRAINING',fetcher:async()=>{calls++;}}),/BACKUP_TARGET_REFUSED/);assert.equal(calls,0);
 }
 let calls=0;await assert.rejects(exportDatabase({token:'fictional',targets,environment:'PRODUCTION',fetcher:async()=>{calls++;throw Error('FICTIONAL-PRIVATE');}}),/EXPORT_OUTCOME_UNKNOWN_NO_RESTART/);assert.equal(calls,1);
 calls=0;await assert.rejects(exportDatabase({token:'fictional',targets,environment:'TRAINING',pause:async()=>{},fetcher:async()=>new Response(JSON.stringify({success:true,result:{at_bookmark:'bookmark-'+ ++calls}}))}),/EXPORT_BOOKMARK_CHANGED_NO_RESTART/);assert.equal(calls,2);
 for(const url of ['http://fictional.r2.cloudflarestorage.com/a','https://api.cloudflare.com/client/v4/accounts/a','https://evil.example/backup','https://x.r2.cloudflarestorage.com.evil.example/a','https://user:pass@x.r2.cloudflarestorage.com/a'])assert.throws(()=>validateDownload(url),/REFUSED/);
});
test('Owner window attestation cannot be supplied by an unrelated reviewer, environment, comment or rejection',()=>{
 const r={state:'approved',user:{login:'Creatorloopzone'},comment:'BACKUP_WINDOW_NO_ACTIVE_OPERATORS',environments:[{name:'creatorloop-acceptance'}]};assert.equal(windowApproved([r]),true);
 for(const change of [{state:'rejected'},{user:{login:'fictional'}},{comment:'approved'},{environments:[{name:'production'}]}])assert.equal(windowApproved([{...r,...change}]),false);
});
test('encrypted bundle authenticates contents, rejects tampering and wrong keys, and uses fresh randomness',()=>{
 const bytes=Buffer.from(sql),one=encryptBundle(bytes,passphrase),two=encryptBundle(bytes,passphrase);
 assert.notDeepEqual(one,two);assert.deepEqual(decryptBundle(one,passphrase),bytes);assert.equal(one.includes(Buffer.from('private@example.com')),false);
 const changed=Buffer.from(one);changed[changed.length-1]^=1;assert.throws(()=>decryptBundle(changed,passphrase),/AUTHENTICATION_FAILED/);
 assert.throws(()=>decryptBundle(one,passphrase+'wrong'),/AUTHENTICATION_FAILED/);assert.throws(()=>encryptBundle(bytes,''),/SECRET_REQUIRED/);
});
test('export CLI rejects absent encryption custody before any live call and does not leak credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-backup-context-'));try{
  const r=spawnSync(process.execPath,[resolve('scripts/acceptance/d1-backup-stage.mjs')],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'1',GITHUB_SHA:'a'.repeat(40),ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',CLOUDFLARE_API_TOKEN:'FICTIONAL-PRIVATE-TOKEN'},encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stdout,/BACKUP_ENCRYPTION_SECRET_REQUIRED/);assert.doesNotMatch(r.stdout+r.stderr,/FICTIONAL-PRIVATE/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('retrieved backup bundle verifies both restores and local rehearsal, rejects row tampering and path traversal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-backup-rehearsal-'));
 try{
  const script=`import pathlib,sqlite3,json,hashlib,zipfile\np=pathlib.Path(${JSON.stringify(dir)}); source=p/'source';source.mkdir()\ndb=sqlite3.connect(':memory:')\nfor m in sorted(pathlib.Path('migrations').glob('*.sql'))[:4]: db.executescript(m.read_text())\nraw='\\n'.join(db.iterdump()).encode()\ne={'status':'FRESH_EXPORTS_CAPTURED','releaseSha':'${'a'.repeat(40)}','exports':[]}\nfor env in ('TRAINING','PRODUCTION'):\n (source/(env+'.sql')).write_bytes(raw);e['exports'].append({'environment':env,'sha256':hashlib.sha256(raw).hexdigest()})\n(source/'export-evidence.json').write_text(json.dumps(e))\n`;
  const seed=spawnSync('python3',['-c',script],{encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
  const invoke=(...args)=>spawnSync('python3',['scripts/backup-stage.py',...args,'--release-sha','a'.repeat(40)],{encoding:'utf8'});
  const original=invoke('bundle',join(dir,'source'),join(dir,'capture.zip'));assert.equal(original.status,0,original.stderr);
  const restore=invoke('restore',join(dir,'capture.zip'),join(dir,'retrieved'));assert.equal(restore.status,0,restore.stderr);assert.match(restore.stdout,/LOCAL_RESTORE_AND_REHEARSAL_PASS/);
  const evidence=JSON.parse(await readFile(join(dir,'retrieved','PRODUCTION-preflight.json'),'utf8'));assert.equal(evidence.remote_verified,false);assert.equal(evidence.pending_migrations.length,3);
  const altered=spawnSync('python3',['-c',`import zipfile,pathlib\np=pathlib.Path(${JSON.stringify(dir)})\nwith zipfile.ZipFile(p/'capture.zip') as old,zipfile.ZipFile(p/'altered.zip','w') as new:\n for n in old.namelist(): new.writestr(n,old.read(n)+(b'-- altered' if n=='TRAINING.sql' else b''))\nwith zipfile.ZipFile(p/'escape.zip','w') as z:z.writestr('../escape.sql','private')\n`],{encoding:'utf8'});assert.equal(altered.status,0,altered.stderr);
  for(const name of ['altered','escape']){const bad=invoke('restore',join(dir,name+'.zip'),join(dir,name));assert.equal(bad.status,1);assert.doesNotMatch(bad.stderr,/private|CREATE TABLE/);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('protected workflow uploads only encrypted files for 90 days and cannot apply a remote migration',async()=>{
 const w=await readFile('.github/workflows/acceptance-backups.yml','utf8');assert.match(w,/environment:\n\s+name: creatorloop-acceptance/);assert.match(w,/github.run_attempt == 1/);assert.match(w,/retention-days: 90/);
 assert.doesNotMatch(w,/wrangler|migrations apply|pull_request_target|set -x/);
 const uploads=w.split('uses: actions/upload-artifact@v4').slice(1).map(x=>x.split('      - name:')[0]);
 assert.equal(uploads.length,2);for(const block of uploads){assert.match(block,/backup-artifacts\/(immediate|owner-transfer)\.clbackup/);assert.doesNotMatch(block,/backup-private|backup-restored|capture\.zip|\.sql/);}
 assert.match(w,/scripts\/backup-stage.py restore/);assert.match(w,/artifact-ids: \$\{\{ steps.immediate.outputs.artifact-id \}\}/);
 assert.equal(w.indexOf('Encrypt captured evidence')<w.indexOf('actions/upload-artifact'),true);
});
