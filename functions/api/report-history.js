// Finalized Console snapshots use the existing append-only audit ledger.
// This does not replace or claim to govern reports stored in external systems.
import {canManageTeam,visibility} from './team-policy.js';
import {scoped,scopedRows} from './console-policy.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const canViewReports=user=>canManageTeam(user)||visibility(user).includes('finalized_reports');
export async function reportHistory({env,request},user) {
 if(!canViewReports(user))return json({error:'Explicit finalized report visibility required'},403);
 if(!user.teamGovernance)return json({error:'Report governance migration is pending'},503);
 const campaignId=new URL(request.url).searchParams.get('campaignId');
 if(!campaignId||!await scoped(env.OPERATIONS_DB,user,campaignId))return json({error:'Assigned report scope required'},403);
 const events=(await env.OPERATIONS_DB.prepare("SELECT a.*,s.actor_role FROM audit_events a JOIN console_audit_actor_snapshots s ON s.event_id=a.id WHERE a.object_type='FinalizedReport' AND a.campaign_id=? ORDER BY a.created_at,a.id").bind(campaignId).all()).results;
 const reports=[];
 for(const event of events){
  const value=JSON.parse(event.new_value);
  const records=await scopedRows(env.OPERATIONS_DB,user,value.records,value.dataset==='creators'?'CREATOR':'CAMPAIGN');
  // The historical snapshot is filtered by current permissions on every read.
  reports.push({reportId:event.object_id,eventId:event.id,version:value.version,title:value.title,dataset:value.dataset,campaignId:event.campaign_id,previousEventId:event.previous_value||null,reason:canManageTeam(user)?value.reason:'Restricted details',finalizedAt:event.created_at,finalizedBy:event.operator_id,roleAtEvent:event.actor_role,snapshotHash:canManageTeam(user)?value.snapshotHash:undefined,records,view:'Authorized subset of immutable snapshot'});
 }
 return json({reports});
}
export async function finalizeReport({env,request},user) {
 if(!canManageTeam(user))return json({error:'Owner / Administrator authority required to finalize or supersede reports'},403);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origin rejected'},403);
 if(!user.teamGovernance)return json({error:'Report governance migration is pending'},503);
 const raw=await request.text();if(raw.length>12000)return json({error:'Report request is too large'},413);
 const body=JSON.parse(raw);
 if(!body||Object.keys(body).some(k=>!['reportId','expectedVersion','campaignId','dataset','title','reason'].includes(k))||!['creators','campaigns'].includes(body.dataset)||typeof body.title!=='string'||!body.title.trim()||body.title.length>160||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0)return json({error:'Dataset, title, reason and expected report version are required'},422);
 const db=env.OPERATIONS_DB;
 const campaign=await db.prepare('SELECT id FROM campaigns WHERE id=?').bind(body.campaignId).first();
 if(!campaign)return json({error:'Campaign not found'},404);
 let previous=null;
 if(body.reportId){
  previous=await db.prepare("SELECT * FROM audit_events WHERE object_type='FinalizedReport' AND object_id=? ORDER BY CAST(json_extract(new_value,'$.version') AS INTEGER) DESC LIMIT 1").bind(body.reportId).first();
  if(!previous)return json({error:'Original report not found'},404);
  const prior=JSON.parse(previous.new_value);
  if(previous.campaign_id!==body.campaignId||prior.dataset!==body.dataset)return json({error:'Report campaign and dataset cannot change'},422);
  if(prior.version!==body.expectedVersion)return json({error:'A newer finalized report version exists'},409);
 }else if(body.expectedVersion!==0)return json({error:'New reports require version zero'},422);
 const reportId=previous?body.reportId:'REPORT-'+crypto.randomUUID();
 const table=body.dataset==='creators'?'creator_enrollments':'campaigns',key=body.dataset==='creators'?'campaign_id':'id';
 const records=(await db.prepare('SELECT * FROM '+table+' WHERE '+key+'=? ORDER BY id').bind(body.campaignId).all()).results;
 const snapshotHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(records))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const id='AUD-'+crypto.randomUUID();
 try {
  await db.batch([db.prepare('INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,previous_value,new_value) VALUES(?,?,?,?,?,?,?,?)').bind(id,user.id,body.campaignId,previous?'REPORT_SUPERSEDED':'REPORT_FINALIZED','FinalizedReport',reportId,previous?.id||null,JSON.stringify({version:body.expectedVersion+1,title:body.title.trim(),dataset:body.dataset,reason:body.reason.trim(),snapshotHash,records}))]);
 }catch(error){if(/Finalized report|UNIQUE constraint failed: index 'finalized_report_versions'/.test(String(error)))return json({error:'Report history changed or the report version is invalid'},409);throw error;}
 return json({reportId,eventId:id,version:body.expectedVersion+1,notice:'Immutable report version finalized; prior versions remain preserved.'},201);
}
