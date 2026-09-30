const api = async (path, options = {}) => {
  const response = await fetch("/api/console/" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({ error: "Unexpected response" }));
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed"), { body, status: response.status });
  return body;
};

const state = { dashboard: null, campaigns: [], creators: [], current: null, currentCampaign: null };
const $ = (selector) => document.querySelector(selector);
const esc = (value = "") => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));
const optionList = (values,current) => values.map((value) =>
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
  state.current = null;
  state.currentCampaign = null;
}

function renderAll() {
  renderChrome();
  renderHome();
  renderCampaigns();
  renderWork();
}

function renderChrome() {
  const user = state.dashboard.user;
  const campaign = state.dashboard.campaign;
  $("#operator-name").textContent = user.displayName;
  $("#operator-role").textContent = user.role.replaceAll("_"," ");
  $("#operator-id").textContent = user.id;
  $("#campaign-name").textContent = campaignLabel(campaign);
  document.querySelectorAll(".admin-only").forEach((element) => { element.hidden = !user.canViewAudit; });
}

function total() {
  const keys = Array.from(arguments);
  return keys.reduce((sum,key) => sum + (state.dashboard.counts[key] || 0),0);
}

function renderHome() {
  const data = state.dashboard;
  $("#home-view").innerHTML =
    '<div class="hero"><span class="eyebrow">CREATOR ON THE SURFACE. OPERATIONS UNDERNEATH.</span>' +
    '<h1>Know what’s next.<br><em>Keep the proof.</em></h1>' +
    '<p>Operators work here—not in the back-office Control System. Campaign identity, creator facts, evidence, workflow, and QA stay together while system fields remain locked.</p>' +
    '<div class="identity-callout"><strong>' + esc(data.campaign.id) + '</strong><span>' + esc(data.campaign.name) + '</span></div>' +
    '<button class="action" data-go="work">Open creator work</button></div>' +
    (!data.system.schemaReady ? '<div class="notice error persistent">V2 database migration is pending. Browsing remains available; record changes are locked.</div>' : "") +
    '<div class="system-strip"><span><b>SYSTEM OF RECORD</b>' + esc(data.system.systemOfRecord) + '</span>' +
    '<span><b>CONTROL SYSTEM</b>' + esc(data.system.controlSystem) + '</span>' +
    '<span><b>SYNC BRIDGE</b>' + (data.system.syncConfigured ? "Configured" : "Activation pending") + '</span></div>' +
    '<div class="section-head"><div><h2>Work status</h2><p>Live D1 counts for ' + esc(campaignLabel(data.campaign)) + '.</p></div></div>' +
    '<div class="status-grid"><div class="status-card ready"><small>READY</small><strong>' + total("AVAILABLE") + '</strong></div>' +
    '<div class="status-card progress"><small>IN PROGRESS</small><strong>' + total("IN_PROGRESS") + '</strong></div>' +
    '<div class="status-card blocked"><small>BLOCKED / CORRECTION</small><strong>' + total("HOLD","CORRECTION_REQUIRED") + '</strong></div>' +
    '<div class="status-card qa"><small>AWAITING QA</small><strong>' + total("AWAITING_QA") + '</strong></div>' +
    '<div class="status-card passed"><small>PASSED</small><strong>' + total("PASSED") + '</strong></div></div>' +
    '<div class="section-head"><div><h2>Your next action</h2><p>' + esc(data.nextAction) + '</p></div><button class="action secondary" data-go="work">Continue</button></div>';
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
    '<div class="detail-grid">' + detail("Campaign ID",campaign.id,"LOCKED") + detail("Campaign name",campaign.name,"AUTO") +
    detail("Campaign slug",campaign.slug || "—","INPUT") + detail("Platform",campaign.platform || "Awaiting sync","SELECT") +
    detail("Objective",campaign.objective || "Awaiting sync","SELECT") + detail("Status",campaign.status.replaceAll("_"," "),"SELECT") +
    detail("Start date",campaign.start_date || "—","INPUT") + detail("End date",campaign.end_date || "—","INPUT") +
    detail("Owner",campaign.owner_name || "—","SELECT") + detail("Cash budget",campaign.cash_budget ? "$" + Number(campaign.cash_budget).toFixed(2) : "—","APPROVAL") + '</div>' +
    '<section class="record-section"><h3>Product scope</h3><p>' + esc(campaign.product_scope || "Awaiting source-system synchronization.") + '</p></section>' +
    '<section class="record-section"><h3>Operational notes</h3><p>' + esc(campaign.notes || "No notes recorded.") + '</p></section>' +
    '<div class="related-grid"><div><b>' + creators.length + '</b><span>Creators</span></div><div><b>' + assignments.length +
    '</b><span>Assignments</span></div><div><b>' + creatives.length + '</b><span>Creatives</span></div></div>' +
    '<button class="action secondary" data-open-work="' + esc(campaign.id) + '">Open campaign work</button>';
}

function renderWork() {
  $("#work-view").innerHTML =
    '<div class="section-head"><div><h2>Creator work</h2><p>Open records, update facts and evidence, then submit through QA.</p></div>' +
    '<button class="action" id="new-creator" ' + (state.dashboard.system.schemaReady ? "" : "disabled") + '>New creator</button></div>' +
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
    '<label>Creator name <input name="creatorName" value="' + esc(creator.creator_name) + '" required></label>' +
    '<label>Primary platform <select name="primaryPlatform">' + optionList(["Meta","TikTok","Google","Shopify","Klaviyo","Recharge","Clipster","Other"],creator.primary_platform) + '</select></label>' +
    '<label>Handle <input name="handle" value="' + esc(creator.handle) + '" required></label><label>Email / contact <input name="contact" value="' + esc(creator.contact) + '" required></label>' +
    '<label>Creator status <select name="creatorStatus">' + optionList(["Not Started","In Progress","Blocked","Ready for Review","Approved","Active","Complete","Archived"],creator.creator_status) + '</select></label>' +
    '<label>Compensation model <select name="compensationModel">' + optionList(["Performance","Fixed Content Fee","Hybrid","Product Seeding","Performance Bonus","Organic Only","N/A"],creator.compensation_model) + '</select></label>' +
    '<label>Rights status <select name="rightsStatus">' + optionList(["Not Reviewed","Organic Only","Paid Usage Approved","Expired","Blocked"],creator.rights_status) + '</select></label>' +
    '<label>Evidence link <input name="evidenceLink" type="url" value="' + esc(creator.evidence_link) + '"><span class="field-help">INPUT · Never store secrets.</span></label></div>' +
    '<label>Product / campaign focus <textarea name="productFocus" required>' + esc(creator.product_focus) + '</textarea></label>' +
    '<label>Operational notes <textarea name="notes">' + esc(creator.notes) + '</textarea></label>' +
    '<div class="form-actions"><button class="action" type="submit">' + (edit ? "Save changes" : "Create enrollment") + '</button>' +
    (edit && ["IN_PROGRESS","CORRECTION_REQUIRED","HOLD"].includes(creator.workflow_status) ? '<button class="action secondary" type="button" id="submit-qa">Send to QA</button>' : "") +
    '</div></form>' + (edit ? assignmentPanel() + creativePanel() + qaPanel(creator) : "");
}

function assignmentPanel() {
  const assignments = state.current.assignments || [];
  return '<div class="section-head"><div><h2>Campaign assignments</h2><p>Operator-editable relational Control System records.</p></div><button class="action secondary" id="new-assignment">New assignment</button></div>' +
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
    '<div class="form-grid"><label>Status <select name="status">' + optionList(["Not Started","In Progress","Blocked","Ready for Review","Approved","Active","Complete","Archived"],assignment.status) + '</select></label>' +
    '<label>Paid usage rights <select name="paidUsageRights">' + optionList(["Yes","No","Pending"],assignment.paid_usage_rights) + '</select></label>' +
    '<label>Evidence status <select name="evidenceStatus">' + optionList(["Planned","Pending","Verified","Blocked","Expired"],assignment.evidence_status) + '</select></label>' +
    '<label>Signed rights evidence <input name="signedRightsEvidenceLink" type="url" value="' + esc(assignment.signed_rights_evidence_link) + '"></label>' +
    '<label>Start date <input name="startDate" type="date" value="' + dateInput(assignment.start_date) + '"></label><label>Content due <input name="contentDue" type="date" value="' + dateInput(assignment.content_due) + '"></label>' +
    '<label>Fixed content fee ($) <input name="fixedContentFee" type="number" min="0" step="0.01" value="' + esc(assignment.fixed_content_fee ?? 0) + '"></label>' +
    '<label>Commission rate <input name="commissionRate" type="number" min="0" max="1" step="0.01" value="' + esc(assignment.commission_rate ?? 0) + '"></label>' +
    '<label>Attribution window <input name="attributionWindowDays" type="number" min="1" max="365" value="' + esc(assignment.attribution_window_days ?? 30) + '"></label>' +
    '<label>Environment <input class="locked" value="' + esc(assignment.environment || "NONPRODUCTION") + '" disabled></label></div>' +
    '<label>Assignment notes <textarea name="notes">' + esc(assignment.notes) + '</textarea></label><button class="action" type="submit">' + (edit ? "Save assignment" : "Create assignment") + '</button></form>';
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
    '<div class="check ' + (value ? "ok" : "no") + '">' + (value ? "✓" : "✕") + " " + esc(key.replace(/([A-Z])/g," $1")) + '</div>'
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
  if (record.creator.campaign_id !== state.dashboard.campaign.id) {
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
  if (state.dashboard.system.schemaReady) return;
  const editor = $("#editor");
  if (!editor) return;
  editor.insertAdjacentHTML("afterbegin", '<div class="notice error persistent">Migration pending · This record is view-only.</div>');
  editor.querySelectorAll("input,select,textarea,button").forEach((control) => { control.disabled = true; });
}

function bindCreatorForm(creator = {}) {
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
start();
