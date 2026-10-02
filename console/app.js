const api = async (path, options = {}) => {
  const response = await fetch("/api/console/" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({ error: "Unexpected response" }));
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed"), { body, status: response.status });
  return body;
};

const state = { dashboard: null, campaigns: [], creators: [], assignments: [], current: null, currentCampaign: null, queues: null };
const $ = (selector) => document.querySelector(selector);
const esc = (value = "") => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));
const optionList = (values,current) => (current && !values.includes(current) ? [current,...values] : values).map((value) =>
  '<option ' + (value === current ? "selected" : "") + '>' + esc(value) + '</option>'
).join("");
const campaignLabel = (campaign) => campaign.id + " · " + campaign.name;
const dateInput = (value) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value || "") ? value.slice(0,10) : "";
const campaignOptions = (current) => state.campaigns.map((campaign) =>
  '<option value="' + esc(campaign.id) + '" ' + (campaign.id === current ? "selected" : "") + '>' + esc(campaignLabel(campaign)) + '</option>'
).join("");
const notice = (message,error = false) => {
  const element = $("#notice");
  element.textContent = message;
  element.className = "notice" + (error ? " error" : "");
  element.hidden = false;
  setTimeout(() => { element.hidden = true; },6000);
};

async function start() {
  try {
    state.campaigns = (await api("campaigns")).campaigns;
    const initial = state.campaigns.find((campaign) => campaign.id === "CMP-100") || state.campaigns[0];
    if (!initial) throw new Error("No campaign records are available");
    await loadCampaign(initial.id);
    renderAll();
    $("#loading").hidden = true;
    $("#app").hidden = false;
  } catch (error) {
    $("#loading").innerHTML = '<div class="loop-mark">∞</div><h1>Access locked</h1><p>' + esc(error.message) + '</p>';
  }
}

async function loadCampaign(id) {
  state.dashboard = await api("dashboard?campaignId=" + encodeURIComponent(id));
  state.creators = (await api("creators?campaignId=" + encodeURIComponent(id))).creators;
  state.assignments = (await api("campaigns/" + encodeURIComponent(id))).assignments || [];
  state.queues = await api('queues?campaignId='+encodeURIComponent(id)).catch(error=>({stages:[],missingSources:['Operational queue synchronization'],error:error.message}));
  state.current = null;
  state.currentCampaign = null;
}

function renderAll() {
  renderChrome();
  renderHome();
  bindEscalationForm();
  renderCampaigns();
  renderWork();
}

function renderChrome() {
  const user = state.dashboard.user;
  const campaign = state.dashboard.campaign;
  $("#operator-name").textContent = user.displayName;
  $("#operator-role").textContent = user.role.replaceAll("_"," ");
  $("#operator-id").textContent = user.id;
  $("#operator-login").textContent = user.loginIdentity || "Login identity unavailable";
  $("#campaign-name").textContent = campaignLabel(campaign);
  document.querySelectorAll(".admin-only").forEach((element) => { element.hidden = !user.canViewAudit; });
}

function total() {
  const keys = Array.from(arguments);
  return keys.reduce((sum,key) => sum + (state.dashboard.counts[key] || 0),0);
}

function renderHome() {
  const data = state.dashboard;
  const today = operatingDate();
  const queue = dailyWork(state.creators, state.assignments, data.user, today);
  $("#home-view").innerHTML =
    (data.system.training ? '<div class="notice error persistent"><strong>TRAINING — FICTIONAL DATA</strong><p>Practice only. This isolated environment cannot synchronize with the PNB Acquisition &amp; Launch Control System. No real payment, compensation change, advertising delivery, or campaign launch is authorized.</p></div>' : '') +
    '<div class="hero"><span class="eyebrow">OPERATOR HOME</span>' +
    '<h1>What do I need<br><em>to do today?</em></h1>' +
    '<p>Open the record below. Check the facts and proof. Send completed creator work to QA. Escalate decisions outside your role.</p>' +
    '<div class="identity-callout"><strong>' + esc(data.campaign.id) + '</strong><span>' + esc(data.campaign.name) + '</span></div>' +
    '<button class="action" data-go="work">Open creator work</button></div>' +
    (!data.system.schemaReady ? '<div class="notice error persistent">V2 database migration is pending. Browsing remains available; record changes are locked.</div>' : "") +
    (!data.system.training && /TEST\s*\/\s*FICTIONAL|certification/i.test(data.campaign.notes || "") ? '<div class="panel"><strong>Certification data</strong><p>This campaign contains fictional certification records. Practice only in the separately designated hosted training environment. These records do not authorize payment, paid use, or launch.</p></div>' : "") +
    '<div class="section-head"><div><h2>Today’s creator work</h2><p>' + esc(today) + ' · Pacific/Honolulu · Selected campaign. Only records authorized for your identity are shown.</p></div></div>' +
    dailyWorkCards(queue.actionable, 'No actionable creator records or dated assignments are currently shown. Other workflow checks below still apply.') +
    (queue.waiting.length ? '<div class="section-head"><div><h2>Waiting for QA</h2><p>An authorized reviewer makes the decision.</p></div></div>' + dailyWorkCards(queue.waiting, '') : '') +
    '<div class="panel"><h2>Source checks</h2><p>Submissions require a verified source and assigned campaign. Missing source queues remain unavailable until the bound Apps Script update and signed import are verified.</p><p>DECISIONS &amp; BLOCKERS, LAUNCH CONTROL, DATA INTAKE, monitoring, and closeout use the operational workflow below. An empty queue does not mean the campaign is clear to launch.</p><p><strong>QA PASS is not Owner Approval.</strong> Verify the required launch gates and explicit approval before any live use or spend.</p></div>' +
    operationalQueueCards() + operatorWorkflowGuide() +
    '<div class="system-strip"><span><b>SYSTEM OF RECORD</b>' + esc(data.system.systemOfRecord) + '</span>' +
    '<span><b>CONTROL SYSTEM</b>' + esc(data.system.controlSystem) + '</span>' +
    '<span><b>SYNC BRIDGE</b>' + (data.system.training ? 'Production synchronization disabled' : data.system.syncConfigured ? "Configured" : "Activation pending") + '</span></div>' +
    '<div class="section-head"><div><h2>Work status</h2><p>Live D1 counts for ' + esc(campaignLabel(data.campaign)) + '.</p></div></div>' +
    '<div class="status-grid"><div class="status-card ready"><small>READY</small><strong>' + total("AVAILABLE") + '</strong></div>' +
    '<div class="status-card progress"><small>IN PROGRESS</small><strong>' + total("IN_PROGRESS") + '</strong></div>' +
    '<div class="status-card blocked"><small>BLOCKED / CORRECTION</small><strong>' + total("HOLD","CORRECTION_REQUIRED") + '</strong></div>' +
    '<div class="status-card qa"><small>AWAITING QA</small><strong>' + total("AWAITING_QA") + '</strong></div>' +
    '<div class="status-card passed"><small>PASSED</small><strong>' + total("PASSED") + '</strong></div></div>' +
    '<div class="section-head"><div><h2>CAMPAIGNS · Status</h2><p>' + esc(data.campaign.status.replaceAll("_", " ")) + '. Campaign Status is separate from Launch Status in LAUNCH CONTROL.</p></div><button class="action secondary" data-go="campaigns">Open campaign</button></div>';
}

// The connected PNB source workbook uses Pacific/Honolulu calendar dates.
function operatingDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return value("year") + "-" + value("month") + "-" + value("day");
}

function dailyWork(creators, assignments, user, today) {
  const actionable = [], waiting = [];
  const canReview = ["OPERATIONS", "QA_REVIEWER", "APPROVAL_AUTHORITY", "ADMINISTRATOR"].includes(user.role);
  for (const creator of creators) {
    const item = { id: creator.id, recordId: creator.id, name: creator.creator_name, status: creator.workflow_status };
    if (["HOLD", "CORRECTION_REQUIRED"].includes(creator.workflow_status)) actionable.push({ ...item, priority: 0, instruction: "Read the QA notes. Correct what is requested; escalate unclear or unapproved changes." });
    else if (creator.creator_status === "Blocked") actionable.push({ ...item, priority: 0, status: "Status: Blocked", instruction: "Open the record. Identify the blocker and route decisions to Operations." });
    else if (["AVAILABLE", "IN_PROGRESS"].includes(creator.workflow_status)) actionable.push({ ...item, priority: 2, instruction: "Check creator facts and Evidence Link. Complete work within your role, then Send to QA." });
    else if (creator.workflow_status === "AWAITING_QA") {
      const review = { ...item, priority: 1, instruction: canReview ? "Review the required evidence. Record PASS, HOLD, or CORRECTION REQUIRED within your authority." : "Wait for an authorized QA reviewer. Do not change the locked record." };
      (canReview ? actionable : waiting).push(review);
    }
    if (creator.sync_status && creator.sync_status !== "SYNCED") actionable.push({ ...item, id: creator.id + " · synchronization", priority: 0, status: creator.sync_status, instruction: "The source has not acknowledged this record. Ask Operations to check synchronization before relying on the change." });
  }
  for (const assignment of assignments) {
    if (["Complete", "Archived"].includes(assignment.status)) continue;
    const due = dateInput(assignment.content_due);
    const blocked = assignment.status === "Blocked";
    if (!blocked && (!due || due > today)) continue;
    actionable.push({ id: assignment.id, recordId: assignment.creator_id, name: assignment.creator_name || assignment.creator_id,
      status: blocked ? "Status: Blocked" : "Content Due: " + due, priority: 0,
      instruction: blocked ? "Read the assignment Notes and escalate the blocker." : due < today ? "Content Due has passed. Verify delivery and record the next step; escalate a deadline exception." : "Content Due is today. Check the submitted file and hand it to the reviewer." });
  }
  actionable.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { actionable, waiting };
}

function dailyWorkCards(items, empty) {
  if (!items.length) return '<div class="panel"><p>' + esc(empty) + '</p></div>';
  return '<div class="daily-queue">' + items.map(item => '<article class="panel"><strong>' + esc(item.id) + ' · ' + esc(item.name) + '</strong><p>' + esc(item.status.replaceAll("_", " ")) + '</p><p>' + esc(item.instruction) + '</p><button class="action secondary" data-record="' + esc(item.recordId) + '">Open record</button></article>').join('') + '</div>';
}

function operatorWorkflowGuide() {
  return '<details class="panel workflow-guide"><summary>Receive submission → Process → QA → Escalate → Launch Gate → Monitor → Close Out</summary><ol>' +
    '<li><strong>Receive submission.</strong> Use the approved intake route. Keep the submitted file and version linked to the correct Creator ID and Campaign ID. A submission does not create a purchase or rights grant.</li>' +
    '<li><strong>Process.</strong> Open Creator work. Check Creator Name, Primary Platform, Handle, Email / Contact, Product Focus, and Evidence Link against the source. Use the existing Creator ID. Keep Product Scope tied to the campaign.</li>' +
    '<li><strong>QA.</strong> Read the content scorecard and rights checklist for the exact asset. Send completed creator work to QA. An authorized reviewer records PASS, HOLD, or CORRECTION REQUIRED. The Console creator checklist does not replace content or launch QA.</li>' +
    '<li><strong>Escalate.</strong> Send compensation, rights, claims, exceptions, missing proof, or conflicting facts to Operations. Operations records decisions in DECISIONS &amp; BLOCKERS. Do not guess or change terms.</li>' +
    '<li><strong>Launch Gate.</strong> Verify LAUNCH CONTROL with Operations. Ready for Review, creator QA PASS, or a budget ceiling does not authorize launch. Owner Approval must cover the actual campaign, platform, creative, and budget.</li>' +
    '<li><strong>Monitor.</strong> Only after explicit launch authorization, check the approved placement, tracking, rights, and authorized spend. Use verified results in DATA INTAKE. Escalate broken tracking, checkout, wrong claims, or uncontrolled spend immediately.</li>' +
    '<li><strong>Close Out.</strong> Operations reconciles spend, orders, refunds, creator compensation, rights, and the next decision. Keep the evidence and update the existing Daily Tasks Log. No new spend is authorized by closeout.</li></ol><p><strong>Training:</strong> Do not practice against live campaigns or real money. Ask Operations to identify the isolated training campaign before making training edits. Existing fictional certification records must be preserved.</p></details>';
}

function campaignCard(campaign) {
  return '<button class="campaign-card ' + (campaign.id === state.dashboard.campaign.id ? "active" : "") + '" data-campaign="' + esc(campaign.id) + '">' +
    '<span class="campaign-id">' + esc(campaign.id) + '</span><strong>' + esc(campaign.name) + '</strong>' +
    '<small>' + esc(campaign.slug || "No slug") + ' · ' + esc(campaign.status.replaceAll("_"," ")) + '</small></button>';
}
function creatorCard(creator) {
  return '<button class="record" data-record="' + esc(creator.id) + '"><span class="badge ' + esc(creator.workflow_status) + '">' +
    esc(creator.workflow_status.replaceAll("_"," ")) + '</span><strong>' + esc(creator.id) + ' · ' + esc(creator.creator_name) +
    '</strong><small>' + esc(creator.campaign_id) + ' · ' + esc(creator.primary_platform) + ' · ' + esc(creator.handle) + '</small></button>';
}

function renderCampaigns(campaigns = state.campaigns, creators = []) {
  $("#campaigns-view").innerHTML =
    '<div class="section-head"><div><h2>Campaign directory</h2><p>Search by Campaign ID, generated campaign name, or campaign slug.</p></div></div>' +
    '<div class="search-row"><input id="campaign-search" type="search" placeholder="CMP-100, campaign name, or slug"><button class="action" id="campaign-search-button">Search</button></div>' +
    '<div class="campaign-layout"><div class="campaign-list">' + (campaigns.map(campaignCard).join("") || '<div class="panel">No matching campaigns.</div>') + '</div>' +
    '<div id="campaign-detail" class="panel"><p class="field-help">Open a campaign to see its operator-ready Control System context.</p></div></div>' +
    (creators.length ? '<div class="section-head"><div><h2>Matching creators</h2><p>Creator results from the same search.</p></div></div><div class="record-list compact">' + creators.map(creatorCard).join("") + '</div>' : "");
}

function detail(label,value,type) {
  return '<div class="detail"><small>' + esc(type) + ' · ' + esc(label) + '</small><strong>' + esc(value) + '</strong></div>';
}

async function openCampaign(id) {
  state.currentCampaign = await api("campaigns/" + encodeURIComponent(id));
  const campaign = state.currentCampaign.campaign;
  const creators = state.currentCampaign.creators;
  const assignments = state.currentCampaign.assignments;
  const creatives = state.currentCampaign.creatives;
  $("#campaign-detail").innerHTML =
    '<div class="campaign-heading"><span class="campaign-id">' + esc(campaign.id) + '</span><h2>' + esc(campaign.name) + '</h2></div>' +
    '<div class="guide"><span><b>AUTO</b>Generated name</span><span><b>SELECT</b>Approved options</span><span><b>INPUT</b>Operational facts</span><span><b>LOCKED</b>IDs & rollups</span><span><b>APPROVAL</b>QA / owner</span></div>' +
    '<div class="detail-grid">' + detail("Campaign ID",campaign.id,"LOCKED") + detail("Campaign Name",campaign.name,"AUTO") +
    detail("Campaign Slug",campaign.slug || "—","INPUT") + detail("Platform",campaign.platform || "Awaiting sync","SELECT") +
    detail("Objective",campaign.objective || "Awaiting sync","SELECT") + detail("Status",campaign.status.replaceAll("_"," "),"SELECT") +
    detail("Start Date",campaign.start_date || "—","INPUT") + detail("End Date",campaign.end_date || "—","INPUT") +
    detail("Owner",campaign.owner_name || "—","SELECT") + detail("Cash Budget ($)",campaign.cash_budget ? "$" + Number(campaign.cash_budget).toFixed(2) : "—","APPROVAL") + '</div>' +
    '<section class="record-section"><h3>Product Scope</h3><p>' + esc(campaign.product_scope || "Awaiting source-system synchronization.") + '</p></section>' +
    '<section class="record-section"><h3>Notes</h3><p>' + esc(campaign.notes || "No notes recorded.") + '</p></section>' +
    '<div class="related-grid"><div><b>' + creators.length + '</b><span>Creators</span></div><div><b>' + assignments.length +
    '</b><span>Assignments</span></div><div><b>' + creatives.length + '</b><span>Creatives</span></div></div>' +
    '<button class="action secondary" data-open-work="' + esc(campaign.id) + '">Open campaign work</button>';
}

function renderWork() {
  $("#work-view").innerHTML =
    '<div class="section-head"><div><h2>Creator work</h2><p>Open records, update facts and evidence, then submit through QA.</p></div>' +
    '<button class="action" id="new-creator" ' + (state.dashboard.system.schemaReady && state.dashboard.user.capabilities?.captureFacts ? "" : "disabled") + '>New creator</button></div>' +
    '<div class="search-grid"><input id="creator-search" type="search" placeholder="Creator ID, name, handle, campaign, platform, or status">' +
    '<select id="platform-filter"><option value="">All platforms</option>' + optionList(["Meta","TikTok","Google","Shopify","Klaviyo","Recharge","Clipster","Other"],"") + '</select>' +
    '<select id="status-filter"><option value="">All statuses</option>' + optionList(["AVAILABLE","IN_PROGRESS","AWAITING_QA","PASSED","HOLD","CORRECTION_REQUIRED","Active","Blocked","Complete"],"") + '</select>' +
    '<button class="action" id="creator-search-button">Filter</button></div>' +
    '<div class="guide"><span><b>AUTO</b>ID & timestamps</span><span><b>SELECT</b>Approved options</span><span><b>INPUT</b>New facts</span><span><b>LOCKED</b>Campaign & history</span><span><b>APPROVAL</b>QA decision</span></div>' +
    '<div class="work-layout"><div class="record-list">' + (state.creators.map(creatorCard).join("") || '<div class="panel">No matching creator records.</div>') +
    '</div><div id="editor" class="panel"><p class="field-help">Choose a record, or start a new creator enrollment.</p></div></div>';
}

function creatorForm(creator = {}) {
  const edit = Boolean(creator.id);
  const campaignId = creator.campaign_id || state.dashboard.campaign.id;
  const campaign = state.campaigns.find((item) => item.id === campaignId) || { id: campaignId, name: creator.campaign_name || "" };
  const campaignField = edit
    ? '<input class="locked" value="' + esc(campaignLabel(campaign)) + '" disabled>'
    : '<select name="campaignId">' + campaignOptions(campaignId) + '</select>';
  return '<form id="creator-form"><div class="record-title"><div><span class="campaign-id">' + esc(creator.id || "AUTO") + '</span><h2>' +
    esc(creator.creator_name || "New creator enrollment") + '</h2></div>' +
    (edit ? '<span class="sync-state ' + esc(creator.sync_status || "LOCAL_ONLY") + '">' + esc((creator.sync_status || "LOCAL ONLY").replaceAll("_"," ")) + '</span>' : "") + '</div>' +
    '<div class="form-grid"><label>Creator ID <input class="locked" value="' + esc(creator.id || "Assigned automatically") + '" disabled><span class="field-help">AUTO · Permanent and never recycled.</span></label>' +
    '<label>Campaign ' + campaignField + '<span class="field-help">' + (edit ? "LOCKED · Relationship cannot be silently changed." : "SELECT · Existing campaign.") + '</span></label>' +
    '<label>Creator Name <input name="creatorName" value="' + esc(creator.creator_name) + '" required></label>' +
    '<label>Primary Platform <select name="primaryPlatform">' + optionList(state.dashboard.options?.platforms || ["Meta","TikTok","Google","Clipster","Shopify","Klaviyo","Recharge","Other"],creator.primary_platform) + '</select></label>' +
    '<label>Handle <input name="handle" value="' + esc(creator.handle) + '" required></label><label>Email / Contact <input name="contact" value="' + esc(creator.contact) + '" required></label>' +
    '<label>Status <select name="creatorStatus">' + optionList(state.dashboard.options?.creatorStatuses || ["Not Started","In Progress","Blocked","Ready for Review","Approved","Live","Paused","Complete","Archived","Active"],creator.creator_status) + '</select></label>' +
    '<label>Compensation Model <select name="compensationModel">' + optionList(state.dashboard.options?.compensation || ["Performance","Fixed Content Fee","Hybrid","Product Seeding","Performance Bonus","N/A"],creator.compensation_model) + '</select></label>' +
    '<label>Rights Status <select name="rightsStatus">' + optionList(state.dashboard.options?.rights || ["Not Reviewed","Organic Only","Paid Usage Approved","Expired","Blocked","N/A"],creator.rights_status) + '</select></label>' +
    '<label>Evidence Link <input name="evidenceLink" type="url" value="' + esc(creator.evidence_link) + '"><span class="field-help">INPUT · Never store secrets.</span></label></div>' +
    '<label>Product Focus <select name="productFocus" required><option value="">Choose Product Focus</option>' + optionList(state.dashboard.options?.productFocus || [],creator.product_focus) + '</select></label>' +
    '<label>Notes <textarea name="notes">' + esc(creator.notes) + '</textarea></label>' +
    '<div class="form-actions"><button class="action" type="submit">' + (edit ? "Save changes" : "Create enrollment") + '</button>' +
    (edit && ["IN_PROGRESS","CORRECTION_REQUIRED","HOLD"].includes(creator.workflow_status) ? '<button class="action secondary" type="button" id="submit-qa">Send to QA</button>' : "") +
    '</div></form>' + (edit ? assignmentPanel() + creativePanel() + qaPanel(creator) : "");
}

function assignmentPanel() {
  const assignments = state.current.assignments || [];
  return '<div class="section-head"><div><h2>Campaign assignments</h2><p>Assigned records. Approved compensation, rights and scheduling are controlled.</p></div><button class="action secondary" id="new-assignment">New assignment</button></div>' +
    '<div id="assignment-list">' + (assignments.map(assignmentForm).join("") || '<p class="field-help">No assignments recorded.</p>') + '</div><div id="assignment-new"></div>';
}

function assignmentForm(assignment = {}) {
  const edit = Boolean(assignment.id);
  const campaignId = assignment.campaign_id || state.dashboard.campaign.id;
  return '<form class="assignment-form nested-panel" data-assignment-id="' + esc(assignment.id || "") + '" data-version="' + esc(assignment.version || "") + '">' +
    '<div class="record-title"><strong>' + esc(assignment.id || "New assignment") + '</strong>' +
    (edit ? '<span class="sync-state ' + esc(assignment.sync_status || "LOCAL_ONLY") + '">' + esc((assignment.sync_status || "LOCAL ONLY").replaceAll("_"," ")) + '</span>' : "") + '</div>' +
    '<input type="hidden" name="creatorId" value="' + esc(assignment.creator_id || state.current.creator.id) + '">' +
    '<label>Campaign <select name="campaignId" ' + (edit ? "disabled" : "") + '>' + campaignOptions(campaignId) + '</select></label>' +
    '<label>Product Scope <textarea disabled>' + esc(assignment.product_scope ?? assignment.campaign_product_scope) + '</textarea><span class="field-help">LOCKED · From CAMPAIGNS through CREATOR ASSIGNMENTS.</span></label>' +
    '<label>Platform <input disabled value="' + esc(assignment.platform ?? assignment.campaign_platform) + '"></label>' +
    '<div class="form-grid"><label>Status <select name="status">' + optionList(state.dashboard.options?.creatorStatuses || ["Not Started","In Progress","Blocked","Ready for Review","Approved","Live","Paused","Complete","Archived","Active"],assignment.status) + '</select></label>' +
    '<label>Paid Usage Rights <select name="paidUsageRights">' + optionList(["Yes","No","Pending"],assignment.paid_usage_rights) + '</select></label>' +
    '<label>Evidence Status <select name="evidenceStatus">' + optionList(["Planned","Pending","Verified","Blocked","Expired"],assignment.evidence_status) + '</select></label>' +
    '<label>Signed Rights Evidence Link <input name="signedRightsEvidenceLink" type="url" value="' + esc(assignment.signed_rights_evidence_link) + '"></label>' +
    '<label>Start Date <input name="startDate" type="date" value="' + dateInput(assignment.start_date) + '"></label><label>Content Due <input name="contentDue" type="date" value="' + dateInput(assignment.content_due) + '"></label>' +
    '<label>Fixed Content Fee ($) <input name="fixedContentFee" type="number" min="0" step="0.01" value="' + esc(assignment.fixed_content_fee ?? 0) + '"></label>' +
    '<label>Commission % <input name="commissionRate" type="number" min="0" max="1" step="0.01" value="' + esc(assignment.commission_rate ?? 0) + '"><span class="field-help">Enter 0.10 for 10%.</span></label>' +
    '<label>Attribution Window (Days) <input name="attributionWindowDays" type="number" min="1" max="365" value="' + esc(assignment.attribution_window_days ?? 30) + '"></label>' +
    '<label>Environment <input class="locked" value="' + esc(assignment.environment || "NONPRODUCTION") + '" disabled></label></div>' +
    '<label>Notes <textarea name="notes">' + esc(assignment.notes) + '</textarea></label><button class="action" type="submit">' + (edit ? "Save assignment" : "Create assignment") + '</button></form>';
}

function creativePanel() {
  const creatives = state.current.creatives || [];
  if (!creatives.length) return "";
  return '<div class="section-head"><div><h2>Linked creatives</h2><p>Approval fields are visible and locked.</p></div></div><div class="creative-grid">' +
    creatives.map((creative) => '<article class="nested-panel"><span class="campaign-id">' + esc(creative.id) + '</span><strong>' + esc(creative.creative_name) +
    '</strong><small>' + esc(creative.format) + ' · ' + esc(creative.platform) + '</small><small>' + esc(creative.approval_status) + '</small></article>').join("") + '</div>';
}

function qaPanel(creator) {
  const canReview = ["OPERATIONS","QA_REVIEWER","APPROVAL_AUTHORITY","ADMINISTRATOR"].includes(state.dashboard.user.role);
  const checks = Object.entries(state.current.checklist || {}).map(([key,value]) =>
    '<div class="check ' + (value ? "ok" : "no") + '">' + (value ? "✓" : "✕") + " " + esc(key === "productCampaignFocus" ? "Product Focus" : key.replace(/([A-Z])/g," $1")) + '</div>'
  ).join("");
  const history = (state.current.reviews || []).map((review) =>
    '<div class="check"><strong>' + esc(review.result) + '</strong> · ' + esc(review.reviewer_role) + ' · ' + esc(review.created_at) + '<br>' + esc(review.notes || "") + '</div>'
  ).join("");
  return '<div class="section-head"><div><h2>QA gate</h2><p>Evidence plus an authorized decision.</p></div></div><div class="checklist">' + checks + '</div>' +
    (creator.workflow_status === "AWAITING_QA" && canReview ? '<label>QA notes <textarea id="qa-notes" placeholder="Required for HOLD or CORRECTION REQUIRED"></textarea></label><div class="qa-actions"><button class="pass" data-qa="PASS">PASS</button><button class="hold" data-qa="HOLD">HOLD</button><button class="correction" data-qa="CORRECTION_REQUIRED">CORRECTION REQUIRED</button></div>' : "") +
    (history ? '<h3>QA history</h3><div class="checklist">' + history + '</div>' : "");
}

async function openRecord(id) {
  let record = await api("creators/" + encodeURIComponent(id));
  if (record.creator.campaign_id && record.creator.campaign_id !== state.dashboard.campaign.id) {
    await loadCampaign(record.creator.campaign_id);
    record = await api("creators/" + encodeURIComponent(id));
    renderAll();
  }
  state.current = record;
  renderWork();
  $("#editor").innerHTML = creatorForm(record.creator);
  lockEditorIfMigrationPending();
  bindCreatorForm(record.creator);
  bindAssignments();
  show("work");
}

function lockEditorIfMigrationPending() {
  if (state.dashboard.system.schemaReady) {
    if (state.current && !state.current.creator.campaign_id) {
      const form = $("#creator-form");
      form.insertAdjacentHTML("afterbegin", '<p class="field-help">Create a campaign assignment before editing this creator.</p>');
      form.querySelectorAll("input,select,textarea,button").forEach((control) => { control.disabled = true; });
    }
    return;
  }
  const editor = $("#editor");
  if (!editor) return;
  editor.insertAdjacentHTML("afterbegin", '<div class="notice error persistent">This record is view-only. Check the campaign assignment and database migration.</div>');
  editor.querySelectorAll("input,select,textarea,button").forEach((control) => { control.disabled = true; });
}

function bindCreatorForm(creator = {}) {
  applyRoleControls();
  $("#creator-form").addEventListener("submit",async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled=true;
    const body = Object.fromEntries(new FormData(form));
    try {
      if (creator.id) {
        body.version = creator.version;
        await api("creators/" + creator.id,{ method: "PATCH",body: JSON.stringify(body) });
      } else {
        await api("creators",{ method: "POST",body: JSON.stringify(body) });
      }
      notice("Saved, attributed, and queued for Control System synchronization.");
      await reload("work");
    } catch (error) {
      submit.disabled = false;
      notice(error.message,true);
    }
  });
  $("#submit-qa")?.addEventListener("click",async () => {
    try {
      await api("creators/" + creator.id,{ method: "PATCH",body: JSON.stringify({ action: "AWAITING_QA",version: creator.version }) });
      notice("Sent to QA. The record is now locked.");
      await reload("work");
    } catch (error) { notice(error.message,true); }
  });
  $("#new-assignment")?.addEventListener("click",() => {
    $("#assignment-new").innerHTML = assignmentForm();
    bindAssignments();
  });
  document.querySelectorAll("[data-qa]").forEach((button) => button.addEventListener("click",async () => {
    try {
      await api("qa/" + creator.id,{ method: "POST",body: JSON.stringify({ result: button.dataset.qa,notes: $("#qa-notes").value,version: creator.version }) });
      notice("QA result saved: " + button.dataset.qa.replaceAll("_"," "));
      await reload("work");
    } catch (error) { notice(error.message,true); }
  }));
}

function bindAssignments() {
  applyRoleControls();
  document.querySelectorAll(".assignment-form").forEach((form) => {
    if (form.dataset.bound) return;
    form.dataset.bound = "true";
    form.addEventListener("submit",async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      const id = form.dataset.assignmentId;
      if (!body.campaignId) body.campaignId = state.current.creator.campaign_id;
      if (id) body.version = Number(form.dataset.version);
      try {
        await api(id ? "assignments/" + id : "assignments",{ method: id ? "PATCH" : "POST",body: JSON.stringify(body) });
        notice("Assignment saved and queued for synchronization.");
        await openRecord(state.current.creator.id);
      } catch (error) { notice(error.message,true); }
    });
  });
}

async function creatorSearch() {
  const search = new URLSearchParams({
    campaignId: state.dashboard.campaign.id,
    q: $("#creator-search").value.trim(),
    platform: $("#platform-filter").value,
    status: $("#status-filter").value
  });
  state.creators = (await api("creators?" + search.toString())).creators;
  state.current = null;
  renderWork();
}

async function combinedSearch(term) {
  const results = await Promise.all([
    api("campaigns?q=" + encodeURIComponent(term)),
    api("creators?q=" + encodeURIComponent(term))
  ]);
  renderCampaigns(results[0].campaigns,results[1].creators);
  show("campaigns");
}

async function renderAudit() {
  if (!state.dashboard.user.canViewAudit) return;
  const events = (await api("audit?campaignId=" + encodeURIComponent(state.dashboard.campaign.id))).events;
  $("#audit-view").innerHTML = '<div class="section-head"><div><h2>Audit trail</h2><p>Administrator / Project Owner only.</p></div></div><div class="panel audit-wrap"><table class="audit-table"><thead><tr><th>WHEN</th><th>OPERATOR</th><th>ACTION</th><th>RECORD</th><th>CHANGE</th></tr></thead><tbody>' +
    events.map((event) => '<tr><td>' + esc(event.created_at) + '</td><td>' + esc(event.operator_name) + '<br>' + esc(event.operator_role) + '</td><td>' + esc(event.action) + '</td><td>' + esc(event.object_id) + '</td><td>' + esc(event.previous_value || "—") + ' → ' + esc(event.new_value || "—") + '</td></tr>').join("") +
    '</tbody></table></div>';
}

async function reload(view) {
  await loadCampaign(state.dashboard.campaign.id);
  renderAll();
  show(view);
}

function show(view) {
  if (view === "audit" && !state.dashboard.user.canViewAudit) return;
  document.querySelectorAll(".view").forEach((element) => { element.hidden = true; });
  const target = $("#" + view + "-view");
  if (target) target.hidden = false;
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active",button.dataset.view === view));
  if (view === "audit") renderAudit().catch((error) => notice(error.message,true));
  $(".sidebar").classList.remove("open");
}

document.addEventListener("click",async (event) => {
  try {
    const go = event.target.closest("[data-go]");
    if (go) show(go.dataset.go);
    const nav = event.target.closest("[data-view]");
    if (nav) show(nav.dataset.view);
    const record = event.target.closest("[data-record]");
    if (record) await openRecord(record.dataset.record);
    const campaign = event.target.closest("[data-campaign]");
    if (campaign) await openCampaign(campaign.dataset.campaign);
    const openWork = event.target.closest("[data-open-work]");
    if (openWork) {
      await loadCampaign(openWork.dataset.openWork);
      renderAll();
      show("work");
    }
    if (event.target.id === "new-creator") {
      $("#editor").innerHTML = creatorForm();
      lockEditorIfMigrationPending();
      bindCreatorForm();
    }
    if (event.target.id === "creator-search-button") await creatorSearch();
    if (event.target.id === "campaign-search-button") await combinedSearch($("#campaign-search").value.trim());
  } catch (error) { notice(error.message,true); }
});
$("#run-search").addEventListener("click",() => combinedSearch($("#global-search").value.trim()).catch((error) => notice(error.message,true)));
$("#global-search").addEventListener("keydown",(event) => {
  if (event.key === "Enter") combinedSearch(event.currentTarget.value.trim()).catch((error) => notice(error.message,true));
});
$("#menu").addEventListener("click",() => $(".sidebar").classList.toggle("open"));

function applyRoleControls() {
  const user=state.dashboard.user,owner=user.role==='ADMINISTRATOR';
  const capture=!!user.capabilities?.captureFacts;
  const form=$('#creator-form');
  if(form) {
    form.querySelectorAll('input,select,textarea').forEach(control=>{
      if(!capture || (!owner && ['compensationModel','rightsStatus','creatorStatus','productFocus'].includes(control.name)))control.disabled=true;
      if(!state.current && !owner && control.name==='compensationModel')control.value='N/A';
      if(!state.current && !owner && control.name==='rightsStatus')control.value='Not Reviewed';
      if(!state.current && !owner && control.name==='creatorStatus')control.value='Not Started';
      if(!state.current && control.name==='productFocus' && capture)control.disabled=false;
    });
    form.querySelectorAll('button').forEach(control=>{if(!capture)control.disabled=true;});
  }
  document.querySelectorAll('.assignment-form').forEach(form=>{
    form.querySelectorAll('input,select,textarea').forEach(control=>{
      if(!capture || (!owner && !['notes','creatorId','campaignId'].includes(control.name)))control.disabled=true;
    });
    form.querySelectorAll('button').forEach(control=>{if(!capture)control.disabled=true;});
  });
  const newAssignment=$('#new-assignment');if(newAssignment)newAssignment.hidden=!capture;
}
function escalationForm() {
  if(!state.dashboard.user.capabilities?.captureFacts)return '';
  const types=['Owner Access','Money/Spend','Tracking','Shipping','Product','Creator Rights','Creative','Inventory','Checkout','Data Missing','Other'];
  return '<details class="panel"><summary>Record an escalation</summary><form id="escalation-form"><label>Type <select name="type">'+optionList(types,'Other')+'</select></label><label>Severity <select name="severity">'+optionList(['Green','Yellow','Red','Blue','Gray'],'Yellow')+'</select></label><label>Decision Needed / Blocker <textarea name="description" required></textarea></label><label>Recommendation <textarea name="recommendation"></textarea></label><label>Evidence Link <input type="url" name="evidenceLink" required></label><button class="action" type="submit">Send to DECISIONS &amp; BLOCKERS</button></form><p>This records an issue; it does not approve, resolve or authorize spending.</p></details>';
}
function operationalQueueCards() {
  const queues=state.queues;
  if(!queues)return '';
  const missing=queues.error || (queues.missingSources?.length?'Awaiting verified source records: '+queues.missingSources.join(', '):'');
  return '<section class="panel"><h2>Operational workflow</h2>'+(missing?'<p class="field-help">'+esc(missing)+'</p>':'')+
    (queues.stages||[]).map(stage=>'<details><summary>'+esc(stage.name)+' · '+stage.items.length+'</summary>'+stage.items.map(row=>'<article class="nested-panel"><h3>'+esc(row.tab)+' · '+esc(row.record_id)+'</h3><dl>'+Object.entries(row.fields).map(([field,value])=>'<dt>'+esc(field)+'</dt><dd>'+esc(value)+'</dd>').join('')+'</dl></article>').join('')+'</details>').join('')+
    '<p>Read the established source status and evidence. These records do not grant authority to approve money, rights or launch.</p></section>'+escalationForm();
}
function bindEscalationForm() {
  const form=$('#escalation-form');if(!form)return;
  const eventId=crypto.randomUUID();
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;
    try {await api('escalations',{method:'POST',body:JSON.stringify({...Object.fromEntries(new FormData(form)),campaignId:state.dashboard.campaign.id,eventId})});notice('Escalation recorded; source synchronization is pending.');await reload('home');}
    catch(error){notice(error.message,true);button.disabled=false;}
  });
}
start();
