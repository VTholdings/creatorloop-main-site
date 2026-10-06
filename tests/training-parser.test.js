import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
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
 const physicalRows=()=>PARSER_SNAPSHOT.map(x=>db.prepare(x.sql).all().map(r=>({...r})));
 const rows=()=>{const r=physicalRows();return [r[0],r.slice(1,16).flat(),r[16],r[17]];},before=rows();
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
  const observed=physicalRows();
  if(o.drift&&calls.includes('probe'))observed[0]=[];
  if(o.countDrift&&calls.includes('probe'))observed[1][0].n++;
  if(o.registrationDrift&&calls.includes('probe'))observed[16].push({version:'0005_team_directory'});
  if(o.endDrift&&calls.includes('probe'))observed[17]=[];
  return new Response(JSON.stringify({success:true,result:observed.map(v=>({success:true,results:v,meta:{rows_written:0,changed_db:false}}))}));
 };
 const request=parserClient({token:'FICTIONAL-CF-TOKEN',authorization,runId:run,releaseSha:sha,fetcher,now:()=>clock});
 return {db,rows,physicalRows,before,source,request,calls,authorization,fetcher};
}
const execute=m=>executeParserDiagnostic({source:m.source,request:m.request,fence:async()=>{},runId:run,releaseSha:sha,now:()=>clock});
test('fixed parser matrix contains only complete EXPLAIN trigger variants and EXPLAIN controls',()=>{
 assert.equal(PARSER_VARIANTS.length,6);assert.equal(PARSER_REQUESTS.length,24);assert.equal(new Set(PARSER_REQUESTS.map(x=>x.id)).size,24);
 assert.equal(createHash('sha256').update(JSON.stringify(PARSER_VARIANTS)).digest('hex'),'ca633d1570e8a7c4ae4e2a0aaac4a21102b87cc854c4038e23688f9a1d7f724f');
 assert.equal(createHash('sha256').update(JSON.stringify(PARSER_REQUESTS)).digest('hex'),'45458f8b19cc7a1c335ee82b8b542a2e8414d7e5f05a1df725f55cfb9b715749');
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
const sha256=value=>createHash('sha256').update(value).digest('hex');
const snapshotTables=['audit_events','campaigns','console_access_grants','console_approval_delegations','console_authorizations','console_source_outbox','console_source_records','control_system_imports','control_system_outbox','creatives','creator_assignments','creator_enrollments','operators','qa_reviews','schema_migrations'];
test('snapshot is one allowlisted 18-entry batch reconstructed into four exact logical results',async()=>{
 assert.equal(PARSER_SNAPSHOT.length,18);
 assert.equal(PARSER_SNAPSHOT[0].sql,PARSER_SNAPSHOT[17].sql);
 assert.equal(PARSER_SNAPSHOT[0].limit,512);assert.equal(PARSER_SNAPSHOT[17].limit,512);
 assert.equal(PARSER_SNAPSHOT[16].sql,'SELECT version FROM schema_migrations ORDER BY version LIMIT 33');assert.equal(PARSER_SNAPSHOT[16].limit,32);
 assert.deepEqual(PARSER_SNAPSHOT.slice(1,16).map(x=>x.table),snapshotTables);
 for(const [i,table] of snapshotTables.entries())assert.deepEqual(PARSER_SNAPSHOT[i+1],{sql:`SELECT '${table}' AS name,count(*) AS n FROM "${table}"`,limit:1,table});
 const m=await model();try{
  const result=await m.request('snapshot');assert.deepEqual(m.calls,['snapshot']);assert.deepEqual(result.rows,m.before);assert.equal(result.rows.length,4);
  assert.deepEqual(result.rows[1].map(x=>x.name),snapshotTables);assert.deepEqual(result.rows[2],m.source.registration);assert.deepEqual(result.rows[0],result.rows[3]);
  assert.equal(result.evidence.resultCount,18);assert.deepEqual(result.evidence.resultRowCounts,m.physicalRows().map(x=>x.length));assert.equal(result.evidence.zeroWriteMetadataAvailable,true);
 }finally{m.db.close();}
});
test('original 15-term failure reproduces the retained provider hash; corrected batch passes compound limit five',async t=>{
 const sql=PARSER_SNAPSHOT.map(x=>x.sql),original=[sql[0],sql.slice(1,16).join(' UNION ALL '),sql[16],sql[17]];
 assert.equal(fingerprint({batch:original.map(sql=>({sql,params:[]}))}),'1bf3494d2f0a1a3ba00749195d8b83478fa04fdfcb46e00666c948c3576b5975');
 const reproduction=spawnSync('python3',['-c',`
import hashlib,json,sqlite3,sys
p=json.load(sys.stdin)
db=sqlite3.connect(':memory:',cached_statements=0)
db.row_factory=sqlite3.Row
versions=['0002_operations_console_v2','0003_pnb_source_contract','0004_operator_permissions']
for i,name in enumerate(p['tables']):
    db.execute('CREATE TABLE "'+name+'" (id INTEGER, version TEXT)')
    values=versions if name=='schema_migrations' else [None]*(i+1)
    db.executemany('INSERT INTO "'+name+'" VALUES (?,?)',enumerate(values))
db.commit()
db.execute('PRAGMA query_only=ON')
db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT,5)
assert db.getlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT)==5
before=db.total_changes
def rows(sql): return [dict(r) for r in db.execute(sql)]
try:
    rows(p['original'][1])
    raise AssertionError('original compound statement unexpectedly succeeded')
except sqlite3.OperationalError as error:
    assert str(error)=='too many terms in compound SELECT'
    assert error.sqlite_errorname=='SQLITE_ERROR'
    message=str(error)+': '+error.sqlite_errorname
    error_hash=hashlib.sha256(message.encode()).hexdigest()
    assert error_hash=='0eb54e3072e6e800bad61521002c1ae76699b327d5d7c6831eba93e9297f4bdd'
physical=[rows(s) for s in p['corrected']]
assert len(physical)==18
logical=[physical[0],[r for entry in physical[1:16] for r in entry],physical[16],physical[17]]
expected=[{'name':name,'n':3 if name=='schema_migrations' else i+1} for i,name in enumerate(p['tables'])]
assert logical[1]==expected
assert logical[2]==[{'version':v} for v in versions]
assert logical[0]==logical[3] and len(logical[0])==15
assert db.total_changes==before
try:
    db.execute('CREATE TABLE forbidden(id INTEGER)')
    raise AssertionError('query_only failed')
except sqlite3.OperationalError as error:
    assert error.sqlite_errorname=='SQLITE_READONLY'
db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT,500)
assert [rows(s) for s in p['original']]==logical
print(json.dumps({'message':message,'errorSha256':error_hash,'compoundLimit':5,'batchEntries':len(physical),'physical':physical,'logical':logical,'totalChangesDelta':db.total_changes-before,'sqliteVersion':sqlite3.sqlite_version}))
db.close()
`],{input:JSON.stringify({tables:snapshotTables,original,corrected:sql}),encoding:'utf8'});
 assert.equal(reproduction.status,0,reproduction.stderr);const proof=JSON.parse(reproduction.stdout);
 assert.equal(proof.compoundLimit,5);assert.equal(proof.batchEntries,18);assert.equal(proof.totalChangesDelta,0);
 const {evidence}=await rejectedSnapshot({success:false,errors:[{code:7500,message:proof.message}]},400);
 assert.equal(evidence.errorSha256,proof.errorSha256);assert.equal(evidence.errorSha256,'0eb54e3072e6e800bad61521002c1ae76699b327d5d7c6831eba93e9297f4bdd');assert.equal(evidence.zeroWriteMetadataAvailable,false);
 let calls=0;
 const authorization={scope:'TRAINING_EXPLAIN_ONLY',databaseId:TRAINING_PARSER_DB,runId:run,releaseSha:sha,attempt:1,windowExpiresAt:new Date(clock+3600000).toISOString()};
 const request=parserClient({token:'FICTIONAL-CF-TOKEN',authorization,runId:run,releaseSha:sha,now:()=>clock,fetcher:async(url,options)=>{
  calls++;assert.equal(JSON.parse(options.body).batch.length,18);
  return new Response(JSON.stringify({success:true,result:proof.physical.map(results=>({success:true,results,meta:{rows_written:0,changed_db:false}}))}));
 }});
 const result=await request('snapshot');assert.equal(calls,1);assert.deepEqual(result.rows,proof.logical);
 t.diagnostic(JSON.stringify({sqliteVersion:proof.sqliteVersion,compoundLimit:proof.compoundLimit,originalError:proof.message,errorSha256:proof.errorSha256,correctedBatchEntries:proof.batchEntries,totalChangesDelta:proof.totalChangesDelta}));
});
async function assertSnapshotBlocked(m,result,{afterProbe=false,label=''}={}){
 let calls=0;
 const request=parserClient({token:'FICTIONAL-CF-TOKEN',authorization:m.authorization,runId:run,releaseSha:sha,now:()=>clock,fetcher:async(url,options)=>{
  calls++;if(afterProbe&&calls<=2)return m.fetcher(url,options);
  return new Response(JSON.stringify({success:true,result}));
 }});
 const receipt=await execute({...m,request});assert.equal(receipt.status,'PARSER_DIAGNOSTIC_BLOCKED',label);assert.equal(calls,afterProbe?3:1,label);
 assert.equal(receipt.snapshots.filter(x=>x.matched===true).length,afterProbe?1:0,label);assert.equal(receipt.observations.length,afterProbe?1:0,label);
 assert.ok(receipt.observations.every(x=>x.schemaPreserved===false),label);assert.equal(receipt.blockers.length,1,label);
 return receipt;
}
test('missing, extra, malformed and reordered snapshot results fail closed before probes and after a probe',async()=>{
 const m=await model();try{
  const valid=()=>m.physicalRows().map(results=>({success:true,results,meta:{rows_written:0,changed_db:false}}));
  for(const result of [undefined,null,{},[],valid().slice(0,17),[...valid(),valid()[0]]])await assertSnapshotBlocked(m,result);
  for(let i=0;i<18;i++){
   for(const replacement of [null,{}, {success:false,results:[],meta:{rows_written:0,changed_db:false}}, {...valid()[i],results:{}}, {...valid()[i],results:null}]){
    const result=valid();result[i]=replacement;await assertSnapshotBlocked(m,result,{label:'malformed index '+i});
   }
   if(i<17){const result=valid();[result[i],result[i+1]]=[result[i+1],result[i]];await assertSnapshotBlocked(m,result,{label:'reordered indices '+i+','+(i+1)});}
  }
  for(let i=1;i<=15;i++){
   for(const results of [[],[{name:snapshotTables[i-1],n:-1}],[{name:snapshotTables[i-1],n:1.5}],[{name:snapshotTables[i-1],n:'0'}],[{name:snapshotTables[i-1],n:Number.MAX_SAFE_INTEGER+1}],[{name:'operators; DELETE',n:0}],[{n:0}],[null],[{name:snapshotTables[i-1],n:0,extra:true}],[...valid()[i].results,...valid()[i].results]]){
    const result=valid();result[i].results=results;await assertSnapshotBlocked(m,result,{label:'invalid count index '+i});
   }
  }
  for(const [index,length] of [[0,513],[16,33],[17,513]]){const result=valid();result[index].results=Array.from({length},()=>({}));await assertSnapshotBlocked(m,result,{label:'row bound index '+index});}
  const result=valid();[result[1],result[2]]=[result[2],result[1]];await assertSnapshotBlocked(m,result,{afterProbe:true});
 }finally{m.db.close();}
});
test('all 18 snapshot entries require explicit numeric-zero rows_written and boolean-false changed_db',async()=>{
 const m=await model();try{
  for(let i=0;i<18;i++)for(const meta of [undefined,{}, {rows_written:0},{changed_db:false},{rows_written:'0',changed_db:false},{rows_written:0,changed_db:0},{rows_written:1,changed_db:false},{rows_written:0,changed_db:true}]){
   const result=m.physicalRows().map(results=>({success:true,results,meta:{rows_written:0,changed_db:false}}));result[i].meta=meta;
   const r=await assertSnapshotBlocked(m,result,{label:'metadata index '+i});assert.equal(r.blockers[0].code,'PARSER_ZERO_WRITE_OR_RESPONSE_BOUND_REQUIRED');
  }
 }finally{m.db.close();}
});
test('all EXPLAIN request bodies are transmitted unchanged',async()=>{
 const m=await model(),bodies=[];try{
  const request=parserClient({token:'FICTIONAL-CF-TOKEN',authorization:m.authorization,runId:run,releaseSha:sha,now:()=>clock,fetcher:async(url,options)=>{
   bodies.push(options.body);return m.fetcher(url,options);
  }});
  for(const q of PARSER_REQUESTS)await request(q.id);
  assert.deepEqual(bodies,PARSER_REQUESTS.map(q=>JSON.stringify(q.body)));
  assert.equal(sha256(JSON.stringify(PARSER_REQUESTS)),'45458f8b19cc7a1c335ee82b8b542a2e8414d7e5f05a1df725f55cfb9b715749');
 }finally{m.db.close();}
});
test('authorization, expiry, checkout and protected workflow bytes remain exactly reviewed',async()=>{
 for(const [path,digest] of Object.entries({
  'scripts/lib/training-parser-authorization.mjs':'c64f55b1f3455c02b2527516d4b8cf21618453049bff4c45d9b8a2d8f9df6dde',
  'scripts/diagnostics/training-parser-live.mjs':'2b76eeebc725a6e6a3ee5979f72dbef2c794df46ca474e6a8ef57b853f240ed4',
  '.github/workflows/acceptance-training-parser.yml':'575a02a4058a61bf669cfb91d6afdfa0ce0901cbd18444f38b5b1282c0470605'
 }))assert.equal(sha256(await readFile(path)),digest,path);
});
async function rejectedSnapshot(body,status=400){
 const raw=typeof body==='string'?body:JSON.stringify(body),calls=[];let fences=0;
 const authorization={scope:'TRAINING_EXPLAIN_ONLY',databaseId:TRAINING_PARSER_DB,runId:run,releaseSha:sha,attempt:1,windowExpiresAt:new Date(clock+3600000).toISOString()};
 const request=parserClient({token:'FICTIONAL-CF-TOKEN',authorization,runId:run,releaseSha:sha,now:()=>clock,fetcher:async(url,options)=>{
  calls.push({url,options});return new Response(raw,{status});
 }});
 const receipt=await executeParserDiagnostic({source:{schemaSha256:'UNREACHED',counts:[],registration:[]},request,fence:async()=>{fences++;},runId:run,releaseSha:sha,now:()=>clock});
 assert.equal(receipt.status,'PARSER_DIAGNOSTIC_BLOCKED');assert.equal(receipt.blockers[0].code,'PARSER_SNAPSHOT_REJECTED');
 assert.deepEqual(receipt.observations,[]);assert.deepEqual(receipt.snapshots,[]);assert.equal(calls.length,1);assert.equal(fences,1);
 assert.equal(calls[0].url,'https://api.cloudflare.com/client/v4/accounts/2a3b96a0b37850cd03107131baa66b6d/d1/database/'+TRAINING_PARSER_DB+'/query');
 assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.redirect,'error');
 assert.deepEqual(calls[0].options.headers,{Authorization:'Bearer FICTIONAL-CF-TOKEN',Accept:'application/json','Content-Type':'application/json'});
 assert.equal(sha256(calls[0].options.body),'af5ee967d03bd99e690cd07d5fd6f2af6bee3017286a689b609fe5e00d3f50fe');
 const evidence=receipt.blockers[0].evidence;
 assert.equal(evidence.httpStatus,status);assert.equal(evidence.requestId,'snapshot');assert.equal(evidence.responseBodySha256,sha256(raw));
 assert.equal(evidence.rowsWritten,undefined);assert.equal(evidence.changedDatabase,undefined);assert.equal(evidence.schemaPreserved,undefined);
 assert.doesNotMatch(JSON.stringify(receipt),/FICTIONAL-PRIVATE|FICTIONAL-CF-TOKEN|Bearer|login_email/);
 return {receipt,evidence};
}
test('HTTP snapshot rejection retains sanitized authorization evidence and stays fatal before all probes',async()=>{
 const message='FICTIONAL-PRIVATE Authentication error';
 const {evidence}=await rejectedSnapshot({success:false,errors:[{code:10000,message}]},403);
 assert.equal(evidence.responseEnvelope,'OBJECT_SUCCESS_FALSE');assert.equal(evidence.category,'AUTHORIZATION');
 assert.deepEqual(evidence.providerCodes,[10000]);assert.equal(evidence.errorSha256,sha256(message));assert.equal(evidence.zeroWriteMetadataAvailable,false);
});
test('HTTP-200 API snapshot rejection retains SQL error evidence without asserting zero writes or preservation',async()=>{
 const message='incomplete input: SQLITE_ERROR';
 const {evidence}=await rejectedSnapshot({success:false,errors:[{code:7500,message}]},200);
 assert.equal(evidence.responseEnvelope,'OBJECT_SUCCESS_FALSE');assert.equal(evidence.category,'INCOMPLETE_INPUT');
 assert.deepEqual(evidence.providerCodes,[7500]);assert.equal(evidence.errorSha256,'83cb710a45a1cd2ce9d2b1bc2508d8f6f9e66976e695041ffa9bfbc9ec67ef56');assert.equal(evidence.zeroWriteMetadataAvailable,false);
});
test('snapshot envelope classification preserves the existing strict success rejection',async()=>{
 for(const [body,label] of [[{},'OBJECT_SUCCESS_MISSING'],[{success:'true'},'OBJECT_SUCCESS_INVALID'],[[],'JSON_ARRAY'],[42,'JSON_PRIMITIVE']]){
  const {evidence}=await rejectedSnapshot(body,200);assert.equal(evidence.responseEnvelope,label);
  assert.deepEqual(evidence.providerCodes,[]);assert.equal(evidence.category,'OTHER_PROVIDER_ERROR');assert.equal(evidence.errorSha256,sha256(''));assert.equal(evidence.zeroWriteMetadataAvailable,false);
 }
});
test('snapshot evidence hashes exact response bytes and retains only bounded numeric codes and sanitized fields',async()=>{
 const codes=[7500,7500,'10000',null,1.5,...Array.from({length:10},(_,i)=>10001+i)];
 const body={success:false,errors:codes.map(code=>({code,message:'FICTIONAL-PRIVATE π'})),result:[{error:'FICTIONAL-PRIVATE result error',results:[{login_email:'FICTIONAL-PRIVATE'}]}],token:'FICTIONAL-PRIVATE'};
 const raw=' \n'+JSON.stringify(body,null,2)+'\n';const {evidence}=await rejectedSnapshot(raw);
 assert.deepEqual(evidence.providerCodes,[7500,10001,10002,10003,10004,10005,10006,10007]);
 assert.equal(evidence.errorSha256,sha256([...body.errors.map(x=>x.message),body.result[0].error].join('\n')));
 assert.notEqual(evidence.responseBodySha256,sha256(JSON.stringify(body)));
 assert.deepEqual(Object.keys(evidence).sort(),['requestId','method','path','requestBodySha256','httpStatus','responseEnvelope','category','errorSha256','providerCodes','responseBodySha256','zeroWriteMetadataAvailable'].sort());
});
test('result-level snapshot error is hashed and classified when no top-level error codes are supplied',async()=>{
 const message='A prepared SQL statement must contain only one statement.';
 const {evidence}=await rejectedSnapshot({success:false,result:[{success:false,error:message}]});
 assert.equal(evidence.category,'STATEMENT_COUNT');assert.deepEqual(evidence.providerCodes,[]);assert.equal(evidence.errorSha256,sha256(message));
});
test('zero-write metadata availability never converts a rejected snapshot into preservation evidence',async()=>{
 const result=Array.from({length:18},()=>({success:true,results:[{login_email:'FICTIONAL-PRIVATE'}],meta:{rows_written:0,changed_db:false}}));
 const available=await rejectedSnapshot({success:true,result},500);
 assert.equal(available.evidence.responseEnvelope,'OBJECT_SUCCESS_TRUE');assert.equal(available.evidence.zeroWriteMetadataAvailable,true);
 const apiFailure=await rejectedSnapshot({success:false,result},200);assert.equal(apiFailure.evidence.zeroWriteMetadataAvailable,true);
 for(const modified of [result.slice(0,17),result.map(r=>({...r,meta:{rows_written:0}})),result.map(r=>({...r,meta:{rows_written:1,changed_db:true}}))]){
  const {evidence}=await rejectedSnapshot({success:false,result:modified});assert.equal(evidence.zeroWriteMetadataAvailable,false);
 }
});
test('generic thrown errors cannot inject untrusted failure evidence into the receipt',async()=>{
 const request=async()=>{throw Object.assign(Error('PARSER_SNAPSHOT_REJECTED'),{evidence:{secret:'FICTIONAL-PRIVATE'}});};
 const r=await executeParserDiagnostic({source:{},request,fence:async()=>{},runId:run,releaseSha:sha,now:()=>clock});
 assert.deepEqual(r.blockers,[{code:'PARSER_SNAPSHOT_REJECTED'}]);assert.deepEqual(r.snapshots,[]);assert.deepEqual(r.observations,[]);
});
test('a rejected preservation snapshot after a probe retains evidence without marking that probe preserved',async()=>{
 const m=await model();let snapshots=0;
 try{
  const request=parserClient({token:'FICTIONAL-CF-TOKEN',authorization:m.authorization,runId:run,releaseSha:sha,now:()=>clock,fetcher:async(url,options)=>{
   if(options.body===JSON.stringify({batch:PARSER_SNAPSHOT.map(x=>({sql:x.sql,params:[]}))})&&++snapshots===2){
    m.calls.push('snapshot');return new Response(JSON.stringify({success:false,errors:[{code:10000,message:'Authentication error'}]}),{status:401});
   }
   return m.fetcher(url,options);
  }});
  const r=await execute({...m,request});assert.equal(r.status,'PARSER_DIAGNOSTIC_BLOCKED');assert.deepEqual(m.calls,['snapshot','probe','snapshot']);
  assert.equal(r.snapshots.length,1);assert.equal(r.snapshots[0].matched,true);assert.equal(r.observations.length,1);assert.equal(r.observations[0].schemaPreserved,false);
  assert.equal(r.blockers[0].code,'PARSER_SNAPSHOT_REJECTED');assert.equal(r.blockers[0].evidence.httpStatus,401);assert.equal(r.blockers[0].evidence.zeroWriteMetadataAvailable,false);
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
