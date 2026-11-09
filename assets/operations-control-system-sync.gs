/**
 * CreatorLoop Operations Console V2 — Control System bridge
 *
 * Install this code as a bound Apps Script in the approved PNB Acquisition & Launch
 * Control System spreadsheet. Configure Script Properties (never source code):
 *   CREATORLOOP_SYNC_ENDPOINT = https://ops.creatorloop.net/api/integrations/control-system
 *   CREATORLOOP_SYNC_SECRET   = the same high-entropy secret stored in Cloudflare
 *   CREATORLOOP_ACCESS_CLIENT_ID     = Cloudflare Access service-token client ID
 *   CREATORLOOP_ACCESS_CLIENT_SECRET = Cloudflare Access service-token client secret
 *
 * Run syncCreatorLoopOperations from a time-driven trigger. The script sends only
 * mapped operational fields, never workbook credentials or unrelated tabs.
 */

const CL_SYNC = Object.freeze({
  CAMPAIGNS: "CAMPAIGNS",
  CREATORS: "🗺️CREATORS",
  ASSIGNMENTS: "CREATOR ASSIGNMENTS",
  CREATIVES: "CREATIVES",
  HEADER_ROW: 3
});

function syncCreatorLoopOperations() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const endpoint = properties.getProperty("CREATORLOOP_SYNC_ENDPOINT");
    const secret = properties.getProperty("CREATORLOOP_SYNC_SECRET");
    const accessClientId = properties.getProperty("CREATORLOOP_ACCESS_CLIENT_ID");
    const accessClientSecret = properties.getProperty("CREATORLOOP_ACCESS_CLIENT_SECRET");
    if (!endpoint || !secret || !accessClientId || !accessClientSecret) {
      throw new Error("CreatorLoop sync and Cloudflare Access properties are not configured");
    }

    const snapshot = buildCreatorLoopSnapshot_();
    signedFetch_(endpoint, secret, accessClientId, accessClientSecret, "post", snapshot);
    const pending = signedFetch_(endpoint, secret, accessClientId, accessClientSecret, "get", null);
    const acknowledged = [];
    (pending.changes || []).forEach((change) => {
      applyConsoleChange_(change);
      SpreadsheetApp.flush();
      acknowledged.push(change.id);
    });
    if (acknowledged.length) {
      signedFetch_(endpoint, secret, accessClientId, accessClientSecret, "post", { mode: "ack", ids: acknowledged });
    }
  } finally {
    lock.releaseLock();
  }
}

function buildCreatorLoopSnapshot_() {
  const assignments = assignmentRows_();
  const primaryCampaign = {};
  assignments.forEach((assignment) => {
    if (!primaryCampaign[assignment.creatorId] || ["Active","In Progress","Approved"].includes(assignment.status)) {
      primaryCampaign[assignment.creatorId] = assignment.campaignId;
    }
  });
  return {
    mode: "import",
    eventId: Utilities.getUuid(),
    sourceVersion: "SHEET-" + new Date().toISOString(),
    campaigns: campaignRows_(),
    creators: creatorRows_(primaryCampaign),
    assignments: assignments,
    creatives: creativeRows_(),
    operationalRecords: operationalRows_(primaryCampaign)
  };
}

function rowsByHeader_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) throw new Error("Missing required sheet: " + sheetName);
  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(CL_SYNC.HEADER_ROW,1,1,lastColumn).getDisplayValues()[0];
  const rows = lastRow > CL_SYNC.HEADER_ROW
    ? sheet.getRange(CL_SYNC.HEADER_ROW + 1,1,lastRow - CL_SYNC.HEADER_ROW,lastColumn).getDisplayValues()
    : [];
  return { sheet: sheet, headers: headers, rows: rows };
}
function objectFromRow_(headers,row) {
  return headers.reduce((record,header,index) => {
    if (header) record[header] = row[index];
    return record;
  },{});
}
function number_(value) {
  const parsed = Number(String(value || "0").replace(/[$,%]/g,""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function rate_(value) {
  const raw = String(value || "");
  return raw.includes("%") ? number_(raw) / 100 : number_(raw);
}
function iso_(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function campaignStatus_(value) {
  return String(value || "NOT_STARTED").trim().toUpperCase().replace(/\s+/g,"_");
}
function platform_(value) {
  const text = String(value || "");
  if (/tiktok/i.test(text)) return "TikTok";
  if (/instagram|facebook|meta/i.test(text)) return "Meta";
  if (/google/i.test(text)) return "Google";
  if (/shopify/i.test(text)) return "Shopify";
  if (/klaviyo/i.test(text)) return "Klaviyo";
  if (/recharge/i.test(text)) return "Recharge";
  if (/clipster/i.test(text)) return "Clipster";
  return "Other";
}

function campaignRows_() {
  const table = rowsByHeader_(CL_SYNC.CAMPAIGNS);
  return table.rows.map((row) => objectFromRow_(table.headers,row))
    .filter((row) => /^CMP-\d+$/.test(row["Campaign ID"]) && row["Campaign Name"])
    .map((row) => ({
      id: row["Campaign ID"],
      name: row["Campaign Name"],
      brandCode: String(row["Campaign Name"]).split("_")[0] || "CL",
      status: campaignStatus_(row["Status"]),
      sourceReference: "PNB Acquisition & Launch Control System / CAMPAIGNS",
      platform: platform_(row["Platform"]),
      objective: row["Objective"] || null,
      slug: row["Campaign Slug"] || null,
      cashBudget: number_(row["Cash Budget ($)"]),
      promoCredit: number_(row["Promo Credit ($)"]),
      startDate: iso_(row["Start Date"]),
      endDate: iso_(row["End Date"]),
      owner: row["Owner"] || null,
      productScope: row["Product Scope"] || null,
      notes: row["Notes"] || null,
      sourceUpdatedAt: new Date().toISOString()
    }));
}

function creatorRows_(primaryCampaign) {
  const table = rowsByHeader_(CL_SYNC.CREATORS);
  return table.rows.map((row) => objectFromRow_(table.headers,row))
    .filter((row) => /^CR-\d+$/.test(row["Creator ID"]) && row["Creator Name"])
    .map((row) => ({
      id: row["Creator ID"],
      campaignId: primaryCampaign[row["Creator ID"]] || null,
      creatorName: row["Creator Name"],
      primaryPlatform: row["Primary Platform"],
      handle: row["Handle"],
      contact: row["Email / Contact"],
      creatorStatus: row["Status"],
      compensationModel: row["Compensation Model"],
      rightsStatus: row["Rights Status"],
      productFocus: row["Product Focus"],
      enrollmentDate: iso_(row["Enrollment Date"]) || new Date().toISOString(),
      notes: row["Notes"] || null,
      evidenceLink: row["Evidence Link"] || null,
      sourceRecord: "PNB Acquisition & Launch Control System / 🗺️CREATORS / " + row["Creator ID"],
      sourceUpdatedAt: iso_(row["Last Updated"]) || new Date().toISOString()
    }));
}

function assignmentRows_() {
  const table = rowsByHeader_(CL_SYNC.ASSIGNMENTS);
  return table.rows.map((row) => objectFromRow_(table.headers,row))
    .filter((row) => /^ASG-\d+$/.test(row["Assignment ID"]) && row["Creator ID"] && row["Campaign ID"])
    .map((row) => ({
      id: row["Assignment ID"],
      environment: row["Environment"] === "PRODUCTION" ? "PRODUCTION" : (row["Environment"] === "TEST" ? "TEST" : "NONPRODUCTION"),
      creatorId: row["Creator ID"],
      campaignId: row["Campaign ID"],
      status: row["Status"],
      startDate: iso_(row["Start Date"]),
      contentDue: iso_(row["Content Due"]),
      fixedContentFee: number_(row["Fixed Content Fee ($)"]),
      commissionRate: rate_(row["Commission %"]),
      paidUsageRights: row["Paid Usage Rights"] || "Pending",
      attributionWindowDays: Math.max(1,Math.round(number_(row["Attribution Window (Days)"]) || 30)),
      evidenceStatus: row["Evidence Status"] || "Planned",
      notes: row["Notes"] || null,
      signedRightsEvidenceLink: row["Signed Rights Evidence Link"] || null,
      sourceUpdatedAt: new Date().toISOString()
    }));
}

function creativeRows_() {
  const table = rowsByHeader_(CL_SYNC.CREATIVES);
  return table.rows.map((row) => objectFromRow_(table.headers,row))
    .filter((row) => /^CRE-\d+$/.test(row["Creative ID"]) && row["Creative Name"] && row["Creator ID"] && row["Campaign ID"])
    .map((row) => ({
      id: row["Creative ID"],
      creativeName: row["Creative Name"],
      creatorId: row["Creator ID"],
      campaignId: row["Campaign ID"],
      product: row["Product"],
      angle: row["Angle"] || null,
      format: row["Format"],
      platform: platform_(row["Platform"]),
      rightsStatus: row["Rights Status"],
      approvalStatus: row["Approval Status"],
      destinationUrl: row["Destination URL"] || null,
      createdDate: iso_(row["Created Date"]),
      evidenceLink: row["Evidence Link"] || null,
      sourceUpdatedAt: iso_(row["Last Updated"]) || new Date().toISOString()
    }));
}

function signedFetch_(endpoint,secret,accessClientId,accessClientSecret,method,payload) {
  const body = payload === null ? "" : JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  // Sign the same UTF-8 bytes sent by UrlFetchApp and verified by Pages.
  const bytes = Utilities.computeHmacSha256Signature(timestamp + "." + body,secret,Utilities.Charset.UTF_8);
  const signature = bytes.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
  const options = {
    method: method,
    muteHttpExceptions: true,
    followRedirects: false,
    headers: {
      "CF-Access-Client-Id": accessClientId,
      "CF-Access-Client-Secret": accessClientSecret,
      "X-CreatorLoop-Timestamp": timestamp,
      "X-CreatorLoop-Signature": signature
    }
  };
  if (payload !== null) {
    options.contentType = "application/json";
    options.payload = body;
  }
  const response = UrlFetchApp.fetch(endpoint,options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error("CreatorLoop sync HTTP " + status);
  return JSON.parse(response.getContentText() || "{}");
}

function applyConsoleChange_(change) {
  const payload = change.payload || {};
  if(change.entity_type==='CAMPAIGN') {
    if(change.action!=='NOTES_ONLY'||Object.keys(payload).sort().join(',')!=='id,notes,previousNotes'||payload.id!==change.entity_id||!/^CMP-\d+$/.test(payload.id)||![payload.notes,payload.previousNotes].every(function(v){return v===null||typeof v==='string';}))throw new Error('Only reviewed campaign Notes can be exported');
    const table=rowsByHeader_(CL_SYNC.CAMPAIGNS),idColumn=table.headers.indexOf('Campaign ID'),notesColumn=table.headers.indexOf('Notes');
    if(idColumn<0||notesColumn<0)throw new Error('Campaign Notes mapping is incomplete');
    const matches=table.rows.filter(function(row){return row[idColumn]===payload.id;});
    if(matches.length!==1)throw new Error('Campaign must exist uniquely; Console cannot create source campaigns');
    const existing=String(matches[0][notesColumn]||'');
    if(existing===String(payload.notes||''))return; // Safe retry after acknowledgement failure.
    if(existing!==String(payload.previousNotes||''))throw new Error('Campaign Notes changed in source; review conflict before export');
    upsertMappedRow_(CL_SYNC.CAMPAIGNS,'Campaign ID',payload.id,{'Notes':payload.notes});return;
  }
  if (change.entity_type === "CREATOR" && change.action !== "UPSERT") {
    if (!["WORKFLOW","QA_RESULT"].includes(change.action)) throw new Error("Unsupported creator action");
    return; // These actions are recorded in Console audit; there is no source workbook field.
  }
  if (change.entity_type === "CREATOR") {
    upsertMappedRow_(CL_SYNC.CREATORS,"Creator ID",payload.id,{
      "Creator Name": payload.creatorName,
      "Primary Platform": payload.primaryPlatform,
      "Handle": payload.handle,
      "Email / Contact": payload.contact,
      "Status": payload.creatorStatus,
      "Compensation Model": payload.compensationModel,
      "Rights Status": payload.rightsStatus,
      "Product Focus": payload.productFocus,
      "Notes": payload.notes,
      "Evidence Link": payload.evidenceLink
    });
    return;
  }
  if (change.entity_type === "ASSIGNMENT") {
    upsertMappedRow_(CL_SYNC.ASSIGNMENTS,"Assignment ID",payload.id,{
      "Environment": payload.environment,
      "Creator ID": payload.creatorId,
      "Campaign ID": payload.campaignId,
      "Status": payload.status,
      "Start Date": payload.startDate,
      "Content Due": payload.contentDue,
      "Fixed Content Fee ($)": payload.fixedContentFee,
      "Commission %": payload.commissionRate,
      "Paid Usage Rights": payload.paidUsageRights,
      "Attribution Window (Days)": payload.attributionWindowDays,
      "Evidence Status": payload.evidenceStatus,
      "Notes": payload.notes,
      "Signed Rights Evidence Link": payload.signedRightsEvidenceLink
    });
    return;
  }
  if(change.entity_type==='DECISION' && change.action==='UPSERT') {
    const allowed=['Type','Severity','Status','Related ID','Date Opened','Decision Needed / Blocker','Recommendation','Evidence Link','Notes'];
    const values={};allowed.forEach(function(key){if(payload.fields && key in payload.fields)values[key]=payload.fields[key];});
    if(values.Status!=='In Progress')throw new Error('An escalation cannot approve or resolve a decision');
    upsertMappedRow_('DECISIONS & BLOCKERS','Record ID',payload.id,values);return;
  }
  throw new Error("Unsupported Console change: " + change.entity_type);
}

function upsertMappedRow_(sheetName,idHeader,id,values) {
  const table = rowsByHeader_(sheetName);
  const idColumn = table.headers.indexOf(idHeader);
  if (idColumn < 0) throw new Error("Missing ID column " + idHeader + " in " + sheetName);
  const writable = Object.keys(values).filter((header) => values[header] !== undefined);
  writable.forEach((header) => {
    if (table.headers.indexOf(header) < 0) throw new Error("Missing mapped column " + header + " in " + sheetName);
  });
  let rowNumber = -1;
  table.rows.some((row,index) => {
    if (row[idColumn] === id) { rowNumber = CL_SYNC.HEADER_ROW + 1 + index; return true; }
    return false;
  });
  const newRow = rowNumber < 0;
  if (newRow) rowNumber = table.sheet.getLastRow() + 1;
  const writes = [];
  writable.forEach((header) => {
    const cell = table.sheet.getRange(rowNumber,table.headers.indexOf(header) + 1);
    const value = values[header];
    if (cell.getFormula()) {
      if (String(cell.getDisplayValue()) === String(value ?? "")) return;
      // A date input uses YYYY-MM-DD while Sheets displays the same date in its locale.
      if (["Start Date","Content Due"].includes(header) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
        const existing = cell.getValue();
        if (Object.prototype.toString.call(existing) === "[object Date]" &&
            Utilities.formatDate(existing,SpreadsheetApp.getActive().getSpreadsheetTimeZone(),"yyyy-MM-dd") === String(value).slice(0,10)) return;
      }
      throw new Error("Refusing to overwrite formula: " + header);
    }
    const rule = cell.getDataValidation() || (newRow ? table.sheet.getRange(CL_SYNC.HEADER_ROW + 1,table.headers.indexOf(header) + 1).getDataValidation() : null);
    if (rule && !rule.getAllowInvalid()) {
      const type = rule.getCriteriaType();
      const args = rule.getCriteriaValues();
      const allowed = type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE
        ? args[0].getDisplayValues().flat()
        : type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST ? args[0] : null;
      if (allowed && value !== null && value !== "" && !allowed.includes(String(value))) {
        throw new Error("Value is not allowed for " + header);
      }
    }
    writes.push({cell:cell,value:value});
  });
  // Extend the established row scaffold, never copy another creator's business values.
  if (newRow) {
    const template = table.sheet.getRange(CL_SYNC.HEADER_ROW + 1,1,1,table.headers.length);
    const target = table.sheet.getRange(rowNumber,1,1,table.headers.length);
    template.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);
    target.setDataValidations(template.getDataValidations());
    table.sheet.getRange(rowNumber,idColumn + 1).setValue(id);
  }
  const formulaHeaders = ["Product Scope","Platform","ID Integrity","Attributed Revenue ($)","Commission ($)","Total Creator Cost ($)","Last Updated","Owner"];
  formulaHeaders.forEach((header) => {
    const column = table.headers.indexOf(header);
    if (column < 0 || writable.includes(header)) return;
    const cell = table.sheet.getRange(rowNumber,column + 1);
    if (cell.getFormula() || cell.getDisplayValue()) return;
    const formula = table.sheet.getRange(CL_SYNC.HEADER_ROW + 1,column + 1).getFormulaR1C1();
    if (formula) cell.setFormulaR1C1(formula);
  });
  writes.forEach((write) => write.cell.setValue(write.value));
}


// Read-only operational queues. Exact source headers; formulas are never exported back.
function operationalRows_(primaryCampaign) {
  const specs=[['LAUNCH CONTROL','Launch ID'],['DECISIONS & BLOCKERS','Record ID'],['RETARGETING','Audience ID'],['DATA INTAKE','Import Batch'],['CREATOR PERFORMANCE','Creator ID']];
  const records=[];
  specs.forEach(function(spec) {
    const table=rowsByHeader_(spec[0]);
    table.rows.forEach(function(values) {
      const row=objectFromRow_(table.headers,values),id=row[spec[1]];
      const campaign=row['Campaign ID']||primaryCampaign[row['Creator ID']]||primaryCampaign[row['Related ID']]||(/^CMP-\d+$/.test(row['Related ID']||'')?row['Related ID']:null);
      if(!id||!campaign)return; // No guessed campaign, global economics or ambiguous routing.
      records.push({tab:spec[0],recordId:id,campaignId:campaign,creatorId:row['Creator ID']||null,fields:row,sourceUpdatedAt:new Date().toISOString()});
    });
  });
  return records;
}
