import {admissionConfiguration} from '../admission.js';
import {readiness} from '../readiness.js';
import { capabilities, scoped, scopedRows, project, authorizeFields } from '../console-policy.js';
import { operationalQueues, administerAccess, authorizeDecision, escalate } from '../operator-workflows.js';
import { canManageTeam, teamAccess } from '../team-access.js';
import { OWNER_EMAIL,loadMembership,guardedDatabase,canDiagnose,canExport,EXPORTS,canViewAudit as canInspectAudit } from '../team-policy.js';
import { reportHistory,finalizeReport,canViewReports } from '../report-history.js';
import { auditHistory,correctAudit,exportDataset } from '../audit-governance.js';
import {canEditCampaign,campaignRevision,updateCampaign} from '../campaign-edit.js';
import {
  PLATFORMS, CREATOR_STATUSES, COMPENSATION, RIGHTS, PRODUCT_FOCUS, AUDIT_ROLES, nextCreatorId, nextEntityId, normalizeCreatorIdentity,
  qaChecklist, QA_ROLES, transitionAllowed, validateAssignment, validateEnrollment
} from "../console-core.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
const uid = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const editFields={CREATOR:{creatorName:'creator_name',primaryPlatform:'primary_platform',handle:'handle',contact:'contact',creatorStatus:'creator_status',compensationModel:'compensation_model',rightsStatus:'rights_status',productFocus:'product_focus',notes:'notes',evidenceLink:'evidence_link'},ASSIGNMENT:{status:'status',startDate:'start_date',contentDue:'content_due',fixedContentFee:'fixed_content_fee',commissionRate:'commission_rate',attributionWindowDays:'attribution_window_days',paidUsageRights:'paid_usage_rights',evidenceStatus:'evidence_status',signedRightsEvidenceLink:'signed_rights_evidence_link',notes:'notes'}};
function editValues(record,type,payload=false) {
 return Object.fromEntries(Object.entries(editFields[type]).map(([key,column])=>{
  let value=record[payload?key:column]??null;
  if(payload&&['fixedContentFee','commissionRate','attributionWindowDays'].includes(key))value=Number(value??(key==='attributionWindowDays'?30:0));
  if(payload&&typeof value==='string'){value=value.trim();if(!value)value=null;}
  return [key,value];
 }));
}
const safeUser = (user) => ({
  id: user.id,
  displayName: user.display_name,
  role: user.role,
  accountStatus: user.account_status,
  loginIdentity: user.login_email,
  lastActivityAt: user.last_activity_at,
  canViewAudit: AUDIT_ROLES.has(user.role) || canInspectAudit(user),
  canManageTeam: canManageTeam(user),
  canViewReports: canViewReports(user),
  canDiagnose: canDiagnose(user),
  exportDatasets: [...EXPORTS,...(canManageTeam(user)?['personnel']:[])].filter(dataset=>canExport(user,dataset)),
  capabilities: capabilities(user)
});

async function actor(context) {
  const email = context.data.loginEmail;
  let user = await context.env.OPERATIONS_DB.prepare("SELECT * FROM operators WHERE login_email = ?").bind(email).first();
  const bootstrap = context.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!user && bootstrap === OWNER_EMAIL && email === OWNER_EMAIL) {
    const id = uid("OP");
    await context.env.OPERATIONS_DB.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status,last_activity_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)")
      .bind(id, email, "Project Owner", "ADMINISTRATOR", "ACTIVE").run();
    user = await context.env.OPERATIONS_DB.prepare("SELECT * FROM operators WHERE id = ?").bind(id).first();
  }
  if (!user || user.account_status !== "ACTIVE") return null;
  const member=await loadMembership(context.env.OPERATIONS_DB,user,context.env,context.data.accessIssuedAt,context.data.accessSubject);
  if(member?.reauthenticate){context.data.reauthenticate=true;return null;}
  if(!member)return null;
  await context.env.OPERATIONS_DB.prepare("UPDATE operators SET last_activity_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
  return member;
}

const pathParts = (context) => (context.params.path ?? []).filter(Boolean);
const sameOrigin = (request) => !request.headers.get("Origin") || request.headers.get("Origin") === new URL(request.url).origin;
const params = (request) => new URL(request.url).searchParams;
const like = (value) => `%${String(value ?? "").trim().toLowerCase()}%`;

async function schemaReady(env) {
  try {
    return Boolean(await env.OPERATIONS_DB.prepare("SELECT version FROM schema_migrations WHERE version=?")
      .bind("0002_operations_console_v2").first());
  } catch {
    return false;
  }
}
async function requireV2(env) {
  return (await schemaReady(env)) ? null : json({ error: "Operations Console V2 database migration is pending" }, 503);
}
async function optionalRows(db, sql, values = []) {
  try { return (await db.prepare(sql).bind(...values).all()).results; }
  catch { return []; }
}

async function dispatchRequest(context) {
  if (!context.env.OPERATIONS_DB) return json({ error: "Operations database is not configured" }, 503);
  if(context.env.CONSOLE_ENVIRONMENT!==undefined&&!['TRAINING','PRODUCTION'].includes(context.env.CONSOLE_ENVIRONMENT))return json({error:'Invalid Console environment'},503);
  if(context.env.CONSOLE_ENVIRONMENT==='TRAINING'&&!admissionConfiguration(context.env))return json({error:'Verified isolated training configuration is pending'},503);
  if (context.request.method !== "GET" && !sameOrigin(context.request)) return json({ error: "Origin rejected" }, 403);
  const user = await actor(context);
  if (!user) return json({ error: "Authorized operator account required" }, 403);
  const checked=context.data.requestPermission;
  if(checked&&(checked.role!==user.role||(checked.teamProfile?.version||0)!==(user.teamProfile?.version||0)))return json({error:'Permissions changed. Refresh and authenticate again.'},409);
  if(context.data.commitScope&&user.role!=='ADMINISTRATOR'){
    const {campaignId,creatorId,wholeCampaign}=context.data.commitScope;
    const grant="EXISTS (SELECT 1 FROM console_access_grants WHERE operator_id=? AND campaign_id=? AND (? IS NULL OR record_id='*' OR record_id=?)"+(wholeCampaign?" AND record_id='*'":"")+")";
    const grantOnly=wholeCampaign||user.teamProfile?.managed_scope;
    user.commitChecks=[{sql:grantOnly?grant:'('+grant+' OR EXISTS (SELECT 1 FROM creator_enrollments WHERE campaign_id=? AND assigned_operator_id=? AND (? IS NULL OR id=?)))',values:[user.id,campaignId,creatorId,creatorId||'',...(grantOnly?[]:[campaignId,user.id,creatorId,creatorId||''])]}];
  }
  if(context.data.commitScope?.creatorId){
    const {campaignId,creatorId}=context.data.commitScope;
    (user.commitChecks||=[]).push({sql:'EXISTS (SELECT 1 FROM creator_enrollments WHERE id=? AND campaign_id=?)',values:[creatorId,campaignId]});
    if(pathParts(context)[0]==='assignments'&&pathParts(context)[1])(user.commitChecks||=[]).push({sql:'EXISTS (SELECT 1 FROM creator_assignments WHERE id=? AND creator_id=? AND campaign_id=?)',values:[pathParts(context)[1],creatorId,campaignId]});
  }
  context={...context,env:{...context.env,OPERATIONS_DB:guardedDatabase(context.env.OPERATIONS_DB,user)}};
  const parts = pathParts(context);
  try {
    if(['creators','assignments','qa'].includes(parts[0])&&['POST','PATCH'].includes(context.request.method)){
      const body=await context.request.clone().json();
      if(body?.saveIntent==='REVIEWED_RECORD_EDIT'&&!user.teamGovernance)return json({error:'Governed editing migration is pending'},503);
    }
    if (parts[0] === 'reports') {
      if(parts.length!==1)return json({error:'Report route not found'},404);
      if(context.request.method==='GET')return await reportHistory(context,user);
      if(context.request.method==='POST')return await finalizeReport(context,user);
      return json({error:'Finalized reports cannot be overwritten or deleted'},405);
    }
    if(parts[0]==='readiness'&&parts.length===1&&context.request.method==='GET')return await readiness(context,user);
    if (parts[0] === 'team') return await teamAccess(context,user);
    if (parts[0] === 'exports') return await exportDataset(context,user);
    if (parts[0] === 'audit' && parts[1] === 'corrections') return await correctAudit(context,user);
    if (parts[0] === 'diagnostics' && context.request.method==='GET') {
      if(!canDiagnose(user))return json({error:'Explicit technical diagnostic scope required'},403);
      return json({environment:context.env.CONSOLE_ENVIRONMENT==='TRAINING'?'TRAINING':'PRODUCTION',schemaReady:await schemaReady(context.env),notice:'Console diagnostics only. No secrets, infrastructure administration or business approval authority are provided.'});
    }
    if (parts[0] === 'access') return await administerAccess(context,user);
    if (parts[0] === 'authorizations') return await authorizeDecision(context,user);
    if (parts[0] === 'escalations' && context.request.method==='POST') return await escalate(context,user);
    if (parts[0] === 'queues' && context.request.method === 'GET') return await operationalQueues(context,user);
    if (context.request.method === "GET" && parts[0] === "me") return json({ user: safeUser(user) });
    if (context.request.method === "GET" && parts[0] === "dashboard") return await dashboard(context, user);
    if (context.request.method === "GET" && parts[0] === "campaigns" && !parts[1]) return await listCampaigns(context);
    if (context.request.method === "GET" && parts[0] === "campaigns" && parts[1]) return await getCampaign(context, parts[1],user);
    if (context.request.method === "PATCH" && parts[0] === "campaigns" && parts.length===2) return await updateCampaign(context,user,parts[1]);
    if (context.request.method === "GET" && parts[0] === "creators" && !parts[1]) return await listCreators(context);
    if (context.request.method === "POST" && parts[0] === "creators" && !parts[1]) return await createCreator(context, user);
    if (context.request.method === "GET" && parts[0] === "creators" && parts[1]) return await getCreator(context, parts[1]);
    if (context.request.method === "PATCH" && parts[0] === "creators" && parts[1]) return await updateCreator(context, user, parts[1]);
    if (context.request.method === "POST" && parts[0] === "assignments" && !parts[1]) return await createAssignment(context, user);
    if (context.request.method === "PATCH" && parts[0] === "assignments" && parts[1]) return await updateAssignment(context, user, parts[1]);
    if (context.request.method === "POST" && parts[0] === "qa" && parts[1]) return await reviewCreator(context, user, parts[1]);
    if (context.request.method === "GET" && parts[0] === "audit") return await audit(context, user);
    if (context.request.method === "GET" && parts[0] === "system") return await systemStatus(context, user);
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Console request failed", { path: parts.join("/"), kind: error?.constructor?.name });
    if(error?.message?.includes('Console permissions changed'))return json({error:'Permissions changed before the write. Refresh and authenticate again.'},403);
    return json({ error: "The request could not be completed" }, 500);
  }
}

async function dashboard({ env, request }, user) {
  const campaignId = params(request).get("campaignId") || "CMP-100";
  const campaign = await env.OPERATIONS_DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(campaignId).first();
  if (!campaign) return json({ error: "Campaign not found" }, 404);
  const counts = await env.OPERATIONS_DB.prepare("SELECT workflow_status status, COUNT(*) count FROM creator_enrollments WHERE campaign_id=? GROUP BY workflow_status").bind(campaign.id).all();
  const ready = await schemaReady(env);
  return json({
    user: safeUser(user),
    campaign,
    counts: Object.fromEntries(counts.results.map((row) => [row.status, row.count])),
    options: { platforms: PLATFORMS, creatorStatuses: CREATOR_STATUSES, compensation: COMPENSATION, rights: RIGHTS, productFocus: PRODUCT_FOCUS },
    nextAction: QA_ROLES.has(user.role) ? "Review work awaiting QA" : "Start or correct a creator enrollment",
    system: {
      schemaReady: ready,
      governedEditingReady: Boolean(user.teamGovernance),
      training: env.CONSOLE_ENVIRONMENT === 'TRAINING',
      controlSystem: "PNB Acquisition & Launch Control System",
      systemOfRecord: env.CONSOLE_ENVIRONMENT === 'TRAINING' ? 'Isolated training database — fictional records' : 'Google Sheets',
      syncConfigured: env.CONSOLE_ENVIRONMENT !== 'TRAINING' && Boolean(env.CONTROL_SYSTEM_SYNC_SECRET)
    }
  });
}

async function listCampaigns({ env, request }) {
  const q = params(request).get("q")?.trim();
  const ready = await schemaReady(env);
  const rows = !q
    ? await env.OPERATIONS_DB.prepare("SELECT * FROM campaigns ORDER BY id").all()
    : ready
      ? await env.OPERATIONS_DB.prepare("SELECT * FROM campaigns WHERE LOWER(id) LIKE ? OR LOWER(name) LIKE ? OR LOWER(COALESCE(slug,'')) LIKE ? ORDER BY id")
        .bind(like(q), like(q), like(q)).all()
      : await env.OPERATIONS_DB.prepare("SELECT * FROM campaigns WHERE LOWER(id) LIKE ? OR LOWER(name) LIKE ? ORDER BY id")
        .bind(like(q), like(q)).all();
  return json({ campaigns: rows.results });
}

async function getCampaign({ env }, id,user) {
  const campaign = await env.OPERATIONS_DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(id).first();
  if (!campaign) return json({ error: "Campaign not found" }, 404);
  const creators = await env.OPERATIONS_DB.prepare("SELECT * FROM creator_enrollments WHERE campaign_id=? ORDER BY id").bind(id).all();
  const assignments = await optionalRows(env.OPERATIONS_DB, "SELECT a.*, c.creator_name, c.handle FROM creator_assignments a JOIN creator_enrollments c ON c.id=a.creator_id WHERE a.campaign_id=? ORDER BY a.id", [id]);
  const creatives = await optionalRows(env.OPERATIONS_DB, "SELECT * FROM creatives WHERE campaign_id=? ORDER BY id", [id]);
  const canEdit=Boolean(user?.teamGovernance&&await canEditCampaign(env.OPERATIONS_DB,user,id));
  return json({ campaign, creators: creators.results, assignments, creatives,editing:{canEdit,revision:canEdit?(await campaignRevision(env.OPERATIONS_DB,campaign)).revision:null,...(canEdit?{notes:campaign.notes}:{})} });
}

async function listCreators({ env, request }) {
  const search = params(request);
  const ready = await schemaReady(env);
  const q = search.get("q")?.trim();
  const campaignId = search.get("campaignId")?.trim();
  const platform = search.get("platform")?.trim();
  const status = search.get("status")?.trim();
  const clauses = [];
  const values = [];
  if (campaignId) { clauses.push("e.campaign_id=?"); values.push(campaignId); }
  if (platform) { clauses.push("e.primary_platform=?"); values.push(platform); }
  if (status) { clauses.push("(e.creator_status=? OR e.workflow_status=?)"); values.push(status, status); }
  if (q) {
    const fields = ["e.id","e.creator_name","e.handle","e.primary_platform","e.creator_status","e.workflow_status","e.campaign_id","c.name"];
    if (ready) fields.push("COALESCE(c.slug,'')");
    clauses.push("(" + fields.map((field) => `LOWER(${field}) LIKE ?`).join(" OR ") + ")");
    for (let i = 0; i < fields.length; i += 1) values.push(like(q));
  }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const campaignFields = ready ? "c.name campaign_name,c.slug campaign_slug" : "c.name campaign_name,NULL campaign_slug";
  const rows = await env.OPERATIONS_DB.prepare(`SELECT e.*,${campaignFields}
    FROM creator_enrollments e LEFT JOIN campaigns c ON c.id=e.campaign_id
    ${where} ORDER BY e.campaign_id,CAST(SUBSTR(e.id,4) AS INTEGER)`).bind(...values).all();
  return json({ creators: rows.results });
}

async function getCreator({ env }, id) {
  const ready = await schemaReady(env);
  const campaignFields = ready
    ? "c.name campaign_name,c.slug campaign_slug,c.platform campaign_platform,c.product_scope campaign_product_scope"
    : "c.name campaign_name,NULL campaign_slug,NULL campaign_platform,NULL campaign_product_scope";
  const creator = await env.OPERATIONS_DB.prepare(`SELECT e.*,${campaignFields}
    FROM creator_enrollments e LEFT JOIN campaigns c ON c.id=e.campaign_id WHERE e.id=?`).bind(id).first();
  if (!creator) return json({ error: "Creator record not found" }, 404);
  const reviews = await env.OPERATIONS_DB.prepare("SELECT q.*,o.display_name reviewer_name,o.role reviewer_role FROM qa_reviews q JOIN operators o ON o.id=q.reviewer_id WHERE q.enrollment_id=? ORDER BY q.created_at DESC").bind(id).all();
  const assignments = await optionalRows(env.OPERATIONS_DB, `SELECT a.*,c.name campaign_name,c.platform campaign_platform,c.product_scope campaign_product_scope,c.product_scope product_scope,c.platform platform
    FROM creator_assignments a JOIN campaigns c ON c.id=a.campaign_id WHERE a.creator_id=? ORDER BY a.id`, [id]);
  const creatives = await optionalRows(env.OPERATIONS_DB, "SELECT * FROM creatives WHERE creator_id=? ORDER BY id", [id]);
  return json({ creator, checklist: qaChecklist(creator), reviews: reviews.results, assignments, creatives });
}

async function createCreator(context, user) {
  const blocked = await requireV2(context.env); if (blocked) return blocked;
  const body = await context.request.json();
  const permission = await authorizeFields(context.env.OPERATIONS_DB,user,'CREATOR',body);
  if(permission)return json({error:permission},403);
  const errors = validateEnrollment(body);
  if (Object.keys(errors).length) return json({ error: "Check the highlighted fields", fields: errors }, 422);
  if (!await context.env.OPERATIONS_DB.prepare("SELECT id FROM campaigns WHERE id=?").bind(body.campaignId).first()) {
    return json({ error: "Choose an existing campaign" }, 422);
  }
  const duplicate = await context.env.OPERATIONS_DB.prepare(`SELECT id FROM creator_enrollments
    WHERE campaign_id=? AND (LOWER(TRIM(handle))=? OR LOWER(TRIM(contact))=?) LIMIT 1`)
    .bind(body.campaignId, normalizeCreatorIdentity(body.handle), normalizeCreatorIdentity(body.contact)).first();
  if (duplicate) return json({ error: `This creator already has campaign record ${duplicate.id}` }, 409);
  const ids = await context.env.OPERATIONS_DB.prepare("SELECT id FROM creator_enrollments").all();
  const id = nextCreatorId(ids.results.map((row) => row.id));
  const now = new Date().toISOString();
  const payload = creatorPayload(id, body, user.id, now);
  const insert = context.env.OPERATIONS_DB.prepare(`INSERT INTO creator_enrollments
    (id,campaign_id,creator_name,primary_platform,handle,contact,creator_status,compensation_model,rights_status,product_focus,notes,evidence_link,workflow_status,assigned_operator_id,enrollment_date,last_updated,sync_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,body.campaignId,body.creatorName.trim(),body.primaryPlatform,body.handle.trim(),body.contact.trim(),body.creatorStatus,body.compensationModel,body.rightsStatus,body.productFocus.trim(),body.notes?.trim()||null,body.evidenceLink?.trim()||null,"IN_PROGRESS",user.id,now,now,"PENDING_EXPORT");
  await context.env.OPERATIONS_DB.batch([
    insert,
    auditInsert(context.env.OPERATIONS_DB,user,body.campaignId,id,"CREATOR_ENROLLMENT_CREATED",null,"IN_PROGRESS"),
    outboxInsert(context.env.OPERATIONS_DB,user,"CREATOR",id,"UPSERT",payload)
  ]);
  return json({ id, workflowStatus: "IN_PROGRESS", syncStatus: "PENDING_EXPORT" }, 201);
}

async function updateCreator(context, user, id) {
  const blocked = await requireV2(context.env); if (blocked) return blocked;
  const current = await context.env.OPERATIONS_DB.prepare("SELECT * FROM creator_enrollments WHERE id=?").bind(id).first();
  if (!current) return json({ error: "Creator record not found" }, 404);
  const body = await context.request.json();
  if (body.action) {
    if(Object.keys(body).some(key=>!['action','version'].includes(key)))return json({error:'Workflow actions cannot change protected record fields'},403);
    if(!capabilities(user).captureFacts)return json({error:'This role may not change creator workflow'},403);
    return updateCreatorWorkflow(context,user,current,body);
  }
  if(body.campaignId && body.campaignId!==current.campaign_id)return json({error:'Campaign ID is locked'},403);
  body.campaignId = current.campaign_id;
  const permission=await authorizeFields(context.env.OPERATIONS_DB,user,'CREATOR',body,current);
  if(permission)return json({error:permission},403);
  const errors = validateEnrollment(body, current);
  if (Object.keys(errors).length) return json({ error: "Check the highlighted fields", fields: errors }, 422);
  if (!["IN_PROGRESS","CORRECTION_REQUIRED","HOLD"].includes(current.workflow_status)) return json({ error: "This record is locked during or after QA" }, 409);
  const duplicate = await context.env.OPERATIONS_DB.prepare(`SELECT id FROM creator_enrollments
    WHERE campaign_id=? AND id<>? AND (LOWER(TRIM(handle))=? OR LOWER(TRIM(contact))=?) LIMIT 1`)
    .bind(current.campaign_id,id,normalizeCreatorIdentity(body.handle),normalizeCreatorIdentity(body.contact)).first();
  if (duplicate) return json({ error: `This creator already has campaign record ${duplicate.id}` }, 409);
  const now = new Date().toISOString();
  const payload = creatorPayload(id, body, user.id, now);
  const mutationId = uid("MUT");
  const update = context.env.OPERATIONS_DB.prepare(`UPDATE creator_enrollments SET creator_name=?,primary_platform=?,handle=?,contact=?,creator_status=?,compensation_model=?,rights_status=?,product_focus=?,notes=?,evidence_link=?,workflow_status='IN_PROGRESS',assigned_operator_id=?,last_updated=?,version=version+1,sync_status='PENDING_EXPORT',last_mutation_id=? WHERE id=? AND version=?`)
    .bind(body.creatorName.trim(),body.primaryPlatform,body.handle.trim(),body.contact.trim(),body.creatorStatus,body.compensationModel,body.rightsStatus,body.productFocus.trim(),body.notes?.trim()||null,body.evidenceLink?.trim()||null,current.assigned_operator_id||user.id,now,mutationId,id,body.version);
  const result = await context.env.OPERATIONS_DB.batch([
    update,
    conditionalCreatorAudit(context.env.OPERATIONS_DB,user,current.campaign_id,id,"CREATOR_ENROLLMENT_UPDATED",JSON.stringify(editValues(current,'CREATOR')),JSON.stringify(editValues(body,'CREATOR',true)),null,mutationId),
    conditionalCreatorOutbox(context.env.OPERATIONS_DB,user,"CREATOR",id,"UPSERT",JSON.stringify(payload),mutationId)
  ]);
  if (!result[0].meta.changes) return json({ error: "Record changed. Refresh and try again." }, 409);
  return json({ id, workflowStatus: "IN_PROGRESS", syncStatus: "PENDING_EXPORT" });
}

async function updateCreatorWorkflow(context, user, current, body) {
  if (!current.campaign_id) return json({ error: "Create a campaign assignment before changing this creator workflow" }, 422);
  if (!transitionAllowed(current.workflow_status, body.action, user.role)) return json({ error: "This status change is not authorized" }, 409);
  if (body.action === "AWAITING_QA") {
    const checks = qaChecklist(current);
    if (Object.values(checks).some((value) => !value)) return json({ error: "Complete the required evidence before QA", checklist: checks }, 422);
    const missingRights = await optionalRows(context.env.OPERATIONS_DB, "SELECT id FROM creator_assignments WHERE creator_id=? AND paid_usage_rights='Yes' AND (signed_rights_evidence_link IS NULL OR TRIM(signed_rights_evidence_link)='')", [current.id]);
    if (missingRights.length) return json({ error: "Signed rights evidence is required before QA", assignments: missingRights.map((row) => row.id) }, 422);
  }
  const mutationId = uid("MUT");
  const update = context.env.OPERATIONS_DB.prepare("UPDATE creator_enrollments SET workflow_status=?,assigned_operator_id=?,last_updated=CURRENT_TIMESTAMP,version=version+1,sync_status='PENDING_EXPORT',last_mutation_id=? WHERE id=? AND version=?")
    .bind(body.action,current.assigned_operator_id||user.id,mutationId,current.id,body.version);
  const payload = JSON.stringify({ id: current.id, campaignId: current.campaign_id, workflowStatus: body.action });
  const result = await context.env.OPERATIONS_DB.batch([
    update,
    conditionalCreatorAudit(context.env.OPERATIONS_DB,user,current.campaign_id,current.id,"WORKFLOW_STATUS_CHANGED",current.workflow_status,body.action,null,mutationId),
    conditionalCreatorOutbox(context.env.OPERATIONS_DB,user,"CREATOR",current.id,"WORKFLOW",payload,mutationId)
  ]);
  if (!result[0].meta.changes) return json({ error: "Record changed. Refresh and try again." }, 409);
  return json({ id: current.id, workflowStatus: body.action, syncStatus: "PENDING_EXPORT" });
}

async function createAssignment(context, user) {
  const blocked = await requireV2(context.env); if (blocked) return blocked;
  const body = await context.request.json();
  body.environment = "NONPRODUCTION";
  const permission=await authorizeFields(context.env.OPERATIONS_DB,user,'ASSIGNMENT',body);
  if(permission)return json({error:permission},403);
  const errors = validateAssignment(body);
  if (Object.keys(errors).length) return json({ error: "Check the highlighted assignment fields", fields: errors }, 422);
  const creator = await context.env.OPERATIONS_DB.prepare("SELECT id FROM creator_enrollments WHERE id=?").bind(body.creatorId).first();
  const campaign = await context.env.OPERATIONS_DB.prepare("SELECT id FROM campaigns WHERE id=?").bind(body.campaignId).first();
  if(creator && user.role!=='ADMINISTRATOR') {
    const source=await context.env.OPERATIONS_DB.prepare('SELECT campaign_id FROM creator_enrollments WHERE id=?').bind(body.creatorId).first();
    if(!await scoped(context.env.OPERATIONS_DB,user,source.campaign_id,body.creatorId))return json({error:'Assigned Creator ID access required'},403);
  }
  if (!creator || !campaign) return json({ error: "Choose an existing creator and campaign" }, 422);
  const duplicate = await context.env.OPERATIONS_DB.prepare("SELECT id FROM creator_assignments WHERE creator_id=? AND campaign_id=? AND status NOT IN ('Complete','Archived')").bind(body.creatorId,body.campaignId).first();
  if (duplicate) return json({ error: `Active assignment ${duplicate.id} already exists` }, 409);
  const ids = await context.env.OPERATIONS_DB.prepare("SELECT id FROM creator_assignments").all();
  const id = nextEntityId("ASG", ids.results.map((row) => row.id));
  const now = new Date().toISOString();
  const payload = assignmentPayload(id, body, user.id, now);
  const insert = context.env.OPERATIONS_DB.prepare(`INSERT INTO creator_assignments
    (id,environment,creator_id,campaign_id,status,start_date,content_due,fixed_content_fee,commission_rate,paid_usage_rights,attribution_window_days,evidence_status,notes,signed_rights_evidence_link,assigned_operator_id,last_updated,sync_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,"NONPRODUCTION",body.creatorId,body.campaignId,body.status,body.startDate||null,body.contentDue||null,Number(body.fixedContentFee||0),Number(body.commissionRate||0),body.paidUsageRights,Number(body.attributionWindowDays||30),body.evidenceStatus,body.notes?.trim()||null,body.signedRightsEvidenceLink?.trim()||null,user.id,now,"PENDING_EXPORT");
  await context.env.OPERATIONS_DB.batch([
    insert,
    auditInsert(context.env.OPERATIONS_DB,user,body.campaignId,id,"CREATOR_ASSIGNMENT_CREATED",null,body.status,"CreatorAssignment"),
    outboxInsert(context.env.OPERATIONS_DB,user,"ASSIGNMENT",id,"UPSERT",payload)
  ]);
  return json({ id, syncStatus: "PENDING_EXPORT" }, 201);
}

async function updateAssignment(context, user, id) {
  const blocked = await requireV2(context.env); if (blocked) return blocked;
  const current = await context.env.OPERATIONS_DB.prepare("SELECT * FROM creator_assignments WHERE id=?").bind(id).first();
  if (!current) return json({ error: "Assignment not found" }, 404);
  const body = await context.request.json();
  if((body.creatorId && body.creatorId!==current.creator_id)||(body.campaignId && body.campaignId!==current.campaign_id))return json({error:'Creator ID and Campaign ID are locked'},403);
  body.creatorId = current.creator_id;
  body.campaignId = current.campaign_id;
  if(body.environment&&body.environment!==current.environment)return json({error:'Environment is locked'},403);
  body.environment = current.environment;
  const permission=await authorizeFields(context.env.OPERATIONS_DB,user,'ASSIGNMENT',body,current);
  if(permission)return json({error:permission},403);
  const errors = validateAssignment(body);
  if (Object.keys(errors).length) return json({ error: "Check the highlighted assignment fields", fields: errors }, 422);
  const now = new Date().toISOString();
  const payload = assignmentPayload(id, body, user.id, now);
  const mutationId = uid("MUT");
  const update = context.env.OPERATIONS_DB.prepare(`UPDATE creator_assignments SET status=?,start_date=?,content_due=?,fixed_content_fee=?,commission_rate=?,paid_usage_rights=?,attribution_window_days=?,evidence_status=?,notes=?,signed_rights_evidence_link=?,assigned_operator_id=?,last_updated=?,version=version+1,sync_status='PENDING_EXPORT',last_mutation_id=? WHERE id=? AND version=?`)
    .bind(body.status,body.startDate||null,body.contentDue||null,Number(body.fixedContentFee||0),Number(body.commissionRate||0),body.paidUsageRights,Number(body.attributionWindowDays||30),body.evidenceStatus,body.notes?.trim()||null,body.signedRightsEvidenceLink?.trim()||null,current.assigned_operator_id||user.id,now,mutationId,id,body.version);
  const result = await context.env.OPERATIONS_DB.batch([
    update,
    conditionalAssignmentAudit(context.env.OPERATIONS_DB,user,current.campaign_id,id,"CREATOR_ASSIGNMENT_UPDATED",JSON.stringify(editValues(current,'ASSIGNMENT')),JSON.stringify(editValues(body,'ASSIGNMENT',true)),mutationId),
    conditionalAssignmentOutbox(context.env.OPERATIONS_DB,user,"ASSIGNMENT",id,"UPSERT",JSON.stringify(payload),mutationId)
  ]);
  if (!result[0].meta.changes) return json({ error: "Assignment changed. Refresh and try again." }, 409);
  return json({ id, syncStatus: "PENDING_EXPORT" });
}

async function reviewCreator(context, user, id) {
  const blocked = await requireV2(context.env); if (blocked) return blocked;
  if (!QA_ROLES.has(user.role)) return json({ error: "QA Reviewer authority required" }, 403);
  const current = await context.env.OPERATIONS_DB.prepare("SELECT * FROM creator_enrollments WHERE id=?").bind(id).first();
  if (!current) return json({ error: "Creator record not found" }, 404);
  const body = await context.request.json();
  if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['result','notes','version','saveIntent'].includes(key))||(body.saveIntent!==undefined&&body.saveIntent!=='REVIEWED_RECORD_EDIT'))return json({error:'QA may change only the authorized QA result and notes'},403);
  if (!transitionAllowed(current.workflow_status, body.result, user.role)) return json({ error: "Record is not awaiting QA" }, 409);
  if (!["PASS","HOLD","CORRECTION_REQUIRED"].includes(body.result)) return json({ error: "Choose PASS, HOLD, or CORRECTION REQUIRED" }, 422);
  if (body.result !== "PASS" && !String(body.notes ?? "").trim()) return json({ error: "Explain what must happen next" }, 422);
  const checklist = qaChecklist(current);
  if (body.result === "PASS" && Object.values(checklist).some((value) => !value)) return json({ error: "All QA checks must pass", checklist }, 422);
  const finalStatus = body.result === "PASS" ? "PASSED" : body.result;
  const mutationId = uid("MUT");
  const update = context.env.OPERATIONS_DB.prepare("UPDATE creator_enrollments SET workflow_status=?,last_updated=CURRENT_TIMESTAMP,version=version+1,sync_status='PENDING_EXPORT',last_mutation_id=? WHERE id=? AND version=?").bind(finalStatus,mutationId,id,body.version);
  const review = context.env.OPERATIONS_DB.prepare("INSERT INTO qa_reviews (id,enrollment_id,reviewer_id,result,checklist_json,notes) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM creator_enrollments WHERE id=? AND last_mutation_id=?)")
    .bind(uid("QA"),id,user.id,body.result,JSON.stringify(checklist),body.notes?.trim()||null,id,mutationId);
  const payload = JSON.stringify({ id, campaignId: current.campaign_id, workflowStatus: finalStatus, qaResult: body.result, qaNotes: body.notes?.trim()||null });
  const result = await context.env.OPERATIONS_DB.batch([
    update,
    review,
    conditionalCreatorAudit(context.env.OPERATIONS_DB,user,current.campaign_id,id,"QA_REVIEW_COMPLETED",current.workflow_status,body.result,body.result,mutationId),
    conditionalCreatorOutbox(context.env.OPERATIONS_DB,user,"CREATOR",id,"QA_RESULT",payload,mutationId)
  ]);
  if (!result[0].meta.changes) return json({ error: "Record changed. Refresh and try again." }, 409);
  return json({ id, result: body.result, syncStatus: "PENDING_EXPORT" });
}

async function audit({ env, request }, user) {
  if (!AUDIT_ROLES.has(user.role) && !canInspectAudit(user)) return json({ error: "Administrator authority required or explicit audit visibility" }, 403);
  return auditHistory({env,request},user);
}

async function systemStatus({ env }, user) {
  if (!AUDIT_ROLES.has(user.role)) return json({ error: "Administrator authority required" }, 403);
  const ready = await schemaReady(env);
  const counts = ready
    ? await env.OPERATIONS_DB.prepare("SELECT status,COUNT(*) count FROM control_system_outbox GROUP BY status").all()
    : { results: [] };
  return json({
    schemaReady: ready,
    syncConfigured: env.CONSOLE_ENVIRONMENT !== 'TRAINING' && Boolean(env.CONTROL_SYSTEM_SYNC_SECRET),
    sourceSystem: "PNB Acquisition & Launch Control System",
    outbound: Object.fromEntries(counts.results.map((row) => [row.status,row.count]))
  });
}

const creatorPayload = (id, body, operatorId, updatedAt) => ({
  id,
  campaignId: body.campaignId,
  creatorName: body.creatorName.trim(),
  primaryPlatform: body.primaryPlatform,
  handle: body.handle.trim(),
  contact: body.contact.trim(),
  creatorStatus: body.creatorStatus,
  compensationModel: body.compensationModel,
  rightsStatus: body.rightsStatus,
  productFocus: body.productFocus.trim(),
  notes: body.notes?.trim() || null,
  evidenceLink: body.evidenceLink?.trim() || null,
  operatorId,
  updatedAt
});
const assignmentPayload = (id, body, operatorId, updatedAt) => ({
  id,
  environment: body.environment || "NONPRODUCTION",
  creatorId: body.creatorId,
  campaignId: body.campaignId,
  status: body.status,
  startDate: body.startDate || null,
  contentDue: body.contentDue || null,
  fixedContentFee: Number(body.fixedContentFee || 0),
  commissionRate: Number(body.commissionRate || 0),
  paidUsageRights: body.paidUsageRights,
  attributionWindowDays: Number(body.attributionWindowDays || 30),
  evidenceStatus: body.evidenceStatus,
  notes: body.notes?.trim() || null,
  signedRightsEvidenceLink: body.signedRightsEvidenceLink?.trim() || null,
  operatorId,
  updatedAt
});
const auditInsert = (db,user,campaignId,id,action,previousValue,newValue,objectType="CreatorEnrollment") =>
  db.prepare("INSERT INTO audit_events (id,operator_id,campaign_id,action,object_type,object_id,previous_value,new_value) VALUES (?,?,?,?,?,?,?,?)")
    .bind(uid("AUD"),user.id,campaignId,action,objectType,id,previousValue,newValue);
const outboxInsert = (db,user,entityType,entityId,action,payload) => {
  const id = uid("SYNC");
  return db.prepare("INSERT INTO control_system_outbox (id,idempotency_key,operator_id,entity_type,entity_id,action,payload_json) VALUES (?,?,?,?,?,?,?)")
    .bind(id,id,user.id,entityType,entityId,action,JSON.stringify(payload));
};
const conditionalCreatorAudit = (db,user,campaignId,id,action,previousValue,newValue,qaEvent,mutationId) =>
  db.prepare("INSERT INTO audit_events (id,operator_id,campaign_id,action,object_type,object_id,previous_value,new_value,qa_event) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM creator_enrollments WHERE id=? AND last_mutation_id=?)")
    .bind(uid("AUD"),user.id,campaignId,action,"CreatorEnrollment",id,String(previousValue),String(newValue),qaEvent,id,mutationId);
const conditionalCreatorOutbox = (db,user,entityType,id,action,payload,mutationId) => {
  const syncId = uid("SYNC");
  return db.prepare("INSERT INTO control_system_outbox (id,idempotency_key,operator_id,entity_type,entity_id,action,payload_json) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM creator_enrollments WHERE id=? AND last_mutation_id=?)")
    .bind(syncId,syncId,user.id,entityType,id,action,payload,id,mutationId);
};
const conditionalAssignmentAudit = (db,user,campaignId,id,action,previousValue,newValue,mutationId) =>
  db.prepare("INSERT INTO audit_events (id,operator_id,campaign_id,action,object_type,object_id,previous_value,new_value) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM creator_assignments WHERE id=? AND last_mutation_id=?)")
    .bind(uid("AUD"),user.id,campaignId,action,"CreatorAssignment",id,String(previousValue),String(newValue),id,mutationId);
const conditionalAssignmentOutbox = (db,user,entityType,id,action,payload,mutationId) => {
  const syncId = uid("SYNC");
  return db.prepare("INSERT INTO control_system_outbox (id,idempotency_key,operator_id,entity_type,entity_id,action,payload_json) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM creator_assignments WHERE id=? AND last_mutation_id=?)")
    .bind(syncId,syncId,user.id,entityType,id,action,payload,id,mutationId);
};


export async function onRequest(context) {
  if (!context.env.OPERATIONS_DB) return json({error:'Operations database is not configured'},503);
  // Fence isolation before actor lookup, bootstrap, or activity writes.
  if(context.env.CONSOLE_ENVIRONMENT!==undefined&&!['TRAINING','PRODUCTION'].includes(context.env.CONSOLE_ENVIRONMENT))return json({error:'Invalid Console environment'},503);
  if(context.env.CONSOLE_ENVIRONMENT==='TRAINING'&&!admissionConfiguration(context.env))return json({error:'Verified isolated training configuration is pending'},503);
  if (context.request.method !== 'GET' && !sameOrigin(context.request)) return json({error:'Origin rejected'},403);
  const user=await actor(context);
  if(!user)return json(context.data.reauthenticate?{error:'Your access changed. Sign out and authenticate again at '+(context.env.CONSOLE_ENVIRONMENT==='TRAINING'?'creatorloop-operator-training.pages.dev':'ops.creatorloop.net')+'.',code:'REAUTHENTICATE'}:{error:'Authorized operator account required'},403);
  context.data.requestPermission=user;
  const parts=pathParts(context), db=context.env.OPERATIONS_DB;
  let campaignId=params(context.request).get('campaignId');
  let creatorId=null;
  if(['dashboard','queues'].includes(parts[0]))campaignId ||= 'CMP-100';
  if(parts[0]==='campaigns' && parts[1])campaignId=parts[1];
  if(['creators','qa','assignments'].includes(parts[0]) && parts[1]) {
    const table=parts[0]==='assignments'?'creator_assignments':'creator_enrollments';
    const row=await db.prepare('SELECT * FROM '+table+' WHERE id=?').bind(parts[1]).first();
    if(row){campaignId=row.campaign_id;creatorId=table==='creator_enrollments'?row.id:row.creator_id;}
  }
  if(context.request.method==='POST' && ['creators','assignments'].includes(parts[0]) && !parts[1]) {
    const migration=await requireV2(context.env);if(migration)return migration;
    const body=await context.request.clone().json();campaignId=body.campaignId;creatorId=body.creatorId||null;
    if(parts[0]==='creators' && user.role!=='ADMINISTRATOR') {
      let grant=null;
      try {grant=await db.prepare("SELECT 1 FROM console_access_grants WHERE operator_id=? AND campaign_id=? AND record_id='*'").bind(user.id,campaignId).first();}catch{}
      if(!grant)return json({error:'Campaign assignment is required to create a creator record'},403);
    }
  }
  if(campaignId && !await scoped(db,user,campaignId,creatorId))return json({error:'Assigned campaign or record access required'},403);
  if(campaignId&&context.request.method!=='GET')context.data.commitScope={campaignId,creatorId,wholeCampaign:parts[0]==='creators'&&!parts[1]&&context.request.method==='POST'};
  const response=await dispatchRequest(context);
  if(context.request.method!=='GET' || !response.ok || user.role==='ADMINISTRATOR')return response;
  const data=await response.json();
  if(data.campaigns)data.campaigns=await scopedRows(db,user,data.campaigns,'CAMPAIGN');
  if(data.campaign)data.campaign=project(data.campaign,'CAMPAIGN',user);
  if(data.creators)data.creators=await scopedRows(db,user,data.creators,'CREATOR');
  if(data.creator)data.creator=project(data.creator,'CREATOR',user);
  if(data.assignments)data.assignments=await scopedRows(db,user,data.assignments,'ASSIGNMENT');
  if(data.creatives)data.creatives=await scopedRows(db,user,data.creatives,'CREATIVE');
  if(data.counts) {
    const all=(await db.prepare('SELECT * FROM creator_enrollments WHERE campaign_id=?').bind(campaignId).all()).results;
    const visible=await scopedRows(db,user,all,'CREATOR');data.counts={};
    for(const row of visible)data.counts[row.workflow_status]=(data.counts[row.workflow_status]||0)+1;
  }
  if(data.system) delete data.system.syncConfigured;
  return json(data);
}
