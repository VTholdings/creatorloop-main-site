import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fingerprint} from '../scripts/lib/gate2-atomicity.mjs';
import {PARSER_REQUESTS,PARSER_SNAPSHOT} from '../scripts/lib/training-parser.mjs';
import {CASE_FREE_MIGRATION_HASHES,CASE_FREE_VARIANTS,CASE_FREE_REQUESTS,TRAINING_PARSER_DB,verifyCaseFreeParserMigrations,caseFreeParserClient,executeCaseFreeParserDiagnostic} from '../scripts/lib/training-case-free-parser.mjs';
import {caseFreeParserAttestationBody,authorizeCaseFreeParserDiagnostic,fenceCaseFreeParserDiagnostic} from '../scripts/lib/training-case-free-parser-authorization.mjs';
import {runCaseFreeParserDiagnostic} from '../scripts/diagnostics/training-case-free-parser-live.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const migrations=Object.fromEntries(await Promise.all(Object.keys(CASE_FREE_MIGRATION_HASHES).map(async n=>[n,await readFile('migrations/'+n,'utf8')])));
const sha='c'.repeat(40),main='b'.repeat(40),run='123',clock=Date.parse('2026-10-07T23:00:00Z'),owner={login:'Creatorloopzone',id:245245322};
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'VTholdings/creatorloop-main-site',GITHUB_REF:'refs/heads/team-access-directory',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:run,GITHUB_SHA:sha,GITHUB_TOKEN:'FICTIONAL-GH-TOKEN',EXPECTED_MAIN_SHA:main,ACCEPTANCE_ENVIRONMENT:'creatorloop-acceptance',TRAINING_CASE_FREE_PARSER_SCOPE:'TRAINING_CASE_FREE_EXPLAIN_ONLY',CLOUDFLARE_API_TOKEN:'FICTIONAL-CF-TOKEN'};
function github(o={}){
 const created=new Date(clock-(o.age??0)).toISOString(),comment={id:9,user:o.user??owner,body:o.body??caseFreeParserAttestationBody(run,sha),issue_url:o.issueUrl??'https://api.github.com/repos/VTholdings/creatorloop-main-site/issues/18',created_at:created,updated_at:o.edited?new Date(clock+1).toISOString():created};
 return async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');let body;
  if(url.endsWith('/approvals'))body=o.approved===false?[]:[{state:o.rejected?'rejected':'approved',user:o.reviewer??owner,environments:[{name:'creatorloop-acceptance'}]}];
  else if(url.includes('/issues/18/comments?'))body=o.noComment?[]:o.duplicate?[comment,comment]:[comment];
  else if(url.endsWith('/issues/comments/9'))body=comment;
  else if(url.endsWith('/heads/team-access-directory'))body={ref:context.GITHUB_REF,object:{sha:o.head??sha}};
  else if(url.endsWith('/heads/main'))body={ref:'refs/heads/main',object:{sha:o.main??main}};
  else body={id:123,head_sha:sha,head_branch:'team-access-directory',run_attempt:o.attempt??1,event:'push',created_at:new Date(clock-2*3600000).toISOString(),path:o.path??'.github/workflows/acceptance-training-case-free-parser.yml',repository:{full_name:context.GITHUB_REPOSITORY}};
  return new Response(JSON.stringify(body));
 };
}
async function model(o={}){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001_bm01.sql','0002_operations_console_v2.sql','0003_pnb_source_contract.sql','0004_operator_permissions.sql'])db.exec(await readFile('migrations/'+name,'utf8'));
 db.exec("CREATE TABLE _cf_KV (key TEXT PRIMARY KEY,value BLOB) WITHOUT ROWID");
 db.exec('PRAGMA query_only=ON');
 const physical=()=>PARSER_SNAPSHOT.map(q=>db.prepare(q.sql).all().map(v=>({...v})));
 const logical=()=>{const v=physical();return [v[0],v.slice(1,16).flat(),v[16],v[17]];};
 const before=logical(),source={sourceRunId:'37358040555',schemaSha256:fingerprint(before[0]),counts:before[1],registration:before[2]},calls=[];
 const authorization={scope:'TRAINING_CASE_FREE_EXPLAIN_ONLY',databaseId:TRAINING_PARSER_DB,runId:run,releaseSha:sha,attempt:1,windowExpiresAt:new Date(clock+3600000).toISOString()};
 const fetcher=async(url,options)=>{
  assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/2a3b96a0b37850cd03107131baa66b6d/d1/database/'+TRAINING_PARSER_DB+'/query');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.ok(options.signal);
  const body=JSON.parse(options.body),snapshot=JSON.stringify(body)===JSON.stringify({batch:PARSER_SNAPSHOT.map(q=>({sql:q.sql,params:[]}))});calls.push(snapshot?'snapshot':'probe');
  if(o.timeout)throw Error('FICTIONAL-PRIVATE-TIMEOUT');
  if(o.malformed)return new Response('FICTIONAL-PRIVATE-MALFORMED');
  if(o.large)return new Response('x'.repeat(1024*1024+1));
  if(snapshot){
   if(o.snapshotReject)return new Response(JSON.stringify({success:false,errors:[{code:7500,message:'too many terms in compound SELECT: SQLITE_ERROR'}]}),{status:400});
   const results=physical();
   if(calls.includes('probe')){
    if(o.schemaDrift)results[0]=[];
    if(o.countDrift)results[1][0].n++;
    if(o.registrationDrift)results[16].push({version:'0005_team_directory'});
    if(o.endDrift)results[17]=[];
   }
   return new Response(JSON.stringify({success:true,result:results.map(results=>({success:true,results,meta:{rows_written:0,changed_db:false}}))}));
  }
  const q=CASE_FREE_REQUESTS.find(q=>JSON.stringify(q.body)===JSON.stringify(body));assert.ok(q,'unapproved request body');
  if(o.probeReject)return new Response(JSON.stringify({success:false,errors:[{code:7500,message:'incomplete input: SQLITE_ERROR'}]}),{status:400});
  const v=CASE_FREE_VARIANTS.find(v=>v.id===q.variant),vm=db.prepare(v.sql).all();
  const result=(q.results===2?[db.prepare('EXPLAIN SELECT 1;').all(),vm]:[vm]).map(results=>({success:true,results,meta:o.missingProbeMeta?undefined:{rows_written:o.probeWrites?1:0,changed_db:o.probeWrites===true}}));
  return new Response(JSON.stringify({success:true,result}));
 };
 const request=caseFreeParserClient({token:'FICTIONAL-CF-TOKEN',authorization,runId:run,releaseSha:sha,fetcher,now:()=>clock});
 return {db,physical,logical,before,source,authorization,calls,fetcher,request};
}
const execute=m=>executeCaseFreeParserDiagnostic({source:m.source,request:m.request,fence:async()=>{},runId:run,releaseSha:sha,now:()=>clock});
test('fixed complete corrected triggers cover all six guards and all twelve bodies without changing historical request bytes',()=>{
 assert.deepEqual(verifyCaseFreeParserMigrations(migrations),CASE_FREE_MIGRATION_HASHES);
 assert.equal(CASE_FREE_VARIANTS.length,3);assert.equal(CASE_FREE_VARIANTS.reduce((n,v)=>n+v.guardCount,0),6);assert.equal(CASE_FREE_REQUESTS.length,12);assert.equal(new Set(CASE_FREE_REQUESTS.map(q=>q.id)).size,12);
 for(const v of CASE_FREE_VARIANTS){assert.equal(hash(v.sql.slice(8)),v.sourceTriggerSha256);assert.ok(migrations[v.migration].includes(v.sql.slice(8)));assert.equal((v.sql.match(/SELECT RAISE\(ABORT,/g)||[]).length,v.guardCount);assert.match(v.sql,/^EXPLAIN CREATE TRIGGER /);assert.doesNotMatch(v.sql,/\bCASE\b/);}
 for(const q of CASE_FREE_REQUESTS){assert.ok(Object.isFrozen(q.body));for(const entry of q.body.batch??[q.body]){assert.match(entry.sql,/^EXPLAIN /);assert.deepEqual(entry.params,[]);}}
 assert.throws(()=>{CASE_FREE_REQUESTS[0].body.sql='DROP TABLE operators';},TypeError);
 assert.throws(()=>verifyCaseFreeParserMigrations({...migrations,'0007_team_governance.sql':migrations['0007_team_governance.sql']+'\n'}),/BYTES_CHANGED/);
 assert.equal(hash(JSON.stringify(PARSER_REQUESTS)),'45458f8b19cc7a1c335ee82b8b542a2e8414d7e5f05a1df725f55cfb9b715749');assert.equal(PARSER_SNAPSHOT.length,18);
});
test('twelve corrected-trigger EXPLAIN shapes pass query-only SQLite and thirteen independent snapshots preserve state',async()=>{
 const m=await model();try{
  const receipt=await execute(m);assert.equal(receipt.status,'CASE_FREE_PARSER_DIAGNOSTIC_COMPLETE',JSON.stringify(receipt.blockers));assert.equal(receipt.probesAttempted,12);assert.equal(receipt.successfulProbes,12);assert.equal(receipt.snapshots.length,13);assert.equal(m.calls.length,25);
  assert.ok(receipt.observations.every(o=>o.schemaPreserved&&o.zeroWriteMetadataAvailable&&o.rowsWritten===0&&o.changedDatabase===false));assert.ok(receipt.snapshots.every(s=>s.matched));assert.deepEqual(m.logical(),m.before);
  assert.throws(()=>m.db.exec('CREATE TABLE forbidden(id INTEGER)'),/readonly/i);assert.doesNotMatch(JSON.stringify(receipt),/CREATE TRIGGER|login_email|Bearer|opcode|FICTIONAL/);
 }finally{m.db.close();}
});
test('provider rejection is fatal after one probe, retains numeric status/code/hash, and distinguishes independent preservation',async()=>{
 const m=await model({probeReject:true});try{
  const r=await execute(m);assert.equal(r.status,'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED');assert.equal(r.probesAttempted,1);assert.equal(r.successfulProbes,0);assert.equal(r.snapshots.length,2);assert.deepEqual(m.calls,['snapshot','probe','snapshot']);
  const o=r.observations[0];assert.equal(o.httpStatus,400);assert.deepEqual(o.providerCodes,[7500]);assert.equal(o.errorSha256,'83cb710a45a1cd2ce9d2b1bc2508d8f6f9e66976e695041ffa9bfbc9ec67ef56');assert.equal(o.zeroWriteMetadataAvailable,false);assert.equal(o.rowsWritten,undefined);assert.equal(o.schemaPreserved,true);assert.match(o.responseBodySha256,/^[a-f0-9]{64}$/);assert.equal(r.blockers[0].code,'CASE_FREE_PARSER_PROBE_REJECTED');
 }finally{m.db.close();}
});
test('initial snapshot rejection retains failure evidence and executes zero EXPLAIN probes',async()=>{
 const m=await model({snapshotReject:true});try{
  const r=await execute(m);assert.equal(r.probesAttempted,0);assert.equal(r.successfulProbes,0);assert.equal(r.snapshots.length,0);assert.equal(r.observations.length,0);assert.deepEqual(m.calls,['snapshot']);
  const b=r.blockers[0];assert.equal(b.code,'CASE_FREE_PARSER_SNAPSHOT_REJECTED');assert.equal(b.evidence.httpStatus,400);assert.deepEqual(b.evidence.providerCodes,[7500]);assert.equal(b.evidence.responseEnvelope,'OBJECT_SUCCESS_FALSE');assert.equal(b.evidence.zeroWriteMetadataAvailable,false);assert.equal(b.evidence.errorSha256,'0eb54e3072e6e800bad61521002c1ae76699b327d5d7c6831eba93e9297f4bdd');
 }finally{m.db.close();}
});
test('schema/count/registration/end drift and missing/write metadata never mark an observation preserved',async()=>{
 for(const options of [{schemaDrift:true},{countDrift:true},{registrationDrift:true},{endDrift:true},{missingProbeMeta:true},{probeWrites:true}]){
  const m=await model(options);try{const r=await execute(m);assert.equal(r.status,'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED');assert.equal(r.probesAttempted,1);assert.equal(r.observations.length,1);assert.equal(r.observations[0].schemaPreserved,false);assert.equal(m.calls.filter(c=>c==='probe').length,1);}finally{m.db.close();}
 }
});
test('every snapshot result requires success, bounded ordered rows, and explicit zero-write metadata',async()=>{
 const m=await model();try{
  const valid=()=>m.physical().map(results=>({success:true,results,meta:{rows_written:0,changed_db:false}}));
  const check=async result=>{
   let calls=0;const request=caseFreeParserClient({token:'x',authorization:m.authorization,runId:run,releaseSha:sha,now:()=>clock,fetcher:async()=>{calls++;return new Response(JSON.stringify({success:true,result}));}});
   const r=await execute({...m,request});assert.equal(r.status,'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED');assert.equal(calls,1);assert.equal(r.probesAttempted,0);assert.equal(r.snapshots.filter(s=>s.matched===true).length,0);
  };
  for(const result of [undefined,null,[],valid().slice(0,17),[...valid(),valid()[0]]])await check(result);
  for(let i=0;i<18;i++)for(const meta of [undefined,{}, {rows_written:0},{changed_db:false},{rows_written:'0',changed_db:false},{rows_written:0,changed_db:0},{rows_written:1,changed_db:false},{rows_written:0,changed_db:true}]){const result=valid();result[i].meta=meta;await check(result);}
  for(let i=0;i<18;i++)for(const replacement of [null,{}, {...valid()[i],success:false},{...valid()[i],results:null}]){const result=valid();result[i]=replacement;await check(result);}
  for(let i=0;i<17;i++){const result=valid();[result[i],result[i+1]]=[result[i+1],result[i]];await check(result);}
  for(const [i,n] of [[0,513],[16,33],[17,513]]){const result=valid();result[i].results=Array.from({length:n},()=>({}));await check(result);}
 }finally{m.db.close();}
});
test('malformed/oversized/timeout responses stop without retry and sanitize private text',async()=>{
 for(const options of [{malformed:true},{large:true},{timeout:true}]){const m=await model(options);try{const r=await execute(m);assert.equal(r.status,'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED');assert.equal(r.probesAttempted,0);assert.equal(m.calls.length,1);assert.doesNotMatch(JSON.stringify(r),/FICTIONAL/);}finally{m.db.close();}}
});
test('fixed client denies arbitrary SQL, replay, wrong target/scope/attempt and expired authority before network',async()=>{
 const m=await model();try{
  for(const id of ['DROP TABLE operators','EXPLAIN PRAGMA foreign_keys=OFF','single_sql'])await assert.rejects(m.request(id),/SQL_REFUSED/);assert.equal(m.calls.length,0);
  await m.request(CASE_FREE_REQUESTS[0].id);await assert.rejects(m.request(CASE_FREE_REQUESTS[0].id),/REPLAY/);
  for(const patch of [{databaseId:'c4993a97-5835-4c6c-af06-7020fa8d4f2a'},{scope:'TRAINING_EXPLAIN_ONLY'},{runId:'999'},{releaseSha:'d'.repeat(40)},{attempt:2}])assert.throws(()=>caseFreeParserClient({token:'x',authorization:{...m.authorization,...patch},runId:run,releaseSha:sha,fetcher:m.fetcher,now:()=>clock}),/REFUSED/);
  const expired=caseFreeParserClient({token:'x',authorization:{...m.authorization,windowExpiresAt:new Date(clock).toISOString()},runId:run,releaseSha:sha,fetcher:m.fetcher,now:()=>clock});const n=m.calls.length;await assert.rejects(expired('snapshot'),/EXPIRED/);assert.equal(m.calls.length,n);
  const bounded=caseFreeParserClient({token:'x',authorization:m.authorization,runId:run,releaseSha:sha,fetcher:m.fetcher,now:()=>clock});for(let i=0;i<13;i++)await bounded('snapshot');const count=m.calls.length;await assert.rejects(bounded('snapshot'),/BOUND_EXCEEDED/);assert.equal(m.calls.length,count);
 }finally{m.db.close();}
});
test('separate authorization retains numeric Owner, independent environment review, exact workflow and first attempt',async()=>{
 const a=await authorizeCaseFreeParserDiagnostic({context,fetcher:github(),now:()=>clock});assert.equal(a.scope,'TRAINING_CASE_FREE_EXPLAIN_ONLY');assert.equal(a.reviewCommentUsed,false);
 for(const o of [{approved:false},{rejected:true},{reviewer:{...owner,id:1}},{path:'.github/workflows/acceptance-training-parser.yml'},{attempt:2}])await assert.rejects(authorizeCaseFreeParserDiagnostic({context,fetcher:github(o),now:()=>clock}),/APPROVAL_REQUIRED|RUN_MISMATCH/);
});
test('fresh corrected attestation refuses old protocol, duplicate/edited/wrong-owner/run/SHA/PR/future/expired comments and stale refs',async()=>{
 for(const o of [{noComment:true},{user:{...owner,id:1}},{body:caseFreeParserAttestationBody('999',sha)},{body:caseFreeParserAttestationBody(run,'d'.repeat(40))},{body:caseFreeParserAttestationBody(run,sha).replace('CASE_FREE_','')},{edited:true},{duplicate:true},{issueUrl:'https://api.github.com/repos/VTholdings/creatorloop-main-site/issues/17'},{age:-1},{age:3600000}])await assert.rejects(authorizeCaseFreeParserDiagnostic({context,fetcher:github(o),now:()=>clock}),/ATTESTATION/);
 const a=await authorizeCaseFreeParserDiagnostic({context,fetcher:github(),now:()=>clock});
 for(const o of [{edited:true},{body:'changed'},{head:'d'.repeat(40)},{main:'d'.repeat(40)}])await assert.rejects(fenceCaseFreeParserDiagnostic({context,authorization:a,fetcher:github(o),now:()=>clock}),/ATTESTATION|STALE/);
 await assert.rejects(fenceCaseFreeParserDiagnostic({context,authorization:a,fetcher:github(),now:()=>clock+3600000}),/EXPIRED/);
});
test('entry point performs no Cloudflare call until recorded approval, fresh comment, migration pins and exact source pass',async()=>{
 for(const o of [{approved:false},{noComment:true},{},{badMigration:true}]){
  let calls=0,reads=0;const r=await runCaseFreeParserDiagnostic({context,githubFetcher:github(o),cloudflareFetcher:async()=>{calls++;throw Error();},read:async p=>{reads++;return String(p).includes('migrations/')?migrations[String(p).split('/').at(-1)]+(o.badMigration?'\n':''):'{}';},now:()=>clock});
  assert.equal(r.status,'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED');assert.equal(calls,0);if(o.approved===false||o.noComment)assert.equal(reads,0);
 }
});
test('new workflow retains existing protected environment/secrets/read permissions and authorization is an exact renamed protocol copy',async()=>{
 const workflow=await readFile('.github/workflows/acceptance-training-case-free-parser.yml','utf8');assert.match(workflow,/name: creatorloop-acceptance/);assert.match(workflow,/needs: validate/);assert.match(workflow,/github.run_attempt == 1/);assert.match(workflow,/secrets.CLOUDFLARE_API_TOKEN/);assert.match(workflow,/persist-credentials: false/);
 assert.doesNotMatch(workflow,/CREATORLOOP_BACKUP_PASSPHRASE|training-migrations\/live|gate2\/live|wrangler|deploy-action|11317109290|workflow_dispatch|write\s*:/);
 let original=await readFile('scripts/lib/training-parser-authorization.mjs','utf8');
 for(const [a,b] of Object.entries({parserAttestationBody:'caseFreeParserAttestationBody',authorizeParserDiagnostic:'authorizeCaseFreeParserDiagnostic',fenceParserDiagnostic:'fenceCaseFreeParserDiagnostic',CREATORLOOP_TRAINING_PARSER_DIAGNOSTIC_V1:'CREATORLOOP_TRAINING_CASE_FREE_PARSER_DIAGNOSTIC_V1',TRAINING_EXPLAIN_ONLY_NO_WRITES:'TRAINING_CASE_FREE_EXPLAIN_ONLY_NO_WRITES',TRAINING_EXPLAIN_ONLY:'TRAINING_CASE_FREE_EXPLAIN_ONLY',TRAINING_PARSER_SCOPE:'TRAINING_CASE_FREE_PARSER_SCOPE','acceptance-training-parser.yml':'acceptance-training-case-free-parser.yml'}))original=original.replaceAll(a,b);
 assert.equal(await readFile('scripts/lib/training-case-free-parser-authorization.mjs','utf8'),original);
});
test('actual transmitted joined/separate/single SQL compiles under reduced SQLite bounds without execution',()=>{
 const result=spawnSync('python3',['-c',`
import json,sqlite3,sys,pathlib
requests=json.load(sys.stdin);db=sqlite3.connect(':memory:',cached_statements=0)
for key,value in {sqlite3.SQLITE_LIMIT_COLUMN:100,sqlite3.SQLITE_LIMIT_LENGTH:2000000,sqlite3.SQLITE_LIMIT_SQL_LENGTH:100000,sqlite3.SQLITE_LIMIT_FUNCTION_ARG:32,sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER:100,sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH:50,sqlite3.SQLITE_LIMIT_COMPOUND_SELECT:5}.items():db.setlimit(key,value)
db.set_authorizer(lambda a,*args:sqlite3.SQLITE_DENY if a in [sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH] else sqlite3.SQLITE_OK)
for path in sorted(pathlib.Path('migrations').glob('*.sql'))[:4]:db.executescript(path.read_text())
db.commit();db.execute('PRAGMA query_only=ON')
def state():return db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall(),{n:db.execute('SELECT * FROM "'+n+'" ORDER BY rowid').fetchall() for n, in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}
before=state();changes=db.total_changes;programs=0
for q in requests:
    count=0
    for entry in q['body'].get('batch',[q['body']]):
        assert entry['params']==[];buffer=''
        for c in entry['sql']:
            buffer+=c
            if c==';' and sqlite3.complete_statement(buffer):
                assert buffer.lstrip().startswith('EXPLAIN ')
                assert db.execute(buffer).fetchall();buffer='';count+=1
        assert not buffer.strip()
    assert count==q['results']
    assert state()==before and db.total_changes==changes and not db.in_transaction
    programs+=count
assert len(requests)==12 and programs==18
print(json.dumps({'requestCount':12,'vmProgramCount':18,'compoundSelectLimit':5,'schemaRowsRegistrationPreserved':True,'providerVerified':False}))
`],{input:JSON.stringify(CASE_FREE_REQUESTS),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const proof=JSON.parse(result.stdout);assert.equal(proof.requestCount,12);assert.equal(proof.vmProgramCount,18);assert.equal(proof.compoundSelectLimit,5);assert.equal(proof.schemaRowsRegistrationPreserved,true);assert.equal(proof.providerVerified,false);
});
test('probe response failure retains exact attempted count and never invents preservation or zero-write metadata',async()=>{
 const m=await model();try{
  const request=caseFreeParserClient({token:'x',authorization:m.authorization,runId:run,releaseSha:sha,now:()=>clock,fetcher:async(url,options)=>{
   if(options.body===JSON.stringify({batch:PARSER_SNAPSHOT.map(q=>({sql:q.sql,params:[]}))}))return m.fetcher(url,options);
   return new Response('FICTIONAL-PRIVATE-HTML',{status:502});
  }});
  const r=await execute({...m,request});assert.equal(r.probesAttempted,1);assert.equal(r.successfulProbes,0);assert.equal(r.snapshots.length,1);assert.equal(r.observations.length,1);assert.equal(r.observations[0].httpStatus,502);assert.equal(r.observations[0].schemaPreserved,false);assert.equal(r.observations[0].zeroWriteMetadataAvailable,false);assert.equal(r.observations[0].rowsWritten,undefined);assert.doesNotMatch(JSON.stringify(r),/FICTIONAL/);
 }finally{m.db.close();}
});
test('expired or stale authority after a successful probe blocks the following snapshot without marking preservation',async()=>{
 const m=await model();try{
  let fences=0;const r=await executeCaseFreeParserDiagnostic({source:m.source,request:m.request,fence:async()=>{if(++fences===3)throw Error('PARSER_WINDOW_ATTESTATION_EXPIRED');},runId:run,releaseSha:sha,now:()=>clock});
  assert.equal(r.status,'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED');assert.deepEqual(m.calls,['snapshot','probe']);assert.equal(r.probesAttempted,1);assert.equal(r.successfulProbes,1);assert.equal(r.observations[0].schemaPreserved,false);assert.equal(r.blockers[0].code,'PARSER_WINDOW_ATTESTATION_EXPIRED');
 }finally{m.db.close();}
});
