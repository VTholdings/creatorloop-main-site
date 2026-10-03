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

const recordEditors=new Set();
function formValues(form) {return Object.fromEntries([...form.querySelectorAll('input[name],select[name],textarea[name]')].map(c=>[c.name,c.value]));}
function changedValues(before,after) {return Object.fromEntries(Object.entries(after).filter(([key,value])=>String(value??'')!==String(before[key]??'')));}
function leavePendingEdits() {
 const pending=[...recordEditors].filter(editor=>editor.form.isConnected&&editor.dirty);
 if(!pending.length)return true;
 if(pending.some(editor=>editor.saving)){notice('Wait for the reviewed save to finish before leaving this record.',true);return false;}
 if(!window.confirm('Discard unsaved record changes and continue?'))return false;
 pending.forEach(editor=>editor.discard());return true;
}
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{
 if([...recordEditors].some(editor=>editor.form.isConnected&&editor.dirty)){event.preventDefault();event.returnValue='';}
});
function bindSafeSave(form,{existing=true,canEdit=true,save,onSaved,governed=[]}) {
 if(!form||form.dataset.safeBound)return;
 for(const editor of recordEditors)if(!editor.form.isConnected)recordEditors.delete(editor);
 form.dataset.safeBound='true';
 canEdit=canEdit&&state.dashboard?.system?.governedEditingReady!==false;
 const baseline=formValues(form),inputs=[...form.querySelectorAll('input[name],select[name],textarea[name]')];
 const permissions=new Map(inputs.map(c=>[c,c.disabled]));
 const submit=form.querySelector('[type="submit"]');
 form.insertAdjacentHTML('beforeend','<div class="safe-save-controls"><p class="edit-state" role="status" aria-live="polite"></p><button type="button" class="action secondary" data-safe-edit>Edit</button><button type="button" class="action secondary" data-safe-discard>Cancel / Discard</button><button type="button" class="action secondary" data-safe-escalate>Request approval / Escalate</button></div><section class="save-review panel" hidden aria-label="Review pending changes"></section>');
 const status=form.querySelector('.edit-state'),edit=form.querySelector('[data-safe-edit]'),discard=form.querySelector('[data-safe-discard]'),review=form.querySelector('.save-review');
 let mode=existing?'VIEW':'EDIT',reviewed=null;
 const editor={form,dirty:false,discard(){if(mode==='SAVING')return;inputs.forEach(c=>{c.value=baseline[c.name];});reviewed=null;mode=existing?'VIEW':'EDIT';paint();}};
 recordEditors.add(editor);
 function paint() {
  form.dataset.safeMode=mode;
  editor.saving=mode==='SAVING';
  inputs.forEach(c=>{c.disabled=permissions.get(c);});
  if(form.id==='creator-form'||form.classList.contains('assignment-form'))applyRoleControls();
  else inputs.forEach(c=>{c.disabled=permissions.get(c);});
  const changes=changedValues(baseline,formValues(form));editor.dirty=Object.keys(changes).length>0;
  inputs.forEach(c=>{if(mode!=='EDIT')c.disabled=true;c.classList.toggle('modified-field',c.name in changes);const label=c.closest('label');if(label){label.classList.toggle('modified-label',c.name in changes);let marker=label.querySelector('.modified-marker');if(!marker){marker=document.createElement('span');marker.className='modified-marker';marker.textContent='Modified — unsaved';label.append(marker);}marker.hidden=!(c.name in changes);}});
  status.textContent=mode==='SAVED'?'Changes saved. Refresh the record before editing again.':mode==='SAVING'?'Saving reviewed changes…':mode==='REVIEW'?'Review pending changes. Nothing has been saved.':editor.dirty?'Unsaved changes — review and save, or discard.':mode==='VIEW'?'View only. Choose Edit to prepare changes.':'Editing locally. Changes take effect only after review and Save.';
  edit.hidden=mode!=='VIEW';edit.disabled=!canEdit;discard.hidden=['VIEW','SAVED'].includes(mode);discard.disabled=mode==='SAVING';
  form.querySelector('[data-safe-escalate]').disabled=mode==='SAVING';
  submit.textContent='Save changes';submit.hidden=mode!=='EDIT';submit.disabled=!canEdit||(existing&&!editor.dirty);
  review.hidden=mode!=='REVIEW';
 }
 edit.addEventListener('click',()=>{if(!canEdit)return;mode='EDIT';paint();});
 discard.addEventListener('click',()=>editor.discard());
 form.querySelector('[data-safe-escalate]').addEventListener('click',()=>{show('home');$('#escalation-form')?.closest('details')?.setAttribute('open','');$('#escalation-form [name="description"]')?.focus();notice('Record the requested change and evidence in DECISIONS & BLOCKERS. This does not apply or approve the change.');});
 for(const event of ['input','change'])form.addEventListener(event,()=>{if(mode==='EDIT')paint();});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(mode!=='EDIT'||!canEdit||!form.reportValidity())return;
  const values=formValues(form),changes=changedValues(baseline,values);
  if(existing&&!Object.keys(changes).length)return;
  if(existing&&Object.keys(changes).every(key=>key==='authorizationId')){notice('Choose a record change to review. An approval reference alone does not change the record.');return;}
  if(inputs.some(c=>c.disabled&&c.name in changes)){notice('A modified field is now locked. Discard that change or request approval through escalation.',true);return;}
  const enabled=Object.fromEntries(inputs.filter(c=>!c.disabled).map(c=>[c.name,c.value]));
  reviewed=existing?Object.fromEntries(Object.entries(changes).filter(([key])=>key in enabled)):enabled;
  if(enabled.authorizationId?.trim())reviewed.authorizationId=enabled.authorizationId.trim();
  const consequential=Object.keys(changes).some(key=>governed.includes(key));
  review.innerHTML='<h3>Review pending changes</h3><p>Check each value before committing. Permissions, scope, record version and approvals are checked again by the server.</p><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>'+Object.entries(existing?changes:enabled).map(([key,value])=>'<tr><th>'+esc(inputs.find(c=>c.name===key)?.closest('label')?.childNodes[0]?.textContent?.trim()||key)+'</th><td>'+esc(existing?baseline[key]:'New record')+'</td><td>'+esc(value)+'</td></tr>').join('')+'</tbody></table>'+(consequential?'<label><input type="checkbox" data-safe-confirm> I verified the separate approval or authority required for these governed values. This confirmation does not grant approval.</label>':'')+'<div class="form-actions"><button type="button" class="action" data-safe-commit>Confirm and save changes</button><button type="button" class="action secondary" data-safe-back>Back to editing</button></div>';
  mode='REVIEW';paint();
  review.querySelector('[data-safe-back]').addEventListener('click',()=>{mode='EDIT';reviewed=null;paint();});
  review.querySelector('[data-safe-commit]').addEventListener('click',async()=>{
   if(mode!=='REVIEW')return;
   if(consequential&&!review.querySelector('[data-safe-confirm]').checked){notice('Confirm the required approval evidence before saving.',true);return;}
   const payload={...reviewed};mode='SAVING';paint();review.querySelector('[data-safe-commit]').disabled=true;
   try{await save(payload);}
   catch(error){mode='EDIT';reviewed=null;paint();notice(error.message,true);return;}
   Object.assign(baseline,payload);inputs.forEach(c=>{c.value=baseline[c.name];});mode='SAVED';paint();
   try{await onSaved?.();}catch{notice('Changes were saved, but the view could not refresh. Reopen the record before editing again.',true);}
  });
 });
 paint();return editor;
}

async function start() {
  try {
    const identity=(await api('me')).user;
    state.campaigns = (await api("campaigns")).campaigns;
    const initial = state.campaigns.find((campaign) => campaign.id === "CMP-100") || state.campaigns[0];
    if (!initial && identity.canDiagnose) {
      state.dashboard={user:identity,campaign:{id:'',name:'Technical workspace'}};
      renderChrome();$('#loading').hidden=true;$('#app').hidden=false;show('diagnostics');return;
    }
    if (!initial) throw new Error("No assigned workspace records are available. Contact the Administrator.");
    await loadCampaign(initial.id);
    renderAll();
    $("#loading").hidden = true;
    $("#app").hidden = false;
    if(identity.role==='TECHNICIAN'&&identity.canDiagnose)show('diagnostics');
  } catch (error) {
    $("#loading").innerHTML = '<div class="loop-mark">∞</div><h1>Access locked</h1><p>' + esc(error.message) + '</p>'+(error.body?.code==='REAUTHENTICATE'?'<p><a href="/cdn-cgi/access/logout">Sign out, then return to ops.creatorloop.net</a></p>':'');
  }
}

async function loadCampaign(id) {
  if(!leavePendingEdits())return false;
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
  document.querySelectorAll(".reports-only").forEach((element) => { element.hidden = !user.canViewReports; });
  document.querySelectorAll(".team-only").forEach((element) => { element.hidden = !user.canManageTeam; });
  document.querySelectorAll(".diagnostics-only").forEach((element) => { element.hidden = !user.canDiagnose; });
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
  if(!leavePendingEdits())return;
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
  if(state.currentCampaign.editing?.canEdit){
    $('#campaign-detail').insertAdjacentHTML('beforeend','<form id="campaign-edit-form"><h3>Operational campaign Notes</h3><p>Generated name, routing, Product Scope, budgets and approval controls stay locked. Request governed changes through approval/escalation.</p><label>Notes <textarea name="notes" maxlength="10000">'+esc(state.currentCampaign.editing.notes)+'</textarea></label><button class="action" type="submit">Save changes</button></form>');
    const revision=state.currentCampaign.editing.revision;
    bindSafeSave($('#campaign-edit-form'),{save:body=>api('campaigns/'+campaign.id,{method:'PATCH',body:JSON.stringify({...body,revision})}),onSaved:async()=>{notice('Campaign Notes saved and queued for synchronization.');await openCampaign(campaign.id);}});
  }
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
    approvalReference('CREATOR') +
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
    approvalReference('ASSIGNMENT') +
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
    '<div class="check"><strong>' + esc(review.result) + '</strong> · ' + 'Current reviewer role: ' + esc(review.reviewer_role) + ' · ' + esc(review.created_at) + '<br>' + esc(review.notes || "") + '</div>'
  ).join("");
  return '<div class="section-head"><div><h2>QA gate</h2><p>Evidence plus an authorized decision.</p></div></div><div class="checklist">' + checks + '</div>' +
    (creator.workflow_status === "AWAITING_QA" && canReview ? '<form id="qa-form"><label>QA result <select name="result" required><option value="">Choose QA result</option><option>PASS</option><option>HOLD</option><option>CORRECTION_REQUIRED</option></select></label><label>QA notes <textarea name="notes" placeholder="Required for HOLD or CORRECTION REQUIRED"></textarea></label><button type="submit" class="action">Save changes</button><p>QA does not grant Owner Approval or authorize launch.</p></form>' : "") +
    (history ? '<h3>QA history</h3><div class="checklist">' + history + '</div>' : "");
}

async function openRecord(id) {
  if(!leavePendingEdits())return;
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
  if(state.dashboard.system.governedEditingReady===false){
    const editor=$('#editor');editor.insertAdjacentHTML('afterbegin','<p class="notice error persistent">Editing is temporarily unavailable. Contact the Administrator.</p>');
    editor.querySelectorAll('input,select,textarea,button').forEach(control=>{control.disabled=true;});return;
  }
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
  bindApprovalReference($("#creator-form"));
  bindSafeSave($("#creator-form"),{existing:Boolean(creator.id),canEdit:!!state.dashboard.user.capabilities?.captureFacts,
    governed:['creatorStatus','compensationModel','rightsStatus','productFocus','evidenceLink'],
    save:body=>api(creator.id?"creators/"+creator.id:"creators",{method:creator.id?"PATCH":"POST",body:JSON.stringify({...body,saveIntent:'REVIEWED_RECORD_EDIT',...(creator.id?{version:creator.version}:{})})}),
    onSaved:async()=>{notice("Saved, attributed, and queued for Control System synchronization.");await reload("work");}});
  $("#submit-qa")?.addEventListener("click",async () => {
    if([...recordEditors].some(e=>e.form.isConnected&&e.dirty)){notice("Save or discard local changes before sending to QA.",true);return;}
    if(!window.confirm("Send the saved record to QA and lock factual editing?"))return;
    try {
      await api("creators/" + creator.id,{ method: "PATCH",body: JSON.stringify({ action: "AWAITING_QA",version: creator.version }) });
      notice("Sent to QA. The record is now locked.");
      await reload("work");
    } catch (error) { notice(error.message,true); }
  });
  $("#new-assignment")?.addEventListener("click",() => {
    if(!leavePendingEdits())return;
    $("#assignment-new").innerHTML = assignmentForm();
    bindAssignments();
  });
  if($('#qa-form'))bindSafeSave($('#qa-form'),{governed:['result'],
    save:body=>api('qa/'+creator.id,{method:'POST',body:JSON.stringify({...body,saveIntent:'REVIEWED_RECORD_EDIT',version:creator.version})}),
    onSaved:async()=>{notice('QA review recorded. This does not authorize launch.');await reload('work');}});
}

function bindAssignments() {
  applyRoleControls();
  document.querySelectorAll(".assignment-form").forEach((form) => {
    if (form.dataset.bound) return;
    form.dataset.bound = "true";
    bindApprovalReference(form);
    const id=form.dataset.assignmentId;
    bindSafeSave(form,{existing:Boolean(id),canEdit:!!state.dashboard.user.capabilities?.captureFacts,
      governed:['status','startDate','contentDue','fixedContentFee','commissionRate','attributionWindowDays','paidUsageRights','evidenceStatus','signedRightsEvidenceLink'],
      save:body=>api(id?"assignments/"+id:"assignments",{method:id?"PATCH":"POST",body:JSON.stringify({...body,saveIntent:'REVIEWED_RECORD_EDIT',campaignId:body.campaignId||state.current.creator.campaign_id,...(id?{version:Number(form.dataset.version)}:{})})}),
      onSaved:async()=>{notice("Assignment saved and queued for synchronization.");await openRecord(state.current.creator.id);}});
  });
}

async function creatorSearch() {
  if(!leavePendingEdits())return;
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
  if(!leavePendingEdits())return;
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
  $("#audit-view").innerHTML = '<div class="section-head"><div><h2>Audit trail</h2><p>Authorized audit visibility in assigned scope. Corrections preserve original events.</p></div></div><div class="panel audit-wrap"><table class="audit-table"><thead><tr><th>WHEN</th><th>OPERATOR</th><th>ACTION</th><th>RECORD</th><th>CHANGE</th></tr></thead><tbody>' +
    events.map((event) => '<tr><td>' + esc(event.created_at) + '</td><td>' + esc(event.operator_name) + '<br>'+(event.role_at_event?'Role at event: ':'Current role: ') + esc(event.operator_role) + '</td><td>' + esc(event.action) + '</td><td>' + esc(event.object_id) + '</td><td>' + esc(event.previous_value || "—") + ' → ' + esc(event.new_value || "—") + (state.dashboard.user.canManageTeam?'<br><button class="action secondary" data-correct-event="'+esc(event.id)+'">Append correction</button>':'') + '</td></tr>').join("") +
    '</tbody></table></div><section id="audit-correction-editor"></section>';
  $('#audit-view').querySelectorAll('[data-correct-event]').forEach(button=>button.addEventListener('click',()=>editAuditCorrection(button.dataset.correctEvent)));
}
function editAuditCorrection(eventId) {
  if(!state.dashboard.user.canManageTeam)return;
  $('#audit-correction-editor').innerHTML='<form id="audit-correction-form" class="panel"><h3>Append an audit correction</h3><p>Original event: '+esc(eventId)+'</p><label>Correction <textarea name="correction" required maxlength="4000"></textarea></label><label>Reason <textarea name="reason" required maxlength="2000"></textarea></label><button class="action" type="submit">Append correction</button></form>';
  const form=$('#audit-correction-form');
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;try{await api('audit/corrections',{method:'POST',body:JSON.stringify({eventId,...Object.fromEntries(new FormData(form))})});notice('Correction appended; original event preserved.');await renderAudit();}catch(e){notice(e.message,true);button.disabled=false;}});
}

async function reload(view) {
  if(await loadCampaign(state.dashboard.campaign.id)===false)return;
  renderAll();
  show(view);
}

function show(view) {
  if (view === "audit" && !state.dashboard.user.canViewAudit) return;
  if (view === "reports" && !state.dashboard.user.canViewReports) return;
  if (view === "team" && !state.dashboard.user.canManageTeam) return;
  if (view === "diagnostics" && !state.dashboard.user.canDiagnose) return;
  document.querySelectorAll(".view").forEach((element) => { element.hidden = true; });
  const target = $("#" + view + "-view");
  if (target) target.hidden = false;
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active",button.dataset.view === view));
  if (view === "audit") renderAudit().catch((error) => notice(error.message,true));
  if (view === "reports") renderReports().catch((error) => notice(error.message,true));
  if (view === "team") renderTeam().catch((error) => notice(error.message,true));
  if (view === "diagnostics") renderDiagnostics().catch((error) => notice(error.message,true));
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
      if(!leavePendingEdits())return;
      await loadCampaign(openWork.dataset.openWork);
      renderAll();
      show("work");
    }
    if (event.target.id === "new-creator") {
      if(!leavePendingEdits())return;
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

// This reference is a Console authorization ID, not a new source workbook field.
function approvalReference(type) {
  const role=state.dashboard.user?.role;
  if(!['ADMINISTRATOR','OPERATIONS'].includes(role) && !(role==='OPERATOR' && type==='ASSIGNMENT'))return '';
  const purpose=role==='OPERATOR'?'Start Date and Content Due':'the exact approved values';
  return '<label>Authorization reference <input name="authorizationId" autocomplete="off" placeholder="Reference supplied by the authorized approver"><span class="field-help">APPROVAL · Enter the recorded decision reference to capture '+purpose+'. The server checks this record, the exact values and the decision validity when you save. This reference does not grant approval authority.</span></label>';
}
function bindApprovalReference(form) {
  form?.querySelector('[name="authorizationId"]')?.addEventListener('input',applyRoleControls);
}
function applyRoleControls() {
  const user=state.dashboard.user,owner=user.role==='ADMINISTRATOR';
  const capture=!!user.capabilities?.captureFacts;
  const form=$('#creator-form');
  if(form) {
    const referenced=['ADMINISTRATOR','OPERATIONS'].includes(user.role) && Boolean(form.querySelector('[name="authorizationId"]')?.value.trim());
    form.querySelectorAll('input,select,textarea').forEach(control=>{
      if(!capture)control.disabled=true;
      else if(['compensationModel','rightsStatus','productFocus'].includes(control.name))control.disabled=!referenced;
      else if(!owner && control.name==='creatorStatus')control.disabled=true;
      else if(control.name==='evidenceLink'&&state.current?.creator?.rights_status==='Paid Usage Approved')control.disabled=!referenced;
      if(!state.current && !owner && control.name==='compensationModel')control.value='N/A';
      if(!state.current && !owner && control.name==='rightsStatus')control.value='Not Reviewed';
      if(!state.current && !owner && control.name==='creatorStatus')control.value='Not Started';
      if(!state.current && control.name==='productFocus' && capture)control.disabled=false;
    });
    if(form.dataset.safeMode&&form.dataset.safeMode!=='EDIT')form.querySelectorAll('input,select,textarea').forEach(control=>{control.disabled=true;});
    form.querySelectorAll('button').forEach(control=>{if(!capture)control.disabled=true;});
  }
  document.querySelectorAll('.assignment-form').forEach(form=>{
    const referenced=Boolean(form.querySelector('[name="authorizationId"]')?.value.trim());
    const approved=['startDate','contentDue',...(['ADMINISTRATOR','OPERATIONS'].includes(user.role)?['fixedContentFee','commissionRate','attributionWindowDays','paidUsageRights','evidenceStatus','signedRightsEvidenceLink']:[])];
    form.querySelectorAll('input,select,textarea').forEach(control=>{
      if(!capture)control.disabled=true;
      else if(approved.includes(control.name))control.disabled=!referenced;
      else if(!owner && !['notes','creatorId','campaignId','authorizationId'].includes(control.name))control.disabled=true;
    });
    if(form.dataset.safeMode&&form.dataset.safeMode!=='EDIT')form.querySelectorAll('input,select,textarea').forEach(control=>{control.disabled=true;});
    form.querySelectorAll('button').forEach(control=>{if(!capture)control.disabled=true;});
  });
  const newAssignment=$('#new-assignment');if(newAssignment)newAssignment.hidden=!capture;
}
function escalationForm() {
  if(!state.dashboard.user.capabilities?.captureFacts&&!['OPERATIONS_MANAGER','MARKETING_CAMPAIGN_MANAGER'].includes(state.dashboard.user.role))return '';
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
function teamScope(person) {
  if(person.ownerReserved)return 'Owner / Administrator';
  if(person.accessStatus!=='ACTIVE')return 'Inactive — no operational access';
  const grants=person.scope.map(g=>g.campaign_id+' / '+(g.record_id==='*'?'All campaign records':g.record_id));
  const assigned=person.profile?.managed_scope?[]:person.assignedRecords.map(r=>r.campaign_id+' / '+r.id+' (record assignment)');
  return [...new Set([...grants,...assigned])].join('; ')||'No active record scope';
}
function roleChoices(meta,current) {
  return meta.approvedRoles.map(role=>'<option value="'+esc(role)+'" '+(role===current?'selected':'')+'>'+esc(meta.roleCatalog?.[role]||role)+'</option>').join('');
}
function teamRows(users) {
  return users.map(person=>'<tr><td>'+esc(person.fullName)+'</td><td>'+esc(person.email)+(person.retiredIdentity?'<br><strong>Retired identity · history preserved</strong>':'')+'</td><td>'+esc(state.teamMeta?.roleCatalog?.[person.role]||person.role)+'</td><td>'+esc(teamScope(person))+'</td><td>'+esc(person.profile?.environment||state.teamMeta?.environment||'Not recorded')+'</td><td>'+esc(person.profile?.training_status||'Not recorded')+'</td><td>'+esc(['PENDING','INVITED'].includes(person.profile?.lifecycle_status)?'Invited · inactive':person.profile?.lifecycle_status||person.accessStatus)+'</td><td>'+esc(person.lastAccess||'No recorded access')+'</td><td><button class="action secondary" data-team-person="'+esc(person.id)+'">View</button></td></tr>').join('');
}
function technicalChoices(current) {
  return [['TRAINING','Technician — Training'],['PRODUCTION_SUPPORT','Technician — Production Support'],['INFRASTRUCTURE_ADMIN','Technician — Infrastructure Admin']].map(([key,label])=>'<option value="'+key+'" '+(key===current?'selected':'')+'>'+label+'</option>').join('');
}
function addTeamForm(data) {
  if(!data.metadataReady)return '<div class="notice error persistent">Team governance migration is pending. The existing directory remains read-only.</div>';
  return '<details class="panel"><summary>Add User</summary><form id="add-team-form"><div class="form-grid">'+
    '<label>Full name <input name="fullName" required maxlength="150" autocomplete="name"></label>'+
    '<label>Individual email address <input name="email" type="email" required maxlength="254" autocomplete="email"></label>'+
    '<label>Approved role <select name="role">'+roleChoices(data,'OPERATOR')+'</select><span class="field-help">Administrator is reserved for the Owner.</span></label>'+
    '<label>Employment status <select name="employmentStatus"><option value="PENDING_START">Pending start</option><option value="EMPLOYED">Employed</option></select></label>'+
    '<label>Proposed scope <select name="scopeKind"><option value="none">No scope yet</option><option value="campaign">Entire selected campaign</option><option value="records">Selected Creator IDs</option></select></label>'+
    '<label>Campaign ID <select name="campaignId"><option value="">Select a campaign</option>'+data.campaigns.map(c=>'<option value="'+esc(c.id)+'">'+esc(campaignLabel(c))+'</option>').join('')+'</select></label>'+
    '<label>Creator IDs <input name="recordIds" placeholder="CR-100, CR-101"><span class="field-help">Each Creator ID must belong to the chosen Campaign ID.</span></label>'+
    '<label>Technical level <select name="technicalLevel">'+technicalChoices(data.environment==='TRAINING'?'TRAINING':'PRODUCTION_SUPPORT')+'</select><span class="field-help">Used only for Technician. This designation does not grant infrastructure administration.</span></label>'+
    '<label>Environment <input disabled value="'+esc(data.environment)+'"></label><label>Training status <input disabled value="Not Started"></label>'+
    '</div><p>Saving creates an invited, inactive individual identity and proposed scope. Training certification and production activation are separate, attributable actions.</p><button class="action" type="submit">Save inactive user</button></form></details>';
}
async function renderTeam() {
  if(!state.dashboard.user.canManageTeam)return;
  const data=await api('team');state.teamMeta=data;
  $('#team-view').innerHTML='<div class="section-head"><div><span class="eyebrow">Administration</span><h2>Team &amp; Access</h2><p>Individual identities · login at <a href="https://ops.creatorloop.net">ops.creatorloop.net</a></p></div></div>'+
    '<div class="panel"><p>'+esc(data.notice)+'</p><p>Historical identities remain identifiable. Deactivation is not deletion. Training certification never automatically grants production access.</p>'+ (data.metadataReady?'<button class="action secondary" id="export-personnel">Download personnel directory</button>':'')+'</div>'+addTeamForm(data)+
    '<div class="panel audit-wrap"><table class="audit-table team-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Scope</th><th>Environment</th><th>Training Status</th><th>Access Status</th><th>Last Access</th><th>Actions</th></tr></thead><tbody>'+teamRows(data.users)+'</tbody></table></div><section id="team-detail"></section>';
  $('#team-view').querySelectorAll('[data-team-person]').forEach(button=>button.addEventListener('click',()=>viewTeamPerson(button.dataset.teamPerson).catch(e=>notice(e.message,true))));
  $('#export-personnel')?.addEventListener('click',()=>downloadDataset('personnel').catch(e=>notice(e.message,true)));
  const form=$('#add-team-form');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('button[type="submit"]');if(button.disabled)return;
    const fields=Object.fromEntries(new FormData(form));
    const ids=fields.scopeKind==='records'?fields.recordIds.split(',').map(id=>id.trim()).filter(Boolean):['*'];
    if(fields.scopeKind!=='none'&&(!fields.campaignId||!ids.length)){notice('Choose the Campaign ID and required Creator IDs',true);return;}
    const scopes=fields.scopeKind==='none'?[]:ids.map(recordId=>({campaignId:fields.campaignId,recordId}));
    button.disabled=true;
    try {const result=await api('team',{method:'POST',body:JSON.stringify({action:'addPending',fullName:fields.fullName,email:fields.email,role:fields.role,employmentStatus:fields.employmentStatus,technicalLevel:fields.role==='TECHNICIAN'?fields.technicalLevel:null,scopes})});notice(result.notice);await renderTeam();}
    catch(e){notice(e.message,true);button.disabled=false;}
  });
}
async function viewTeamPerson(id) {
  const data=await api('team/'+encodeURIComponent(id));state.teamPerson=data.person;
  $('#team-detail').innerHTML=teamPersonDetails(data);
  $('#team-detail').querySelectorAll('[data-team-action]').forEach(button=>button.addEventListener('click',()=>editTeamAction(button.dataset.teamAction)));
  $('#team-detail').scrollIntoView({block:'nearest'});
}
function teamPersonDetails({person,events,historyNotice}) {
  const proposed=person.profile?JSON.parse(person.profile.proposed_scope_json):[];
  const writable=state.teamMeta?.metadataReady&&!person.ownerReserved&&!person.retiredIdentity&&person.role!=='ADMINISTRATOR';
  const actions=writable?'<div class="qa-actions">'+['editEmployment','editScope','changeRole','manageAuthority','visibility','startTraining','certify','activate','suspend','deactivate'].map(action=>'<button class="action secondary" data-team-action="'+action+'" '+(action==='activate'&&!state.teamMeta.activationAvailable?'disabled title="Individual admission rollout is not verified"':'')+'>'+({editEmployment:'Employment Status',editScope:'Edit Scope',changeRole:'Change Role',manageAuthority:'Manage Authority',visibility:'Visibility & Exports',startTraining:'Start Training',certify:'Record Certification',activate:'Activate',suspend:'Suspend',deactivate:'Deactivate'}[action])+'</button>').join('')+'</div>':'';
  return '<div class="panel"><h2>'+esc(person.fullName)+'</h2><p>'+esc(person.email)+' · '+esc(person.role)+'</p>'+actions+
    '<p>Current scope: '+esc(teamScope(person))+'</p><p>Environment: '+esc(person.profile?.environment||state.teamMeta?.environment||'Not recorded')+' · Employment status: '+esc(person.profile?.employment_status||'Not recorded')+'</p>'+
    '<p>Proposed scope: '+esc(proposed.map(s=>s.campaignId+' / '+s.recordId).join('; ')||'None')+'</p>'+
    '<p>Cloudflare session revocation: '+esc(person.profile?.edge_revocation_status||'Not recorded')+'</p>'+
    '<p>Delegated approvals: '+esc(person.delegations.map(d=>d.campaign_id+' / '+authorityLabel(d.field_key)+' / expires '+d.expires_at).join('; ')||'None')+'</p>'+
    '<p>Record attribution is preserved separately from access grants.</p><p>'+esc(historyNotice)+'</p>'+events.map(event=>'<div class="record-section"><strong>'+esc(event.action)+'</strong><p>'+esc(event.created_at)+' · '+esc(event.actor_name)+' · '+esc(event.actor_email)+' · Role at action: '+esc(event.actor_role)+'</p><details><summary>Recorded change</summary><pre>'+esc(event.previous_state_json||'No previous state')+' → '+esc(event.new_state_json)+'</pre></details></div>').join('')+'<section id="team-action-editor"></section></div>';
}
function authorityLabel(key) {
  return {compensationModel:'Compensation Model',rightsStatus:'Rights Status',productFocus:'Product Focus',evidenceLink:'Evidence Link',fixedContentFee:'Fixed Content Fee ($)',commissionRate:'Commission %',attributionWindowDays:'Attribution Window (Days)',paidUsageRights:'Paid Usage Rights',evidenceStatus:'Evidence Status',signedRightsEvidenceLink:'Signed Rights Evidence Link',startDate:'Start Date',contentDue:'Content Due'}[key]||key;
}
function teamActionFields(action,person,meta) {
  const p=person.profile,scopes=p?JSON.parse(p.proposed_scope_json):[...person.scope.map(g=>({campaignId:g.campaign_id,recordId:g.record_id})),...person.assignedRecords.map(r=>({campaignId:r.campaign_id,recordId:r.id}))];
  if(action==='editEmployment')return '<label>Employment status <select name="employmentStatus"><option value="PENDING_START" '+(p?.employment_status==='PENDING_START'?'selected':'')+'>Pending start</option><option value="EMPLOYED" '+(p?.employment_status==='EMPLOYED'?'selected':'')+'>Employed</option></select></label><p>Employment status does not grant access. Suspend access before returning an active person to pending start.</p>';
  if(action==='changeRole')return '<p>Changing role pauses access and clears certification, authority and sensitive visibility. Review training and explicitly activate afterward.</p><label>Approved role <select name="role">'+roleChoices(meta,person.role)+'</select></label><label>Technical level <select name="technicalLevel">'+technicalChoices(p?.technical_level||'TRAINING')+'</select></label>';
  if(action==='editScope')return '<label>Campaign ID, Creator ID <textarea name="scopes" rows="5">'+esc(scopes.map(s=>s.campaignId+','+s.recordId).join('\n'))+'</textarea><span class="field-help">One assignment per line. Use * only when authorizing the entire campaign. Empty scope revokes all record access.</span></label>'+(person.role==='TECHNICIAN'?'<label><input type="checkbox" name="diagnostics" '+(JSON.parse(p?.system_scope_json||'[]').includes('console_diagnostics')?'checked':'')+'> Console diagnostics only</label>':'');
  if(action==='visibility')return '<fieldset><legend>Read visibility — does not grant business approval</legend>'+meta.visibilityCategories.map(c=>'<label><input type="checkbox" name="view_'+c+'" '+(JSON.parse(p?.visibility_json||'[]').includes(c)?'checked':'')+'> '+esc({creator_pii:'Creator identity, contact and evidence',creator_compensation:'Approved creator compensation terms',financial_economics:'Financial/economic information in assigned campaigns',audit_history:'Audit history in assigned scope',finalized_reports:'Finalized Console reports in assigned scope'}[c])+'</label>').join('')+'</fieldset><fieldset><legend>Separate download authorization</legend>'+meta.exportCategories.map(c=>'<label><input type="checkbox" name="export_'+c+'" '+(JSON.parse(p?.export_permissions_json||'[]').includes(c)?'checked':'')+'> '+esc(c)+'</label>').join('')+'</fieldset>';
  if(action==='manageAuthority')return '<p>Explicit field/campaign approval only. Owner Approval, launch, budget/spend and consequential exception authority are not granted by this control.</p>'+[...person.delegations,{}].map((d,i)=>'<div class="nested-panel"><label>Campaign ID <select name="delegation_'+i+'_campaignId"><option value="">No delegation</option>'+meta.campaigns.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===d.campaign_id?'selected':'')+'>'+esc(campaignLabel(c))+'</option>').join('')+'</select></label><label>Approval field <select name="delegation_'+i+'_fieldKey">'+meta.authorityFields.map(f=>'<option value="'+esc(f)+'" '+(f===d.field_key?'selected':'')+'>'+esc(authorityLabel(f))+'</option>').join('')+'</select></label><label>Expires (UTC) <input step="1" name="delegation_'+i+'_expiresAt" type="datetime-local" value="'+esc(d.expires_at?new Date(d.expires_at).toISOString().slice(0,19):'')+'"></label><label><input type="checkbox" name="delegation_'+i+'_remove"> Remove this delegation</label></div>').join('');
  if(action==='certify')return '<p>Certification records the Owner’s verification. It does not activate production access. Use evidence from the isolated sandbox and the person’s approved role procedure.</p><label>Certification evidence <input name="evidenceLink" type="url" required></label><label><input type="checkbox" name="attestation" required> I verified this individual’s role-specific training and required scenarios.</label>';
  if(action==='startTraining')return '<p>'+(meta.environment==='TRAINING'?'Hosted sandbox access requires verified individual admission.':'This records training status only. Actual practice must occur in the isolated hosted sandbox; production access remains disabled.')+'</p>';
  if(action==='activate')return '<p>Activation requires verified individual admission, current-role certification and explicit scope. It grants only this environment’s approved access.</p>';
  return '<p>Future Console access will be blocked. Historical activity remains preserved. Any Cloudflare token revocation is tracked separately and must be verified.</p>';
}
function editTeamAction(action) {
  const person=state.teamPerson,meta=state.teamMeta;
  $('#team-action-editor').innerHTML='<form id="team-action-form"><h3>'+esc(action.replace(/([A-Z])/g,' $1'))+'</h3>'+teamActionFields(action,person,meta)+'<label>Reason <textarea name="reason" required maxlength="2000"></textarea></label><button class="action" type="submit">Record authorized change</button></form>';
  const form=$('#team-action-form');
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('button[type="submit"]');if(button.disabled)return;
    try {
    const fields=Object.fromEntries(new FormData(form));
    const body={action,operatorId:person.id,version:person.profile?.version||0,reason:fields.reason};
    if(action==='editEmployment')body.employmentStatus=fields.employmentStatus;
    if(action==='changeRole'){body.role=fields.role;body.technicalLevel=fields.role==='TECHNICIAN'?fields.technicalLevel:null;}
    if(action==='editScope'){body.scopes=fields.scopes.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const [campaignId,recordId,...rest]=line.split(',').map(s=>s.trim());if(!campaignId||!recordId||rest.length)throw new Error('Use one Campaign ID, Creator ID assignment per line');return {campaignId,recordId};});body.systems=fields.diagnostics?['console_diagnostics']:[];}
    if(action==='visibility'){body.categories=meta.visibilityCategories.filter(c=>fields['view_'+c]);body.exports=meta.exportCategories.filter(c=>fields['export_'+c]);}
    if(action==='manageAuthority'){body.delegations=[];for(let i=0;i<=person.delegations.length;i++){const campaignId=fields['delegation_'+i+'_campaignId'];if(campaignId&&!fields['delegation_'+i+'_remove']){const date=new Date(fields['delegation_'+i+'_expiresAt']+'Z');if(!Number.isFinite(date.getTime())){notice('Choose a future delegation expiry',true);return;}body.delegations.push({campaignId,fieldKey:fields['delegation_'+i+'_fieldKey'],expiresAt:date.toISOString()});}}}
    if(action==='certify'){body.evidenceLink=fields.evidenceLink;body.attestation=!!fields.attestation;}
    button.disabled=true;
    const result=await api('team',{method:'POST',body:JSON.stringify(body)});notice(result.notice);await renderTeam();await viewTeamPerson(person.id);}
    catch(e){notice(e.message,true);button.disabled=false;}
  });
}
async function downloadDataset(dataset) {
  const response=await fetch('/api/console/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset,...(dataset==='personnel'?{}:{campaignId:state.dashboard.campaign.id})})});
  if(!response.ok){const body=await response.json();throw new Error(body.error||'Export denied');}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='creatorloop-'+dataset+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Authorized download recorded in audit history.');
}
async function renderDiagnostics() {
  if(!state.dashboard.user.canDiagnose)return;
  const data=await api('diagnostics');$('#diagnostics-view').innerHTML='<div class="panel"><h2>Technical diagnostics</h2><p>Environment: '+esc(data.environment)+'</p><p>Operational schema: '+(data.schemaReady?'Ready':'Pending')+'</p><p>'+esc(data.notice)+'</p></div>';
}


function reportSnapshot(records,dataset) {
  const fields=dataset==='creators'?{id:'Creator ID',creator_name:'Creator Name',primary_platform:'Primary Platform',handle:'Handle',contact:'Email / Contact',creator_status:'Status',product_focus:'Product Focus',rights_status:'Rights Status'}:{id:'Campaign ID',name:'Campaign Name',platform:'Platform',status:'Status',product_scope:'Product Scope',cash_budget:'Cash Budget ($)'};
  const keys=Object.keys(fields).filter(key=>records.some(row=>key in row));
  return '<div class="audit-wrap"><table class="audit-table"><thead><tr>'+keys.map(key=>'<th>'+esc(fields[key])+'</th>').join('')+'</tr></thead><tbody>'+records.map(row=>'<tr>'+keys.map(key=>'<td>'+esc(row[key]??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
async function renderReports() {
  const user=state.dashboard.user;if(!user.canViewReports)return;
  const reports=(await api('reports?campaignId='+encodeURIComponent(state.dashboard.campaign.id))).reports;
  const latest=reports.filter(report=>!reports.some(other=>other.reportId===report.reportId&&other.version>report.version));
  $('#reports-view').innerHTML='<div class="section-head"><div><h2>Finalized reports</h2><p>Every version is preserved. Viewing and downloading follow your current permissions.</p></div>'+(user.exportDatasets.includes('reports')?'<button class="action secondary" id="report-download">Download authorized reports</button>':'')+'</div>'+
    (user.canManageTeam?'<form id="finalize-report-form" class="panel"><h3>Finalize a Console snapshot</h3><label>Report <select name="reportId"><option value="">New report</option>'+latest.map(r=>'<option value="'+esc(r.reportId)+'">'+esc(r.title)+' · version '+r.version+'</option>').join('')+'</select></label><label>Records <select name="dataset"><option value="creators">🗺️CREATORS</option><option value="campaigns">CAMPAIGNS</option></select></label><label>Title <input name="title" required maxlength="160"></label><label>Reason <textarea name="reason" required maxlength="2000"></textarea></label><button type="submit" class="action">Finalize version</button><p>This saves a historical Console snapshot. External reports remain governed in their own source systems.</p></form>':'')+
    (reports.map(report=>'<article class="panel"><h3>'+esc(report.title)+' · version '+report.version+'</h3><p>'+esc(report.finalizedAt)+' · '+esc(report.finalizedBy)+' · Role at event: '+esc(report.roleAtEvent)+'</p><p>'+esc(report.reason)+'</p><details><summary>'+report.records.length+' authorized records</summary>'+reportSnapshot(report.records,report.dataset)+'</details></article>').join('')||'<div class="panel">No finalized Console reports for this campaign.</div>');
  $('#report-download')?.addEventListener('click',()=>downloadDataset('reports').catch(error=>notice(error.message,true)));
  const form=$('#finalize-report-form');if(!form)return;
  form.querySelector('[name="reportId"]').addEventListener('change',event=>{const report=latest.find(r=>r.reportId===event.target.value);if(report){form.querySelector('[name="dataset"]').value=report.dataset;form.querySelector('[name="title"]').value=report.title;}form.querySelector('[name="dataset"]').disabled=!!report;});
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;try{const fields=Object.fromEntries(new FormData(form)),previous=latest.find(r=>r.reportId===fields.reportId);await api('reports',{method:'POST',body:JSON.stringify({campaignId:state.dashboard.campaign.id,reportId:fields.reportId||undefined,dataset:previous?.dataset||fields.dataset,title:fields.title,reason:fields.reason,expectedVersion:previous?.version||0})});notice('Report version finalized. Prior versions remain preserved.');await renderReports();}catch(error){notice(error.message,true);button.disabled=false;}});
}

start();
