import {visibility} from './team-policy.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function canEditCampaign(db,user,id) {
 if(user.role==='ADMINISTRATOR')return true;
 if(user.role!=='MARKETING_CAMPAIGN_MANAGER'||!visibility(user).includes('financial_economics'))return false;
 return Boolean(await db.prepare("SELECT 1 FROM console_access_grants WHERE operator_id=? AND campaign_id=? AND record_id='*'").bind(user.id,id).first());
}
async function historyId(db,id){return (await db.prepare("SELECT id FROM audit_events WHERE object_type='Campaign' AND object_id=? ORDER BY rowid DESC LIMIT 1").bind(id).first())?.id||null;}
export async function campaignRevision(db,campaign) {
 const history=await historyId(db,campaign.id);
 const bytes=new TextEncoder().encode(JSON.stringify([Object.keys(campaign).sort().map(key=>[key,campaign[key]]),history]));
 const revision=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {revision,history};
}
export async function updateCampaign({env,request},user,id) {
 const db=env.OPERATIONS_DB;
 if(!user.teamGovernance)return json({error:'Governed editing migration is pending'},503);
 if(!await canEditCampaign(db,user,id))return json({error:'Authorized campaign-wide editing and management visibility required'},403);
 const current=await db.prepare('SELECT * FROM campaigns WHERE id=?').bind(id).first();
 if(!current)return json({error:'Campaign not found'},404);
 const body=await request.json();
 if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['notes','revision'].includes(key)))return json({error:'Only operational Notes may be saved. Governed business changes require approval/escalation.'},403);
 if(typeof body.notes!=='string'||body.notes.length>10000)return json({error:'Enter Notes up to 10,000 characters'},422);
 const snapshot=await campaignRevision(db,current);
 if(body.revision!==snapshot.revision)return json({error:'Campaign changed. Refresh and review the current record before saving.'},409);
 const next=body.notes.trim()||null;
 if(next===current.notes)return json({id,unchanged:true});
 const auditId='AUD-'+crypto.randomUUID(),syncId='SYNC-'+crypto.randomUUID(),columns=Object.keys(current);
 // Compare the original row and immutable history in the same guarded transaction.
 const predicate=columns.map(key=>'"'+key.replaceAll('"','""')+'" IS ?').join(' AND ')+" AND (SELECT id FROM audit_events WHERE object_type='Campaign' AND object_id=? ORDER BY rowid DESC LIMIT 1) IS ?";
 const allowed=user.role==='ADMINISTRATOR'?'1=1':"EXISTS (SELECT 1 FROM console_access_grants WHERE operator_id=? AND campaign_id=? AND record_id='*')";
 const result=await db.batch([
  db.prepare("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,previous_value,new_value) SELECT ?,?,?,?,'Campaign',?,?,? FROM campaigns WHERE "+predicate+' AND '+allowed).bind(auditId,user.id,id,'CAMPAIGN_NOTES_UPDATED',id,JSON.stringify({notes:current.notes}),JSON.stringify({notes:next}),...columns.map(key=>current[key]),id,snapshot.history,...(user.role==='ADMINISTRATOR'?[]:[user.id,id])),
  db.prepare('UPDATE campaigns SET notes=? WHERE id=? AND EXISTS (SELECT 1 FROM audit_events WHERE id=?)').bind(next,id,auditId),
  db.prepare("INSERT INTO control_system_outbox(id,idempotency_key,operator_id,entity_type,entity_id,action,payload_json) SELECT ?,?,?,'CAMPAIGN',?,'NOTES_ONLY',? WHERE EXISTS (SELECT 1 FROM audit_events WHERE id=?)").bind(syncId,syncId,user.id,id,JSON.stringify({id,notes:next,previousNotes:current.notes}),auditId)
 ]);
 if(!result[0].meta.changes)return json({error:'Campaign or access changed before commit. Refresh and review again.'},409);
 return json({id,syncStatus:'PENDING_EXPORT'});
}
