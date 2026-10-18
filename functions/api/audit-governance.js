import {canManageTeam,canViewAudit,canExport} from './team-policy.js';
import {scoped,scopedRows} from './console-policy.js';
import {reportHistory} from './report-history.js';
import {directory} from './team-access.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function eventVisible(db,user,event,depth=0) {
 if(user.role==='ADMINISTRATOR')return true;
 if(!await scoped(db,user,event.campaign_id))return false;
 if(['CreatorEnrollment','CREATOR'].includes(event.object_type)&&event.object_id!=='NEW')return scoped(db,user,event.campaign_id,event.object_id);
 if(['CreatorAssignment','ASSIGNMENT'].includes(event.object_type)&&event.object_id!=='NEW'){
  const row=await db.prepare('SELECT creator_id FROM creator_assignments WHERE id=?').bind(event.object_id).first();
  return row?scoped(db,user,event.campaign_id,row.creator_id):false;
 }
 if(event.object_type==='AuditEvent'&&depth<3){const original=await db.prepare('SELECT * FROM audit_events WHERE id=?').bind(event.object_id).first();return original?eventVisible(db,user,original,depth+1):false;}
 return Boolean(await db.prepare("SELECT 1 FROM console_access_grants WHERE operator_id=? AND campaign_id=? AND record_id='*'").bind(user.id,event.campaign_id).first());
}
export async function auditHistory({env,request},user) {
 if(!canViewAudit(user))return json({error:'Explicit audit visibility required'},403);
 const db=env.OPERATIONS_DB,campaignId=new URL(request.url).searchParams.get('campaignId')||'CMP-100';
 if(!await scoped(db,user,campaignId))return json({error:'Assigned audit scope required'},403);
 const snapshotsReady=Boolean(await db.prepare("SELECT version FROM schema_migrations WHERE version='0006_audit_history'").first());
 const sql=snapshotsReady?
 'SELECT a.*,COALESCE(s.actor_name,o.display_name) operator_name,COALESCE(s.actor_role,o.role) operator_role,s.actor_email,s.actor_role role_at_action,CASE WHEN s.event_id IS NULL THEN 0 ELSE 1 END role_at_event FROM audit_events a JOIN operators o ON o.id=a.operator_id LEFT JOIN console_audit_actor_snapshots s ON s.event_id=a.id WHERE a.campaign_id=? ORDER BY a.created_at DESC,a.id LIMIT 200':
 'SELECT a.*,o.display_name operator_name,o.role operator_role,NULL role_at_action,0 role_at_event FROM audit_events a JOIN operators o ON o.id=a.operator_id WHERE a.campaign_id=? ORDER BY a.created_at DESC,a.id LIMIT 200';
 const rows=(await db.prepare(sql).bind(campaignId).all()).results,events=[];
 for(const event of rows)if(await eventVisible(db,user,event))events.push(user.role==='ADMINISTRATOR'?event:{...event,operator_name:'Identity '+event.operator_id,actor_email:undefined,previous_value:'Restricted details',new_value:'Restricted details'});
 return json({events});
}
export async function correctAudit({env,request},user) {
 if(!canManageTeam(user))return json({error:'Owner / Administrator authority required'},403);
 if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origin or method rejected'},403);
 if(!user.teamGovernance)return json({error:'Audit governance migration is pending'},503);
 const body=await request.json();
 if(!body||Object.keys(body).some(k=>!['eventId','reason','correction'].includes(k))||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000||typeof body.correction!=='string'||!body.correction.trim()||body.correction.length>4000)return json({error:'Original event, correction and reason are required'},422);
 const original=await env.OPERATIONS_DB.prepare('SELECT * FROM audit_events WHERE id=?').bind(body.eventId).first();
 if(!original)return json({error:'Original audit event not found'},404);
 const id='AUD-'+crypto.randomUUID();
 await env.OPERATIONS_DB.batch([env.OPERATIONS_DB.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES(?,?,?,?,?,?,?)').bind(id,user.id,original.campaign_id,'AUDIT_CORRECTION','AuditEvent',original.id,JSON.stringify({reason:body.reason.trim(),correction:body.correction.trim(),originalEventId:original.id}))]);
 return json({id,notice:'Correction appended. The original event and business records are unchanged.'},201);
}
export async function exportDataset({env,request},user) {
 if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origin or method rejected'},403);
 if(!user.teamGovernance)return json({error:'Export governance migration is pending'},503);
 const body=await request.json();
 if(!body||Object.keys(body).some(k=>!['dataset','campaignId'].includes(k))||!['creators','campaigns','audit','reports','personnel'].includes(body.dataset))return json({error:'Choose a supported export dataset'},422);
 if(!canExport(user,body.dataset)||(body.dataset==='personnel'&&!canManageTeam(user)))return json({error:'Separate export authorization required'},403);
 const db=env.OPERATIONS_DB;let rows;
 if(body.dataset==='personnel')rows=await directory(db,true);
 else {
  if(!body.campaignId||!await scoped(db,user,body.campaignId))return json({error:'Explicit assigned export scope required'},403);
  if(body.dataset==='reports'){
   const result=await reportHistory({env,request:new Request(new URL('/api/console/reports?campaignId='+encodeURIComponent(body.campaignId),request.url))},user);
   if(!result.ok)return result;rows=(await result.json()).reports;
  }else if(body.dataset==='audit'){
   const result=await auditHistory({env,request:new Request(new URL('/api/console/audit?campaignId='+encodeURIComponent(body.campaignId),request.url))},user);
   if(!result.ok)return result;rows=(await result.json()).events;
  }else {
   const table=body.dataset==='creators'?'creator_enrollments':'campaigns',key=body.dataset==='creators'?'campaign_id':'id';
   const raw=(await db.prepare('SELECT * FROM '+table+' WHERE '+key+'=? ORDER BY id').bind(body.campaignId).all()).results;
   rows=await scopedRows(db,user,raw,body.dataset==='creators'?'CREATOR':'CAMPAIGN');
  }
 }
 // Personnel exports use the existing campaign-independent personnel audit extension.
 await db.batch([db.prepare('INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) VALUES(?,?,?,?,?,?,?,?)').bind('TEAM-'+crypto.randomUUID(),user.id,user.id,user.login_email,user.display_name,user.role,'SENSITIVE_EXPORT',JSON.stringify({dataset:body.dataset,campaignId:body.campaignId||null,rowCount:rows.length}))]);
 return new Response(JSON.stringify({dataset:body.dataset,scope:body.campaignId||null,exportedBy:user.id,exportedAt:new Date().toISOString(),records:rows}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="creatorloop-'+body.dataset+'.json"'}});
}
