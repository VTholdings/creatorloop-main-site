import { nextCreatorId, qaChecklist, QA_ROLES, transitionAllowed, validateEnrollment } from "../console-core.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const uid = (prefix) => `${prefix}-${crypto.randomUUID()}`;

async function actor(context) {
  const email = context.data.loginEmail;
  let user = await context.env.OPERATIONS_DB.prepare("SELECT * FROM operators WHERE login_email = ?").bind(email).first();
  const bootstrap = context.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!user && bootstrap && email === bootstrap) {
    const id = uid("OP");
    await context.env.OPERATIONS_DB.prepare("INSERT INTO operators (id,login_email,display_name,role,account_status,last_activity_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)")
      .bind(id, email, "Project Owner", "ADMINISTRATOR", "ACTIVE").run();
    user = await context.env.OPERATIONS_DB.prepare("SELECT * FROM operators WHERE id = ?").bind(id).first();
  }
  if (!user || user.account_status !== "ACTIVE") return null;
  await context.env.OPERATIONS_DB.prepare("UPDATE operators SET last_activity_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
  return user;
}

function pathParts(context) { return (context.params.path ?? []).filter(Boolean); }
function assertSameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequest(context) {
  if (!context.env.OPERATIONS_DB) return json({ error: "Operations database is not configured" }, 503);
  if (context.request.method !== "GET" && !assertSameOrigin(context.request)) return json({ error: "Origin rejected" }, 403);
  const user = await actor(context);
  if (!user) return json({ error: "Authorized operator account required" }, 403);
  const parts = pathParts(context);
  try {
    if (context.request.method === "GET" && parts[0] === "me") return json({ user: safeUser(user) });
    if (context.request.method === "GET" && parts[0] === "dashboard") return dashboard(context, user);
    if (context.request.method === "GET" && parts[0] === "creators" && !parts[1]) return listCreators(context);
    if (context.request.method === "POST" && parts[0] === "creators" && !parts[1]) return createCreator(context, user);
    if (context.request.method === "GET" && parts[0] === "creators" && parts[1]) return getCreator(context, parts[1]);
    if (context.request.method === "PATCH" && parts[0] === "creators" && parts[1]) return updateCreator(context, user, parts[1]);
    if (context.request.method === "POST" && parts[0] === "qa" && parts[1]) return reviewCreator(context, user, parts[1]);
    if (context.request.method === "GET" && parts[0] === "audit") return audit(context);
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Console request failed", { path: parts.join("/"), kind: error?.constructor?.name });
    return json({ error: "The request could not be completed" }, 500);
  }
}

const safeUser = (user) => ({ id: user.id, displayName: user.display_name, role: user.role, accountStatus: user.account_status, loginIdentity: user.login_email, lastActivityAt: user.last_activity_at });

async function dashboard({ env }, user) {
  const campaign = await env.OPERATIONS_DB.prepare("SELECT * FROM campaigns WHERE id='CMP-100'").first();
  const counts = await env.OPERATIONS_DB.prepare("SELECT workflow_status status, COUNT(*) count FROM creator_enrollments WHERE campaign_id=? GROUP BY workflow_status").bind(campaign.id).all();
  return json({ user: safeUser(user), campaign, counts: Object.fromEntries(counts.results.map((row) => [row.status, row.count])), nextAction: QA_ROLES.has(user.role) ? "Review work awaiting QA" : "Start or correct a creator enrollment" });
}

async function listCreators({ env }) {
  const rows = await env.OPERATIONS_DB.prepare("SELECT * FROM creator_enrollments WHERE campaign_id='CMP-100' ORDER BY CAST(SUBSTR(id,4) AS INTEGER)").all();
  return json({ creators: rows.results });
}

async function getCreator({ env }, id) {
  const creator = await env.OPERATIONS_DB.prepare("SELECT * FROM creator_enrollments WHERE id=?").bind(id).first();
  if (!creator) return json({ error: "Creator record not found" }, 404);
  const reviews = await env.OPERATIONS_DB.prepare("SELECT q.*, o.display_name reviewer_name, o.role reviewer_role FROM qa_reviews q JOIN operators o ON o.id=q.reviewer_id WHERE q.enrollment_id=? ORDER BY q.created_at DESC").bind(id).all();
  return json({ creator, checklist: qaChecklist(creator), reviews: reviews.results });
}

async function createCreator(context, user) {
  const body = await context.request.json();
  const errors = validateEnrollment(body);
  if (Object.keys(errors).length) return json({ error: "Check the highlighted fields", fields: errors }, 422);
  const ids = await context.env.OPERATIONS_DB.prepare("SELECT id FROM creator_enrollments").all();
  const id = nextCreatorId(ids.results.map((row) => row.id));
  const now = new Date().toISOString();
  const enrollment = context.env.OPERATIONS_DB.prepare(`INSERT INTO creator_enrollments
    (id,campaign_id,creator_name,primary_platform,handle,contact,creator_status,compensation_model,rights_status,product_focus,notes,evidence_link,workflow_status,assigned_operator_id,enrollment_date,last_updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,"CMP-100",body.creatorName.trim(),body.primaryPlatform,body.handle.trim(),body.contact.trim(),body.creatorStatus,body.compensationModel,body.rightsStatus,body.productFocus.trim(),body.notes?.trim()||null,body.evidenceLink?.trim()||null,"IN_PROGRESS",user.id,now,now);
  const event = context.env.OPERATIONS_DB.prepare("INSERT INTO audit_events (id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES (?,?,?,?,?,?,?)")
    .bind(uid("AUD"),user.id,"CMP-100","CREATOR_ENROLLMENT_CREATED","CreatorEnrollment",id,JSON.stringify({ workflowStatus:"IN_PROGRESS" }));
  await context.env.OPERATIONS_DB.batch([enrollment,event]);
  return json({ id, workflowStatus: "IN_PROGRESS" }, 201);
}

async function updateCreator(context, user, id) {
  const current = await context.env.OPERATIONS_DB.prepare("SELECT * FROM creator_enrollments WHERE id=?").bind(id).first();
  if (!current) return json({ error: "Creator record not found" }, 404);
  const body = await context.request.json();
  if (body.action) {
    if (!transitionAllowed(current.workflow_status, body.action, user.role)) return json({ error: "This status change is not authorized" }, 409);
    if (body.action === "AWAITING_QA") {
      const checks = qaChecklist(current);
      if (Object.values(checks).some((value) => !value)) return json({ error: "Complete the required evidence before QA", checklist: checks }, 422);
    }
    const updated = context.env.OPERATIONS_DB.prepare("UPDATE creator_enrollments SET workflow_status=?,assigned_operator_id=?,last_updated=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND version=?")
      .bind(body.action,user.id,id,body.version);
    const event = auditStatement(context.env.OPERATIONS_DB,user,id,"WORKFLOW_STATUS_CHANGED",current.workflow_status,body.action,null,body.version+1);
    const result = await context.env.OPERATIONS_DB.batch([updated,event]);
    if (!result[0].meta.changes) return json({ error: "Record changed. Refresh and try again." }, 409);
    return json({ id, workflowStatus: body.action });
  }
  const errors = validateEnrollment(body);
  if (Object.keys(errors).length) return json({ error: "Check the highlighted fields", fields: errors }, 422);
  if (!['IN_PROGRESS','CORRECTION_REQUIRED','HOLD'].includes(current.workflow_status)) return json({ error: "This record is locked during or after QA" }, 409);
  const statement = context.env.OPERATIONS_DB.prepare(`UPDATE creator_enrollments SET creator_name=?,primary_platform=?,handle=?,contact=?,creator_status=?,compensation_model=?,rights_status=?,product_focus=?,notes=?,evidence_link=?,workflow_status='IN_PROGRESS',assigned_operator_id=?,last_updated=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND version=?`)
    .bind(body.creatorName.trim(),body.primaryPlatform,body.handle.trim(),body.contact.trim(),body.creatorStatus,body.compensationModel,body.rightsStatus,body.productFocus.trim(),body.notes?.trim()||null,body.evidenceLink?.trim()||null,user.id,id,body.version);
  const event = auditStatement(context.env.OPERATIONS_DB,user,id,"CREATOR_ENROLLMENT_UPDATED",current.workflow_status,"IN_PROGRESS",null,body.version+1);
  const result = await context.env.OPERATIONS_DB.batch([statement,event]);
  if (!result[0].meta.changes) return json({ error: "Record changed. Refresh and try again." }, 409);
  return json({ id, workflowStatus: "IN_PROGRESS" });
}

async function reviewCreator(context, user, id) {
  if (!QA_ROLES.has(user.role)) return json({ error: "QA Reviewer authority required" }, 403);
  const current = await context.env.OPERATIONS_DB.prepare("SELECT * FROM creator_enrollments WHERE id=?").bind(id).first();
  if (!current) return json({ error: "Creator record not found" }, 404);
  const body = await context.request.json();
  if (!transitionAllowed(current.workflow_status, body.result, user.role)) return json({ error: "Record is not awaiting QA" }, 409);
  if (!['PASS','HOLD','CORRECTION_REQUIRED'].includes(body.result)) return json({ error: "Choose PASS, HOLD, or CORRECTION REQUIRED" }, 422);
  if (body.result !== 'PASS' && !String(body.notes??'').trim()) return json({ error: "Explain what must happen next" }, 422);
  const checklist = qaChecklist(current);
  if (body.result === 'PASS' && Object.values(checklist).some((value) => !value)) return json({ error: "All QA checks must pass", checklist }, 422);
  const review = context.env.OPERATIONS_DB.prepare("INSERT INTO qa_reviews (id,enrollment_id,reviewer_id,result,checklist_json,notes) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM creator_enrollments WHERE id=? AND version=?)")
    .bind(uid("QA"),id,user.id,body.result,JSON.stringify(checklist),body.notes?.trim()||null,id,body.version+1);
  const update = context.env.OPERATIONS_DB.prepare("UPDATE creator_enrollments SET workflow_status=?,last_updated=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND version=?")
    .bind(body.result === "PASS" ? "PASSED" : body.result,id,body.version);
  const event = auditStatement(context.env.OPERATIONS_DB,user,id,"QA_REVIEW_COMPLETED",current.workflow_status,body.result,body.result,body.version+1);
  const result = await context.env.OPERATIONS_DB.batch([update,review,event]);
  if (!result[0].meta.changes) return json({ error: "Record changed. Refresh and try again." }, 409);
  return json({ id, result: body.result });
}

async function audit({ env }) {
  const events = await env.OPERATIONS_DB.prepare("SELECT a.*,o.display_name operator_name,o.role operator_role FROM audit_events a JOIN operators o ON o.id=a.operator_id WHERE a.campaign_id='CMP-100' ORDER BY a.created_at DESC LIMIT 100").all();
  return json({ events: events.results });
}

function auditStatement(db,user,id,action,previousValue,newValue,qaEvent,committedVersion) {
  return db.prepare("INSERT INTO audit_events (id,operator_id,campaign_id,action,object_type,object_id,previous_value,new_value,qa_event) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM creator_enrollments WHERE id=? AND version=?)")
    .bind(uid("AUD"),user.id,"CMP-100",action,"CreatorEnrollment",id,String(previousValue),String(newValue),qaEvent,id,committedVersion);
}
