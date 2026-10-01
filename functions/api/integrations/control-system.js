const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function verify(request, secret, rawBody = "") {
  if (!secret) {
    console.error("Control-system authentication unavailable", { reason: "CONTROL_SYSTEM_SYNC_SECRET is not bound" });
    return false;
  }
  const timestamp = request.headers.get("X-CreatorLoop-Timestamp") || "";
  const signature = (request.headers.get("X-CreatorLoop-Signature") || "").toLowerCase();
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > 300000) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

export async function onRequest(context) {
  if (!context.env.OPERATIONS_DB) return json({ error: "Database unavailable" }, 503);
  const rawBody = context.request.method === "POST" ? await context.request.text() : "";
  if (!(await verify(context.request, context.env.CONTROL_SYSTEM_SYNC_SECRET, rawBody))) {
    return json({ error: "Signed control-system request required" }, 401);
  }
  try {
    if (context.request.method === "GET") return exportPending(context.env.OPERATIONS_DB);
    if (context.request.method === "POST") {
      const payload = JSON.parse(rawBody || "{}");
      if (payload.mode === "ack") return acknowledge(context.env.OPERATIONS_DB, payload);
      if (payload.mode === "import") return importSnapshot(context.env.OPERATIONS_DB, payload);
      return json({ error: "Unsupported sync mode" }, 422);
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Control-system sync failed", { kind: error?.constructor?.name });
    return json({ error: "Sync request failed" }, 500);
  }
}

async function exportPending(db) {
  const rows = await db.prepare("SELECT id,idempotency_key,entity_type,entity_id,action,payload_json,created_at FROM control_system_outbox WHERE status IN ('PENDING','FAILED','EXPORTED') ORDER BY created_at,rowid LIMIT 100").all();
  if (rows.results.length) {
    await db.batch(rows.results.map((row) =>
      db.prepare("UPDATE control_system_outbox SET status='EXPORTED',attempt_count=attempt_count+1,exported_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?").bind(row.id)
    ));
  }
  return json({ changes: rows.results.map((row) => ({ ...row, payload: JSON.parse(row.payload_json) })) });
}

async function acknowledge(db, payload) {
  const ids = Array.isArray(payload.ids) ? [...new Set(payload.ids.filter((id) => typeof id === "string"))] : [];
  if (!ids.length) return json({ error: "At least one outbox id is required" }, 422);
  await db.batch(ids.map((id) =>
    db.prepare("UPDATE control_system_outbox SET status='ACKNOWLEDGED',acknowledged_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=? AND status IN ('EXPORTED','PENDING')").bind(id)
  ));
  return json({ acknowledged: ids.length });
}

async function importSnapshot(db, payload) {
  const eventId = String(payload.eventId || "");
  const sourceVersion = String(payload.sourceVersion || "");
  if (!eventId || !sourceVersion) return json({ error: "eventId and sourceVersion are required" }, 422);
  const existing = await db.prepare("SELECT status FROM control_system_imports WHERE event_id=?").bind(eventId).first();
  if (existing) return json({ eventId, status: existing.status, replay: true });
  const digest = hex(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(payload))));
  const collections = ["campaigns","creators","assignments","creatives"];
  const count = collections.reduce((sum, key) => sum + (Array.isArray(payload[key]) ? payload[key].length : 0), 0);
  await db.prepare("INSERT INTO control_system_imports (event_id,source_version,payload_hash,record_count,status) VALUES (?,?,?,?,?)")
    .bind(eventId,sourceVersion,digest,count,"PROCESSING").run();
  try {
    const statements = [];
    for (const row of payload.campaigns || []) statements.push(upsertCampaign(db,row,sourceVersion));
    for (const row of payload.creators || []) statements.push(upsertCreator(db,row,sourceVersion));
    for (const row of payload.assignments || []) statements.push(upsertAssignment(db,row,sourceVersion));
    for (const row of payload.creatives || []) statements.push(upsertCreative(db,row,sourceVersion));
    if (statements.length) await db.batch(statements);
    await db.prepare("UPDATE control_system_imports SET status='APPLIED',applied_at=CURRENT_TIMESTAMP WHERE event_id=?").bind(eventId).run();
    return json({ eventId, status: "APPLIED", records: count });
  } catch (error) {
    await db.prepare("UPDATE control_system_imports SET status='FAILED',error_message=? WHERE event_id=?")
      .bind(String(error?.message || "Import failed").slice(0,500),eventId).run();
    throw error;
  }
}

const newer = "excluded.source_updated_at >= COALESCE(source_updated_at,'')";
const upsertCampaign = (db,row,version) => db.prepare(`INSERT INTO campaigns
  (id,name,brand_code,status,source_reference,platform,objective,slug,cash_budget,promo_credit,start_date,end_date,owner_name,product_scope,notes,source_updated_at,source_version)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,brand_code=excluded.brand_code,status=excluded.status,source_reference=excluded.source_reference,platform=excluded.platform,objective=excluded.objective,slug=excluded.slug,cash_budget=excluded.cash_budget,promo_credit=excluded.promo_credit,start_date=excluded.start_date,end_date=excluded.end_date,owner_name=excluded.owner_name,product_scope=excluded.product_scope,notes=excluded.notes,source_updated_at=excluded.source_updated_at,source_version=excluded.source_version
  WHERE ${newer}`).bind(row.id,row.name,row.brandCode||"CL",row.status,row.sourceReference||"Control System / CAMPAIGNS",row.platform||null,row.objective||null,row.slug||null,Number(row.cashBudget||0),Number(row.promoCredit||0),row.startDate||null,row.endDate||null,row.owner||null,row.productScope||null,row.notes||null,row.sourceUpdatedAt||new Date().toISOString(),version);

const upsertCreator = (db,row,version) => db.prepare(`INSERT INTO creator_enrollments
  (id,campaign_id,creator_name,primary_platform,handle,contact,creator_status,compensation_model,rights_status,product_focus,notes,evidence_link,workflow_status,enrollment_date,last_updated,source_record,sync_status,source_updated_at,source_version)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET campaign_id=excluded.campaign_id,creator_name=excluded.creator_name,primary_platform=excluded.primary_platform,handle=excluded.handle,contact=excluded.contact,creator_status=excluded.creator_status,compensation_model=excluded.compensation_model,rights_status=excluded.rights_status,product_focus=excluded.product_focus,notes=excluded.notes,evidence_link=excluded.evidence_link,source_record=excluded.source_record,last_updated=excluded.last_updated,sync_status='SYNCED',source_updated_at=excluded.source_updated_at,source_version=excluded.source_version
  WHERE ${newer} AND NOT EXISTS (SELECT 1 FROM control_system_outbox o WHERE o.entity_type='CREATOR' AND o.entity_id=excluded.id AND o.status IN ('PENDING','EXPORTED','FAILED'))`).bind(row.id,row.campaignId||null,row.creatorName,row.primaryPlatform||"",row.handle||"",row.contact||"",row.creatorStatus||"",row.compensationModel||"",row.rightsStatus||"",row.productFocus||"",row.notes||null,row.evidenceLink||null,row.workflowStatus||"AVAILABLE",row.enrollmentDate||new Date().toISOString(),row.sourceUpdatedAt||new Date().toISOString(),row.sourceRecord||"Control System / CREATORS","SYNCED",row.sourceUpdatedAt||new Date().toISOString(),version);

const upsertAssignment = (db,row,version) => db.prepare(`INSERT INTO creator_assignments
  (id,environment,creator_id,campaign_id,status,start_date,content_due,fixed_content_fee,commission_rate,paid_usage_rights,attribution_window_days,evidence_status,notes,signed_rights_evidence_link,last_updated,sync_status,source_updated_at,source_version)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET environment=excluded.environment,creator_id=excluded.creator_id,campaign_id=excluded.campaign_id,status=excluded.status,start_date=excluded.start_date,content_due=excluded.content_due,fixed_content_fee=excluded.fixed_content_fee,commission_rate=excluded.commission_rate,paid_usage_rights=excluded.paid_usage_rights,attribution_window_days=excluded.attribution_window_days,evidence_status=excluded.evidence_status,notes=excluded.notes,signed_rights_evidence_link=excluded.signed_rights_evidence_link,last_updated=excluded.last_updated,sync_status='SYNCED',source_updated_at=excluded.source_updated_at,source_version=excluded.source_version
  WHERE ${newer} AND NOT EXISTS (SELECT 1 FROM control_system_outbox o WHERE o.entity_type='ASSIGNMENT' AND o.entity_id=excluded.id AND o.status IN ('PENDING','EXPORTED','FAILED'))`).bind(row.id,row.environment||"NONPRODUCTION",row.creatorId,row.campaignId,row.status,row.startDate||null,row.contentDue||null,Number(row.fixedContentFee||0),Number(row.commissionRate||0),row.paidUsageRights||"Pending",Number(row.attributionWindowDays||30),row.evidenceStatus||"Planned",row.notes||null,row.signedRightsEvidenceLink||null,row.sourceUpdatedAt||new Date().toISOString(),"SYNCED",row.sourceUpdatedAt||new Date().toISOString(),version);

const upsertCreative = (db,row,version) => db.prepare(`INSERT INTO creatives
  (id,creative_name,creator_id,campaign_id,product,angle,format,platform,rights_status,approval_status,destination_url,evidence_link,created_date,last_updated,sync_status,source_updated_at,source_version)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET creative_name=excluded.creative_name,creator_id=excluded.creator_id,campaign_id=excluded.campaign_id,product=excluded.product,angle=excluded.angle,format=excluded.format,platform=excluded.platform,rights_status=excluded.rights_status,approval_status=excluded.approval_status,destination_url=excluded.destination_url,evidence_link=excluded.evidence_link,last_updated=excluded.last_updated,sync_status='SYNCED',source_updated_at=excluded.source_updated_at,source_version=excluded.source_version
  WHERE ${newer} AND NOT EXISTS (SELECT 1 FROM control_system_outbox o WHERE o.entity_type='CREATIVE' AND o.entity_id=excluded.id AND o.status IN ('PENDING','EXPORTED','FAILED'))`).bind(row.id,row.creativeName,row.creatorId,row.campaignId,row.product,row.angle||null,row.format,row.platform,row.rightsStatus,row.approvalStatus,row.destinationUrl||null,row.evidenceLink||null,row.createdDate||null,row.sourceUpdatedAt||new Date().toISOString(),"SYNCED",row.sourceUpdatedAt||new Date().toISOString(),version);
