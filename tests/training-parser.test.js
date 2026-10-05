import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {fingerprint} from '../scripts/lib/gate2-atomicity.mjs';
import {PARSER_VARIANTS,PARSER_REQUESTS,PARSER_SNAPSHOT,PARSER_MIGRATION_HASHES,TRAINING_PARSER_DB,verifyParserMigrations,verifyParserSource,parserClient,executeParserDiagnostic} from '../scripts/lib/training-parser.mjs';
import {authorizeParserDiagnostic,fenceParserDiagnostic,parserAttestationBody} from '../scripts/lib/training-parser-authorization.mjs';
import {runParserDiagnostic} from '../scripts/diagnostics/training-parser-live.mjs';
const files=Object.keys(PARSER_MIGRATION_HASHES),migrations=Object.fromEntries(await Promise.all(files.map(async n=>[n,await readFile('migrations/'+n,'utf8')])));
const sha='c'.repeat(40),main='b'.repeat(40),run='123',clock=Date.parse('2026-10-05T19:00:00Z'),owner={login:'Creatorloopzone',id:245245322};
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:run,GITHUB_SHA:sha,GITHUB_TOKEN:'FICTIONAL-GH-TOKEN',EXPECTED_MAIN_SHA:main,ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',TRAINING_PARSER_SCOPE:'TRAINING_EXPLAIN_ONLY',CLOUDFLARE_API_TOKEN:'FICTIONAL-CF-TOKEN'};
function github(o={}){
 const created=new Date(clock-(o.age??0)).toISOString(),c={id:9,user:o.user??owner,body:o.body??parserAttestationBody(run,sha),issue_url:o.issueUrl??'https://api.github.com/repos/VTholdings/creatorloop-main-site/issues/18',created_at:created,updated_at:o.edited?new Date(clock+1).toISOString():created};
 return async (url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');let v;
  if(url.endsWith('/approvals'))v=o.approved===false?[]:[{state:o.rejected?'rejected':'approved',user:o.reviewer??owner,environments:[{name:'creatorloop-acceptance'}]}];
  else if(url.includes('/issues/18/comments?'))v=o.noComment?[]:o.duplicate?[c,c]:[c];
  else if(url.endsWith('/issues/comments/9'))v=c;
  else if(url.endsWith('/heads/team-access-directory'))v={ref:context.GITHUB_REF,object:{sha:o.head??sha}};
  else if(url.endsWith('/heads/main'))v={ref:'refs/heads/main',object:{sha:o.main??main}};
  else v={id:123,head_sha:sha,head_branch:'team-access-directory',run_attempt:o.attempt??1,event:'push',created_at:new Date(clock-2*60*60*1000).toISOString(),path:o.path??'.github/workflows/acceptance-training-parser.yml',repository:{full_name:context.GITHUB_REPOSITORY}};
  return new Response(JSON.stringify(v));
 };
}
async function model(o={}){
 const db=new DatabaseSync(':memory:');
 for(const n of ['0001_bm01.sql','0002_operations_console_v2.sql','0003_pnb_source_contract.sql','0004_operator_permissions.sql'])db.exec(await readFile('migrations/'+n,'utf8'));
 db.exec("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('SYNTHETIC','synthetic@example.invalid','FICTIONAL-PRIVATE','OPERATOR','DISABLED')");
 db.exec("CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID");
 // SQLite query-only mode refuses actual schema/data writes but accepts EXPLAIN DDL.
 db.exec('PRAGMA query_only=ON');
 const rows=()=>PARSER_SNAPSHOT.map(x=>db.prepare(x.sql).all().map(r=>({...r}))),before=rows();
 const source={sourceRunId:'37358040555',schemaSha256:fingerprint(before[0]),counts:before[1],registration:before[2]},calls=[];
 const authorization={scope:'TRAINING_EXPLAIN_ONLY',databaseId:TRAINING_PARSER_DB,runId:run,releaseSha:sha,attempt:1,windowExpiresAt:new Date(clock+3600000).toISOString()};
 const fetcher=async (url,options)=>{
  assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/2a3b96a0b37850cd03107131baa66b6d/d1/database/'+TRAINING_PARSER_DB+'/query');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body),snapshot=JSON.stringify(body)===JSON.stringify({batch:PARSER_SNAPSHOT.map(x=>({sql:x.sql,params:[]}))});calls.push(snapshot?'snapshot':'probe');
  if(o.timeout)throw Error('FICTIONAL-PRIVATE-NETWORK');
  if(o.malformed)return new Response('FICTIONAL-PRIVATE-MALFORMED');
  if(o.large)return new Response('x'.repeat(1024*1024+1));
  if(!snapshot){
   const q=PARSER_REQUESTS.find(x=>JSON.stringify(x.body)===JSON.stringify(body));assert.ok(q,'unreviewed body');
   if(o.parserFailure)return new Response(JSON.stringify({success:false,errors:[{code:7500,message:'incomplete input: SQLITE_ERROR'}]}),{status:400});
   if(o.otherError)return new Response(JSON.stringify({success:false,errors:[{code:10000,message:'FICTIONAL-PRIVATE-TOKEN Authentication error'}]}),{status:403});
   const variant=PARSER_VARIANTS.find(x=>x.id===q.variant).sql;
   const results=(q.results===2?[db.prepare('EXPLAIN SELECT 1').all(),db.prepare(variant).all()]:[db.prepare(variant).all()]);
   return new Response(JSON.stringify({success:true,result:results.map(v=>({success:true,results:v,meta:{rows_written:o.writes?1:0,changed_db:o.writes===true}}))}));
  }
  const observed=rows();
  if(o.drift&&calls.includes('probe'))observed[0]=[];
  if(o.countDrift&&calls.includes('probe'))observed[1][0].n++;
  if(o.registrationDrift&&calls.includes('probe'))observed[2].push({version:'0005_team_directory'});
  if(o.endDrift&&calls.includes('probe'))observed[3]=[];
  return new Response(JSON.stringify({success:true,result:observed.map(v=>({success:true,results:v,meta:{rows_written:0,changed_db:false}}))}));
 };
 const request=parserClient({token:'FICTIONAL-CF-TOKEN',authorization,runId:run,releaseSha:sha,fetcher,now:()=>clock});
 return {db,rows,before,source,request,calls,authorization,fetcher};
}
const execute=m=>executeParserDiagnostic({source:m.source,request:m.request,fence:async()=>{},runId:run,releaseSha:sha,now:()=>clock});
test('fixed parser matrix contains only complete EXPLAIN trigger variants and EXPLAIN controls',()=>{
 assert.equal(PARSER_VARIANTS.length,6);assert.equal(PARSER_REQUESTS.length,24);assert.equal(new Set(PARSER_REQUESTS.map(x=>x.id)).size,24);
 for(const v of PARSER_VARIANTS){assert.match(v.sql,/^EXPLAIN CREATE TRIGGER cl_parser_explain_only BEFORE UPDATE ON operators/);assert.doesNotMatch(v.sql,/PRAGMA|INSERT|DELETE|ALTER|DROP|ATTACH|DETACH|COMMIT|ROLLBACK/);assert.match(v.sql,/ END;$/);assert.ok(Object.isFrozen(v));}
 for(const q of PARSER_REQUESTS){assert.ok(Object.isFrozen(q.body));for(const x of q.body.batch??[q.body]){assert.match(x.sql,/^EXPLAIN /);assert.deepEqual(x.params,[]);}}
 assert.throws(()=>{PARSER_REQUESTS[0].body.sql='DELETE FROM operators';},TypeError);
});
test('all 24 request shapes compile locally under SQLite query-only and leave every schema/data read unchanged',async()=>{
 const m=await model();try{
  const r=await execute(m);assert.equal(r.status,'PARSER_DIAGNOSTIC_COMPLETE',JSON.stringify(r.blockers));assert.equal(r.observations.length,24);assert.equal(r.snapshots.length,25);
  assert.ok(r.observations.every(x=>x.rowsWritten===0&&x.changedDatabase===false&&x.schemaPreserved));assert.deepEqual(m.rows(),m.before);
  assert.throws(()=>m.db.exec('CREATE TABLE forbidden(id TEXT)'),/readonly/i);
  assert.doesNotMatch(JSON.stringify(r),/FICTIONAL|EXPLAIN CREATE|login_email|Bearer|opcode/);
 }finally{m.db.close();}
});
test('recognized parser rejection preserves exact recovered error hash, numeric HTTP status and independent preservation evidence',async()=>{
 const m=await model({parserFailure:true});try{
  const r=await execute(m);assert.equal(r.status,'PARSER_DIAGNOSTIC_COMPLETE');assert.equal(r.observations.length,24);
  for(const x of r.observations){assert.equal(x.httpStatus,400);assert.equal(x.category,'INCOMPLETE_INPUT');assert.equal(x.errorSha256,'83cb710a45a1cd2ce9d2b1bc2508d8f6f9e66976e695041ffa9bfbc9ec67ef56');assert.equal(x.zeroWriteMetadataAvailable,false);assert.equal(x.rowsWritten,undefined);assert.equal(x.schemaPreserved,true);}
  assert.deepEqual(m.rows(),m.before);
 }finally{m.db.close();}
});
test('unexpected authorization/provider errors are sanitized and stop after one observation without retry',async()=>{
 const m=await model({otherError:true});try{
  const r=await execute(m);assert.equal(r.status,'PARSER_DIAGNOSTIC_BLOCKED');assert.equal(r.observations.length,1);assert.equal(r.observations[0].httpStatus,403);assert.equal(r.observations[0].schemaPreserved,true);assert.equal(r.blockers[0].code,'PARSER_UNEXPECTED_PROVIDER_RESPONSE');assert.doesNotMatch(JSON.stringify(r),/FICTIONAL-PRIVATE/);
 }finally{m.db.close();}
});
test('schema, end fence, counts or registration discrepancy stops at the first probe',async()=>{
 for(const o of [{drift:true},{endDrift:true},{countDrift:true},{registrationDrift:true}]){const m=await model(o);try{const r=await execute(m);assert.equal(r.blockers[0].code,'PARSER_SCHEMA_OR_COUNTS_PRESERVATION_DISCREPANCY');assert.equal(m.calls.filter(x=>x==='probe').length,1);assert.equal(r.observations[0].schemaPreserved,false);}finally{m.db.close();}}
});
test('write metadata, malformed/oversized responses and timeout fail closed without retry',async()=>{
 for(const o of [{writes:true},{malformed:true},{large:true},{timeout:true}]){const m=await model(o);try{const r=await execute(m);assert.equal(r.status,'PARSER_DIAGNOSTIC_BLOCKED');assert.ok(m.calls.filter(x=>x==='probe').length<=1);assert.ok(r.blockers[0].code.startsWith('PARSER_'));}finally{m.db.close();}}
});
test('client refuses arbitrary SQL, replay, substituted database, wrong scope and expired authority before network',async()=>{
 const m=await model();try{
  await assert.rejects(m.request('EXPLAIN PRAGMA foreign_keys=OFF'),/SQL_REFUSED/);await assert.rejects(m.request('DELETE FROM operators'),/SQL_REFUSED/);assert.equal(m.calls.length,0);
  await m.request(PARSER_REQUESTS[0].id);await assert.rejects(m.request(PARSER_REQUESTS[0].id),/REPLAY/);
  for(const change of [{databaseId:'c4993a97-5835-4c6c-af06-7020fa8d4f2a'},{scope:'TRAINING_0005_0007_ONLY'},{runId:'999'},{releaseSha:'d'.repeat(40)},{attempt:2}])assert.throws(()=>parserClient({token:'x',authorization:{...m.authorization,...change},runId:run,releaseSha:sha,fetcher:m.fetcher,now:()=>clock}),/REFUSED/);
  const expired=parserClient({token:'x',authorization:{...m.authorization,windowExpiresAt:new Date(clock).toISOString()},runId:run,releaseSha:sha,fetcher:m.fetcher,now:()=>clock});const n=m.calls.length;await assert.rejects(expired('snapshot'),/EXPIRED/);assert.equal(m.calls.length,n);
 }finally{m.db.close();}
});
test('reviewed migration hashes stay unchanged and altered receipt/migration bytes are rejected',()=>{
 assert.deepEqual(verifyParserMigrations(migrations),PARSER_MIGRATION_HASHES);
 assert.throws(()=>verifyParserMigrations({...migrations,[files[0]]:migrations[files[0]]+'\n'}),/BYTES_CHANGED/);
 assert.throws(()=>verifyParserSource('{}'),/RECEIPT_HASH_REQUIRED/);
 assert.equal(createHash('sha256').update('incomplete input: SQLITE_ERROR').digest('hex'),'83cb710a45a1cd2ce9d2b1bc2508d8f6f9e66976e695041ffa9bfbc9ec67ef56');
});
test('authorization requires exact independent Owner environment approval and matching first attempt parser workflow',async()=>{
 const a=await authorizeParserDiagnostic({context,fetcher:github(),now:()=>clock});assert.equal(a.scope,'TRAINING_EXPLAIN_ONLY');assert.equal(a.reviewCommentUsed,false);
 for(const o of [{approved:false},{rejected:true},{reviewer:{...owner,id:1}},{path:'.github/workflows/acceptance-training-migrations.yml'},{attempt:2}])await assert.rejects(authorizeParserDiagnostic({context,fetcher:github(o),now:()=>clock}),/APPROVAL_REQUIRED|RUN_MISMATCH/);
});
test('saved PR attestation fails closed on missing, wrong Owner, run, SHA, scope, edited, duplicate, wrong PR, future or expired evidence',async()=>{
 for(const o of [{noComment:true},{user:{...owner,id:1}},{body:parserAttestationBody('999',sha)},{body:parserAttestationBody(run,'d'.repeat(40))},{body:parserAttestationBody(run,sha).replace('TRAINING_EXPLAIN_ONLY_NO_WRITES','TRAINING_MIGRATION_NO_ACTIVE_OPERATORS')},{edited:true},{duplicate:true},{issueUrl:'https://api.github.com/repos/VTholdings/creatorloop-main-site/issues/17'},{age:-1},{age:3600000},{age:3*3600000}])await assert.rejects(authorizeParserDiagnostic({context,fetcher:github(o),now:()=>clock}),/ATTESTATION/);
});
test('per-request fence rejects changed comment, stale branch/main or expired attestation',async()=>{
 const a=await authorizeParserDiagnostic({context,fetcher:github(),now:()=>clock});
 for(const o of [{edited:true},{body:'changed'},{head:'d'.repeat(40)},{main:'d'.repeat(40)}])await assert.rejects(fenceParserDiagnostic({context,authorization:a,fetcher:github(o),now:()=>clock}),/ATTESTATION|STALE/);
 await assert.rejects(fenceParserDiagnostic({context,authorization:a,fetcher:github(),now:()=>clock+3600000}),/EXPIRED/);
});
test('entry point makes zero Cloudflare calls before approval, saved comment and source/migration validation',async()=>{
 for(const o of [{approved:false},{noComment:true},{}]){
  let calls=0,reads=0;const r=await runParserDiagnostic({context,githubFetcher:github(o),cloudflareFetcher:async()=>{calls++;throw Error();},read:async p=>{reads++;return String(p).includes('migrations/')?migrations[String(p).split('/').at(-1)]:'{}';},now:()=>clock});
  assert.equal(r.status,'PARSER_DIAGNOSTIC_BLOCKED');assert.equal(calls,0);if(o.approved===false||o.noComment)assert.equal(reads,0);
 }
});
test('workflow retains protection and has no write-capable workflow dependency or secret beyond the Cloudflare token',async()=>{
 const w=await readFile('.github/workflows/acceptance-training-parser.yml','utf8');
 assert.match(w,/name: creatorloop-acceptance/);assert.match(w,/needs: validate/);assert.match(w,/github.run_attempt == 1/);assert.match(w,/secrets.CLOUDFLARE_API_TOKEN/);
 assert.doesNotMatch(w,/CREATORLOOP_BACKUP_PASSPHRASE|training-migrations\/live|gate2\/live|wrangler|deploy-action|11317109290|workflow_dispatch/);
 const auth=await readFile('scripts/lib/training-parser-authorization.mjs','utf8');assert.match(auth,/245245322/);assert.match(auth,/created_at!==c.updated_at/);
});
