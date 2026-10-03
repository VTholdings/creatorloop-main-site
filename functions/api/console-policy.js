// Internal identifiers map explicitly to established source fields. No workbook changes.
export const FIELD_NAMES = Object.freeze({
  creatorStatus:'Status', compensationModel:'Compensation Model', rightsStatus:'Rights Status',
  productFocus:'Product Focus', status:'Status', startDate:'Start Date', contentDue:'Content Due',
  fixedContentFee:'Fixed Content Fee ($)', commissionRate:'Commission %',
  attributionWindowDays:'Attribution Window (Days)', paidUsageRights:'Paid Usage Rights',
  evidenceStatus:'Evidence Status', signedRightsEvidenceLink:'Signed Rights Evidence Link', evidenceLink:'Evidence Link'
});
const KNOWN = new Set(['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','ADMINISTRATOR']);
export const FactualRoles = new Set(['OPERATOR','OPERATIONS','ADMINISTRATOR']);
const creatorKeys = {creatorName:'creator_name',primaryPlatform:'primary_platform',handle:'handle',contact:'contact',creatorStatus:'creator_status',compensationModel:'compensation_model',rightsStatus:'rights_status',productFocus:'product_focus',notes:'notes',evidenceLink:'evidence_link'};
const assignmentKeys = {status:'status',startDate:'start_date',contentDue:'content_due',fixedContentFee:'fixed_content_fee',commissionRate:'commission_rate',attributionWindowDays:'attribution_window_days',paidUsageRights:'paid_usage_rights',evidenceStatus:'evidence_status',signedRightsEvidenceLink:'signed_rights_evidence_link',notes:'notes'};
const controlled = {CREATOR:new Set(['compensationModel','rightsStatus','productFocus']),ASSIGNMENT:new Set(['fixedContentFee','commissionRate','attributionWindowDays','paidUsageRights','evidenceStatus','signedRightsEvidenceLink','startDate','contentDue'])};
const restrictedStatus = new Set(['Approved','Live','Active','Complete','Archived']);
export function capabilities(user) {
  return {captureFacts:FactualRoles.has(user.role),reviewQA:['QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','ADMINISTRATOR'].includes(user.role),
    recordAuthorizedDecisions:['OPERATIONS','ADMINISTRATOR'].includes(user.role),administer:user.role==='ADMINISTRATOR'};
}
export async function scoped(db,user,campaignId,creatorId=null) {
  if (!KNOWN.has(user.role)) return false;
  if (user.role==='ADMINISTRATOR') return true;
  if (!campaignId) return false;
  try {
    const grant=await db.prepare(`SELECT 1 FROM console_access_grants WHERE operator_id=? AND campaign_id=? AND (? IS NULL OR record_id='*' OR record_id=?) LIMIT 1`).bind(user.id,campaignId,creatorId,creatorId||'').first();
    if (grant) return true;
  } catch {} // Older schemas fail closed; a factual assignment still grants its own record.
  if (creatorId) return Boolean(await db.prepare('SELECT 1 FROM creator_enrollments WHERE id=? AND campaign_id=? AND assigned_operator_id=?').bind(creatorId,campaignId,user.id).first());
  return Boolean(await db.prepare('SELECT 1 FROM creator_enrollments WHERE campaign_id=? AND assigned_operator_id=? LIMIT 1').bind(campaignId,user.id).first());
}
export async function scopedRows(db,user,rows,kind) {
  const allowed=[];
  for(const row of rows) if(await scoped(db,user,kind==='CAMPAIGN'?row.id:row.campaign_id,kind==='CREATOR'?row.id:row.creator_id)) allowed.push(project(row,kind,user));
  return allowed;
}
const campaignFields=['id','name','brand_code','status','source_reference','platform','objective','slug','start_date','end_date','product_scope','source_version','source_updated_at'];
const common=['id','campaign_id','creator_id','creator_name','handle','status','workflow_status','creator_status','primary_platform','contact','product_focus','rights_status','notes','evidence_link','enrollment_date','last_updated','version','sync_status','campaign_name','campaign_slug','campaign_platform','campaign_product_scope','product_scope','platform','assigned_operator_id'];
const assignmentFields=['environment','start_date','content_due','paid_usage_rights','evidence_status','signed_rights_evidence_link'];
const terms=['compensation_model','fixed_content_fee','commission_rate','attribution_window_days'];
const creativeFields=['creative_name','product','angle','format','approval_status','destination_url','created_date'];
export function project(row,kind,user) {
  if(user.role==='ADMINISTRATOR')return row;
  const fields=kind==='CAMPAIGN'?campaignFields:[...common,...(kind==='ASSIGNMENT'?assignmentFields:[]),...(kind==='CREATIVE'?creativeFields:[])];
  // Approved assignment terms are read-only operational facts; QA receives no compensation amounts.
  if(user.role!=='QA_REVIEWER' && kind!=='CAMPAIGN')fields.push(...terms);
  if(kind==='CREATOR' && user.role==='QA_REVIEWER')fields.push('compensation_model'); // categorical QA completeness only
  return Object.fromEntries(fields.filter(k=>k in row).map(k=>[k,row[k]]));
}
const equivalent=(a,b)=>String(a??'')===String(b??'') || (a!==null && b!==null && a!=='' && b!=='' && Number.isFinite(Number(a)) && Number(a)===Number(b));
export async function authorizeFields(db,user,type,body,current=null) {
  if(!FactualRoles.has(user.role))return 'This role may not change operational facts';
  const keys=type==='CREATOR'?creatorKeys:assignmentKeys;
  const known=new Set([...Object.keys(keys),'campaignId','creatorId','environment','version','authorizationId']);
  if(Object.keys(body).some(key=>!known.has(key)))return 'Unrecognized or restricted operational fields were supplied';
  const baseline=current|| (type==='CREATOR'?{compensation_model:'N/A',rights_status:'Not Reviewed',creator_status:'Not Started',product_focus:''}:{fixed_content_fee:0,commission_rate:0,attribution_window_days:30,paid_usage_rights:'Pending',evidence_status:'Planned',status:'Not Started'});
  if(!current && user.role!=='ADMINISTRATOR' && type==='CREATOR') {
    body.compensationModel ??= 'N/A';body.rightsStatus ??='Not Reviewed';body.creatorStatus ??='Not Started';
    // Selecting an assigned approved campaign's Product Focus is factual processing, not a new offer.
    baseline.product_focus=body.productFocus;
  }
  const changed=Object.keys(keys).filter(k=>k in body && !equivalent(body[k],baseline[keys[k]]));
  const statusKey=type==='CREATOR'?'creatorStatus':'status';
  if(changed.includes(statusKey) && restrictedStatus.has(body[statusKey])) {
    if(user.role!=='ADMINISTRATOR')return `Status ${body[statusKey]} requires authorized management; QA does not authorize launch or closeout`;
    if(['Approved','Live','Active'].includes(body[statusKey])) {
      let gates=[];
      try {gates=(await db.prepare("SELECT fields_json FROM console_source_records WHERE tab='LAUNCH CONTROL' AND campaign_id=?").bind(body.campaignId).all()).results.map(row=>JSON.parse(row.fields_json));}catch{}
      const campaign=await db.prepare('SELECT platform FROM campaigns WHERE id=?').bind(body.campaignId).first();
      const applicable=gates.filter(g=>campaign?.platform && g['Platform']===campaign.platform && g['Campaign ID']===body.campaignId);
      if(!applicable.length || !applicable.every(g=>g['Owner Approval']==='Approved' && g['Launch Status']==='Approved' && g['Pre-Launch QA']==='READY' && g['Economics Gate']==='READY' && g['Tracking Gate']==='VERIFIED' && g['Rights Gate']==='VERIFIED' && g['Budget Gate']==='READY'))return 'Verified LAUNCH CONTROL for this Campaign ID and Platform, with explicit Owner Approval, is required before this Status';
    }
  }
  const needs=changed.filter(k=>controlled[type].has(k)||(k==='evidenceLink' && current?.rights_status==='Paid Usage Approved'));
  if(needs.length && user.role!=='ADMINISTRATOR') {
    let decision=null;
    try { decision=await db.prepare('SELECT * FROM console_authorizations WHERE id=? AND entity_type=? AND entity_id=? AND campaign_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)').bind(body.authorizationId||'',type,current?.id||'NEW',body.campaignId).first(); } catch {}
    const approved=decision?JSON.parse(decision.values_json):{};
    const canRecord=user.role==='OPERATIONS' || (user.role==='OPERATOR' && needs.every(k=>['startDate','contentDue'].includes(k)));
    if(!canRecord || !needs.every(k=>k in approved && equivalent(body[k],approved[k])))return 'Authorized decision required for '+needs.map(k=>FIELD_NAMES[k]).join(', ');
  }
  // Merge only known fields; protects partial factual updates and rejects changes to locked identities.
  for(const [key,column] of Object.entries(keys))if(!(key in body) && column in baseline)body[key]=baseline[column];
  return null;
}
export const AUTHORIZATION_FIELDS={CREATOR:['compensationModel','rightsStatus','productFocus','evidenceLink'],ASSIGNMENT:['fixedContentFee','commissionRate','attributionWindowDays','paidUsageRights','evidenceStatus','signedRightsEvidenceLink','startDate','contentDue']};
