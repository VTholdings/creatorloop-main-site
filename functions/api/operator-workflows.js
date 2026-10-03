import { scoped, AUTHORIZATION_FIELDS, FactualRoles } from './console-policy.js';
import { nextEntityId } from './console-core.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const http=value=>{try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}};
export async function escalate({env,request},user) {
 if(!FactualRoles.has(user.role))return json({error:'This role cannot capture an escalation'},403);
 const body=await request.json(),db=env.OPERATIONS_DB;
 if(!await scoped(db,user,body.campaignId,body.creatorId||null))return json({error:'Assigned record access required'},403);
 const types=['Owner Access','Money/Spend','Tracking','Shipping','Product','Creator Rights','Creative','Inventory','Checkout','Data Missing','Other'];
 if(!types.includes(body.type)||!['Green','Yellow','Red','Blue','Gray'].includes(body.severity)||!body.description?.trim()||!http(body.evidenceLink)||!/^[-\w]{8,100}$/.test(body.eventId||''))return json({error:'Use the established Type and Severity, describe the blocker, attach evidence and supply a unique event ID'},422);
 if(Object.keys(body).some(k=>!['campaignId','creatorId','type','severity','description','recommendation','evidenceLink','notes','eventId'].includes(k)))return json({error:'An escalation cannot record an approval or resolution'},403);
 const replay=await db.prepare('SELECT entity_id FROM console_source_outbox WHERE idempotency_key=?').bind(user.id+':'+body.eventId).first();
 if(replay)return json({id:replay.entity_id,replay:true});
 const existing=(await db.prepare("SELECT record_id id FROM console_source_records WHERE tab='DECISIONS & BLOCKERS'").all()).results;
 const id=nextEntityId('DEC',existing.map(r=>r.id)),now=new Date().toISOString();
 const fields={'Record ID':id,'Type':body.type,'Severity':body.severity,'Status':'In Progress','Related ID':body.creatorId||body.campaignId,'Date Opened':now,'Decision Needed / Blocker':body.description.trim(),'Recommendation':body.recommendation||'','Evidence Link':body.evidenceLink,'Notes':body.notes||''};
 const payload={id,fields};
 await db.batch([
  db.prepare('INSERT INTO console_source_records(tab,record_id,campaign_id,creator_id,fields_json,source_version,source_updated_at) VALUES(?,?,?,?,?,?,?)').bind('DECISIONS & BLOCKERS',id,body.campaignId,body.creatorId||null,JSON.stringify(fields),'PENDING_EXPORT',now),
  db.prepare('INSERT INTO console_source_outbox(id,idempotency_key,operator_id,entity_type,entity_id,action,payload_json) VALUES(?,?,?,?,?,?,?)').bind('SYNC-'+crypto.randomUUID(),user.id+':'+body.eventId,user.id,'DECISION',id,'UPSERT',JSON.stringify(payload)),
  db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').bind('AUD-'+crypto.randomUUID(),user.id,body.campaignId,'ESCALATION_CAPTURED','DECISIONS & BLOCKERS',id,JSON.stringify(fields))
 ]);
 return json({id,syncStatus:'PENDING_EXPORT'},201);
}
export const SOURCE_FIELDS={
 'LAUNCH CONTROL':['Launch ID','Campaign ID','Platform','Launch Status','Pre-Launch QA','Tracking Gate','Rights Gate','Budget Gate','Economics Gate','Owner Approval'],
 'DECISIONS & BLOCKERS':['Record ID','Type','Severity','Status','Related ID','Date Opened','Due / Review Date','Decision Needed / Blocker','Recommendation','Decision','Resolved Date','Evidence Link','Notes'],
 'RETARGETING':['Audience ID','Campaign ID','Platform','Audience Tier','Window (Days)','Product Scope','Exclude Purchasers?','Creative ID','Status','Cash Spend ($)','Purchases','Revenue ($)','CAC ($)','ROAS','Decision','Notes'],
 'CREATOR PERFORMANCE':['Creator ID','Creator Name','Cash Media Spend ($)','Purchases','Revenue ($)','Rights Status','Status','30/60/90-Day LTV Proven?','Decision','Evidence Link','Notes'],
 'DATA INTAKE':['Import Batch','Source Platform','Import Date/Time','Campaign ID','Creator ID','Creative ID','Product Key','Date','Spend ($)','Impressions','Clicks','Landing Views','Add to Cart','Checkout','Purchases','Revenue ($)','Refunds ($)','Audience ID','Promo Credit Used ($)','Notes'],
 'Creator Loop: Sign Up Form (Responses)':['Timestamp','Name:','Email:','Verification Status','Approved Y/N','Notes']
};
export async function operationalQueues({env,request},user) {
 const campaignId=new URL(request.url).searchParams.get('campaignId')||'CMP-100';
 if(!await scoped(env.OPERATIONS_DB,user,campaignId))return json({error:'Assigned campaign access required'},403);
 let rows;
 try {rows=(await env.OPERATIONS_DB.prepare('SELECT * FROM console_source_records WHERE campaign_id=? ORDER BY tab,record_id').bind(campaignId).all()).results;}
 catch{return json({error:'Operator workflow migration is pending'},503);}
 const records=[];
 for(const row of rows) {
   const fields=JSON.parse(row.fields_json);
   const creatorId=row.creator_id||fields['Creator ID']||(/^CR-\d+$/.test(fields['Related ID']||'')?fields['Related ID']:null);
   if(creatorId && !await scoped(env.OPERATIONS_DB,user,campaignId,creatorId))continue;
   records.push({...row,fields_json:undefined,fields:user.role==='ADMINISTRATOR'?fields:Object.fromEntries((SOURCE_FIELDS[row.tab]||[]).filter(k=>k in fields).map(k=>[k,fields[k]]))});
 }
 const byTab=tab=>records.filter(r=>r.tab===tab);
 const stages=[
  {name:'Receive Submission',tab:'Creator Loop: Sign Up Form (Responses)',items:byTab('Creator Loop: Sign Up Form (Responses)').filter(r=>r.fields['Approved Y/N']!=='Y')},
  {name:'Escalate',tab:'DECISIONS & BLOCKERS',items:byTab('DECISIONS & BLOCKERS').filter(r=>r.fields.Status!=='Resolved')},
  {name:'Launch Gate',tab:'LAUNCH CONTROL',items:byTab('LAUNCH CONTROL')},
  {name:'Monitor',tab:'RETARGETING',items:[...byTab('RETARGETING'),...byTab('DATA INTAKE')]},
  {name:'Close Out',tab:'CREATOR PERFORMANCE',items:byTab('CREATOR PERFORMANCE')}
 ];
 return json({campaignId,stages,sourceSystem:'PNB Acquisition & Launch Control System',sourceVersion:records[0]?.source_version||null,missingSources:stages.filter(stage=>!byTab(stage.tab).length).map(stage=>stage.tab),notice:'QA status does not authorize compensation, paid usage, launch or Owner Approval.'});
}
export async function administerAccess({env,request},user) {
 if(user.role!=='ADMINISTRATOR')return json({error:'Administrator authority required'},403);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const body=await request.json(),db=env.OPERATIONS_DB;
 if(!['grant','provision','disable','delegate'].includes(body.action))return json({error:'Choose a supported administration action'},422);
 const campaign=await db.prepare('SELECT id FROM campaigns WHERE id=?').bind(body.campaignId||'').first();
 if(!campaign)return json({error:'Choose an existing Campaign ID'},422);
 let target=body.operatorId?await db.prepare('SELECT * FROM operators WHERE id=?').bind(body.operatorId).first():null;
 if(body.action==='provision') {
  const email=String(body.email||'').trim().toLowerCase();
  if(email==='support@creatorloop.net'||!/^\S+@\S+\.\S+$/.test(email)||/[\[\]]/.test(email))return json({error:'An individual authorized email is required; support@creatorloop.net is not a human login'},422);
  if(!['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','ADMINISTRATOR'].includes(body.role))return json({error:'Choose an approved role'},422);
  const existing=await db.prepare('SELECT id FROM operators WHERE login_email=?').bind(email).first();
  if(existing)return json({error:'Identity already exists; historical identity is not rewritten'},409);
  const id='OP-'+crypto.randomUUID();
  await db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').bind(id,email,String(body.displayName||email),body.role,'ACTIVE').run();
  target=await db.prepare('SELECT * FROM operators WHERE id=?').bind(id).first();
 }
 if(!target)return json({error:'Operator not found'},404);
 if(body.action==='disable') {
  if(target.id===user.id)return json({error:'Do not disable the current administrator'},409);
  if(target.login_email==='support@creatorloop.net' && (!user.last_activity_at || user.login_email==='support@creatorloop.net'))return json({error:'Verify the individual Owner sign-in before disabling support access'},409);
  await db.prepare("UPDATE operators SET account_status='DISABLED' WHERE id=?").bind(target.id).run();
 } else if(body.action==='delegate') {
  if(target.role!=='APPROVAL_AUTHORITY'||!Object.values(AUTHORIZATION_FIELDS).flat().includes(body.fieldKey)||!body.expiresAt||new Date(body.expiresAt)<=new Date())return json({error:'An explicit limited delegation with a future expiry is required'},422);
  await db.prepare('INSERT INTO console_approval_delegations(operator_id,campaign_id,field_key,delegated_by,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(operator_id,campaign_id,field_key) DO UPDATE SET delegated_by=excluded.delegated_by,expires_at=excluded.expires_at').bind(target.id,body.campaignId,body.fieldKey,user.id,new Date(body.expiresAt).toISOString()).run();
 } else if(body.action==='grant') {
  const id=body.recordId||'*';
  if(id!=='*' && !await db.prepare('SELECT id FROM creator_enrollments WHERE id=? AND campaign_id=?').bind(id,body.campaignId).first())return json({error:'Choose an existing assigned Creator ID'},422);
  await db.prepare('INSERT OR IGNORE INTO console_access_grants(operator_id,campaign_id,record_id,granted_by) VALUES(?,?,?,?)').bind(target.id,body.campaignId,id,user.id).run();
 }
 await db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').bind('AUD-'+crypto.randomUUID(),user.id,body.campaignId,'ACCESS_'+body.action.toUpperCase(),'Operator',target.id,body.action==='disable'?'DISABLED':JSON.stringify({role:target.role,recordId:body.recordId||null,fieldKey:body.fieldKey||null})).run();
 return json({id:target.id,status:'Recorded'});
}
export async function authorizeDecision({env,request},user) {
 if(!['ADMINISTRATOR','APPROVAL_AUTHORITY'].includes(user.role))return json({error:'Explicit business approval authority required'},403);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const body=await request.json(),db=env.OPERATIONS_DB;
 if(!AUTHORIZATION_FIELDS[body.entityType] || !body.values || Array.isArray(body.values) || !http(body.evidenceLink))return json({error:'An established entity, approved values and decision evidence are required'},422);
 const fields=Object.keys(body.values);
 if(!fields.length || fields.some(k=>!AUTHORIZATION_FIELDS[body.entityType].includes(k)))return json({error:'Owner Approval, launch and economics controls are not delegated by this endpoint'},403);
 if(!await scoped(db,user,body.campaignId))return json({error:'Assigned campaign access required'},403);
 if(body.entityId!=='NEW') {
  const table=body.entityType==='CREATOR'?'creator_enrollments':'creator_assignments';
  const entity=await db.prepare('SELECT * FROM '+table+' WHERE id=? AND campaign_id=?').bind(body.entityId,body.campaignId).first();
  if(!entity)return json({error:'Entity and Campaign ID must match'},422);
  if(!await scoped(db,user,body.campaignId,body.entityType==='CREATOR'?entity.id:entity.creator_id))return json({error:'Assigned record access required'},403);
 }
 if(user.role==='APPROVAL_AUTHORITY') for(const field of fields) {
  const grant=await db.prepare('SELECT 1 FROM console_approval_delegations WHERE operator_id=? AND campaign_id=? AND field_key=? AND expires_at>?').bind(user.id,body.campaignId,field,new Date().toISOString()).first();
  if(!grant)return json({error:'This business approval has not been explicitly delegated'},403);
 }
 const id='AUTH-'+crypto.randomUUID();
 await db.batch([
  db.prepare('INSERT INTO console_authorizations(id,campaign_id,entity_type,entity_id,values_json,evidence_link,approved_by,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,body.campaignId,body.entityType,body.entityId,JSON.stringify(body.values),body.evidenceLink,user.id,body.expiresAt||null),
  db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').bind('AUD-'+crypto.randomUUID(),user.id,body.campaignId,'BUSINESS_DECISION_AUTHORIZED',body.entityType,body.entityId,JSON.stringify({authorizationId:id,fields,evidenceLink:body.evidenceLink}))
 ]);
 return json({id},201);
}
