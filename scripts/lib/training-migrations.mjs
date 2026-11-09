import {createHash} from 'node:crypto';
import {fingerprint} from './gate2-atomicity.mjs';
export const TRAINING_DB='12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0';
export const MIGRATION_HASHES=Object.freeze({'0005_team_directory.sql':'2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693','0006_audit_history.sql':'4caafd074663b4125d8af552c2e35653c26feaaa3458c92906d6b8c0856d9d02','0007_team_governance.sql':'521b61fd348277116dcb0af55a803f057c64cc97b065ff00fdf244dcdea0c382'});
export const GATE2_RECEIPT_HASH='4172d4a907145811dc3d9c9101d763fea8564dcfe90bedbd0b336cb9dc12d0a9';
const account='2a3b96a0b37850cd03107131baa66b6d',root='/accounts/'+account;
const fail=c=>{throw Error(c);},bytes=s=>createHash('sha256').update(s).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const reviewed=new WeakSet();
const sorted=rows=>rows.toSorted((a,b)=>{const x=JSON.stringify(Object.fromEntries(Object.entries(a).sort())),y=JSON.stringify(Object.fromEntries(Object.entries(b).sort()));return x<y?-1:x>y?1:0;});
const schemaSQL="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name LIMIT 513";
const providerHash='7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686';
function columns(b,t){
 const cols=b.dataColumns?.[t];
 if(!Array.isArray(cols)||!cols.length||cols.length>128||new Set(cols).size!==cols.length||cols.some(c=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c)))fail('MIGRATION_COLUMN_BOUNDARY_REFUSED');return cols;
}
function dataSQL(t,cols){
 return 'SELECT '+cols.map(c=>{const q='"'+c+'"';return `CASE typeof(${q}) WHEN 'text' THEN 'text:'||hex(${q}) WHEN 'blob' THEN 'blob:'||hex(${q}) WHEN 'real' THEN 'real:'||printf('%!.17g',${q}) ELSE typeof(${q})||':'||quote(${q}) END AS ${q}`;}).join(',')+' FROM "'+t+'" LIMIT 2001';
}
export function verifyAcceptedGate2(raw,b){
 if(bytes(raw)!==GATE2_RECEIPT_HASH)fail('ACCEPTED_GATE2_RECEIPT_HASH_REQUIRED');
 const g=JSON.parse(raw);
 if(g.status!=='GATE2_ATOMICITY_PASS'||g.runId!=='37353740653'||g.releaseSha!=='7237c1317113c2705c5f2b8e622d284ea14871fc'||g.databaseId!==TRAINING_DB||g.environment!=='TRAINING'||g.authorization?.attempt!==1||g.authorization.scope!=='TRAINING_SYNTHETIC_ONLY'||g.atomicExecutionCertified!==true||g.cleanupStatus!=='VERIFIED'||g.remainingFixtureObjects?.length!==0||g.blockers?.length!==0||g.productionAccessed!==false||g.remoteMigrationsApplied!==false||g.checks?.length!==6||g.checks.some(c=>c.matched!==true)||fingerprint(g.originalSnapshot?.appData)!==fingerprint(b.backupData)||fingerprint(g.preflight?.migrationSha256)!==fingerprint(b.migrationSha256)||fingerprint(g.preflight?.acceptedRehearsalSha256)!==fingerprint(MIGRATION_HASHES))fail('ACCEPTED_GATE2_OR_BACKUP_COVERAGE_REQUIRED');
 return {runId:g.runId,releaseSha:g.releaseSha,receiptSha256:GATE2_RECEIPT_HASH,atomicPath:'TRAINING_D1_REST_BATCH',cleanupStatus:g.cleanupStatus,rawSchemaSha256:g.originalSnapshot.appSchemaSha256};
}
export function trainingMigrationPlan({runId,releaseSha,baseline:b,migrations}){
 const names=Object.keys(MIGRATION_HASHES),tables=Object.keys(b?.foreignKeys??{}).sort(),newTables=['console_audit_actor_snapshots','console_mutation_guards','console_team_events','console_team_profiles'];
 if(!/^\d{1,20}$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(releaseSha||'')||b?.protocol!=='CREATORLOOP_D1_SCHEMA_BASELINE_V1'||b.environment!=='TRAINING'||b.databaseId!==TRAINING_DB||b.backupRunId!=='37242966914'||b.backupReleaseSha!=='a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46'||b.localRehearsal!=='LOCAL_REHEARSAL_AND_ROLLBACK_PASS'||fingerprint(b.acceptedRehearsalSha256)!==fingerprint(MIGRATION_HASHES)||b.registeredTeamMigrations?.length!==0||fingerprint(b.pendingMigrations)!==fingerprint(names.map(n=>n.slice(0,-4)))||!tables.includes('operators')||!tables.includes('schema_migrations')||tables.length>48||!tables.length||tables.some(t=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)||t.startsWith('_cf_')||t.startsWith('cl_g2_'))||fingerprint(b.newTables)!==fingerprint(newTables))fail('MIGRATION_TARGET_BASELINE_OR_REHEARSAL_REFUSED');
 if(fingerprint(columns(b,'operators'))!==fingerprint(['id','login_email','display_name','role','account_status','last_activity_at','created_at'])||b.schema.some(r=>r.name==='_cf_KV'||r.name==='operators_expanded'||newTables.includes(r.name))||Object.values(b.foreignKeys).flat().some(r=>r.table==='operators'&&(r.on_update!=='NO ACTION'||r.on_delete!=='NO ACTION')))fail('MIGRATION_IDENTITY_OR_SCHEMA_ASSUMPTION_REFUSED');
 if(fingerprint(Object.keys(migrations??{}))!==fingerprint(names)||names.some(n=>typeof migrations[n]!=='string'||bytes(migrations[n])!==MIGRATION_HASHES[n]||b.migrationSha256?.[n]!==MIGRATION_HASHES[n]))fail('REVIEWED_MIGRATION_BYTES_REQUIRED');
 const postTables=Object.keys(b.postForeignKeys??{}).sort();
 if(!/^[a-f0-9]{64}$/.test(b.acceptedGate2SchemaSha256||'')||fingerprint(postTables)!==fingerprint([...tables,...newTables].sort())||!Array.isArray(b.postSchema)||b.postSchema.length>512||!Array.isArray(b.originalRegistrationRows)||b.originalRegistrationRows.length!==3||fingerprint(b.registration)!==fingerprint(['0002_operations_console_v2','0003_pnb_source_contract','0004_operator_permissions'].map(version=>({version}))))fail('MIGRATION_EXPECTED_STATE_REFUSED');
 const reads=post=>{
  const ts=post?postTables:tables;
  return [
   {key:'schema',sql:schemaSQL,limit:512},
   {key:'foreignKeysEnabled',sql:'PRAGMA foreign_keys',limit:1,expected:[{foreign_keys:1}]},
   {key:'deferralReset',sql:'PRAGMA defer_foreign_keys',limit:1,expected:[{defer_foreign_keys:0}]},
   {key:'constraintsEnabled',sql:'PRAGMA ignore_check_constraints',limit:1,expected:[{ignore_check_constraints:0}]},
   {key:'renameBehavior',sql:'PRAGMA legacy_alter_table',limit:1,expected:[{legacy_alter_table:0}]},
   {key:'consistency',sql:'PRAGMA quick_check',limit:1,expected:[{quick_check:'ok'}]},
   {key:'foreignKeyCheck',sql:'PRAGMA foreign_key_check',limit:2000,expected:[]},
   {key:'reportJSONPreflight',sql:"SELECT count(*) AS n FROM audit_events WHERE object_type='FinalizedReport' AND json_valid(new_value)=0",limit:1,expected:[{n:0}]},
   {key:'reportVersionCollisions',sql:"SELECT count(*) AS n FROM (SELECT object_id,json_extract(CASE WHEN json_valid(new_value) THEN new_value ELSE '{}' END,'$.version') FROM audit_events WHERE object_type='FinalizedReport' GROUP BY object_id,json_extract(CASE WHEN json_valid(new_value) THEN new_value ELSE '{}' END,'$.version') HAVING count(*)>1)",limit:1,expected:[{n:0}]},
   ...ts.flatMap(t=>[{key:'columns:'+t,sql:'PRAGMA table_info("'+t+'")',limit:128,expected:(post?b.postTableInfo:b.originalTableInfo)?.[t]},{key:'foreignKeys:'+t,sql:'PRAGMA foreign_key_list("'+t+'")',limit:128,expected:(post?b.postForeignKeys:b.foreignKeys)[t]}]),
   ...tables.map(t=>({key:'data:'+t,sql:dataSQL(t,columns(b,t)),limit:2000})),
   ...(post?newTables.map(t=>({key:'empty:'+t,sql:'SELECT count(*) AS n FROM "'+t+'"',limit:1,expected:[{n:0}]})):[]),
   {key:'schemaEndFence',sql:schemaSQL,limit:512}
  ];
 };
 const before=reads(false),post=reads(true);
 if([...before,...post].some(d=>d.expected===undefined&&!['schema','schemaEndFence'].includes(d.key)&&!d.key.startsWith('data:')))fail('MIGRATION_EXPECTED_METADATA_REQUIRED');
 // Do not tokenize, split statements, rewrite files or independently commit registration.
 const sql=names.map(n=>migrations[n]).join('\n');
 const plan=freeze({runId,releaseSha,baseline:b,tables,newTables,order:names,migrationSha256:MIGRATION_HASHES,migrationSQL:sql,migrationSQLSha256:bytes(sql),before,post,planSha256:fingerprint({migrationSQLSha256:bytes(sql),before,post})});reviewed.add(plan);return plan;
}
export function trainingMigrationClient({token,targets,authorization:a,plan,fetcher=fetch,now=()=>Date.now()}){
 if(!reviewed.has(plan)||typeof token!=='string'||!token.trim()||targets?.accountId!==account||targets.training?.databaseId!==TRAINING_DB||a?.scope!=='TRAINING_0005_0007_ONLY'||a.databaseId!==TRAINING_DB||a.runId!==plan.runId||a.releaseSha!==plan.releaseSha||a.attempt!==1)fail('MIGRATION_CREDENTIAL_TARGET_OR_PLAN_REFUSED');
 let submitted=false;const counts=new Map();
 return async phase=>{
  if(!['token','metadata','before','beforeFence','migrate','post','rollback'].includes(phase))fail('MIGRATION_PHASE_REFUSED');
  if(counts.has(phase))fail('MIGRATION_REQUEST_REPLAY_REFUSED');counts.set(phase,1);
  const writing=phase==='migrate';
  if(!Number.isFinite(Date.parse(a.windowExpiresAt))||now()>=Date.parse(a.windowExpiresAt)||(writing&&Date.parse(a.windowExpiresAt)-now()<5*60*1000))fail('MIGRATION_WINDOW_EXECUTION_BUDGET_REQUIRED');
  if(writing){if(submitted)fail('MIGRATION_WRITE_REPLAY_REFUSED');submitted=true;}
  const get=phase==='token'||phase==='metadata',descriptors=['before','beforeFence','rollback'].includes(phase)?plan.before:phase==='post'?plan.post:null;
  const path=root+(phase==='token'?'/tokens/verify':'/d1/database/'+TRAINING_DB+(phase==='metadata'?'':'/query'));
  const body=writing?{batch:[{sql:plan.migrationSQL,params:[]}]}:descriptors?{batch:descriptors.map(d=>({sql:d.sql,params:[]}))}:undefined;
  const evidence={phase,method:get?'GET':'POST',path,sqlPlanSha256:writing?plan.migrationSQLSha256:descriptors?fingerprint(descriptors.map(d=>d.sql)):undefined};
  let r;try{r=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:get?'GET':'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json',...(!get?{'Content-Type':'application/json'}:{})},...(!get?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{if(writing)return {outcome:'UNKNOWN',evidence:{...evidence,outcome:'UNKNOWN_NO_RETRY'}};fail('MIGRATION_READ_UNAVAILABLE_NO_RETRY');}
  evidence.status=r.status;let data;
  try{const reader=r.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>4*1024*1024)throw Error();chunks.push(Buffer.from(v.value));}}finally{await reader.cancel().catch(()=>{});}data=JSON.parse(Buffer.concat(chunks).toString());}catch{if(writing)return {outcome:'UNKNOWN',evidence:{...evidence,outcome:'RESPONSE_UNKNOWN_NO_RETRY'}};fail('MIGRATION_READ_RESPONSE_REFUSED');}
  if(writing){
   if(r.ok&&data.success===true&&Array.isArray(data.result)&&data.result.length>=1&&data.result.length<=128&&data.result.every(x=>x.success===true&&Array.isArray(x.results)&&x.results.length<=2000&&Number.isSafeInteger(x.meta?.rows_written)&&x.meta.rows_written>=0&&typeof x.meta.changed_db==='boolean'))return {outcome:'COMMITTED_UNVERIFIED',evidence:{...evidence,resultCount:data.result.length,rowsWritten:data.result.map(x=>x.meta.rows_written),changedDatabase:data.result.map(x=>x.meta.changed_db)}};
   const messages=[...(Array.isArray(data.errors)?data.errors:[]).map(x=>x.message),...(Array.isArray(data.result)?data.result:[]).map(x=>x.error)].filter(x=>typeof x==='string').join('\n');
   const sqlFailure=[200,400].includes(r.status)&&data.success===false&&(data.errors?.some?.(x=>x.code===7500)||/SQLITE_|D1_ERROR/.test(messages));
   return {outcome:sqlFailure?'SQL_FAILED_UNVERIFIED':'UNKNOWN',evidence:{...evidence,outcome:sqlFailure?'SQL_FAILED_UNVERIFIED':'UNKNOWN_NO_RETRY',errorSha256:bytes(messages)}};
  }
  if(!r.ok||data.success!==true)fail('MIGRATION_READ_OR_CREDENTIAL_REJECTED');
  if(get){
   if(phase==='token'){
    if(data.result?.status!=='active')fail('ACTIVE_ACCOUNT_TOKEN_REQUIRED');
    const expiry=data.result.expires_on==null?null:Date.parse(data.result.expires_on),start=data.result.not_before==null?null:Date.parse(data.result.not_before);
    if((expiry!==null&&(!Number.isFinite(expiry)||expiry-now()<20*60*1000))||(start!==null&&(!Number.isFinite(start)||start>now())))fail('TOKEN_EXECUTION_WINDOW_INSUFFICIENT');
    return {evidence:{...evidence,tokenStatus:'active',expiresAt:expiry===null?null:new Date(expiry).toISOString()}};
   }
   if(data.result?.uuid!==TRAINING_DB)fail('TRAINING_DATABASE_METADATA_MISMATCH');return {evidence:{...evidence,databaseId:TRAINING_DB}};
  }
  if(!Array.isArray(data.result)||data.result.length!==descriptors.length||data.result.some((x,i)=>x.success!==true||!Array.isArray(x.results)||x.results.length>descriptors[i].limit||x.meta?.rows_written!==0||x.meta.changed_db!==false))fail('MIGRATION_READ_BOUND_OR_ZERO_WRITE_EVIDENCE_REQUIRED');
  return {rows:data.result.map(x=>x.results),evidence:{...evidence,rowsWritten:0,changedDatabase:false}};
 };
}
function snapshot(plan,rows,post,originalProvider,check,writeStarted,now){
 const descriptors=post?plan.post:plan.before,b=plan.baseline,map=Object.fromEntries(descriptors.map((d,i)=>[d.key,rows[i]]));
 const expectedSchema=post?b.postSchema:b.schema;
 let provider;
 for(const k of ['schema','schemaEndFence']){
  const raw=map[k],p=raw.filter(r=>r.name==='_cf_KV');
  check(k+':provider',p.length<=1&&(p.length===0||fingerprint(p[0])===providerHash));
  const ph=fingerprint(p);if(provider===undefined)provider=ph;
  check(k+':providerPreserved',ph===provider&&(originalProvider===undefined||ph===originalProvider));
  check(k+':definitions',fingerprint(raw.filter(r=>r.name!=='_cf_KV'))===fingerprint(expectedSchema),{expectedSha256:fingerprint(expectedSchema),actualSha256:fingerprint(raw)});
  if(!post)check(k+':acceptedGate2State',fingerprint(raw)===b.acceptedGate2SchemaSha256);
 }
 for(const d of descriptors.filter(d=>d.expected!==undefined))check(d.key,fingerprint(map[d.key])===fingerprint(d.expected),{expectedSha256:fingerprint(d.expected),actualSha256:fingerprint(map[d.key])});
 const data={};
 for(const t of plan.tables){
  const values=sorted(map['data:'+t]);let preserved=values;
  if(post&&t==='schema_migrations'){
   const old=b.originalRegistrationRows,newVersions=plan.order.map(n=>'text:'+Buffer.from(n.slice(0,-4)).toString('hex').toUpperCase());
   preserved=values.filter(r=>!newVersions.includes(r.version));const added=values.filter(r=>newVersions.includes(r.version));
   check('migrationRegistrationExact',values.length===old.length+3&&added.length===3&&new Set(added.map(r=>r.version)).size===3&&fingerprint(sorted(preserved))===fingerprint(sorted(old)));
   const timestamp=r=>/^text:[0-9A-F]+$/.test(r.applied_at)?Buffer.from(r.applied_at.slice(5),'hex').toString():'';
   check('migrationRegistrationTimestamps',added.every(r=>{const s=timestamp(r),v=Date.parse(s.replace(' ','T')+'Z');return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)&&Number.isFinite(v)&&v>=writeStarted-5*60*1000&&v<=now()+5*60*1000;}));
  }
  data[t]={count:preserved.length,sha256:fingerprint(preserved)};
  check('preserved:'+t,fingerprint(data[t])===fingerprint(b.backupData[t]),{...data[t],expectedSha256:b.backupData[t].sha256});
 }
 return {providerSha256:provider,schemaSha256:fingerprint(map.schema),preservedDataSha256:fingerprint(data),data};
}
export async function executeTrainingMigrations({plan,request,fence,preflight,now=()=>Date.now()}){
 const receipt={protocol:'CREATORLOOP_TRAINING_MIGRATIONS_V1',environment:'TRAINING',databaseId:TRAINING_DB,runId:plan.runId,releaseSha:plan.releaseSha,migrationOrder:plan.order,migrationSha256:plan.migrationSha256,planSha256:plan.planSha256,migrationSQLSha256:plan.migrationSQLSha256,status:'TRAINING_MIGRATION_BLOCKED',startedAt:new Date(now()).toISOString(),phases:[],checks:[],blockers:[],migrationSubmitted:false,remoteMigrationsApplied:false,rollbackStatus:'NOT_REQUIRED',productionAccessed:false,productionDeployed:false,remoteRestorePerformed:false,executorActivated:false,operatorAdmitted:false};
 let original,writeStarted;
 const check=(name,matched,detail={})=>{receipt.checks.push({check:name,matched,...detail});if(!matched)fail('MIGRATION_'+name.replace(/[^a-z0-9]/gi,'_').toUpperCase()+'_DISCREPANCY');};
 const call=async phase=>{
  await fence();receipt.phases.push({phase,status:'REQUEST_STARTED'});
  if(phase==='migrate'){receipt.migrationSubmitted=true;receipt.remoteMigrationsApplied=null;receipt.rollbackStatus='OUTCOME_UNVERIFIED';writeStarted=now();}
  const r=await request(phase);Object.assign(receipt.phases.at(-1),r.evidence,{status:r.outcome??'READ_COMPLETED'});return r;
 };
 try{
  await call('token');await call('metadata');await fence();receipt.preflight=await preflight();
  if(receipt.preflight?.status!=='LIVE_SCHEMA_INSPECTION_PASS')fail('MIGRATION_SCHEMA_PREFLIGHT_REQUIRED');
  original=snapshot(plan,(await call('before')).rows,false,undefined,check,0,now);receipt.beforeSnapshot=original;
  const finalBefore=snapshot(plan,(await call('beforeFence')).rows,false,original.providerSha256,check,0,now);
  check('prewriteEndFence',fingerprint(finalBefore)===fingerprint(original));
  const result=await call('migrate');
  if(result.outcome!=='COMMITTED_UNVERIFIED'){
   receipt.rollbackStatus='VERIFICATION_REQUIRED';
   const restored=snapshot(plan,(await call('rollback')).rows,false,original.providerSha256,check,0,now);
   check('rollbackExact',fingerprint(restored)===fingerprint(original));receipt.rollbackSnapshot=restored;
   receipt.rollbackStatus=result.outcome==='SQL_FAILED_UNVERIFIED'?'VERIFIED_ATOMIC_ROLLBACK':'UNCHANGED_AT_INSPECTION_OUTCOME_STILL_UNKNOWN';
   if(result.outcome==='SQL_FAILED_UNVERIFIED')receipt.remoteMigrationsApplied=false;
   fail(result.outcome==='SQL_FAILED_UNVERIFIED'?'MIGRATION_SQL_FAILED_ROLLBACK_VERIFIED':'MIGRATION_OUTCOME_UNKNOWN_NO_RETRY');
  }
  receipt.remoteMigrationsApplied=true;receipt.rollbackStatus='COMMITTED_NO_AUTOMATIC_RESTORE';
  receipt.afterSnapshot=snapshot(plan,(await call('post')).rows,true,original.providerSha256,check,writeStarted,now);
  receipt.status='TRAINING_MIGRATION_PASS';
 }catch(error){
  receipt.blockers.push({code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'TRAINING_MIGRATION_BLOCKED'});
  if(error.message==='MIGRATION_WINDOW_EXECUTION_BUDGET_REQUIRED'&&receipt.phases.at(-1)?.phase==='migrate'){
   receipt.migrationSubmitted=false;receipt.remoteMigrationsApplied=false;receipt.rollbackStatus='NOT_REQUIRED';receipt.phases.at(-1).status='NOT_SUBMITTED_WINDOW_BUDGET';
  }
  if(receipt.migrationSubmitted&&receipt.rollbackStatus==='VERIFICATION_REQUIRED')receipt.rollbackStatus='UNVERIFIED_RECOVERY_HELD';
 }
 receipt.completedAt=new Date(now()).toISOString();return receipt;
}
