/**
 * CreatorLoop Operations Console V2 — Control System bridge
 *
 * Install this code as a bound Apps Script in the approved Acquisition & Launch
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
    creatives: creativeRows_()
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
      sourceReference: "Acquisition & Launch Control System / CAMPAIGNS",
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
    .filter((row) => /^CR-\d+$/.test(row["Creator ID"]) && row["Creator Name"] && primaryCampaign[row["Creator ID"]])
    .map((row) => ({
      id: row["Creator ID"],
      campaignId: primaryCampaign[row["Creator ID"]],
      creatorName: row["Creator Name"],
      primaryPlatform: platform_(row["Primary Platform"]),
      handle: row["Handle"],
      contact: row["Email / Contact"],
      creatorStatus: row["Status"],
      compensationModel: row["Compensation Model"],
      rightsStatus: row["Rights Status"],
      productFocus: row["Product Focus"],
      enrollmentDate: iso_(row["Enrollment Date"]) || new Date().toISOString(),
      notes: row["Notes"] || null,
      evidenceLink: row["Evidence Link"] || null,
      sourceRecord: "Acquisition & Launch Control System / CREATORS / " + row["Creator ID"],
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
  const bytes = Utilities.computeHmacSha256Signature(timestamp + "." + body,secret);
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
      "Environment": "NONPRODUCTION",
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
  }
}

function upsertMappedRow_(sheetName,idHeader,id,values) {
  const table = rowsByHeader_(sheetName);
  const idColumn = table.headers.indexOf(idHeader);
  if (idColumn < 0) throw new Error("Missing ID column " + idHeader + " in " + sheetName);
  let rowNumber = -1;
  table.rows.some((row,index) => {
    if (row[idColumn] === id) { rowNumber = CL_SYNC.HEADER_ROW + 1 + index; return true; }
    return false;
  });
  if (rowNumber < 0) {
    rowNumber = table.sheet.getLastRow() + 1;
    table.sheet.getRange(rowNumber,idColumn + 1).setValue(id);
  }
  Object.keys(values).forEach((header) => {
    const column = table.headers.indexOf(header);
    if (column >= 0 && values[header] !== undefined) table.sheet.getRange(rowNumber,column + 1).setValue(values[header]);
  });
}
