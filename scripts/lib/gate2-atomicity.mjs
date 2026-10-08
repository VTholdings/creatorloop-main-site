import {createHash} from 'node:crypto';
const account='2a3b96a0b37850cd03107131baa66b6d',dbid='12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0';
const fail=c=>{throw Error(c);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const fingerprint=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const sorted=rows=>rows.map(canonical).sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;});
const schemaSQL="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name LIMIT 513";
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const reviewedPlans=new WeakSet();
const providerSha256='7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686';
export function gate2Plan({runId,releaseSha,baseline}){
 if(!/^\d{1,20}$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(releaseSha||'')||baseline?.environment!=='TRAINING'||baseline.databaseId!==dbid||baseline.schema.some(r=>r.name==='_cf_KV'))fail('GATE2_TARGET_OR_BASELINE_REFUSED');
 const tables=Object.keys(baseline.foreignKeys).sort();
 if(!tables.includes('operators')||!tables.includes('schema_migrations')||tables.length>48||tables.some(t=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)||t.startsWith('_cf_')||t.startsWith('cl_g2_')))fail('GATE2_DATA_BOUNDARY_REFUSED');
 const prefix='cl_g2_'+runId+'_1_'+releaseSha.slice(0,12)+'_',n=Object.fromEntries(['p','c','m','h','hu','hd','fkfail','abortfail'].map(k=>[k,prefix+k])),q=k=>'"'+n[k]+'"',tag=runId+':'+releaseSha;
 const ddl=[
  ['table','p',`CREATE TABLE ${q('p')}(id TEXT PRIMARY KEY,value TEXT NOT NULL)`],
  ['table','c',`CREATE TABLE ${q('c')}(id TEXT PRIMARY KEY,parent_id TEXT NOT NULL REFERENCES ${q('p')}(id) ON UPDATE NO ACTION ON DELETE NO ACTION)`],
  ['table','m',`CREATE TABLE ${q('m')}(version TEXT PRIMARY KEY,owner TEXT NOT NULL CHECK(owner='${tag}'))`],
  ['table','h',`CREATE TABLE ${q('h')}(id TEXT PRIMARY KEY,value TEXT NOT NULL)`],
  ['trigger','hu',`CREATE TRIGGER ${q('hu')} BEFORE UPDATE ON ${q('h')} BEGIN SELECT RAISE(ABORT,'CL_GATE2_HISTORY_DENIED'); END`],
  ['trigger','hd',`CREATE TRIGGER ${q('hd')} BEFORE DELETE ON ${q('h')} BEGIN SELECT RAISE(ABORT,'CL_GATE2_HISTORY_DENIED'); END`]
 ];
 const expectedSchema=ddl.map(([type,k,sql])=>({type,name:n[k],tbl_name:type==='trigger'?n.h:n[k],sql})).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
 const initialData={p:[],c:[],m:[{version:'OWNER',owner:tag}],h:[{id:'SEED',value:tag}]};
 const committedData={p:[{id:'P',value:'COMMITTED'}],c:[{id:'C',parent_id:'P'}],m:[...initialData.m,{version:'SUCCESS',owner:tag}],h:[...initialData.h,{id:'SUCCESS',value:'SYNTHETIC_SUCCESS'}]};
 const appReads=tables.map(t=>{
  const cols=baseline.dataColumns?.[t];
  if(!Array.isArray(cols)||!cols.length||cols.length>128||new Set(cols).size!==cols.length||cols.some(c=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c)))fail('GATE2_COLUMN_BOUNDARY_REFUSED');
  const projection=cols.map(c=>{const id='"'+c+'"';return `CASE typeof(${id}) WHEN 'text' THEN 'text:'||hex(${id}) WHEN 'blob' THEN 'blob:'||hex(${id}) WHEN 'real' THEN 'real:'||printf('%!.17g',${id}) ELSE typeof(${id})||':'||quote(${id}) END AS ${id}`;});
  return 'SELECT '+projection.join(',')+' FROM "'+t+'" LIMIT 2001';
 });
 const baseReads=[schemaSQL,'PRAGMA foreign_keys','PRAGMA defer_foreign_keys',...appReads];
 const literal=s=>"'"+s.replaceAll("'","''")+"'";
 const cleanupConditions=[...expectedSchema.map(r=>`(SELECT sql FROM sqlite_master WHERE type=${literal(r.type)} AND name=${literal(r.name)} AND tbl_name=${literal(r.tbl_name)})=${literal(r.sql)}`),
  `(SELECT count(*) FROM sqlite_master WHERE sql IS NOT NULL AND name GLOB '${prefix}*')=6`,
  `(SELECT count(*) FROM ${q('p')})=1`,`(SELECT count(*) FROM ${q('p')} WHERE id='P' AND value='COMMITTED')=1`,
  `(SELECT count(*) FROM ${q('c')})=1`,`(SELECT count(*) FROM ${q('c')} WHERE id='C' AND parent_id='P')=1`,
  `(SELECT count(*) FROM ${q('m')})=2`,`(SELECT count(*) FROM ${q('m')} WHERE version IN ('OWNER','SUCCESS') AND owner='${tag}')=2`,
  `(SELECT count(*) FROM ${q('h')})=2`,`(SELECT count(*) FROM ${q('h')} WHERE (id='SEED' AND value='${tag}') OR (id='SUCCESS' AND value='SYNTHETIC_SUCCESS'))=2`];
 const cleanupGuard=`INSERT INTO ${q('m')} VALUES('CLEANUP_GUARD',CASE WHEN ${cleanupConditions.join(' AND ')} THEN '${tag}' ELSE 'OWNERSHIP_MISMATCH' END)`;
 const phases={
  original:{read:true,sql:baseReads},
  fixture_read:{read:true,sql:[...baseReads,...['p','c','m','h'].map(k=>`SELECT * FROM ${q(k)} LIMIT 17`),`PRAGMA foreign_key_check(${q('c')})`]},
  setup:{sql:[...ddl.map(d=>d[2]),`INSERT INTO ${q('m')} VALUES('OWNER','${tag}')`,`INSERT INTO ${q('h')} VALUES('SEED','${tag}')`]},
  success:{sql:['PRAGMA defer_foreign_keys=ON',`INSERT INTO ${q('c')} VALUES('C','P')`,`INSERT INTO ${q('p')} VALUES('P','COMMITTED')`,`INSERT INTO ${q('m')} VALUES('SUCCESS','${tag}')`,`INSERT INTO ${q('h')} VALUES('SUCCESS','SYNTHETIC_SUCCESS')`]},
  fk_fail:{expectedError:'FOREIGN_KEY',sql:['PRAGMA defer_foreign_keys=ON',`CREATE TABLE ${q('fkfail')}(id TEXT)`,`INSERT INTO ${q('m')} VALUES('FK_FAIL','${tag}')`,`INSERT INTO ${q('h')} VALUES('FK_FAIL','MUST_ROLL_BACK')`,`INSERT INTO ${q('c')} VALUES('ORPHAN','ABSENT_PARENT')`]},
  guard_fail:{expectedError:'HISTORY_GUARD',sql:[`CREATE TABLE ${q('abortfail')}(id TEXT)`,`INSERT INTO ${q('m')} VALUES('GUARD_FAIL','${tag}')`,`INSERT INTO ${q('h')} VALUES('GUARD_FAIL','MUST_ROLL_BACK')`,`UPDATE ${q('p')} SET value='MUST_ROLL_BACK' WHERE id='P'`,`DELETE FROM ${q('h')} WHERE id='SEED'`]},
  cleanup:{sql:[cleanupGuard,...['c','m','h','p'].map(k=>`DROP TABLE ${q(k)}`)]}
 };
 for(const phase of Object.values(phases))phase.sha256=fingerprint(phase.sql);
 const plan=freeze({prefix,names:n,ownedNames:Object.values(n),expectedSchema,expectedAppSchemaSha256:fingerprint(baseline.schema),initialData,committedData,tables,phases,runId,releaseSha,planSha256:fingerprint(Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,v.sha256])))});reviewedPlans.add(plan);return plan;
}
export function gate2Client({token,targets,authorization,plan,fetcher=fetch}){
 if(!reviewedPlans.has(plan)||typeof token!=='string'||!token.trim()||targets?.accountId!==account||targets.training?.databaseId!==dbid||authorization?.scope!=='TRAINING_SYNTHETIC_ONLY'||authorization.databaseId!==dbid||authorization.runId!==plan.runId||authorization.releaseSha!==plan.releaseSha)fail('GATE2_CREDENTIAL_OR_TARGET_REFUSED');
 const written=new Set(),counts=new Map();
 return async phaseName=>{
  const phase=plan.phases[phaseName];if(!phase)fail('GATE2_PHASE_REFUSED');
  const count=(counts.get(phaseName)??0)+1;counts.set(phaseName,count);
  if(phase.read&&count>(phaseName==='original'?2:4))fail('GATE2_READ_BOUND_EXCEEDED');
  if(!phase.read){if(written.has(phaseName))fail('GATE2_WRITE_REPLAY_REFUSED');written.add(phaseName);}
  const body={batch:phase.sql.map(sql=>({sql,params:[]}))},path='/accounts/'+account+'/d1/database/'+dbid+'/query';
  let response;try{response=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('GATE2_OUTCOME_UNKNOWN_NO_RETRY');}
  let data;try{const reader=response.body?.getReader();if(!reader)throw Error();const chunks=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4*1024*1024)throw Error();chunks.push(Buffer.from(r.value));}}finally{await reader.cancel().catch(()=>{});}data=JSON.parse(Buffer.concat(chunks).toString());}catch{fail('GATE2_RESPONSE_REFUSED_NO_RETRY');}
  const evidence={phase:phaseName,method:'POST',path,status:response.status,sqlPlanSha256:phase.sha256};
  const failed=data.success===false||data.result?.some?.(r=>r.success===false);
  if(failed&&phase.expectedError&&[200,400].includes(response.status)){
   const messages=[...(data.errors??[]).map(e=>e.message),...(data.result??[]).map(r=>r.error)].filter(m=>typeof m==='string').join('\n');
   const codes=(data.errors??[]).map(e=>e.code).filter(Number.isInteger);
   const expected=(codes.includes(7500)||messages.includes('SQLITE_CONSTRAINT'))&&(phase.expectedError==='FOREIGN_KEY'?messages.includes('FOREIGN KEY constraint failed'):messages.includes('CL_GATE2_HISTORY_DENIED'));
   if(expected)return {expectedFailure:true,evidence:{...evidence,failureClass:phase.expectedError,errorSha256:fingerprint(messages)}};
  }
  if(!response.ok||failed||data.success!==true||!Array.isArray(data.result)||data.result.length!==phase.sql.length||data.result.some(r=>r.success!==true||!Array.isArray(r.results)))fail('GATE2_UNEXPECTED_RESPONSE_NO_RETRY');
  if(phase.expectedError)fail('GATE2_INTENTIONAL_FAILURE_DID_NOT_FAIL');
  if(data.result.some(r=>!Number.isSafeInteger(r.meta?.rows_written)||r.meta.rows_written<0||typeof r.meta?.changed_db!=='boolean'||r.results.length>2000))fail('GATE2_RESULT_BOUND_OR_EVIDENCE_REFUSED');
  if(phase.read&&data.result.some(r=>r.meta.rows_written!==0||r.meta.changed_db!==false))fail('GATE2_READ_ZERO_WRITE_EVIDENCE_REQUIRED');
  return {rows:data.result.map(r=>r.results),evidence:{...evidence,rowsWritten:data.result.map(r=>r.meta.rows_written),changedDatabase:data.result.map(r=>r.meta.changed_db)}};
 };
}
function state(plan,rows,fixtures){
 const schema=rows[0];if(schema.length>512||schema.some(r=>r.name.startsWith(plan.prefix)&&!plan.ownedNames.includes(r.name)))fail('GATE2_SCHEMA_OR_NAMESPACE_BOUNDARY');
 if(fingerprint(rows[1])!==fingerprint([{foreign_keys:1}])||fingerprint(rows[2])!==fingerprint([{defer_foreign_keys:0}]))fail('GATE2_FK_CONFIGURATION_NOT_RESTORED');
 const ownedSchema=schema.filter(r=>plan.ownedNames.includes(r.name)),appSchema=schema.filter(r=>!plan.ownedNames.includes(r.name));
 const provider=appSchema.filter(r=>r.name==='_cf_KV');
 if(provider.length>1||(provider.length===1&&fingerprint(provider[0])!==providerSha256)||fingerprint(appSchema.filter(r=>r.name!=='_cf_KV'))!==plan.expectedAppSchemaSha256)fail('GATE2_ACCEPTED_APP_SCHEMA_DISCREPANCY');
 const appData=Object.fromEntries(plan.tables.map((t,i)=>[t,{count:rows[i+3].length,sha256:fingerprint(sorted(rows[i+3]))}]));
 const fixtureData=fixtures?Object.fromEntries(['p','c','m','h'].map((k,i)=>[k,sorted(rows[3+plan.tables.length+i])])):null;
 if(fixtures&&rows.at(-1).length!==0)fail('GATE2_FIXTURE_FOREIGN_KEY_VIOLATIONS');
 return {appSchemaSha256:fingerprint(appSchema),appDataSha256:fingerprint(appData),appData,ownedSchemaSha256:fingerprint(ownedSchema),ownedNames:ownedSchema.map(r=>r.name),fixtureDataSha256:fixtures?fingerprint(fixtureData):null};
}
export async function executeGate2({plan,request,fence,preflight,now=()=>new Date().toISOString()}){
 const receipt={protocol:'CREATORLOOP_D1_ATOMICITY_V1',environment:'TRAINING',databaseId:dbid,runId:plan.runId,releaseSha:plan.releaseSha,planSha256:plan.planSha256,status:'GATE2_BLOCKED',startedAt:now(),phases:[],checks:[],blockers:[],cleanupStatus:'NOT_STARTED',remainingFixtureObjects:[],atomicExecutionCertified:false,remoteMigrationsApplied:false,remoteRestorePerformed:false,productionDeployed:false,productionAccessed:false};
 const call=async phase=>{await fence();receipt.phases.push({phase,status:'REQUEST_STARTED',sqlPlanSha256:plan.phases[phase].sha256});const result=await request(phase);Object.assign(receipt.phases.at(-1),result.evidence,{status:result.expectedFailure?'EXPECTED_FAILURE':'COMPLETED'});return result;};
 const check=(name,matched,detail={})=>{receipt.checks.push({check:name,matched,...detail});if(!matched)fail('GATE2_'+name.toUpperCase()+'_DISCREPANCY');};
 let original,latest;
 try{
  await fence();receipt.preflight=await preflight();if(receipt.preflight.status!=='LIVE_SCHEMA_INSPECTION_PASS')fail('GATE2_SCHEMA_PREFLIGHT_REQUIRED');
  original=state(plan,(await call('original')).rows,false);check('namespace_absent',original.ownedNames.length===0);
  receipt.originalSnapshot=original;
  receipt.cleanupStatus='POSSIBLE_UNVERIFIED';receipt.remainingFixtureObjects=plan.ownedNames;
  await call('setup');receipt.cleanupStatus='REQUIRED';receipt.remainingFixtureObjects=plan.expectedSchema.map(r=>r.name);
  latest=state(plan,(await call('fixture_read')).rows,true);
  const preserved=s=>s.appSchemaSha256===original.appSchemaSha256&&s.appDataSha256===original.appDataSha256;
  check('setup',preserved(latest)&&latest.ownedSchemaSha256===fingerprint(plan.expectedSchema)&&latest.fixtureDataSha256===fingerprint(Object.fromEntries(Object.entries(plan.initialData).map(([k,v])=>[k,sorted(v)]))),latest);
  await call('success');latest=state(plan,(await call('fixture_read')).rows,true);
  check('atomic_commit_and_deferred_fk',preserved(latest)&&latest.ownedSchemaSha256===fingerprint(plan.expectedSchema)&&latest.fixtureDataSha256===fingerprint(Object.fromEntries(Object.entries(plan.committedData).map(([k,v])=>[k,sorted(v)]))),latest);
  const committed=fingerprint(latest);
  for(const phase of ['fk_fail','guard_fail']){
   const failure=await call(phase);if(failure.expectedFailure!==true)fail('GATE2_EXPECTED_FAILURE_REQUIRED');
   latest=state(plan,(await call('fixture_read')).rows,true);
   check(phase+'_rollback',fingerprint(latest)===committed,latest);
  }
  // Last captured state is exact, run-owned, and rollback proof precedes cleanup.
  await call('cleanup');receipt.cleanupStatus='EXECUTED_UNVERIFIED';
  latest=state(plan,(await call('original')).rows,false);
  check('cleanup_and_original_history_preserved',latest.ownedNames.length===0&&latest.appSchemaSha256===original.appSchemaSha256&&latest.appDataSha256===original.appDataSha256,latest);
  receipt.cleanupStatus='VERIFIED';receipt.remainingFixtureObjects=[];receipt.status='GATE2_ATOMICITY_PASS';receipt.atomicExecutionCertified=true;
 }catch(error){receipt.blockers.push({code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'GATE2_BLOCKED'});if(latest)receipt.remainingFixtureObjects=latest.ownedNames;if(receipt.phases.some(p=>!plan.phases[p.phase].read))receipt.cleanupStatus=receipt.cleanupStatus==='VERIFIED'?'VERIFIED':'HELD_AFTER_BLOCKER';}
 receipt.completedAt=now();return receipt;
}
