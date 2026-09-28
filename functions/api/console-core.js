export const ROLES = ["OPERATOR","MARKETING","MERCH","LOOPERS","OPERATIONS","QA_REVIEWER","APPROVAL_AUTHORITY","ADMINISTRATOR"];
export const QA_ROLES = new Set(["OPERATIONS","QA_REVIEWER","APPROVAL_AUTHORITY","ADMINISTRATOR"]);
export const AUDIT_ROLES = new Set(["ADMINISTRATOR"]);
export const PLATFORMS = ["Meta","TikTok","Google","Shopify","Klaviyo","Recharge","Clipster","Other"];
export const CREATOR_STATUSES = ["Not Started","In Progress","Blocked","Ready for Review","Approved","Active","Complete","Archived"];
export const COMPENSATION = ["Performance","Fixed Content Fee","Hybrid","Product Seeding","Performance Bonus","Organic Only","N/A"];
export const RIGHTS = ["Not Reviewed","Organic Only","Paid Usage Approved","Expired","Blocked"];
export const ASSIGNMENT_RIGHTS = ["Yes","No","Pending"];
export const EVIDENCE_STATUSES = ["Planned","Pending","Verified","Blocked","Expired"];

export function validateEnrollment(body) {
  const required = ["campaignId","creatorName","primaryPlatform","handle","contact","creatorStatus","compensationModel","rightsStatus","productFocus"];
  const errors = {};
  for (const key of required) if (!String(body[key] ?? "").trim()) errors[key] = "Required";
  if (body.primaryPlatform && !PLATFORMS.includes(body.primaryPlatform)) errors.primaryPlatform = "Choose an approved platform";
  if (body.creatorStatus && !CREATOR_STATUSES.includes(body.creatorStatus)) errors.creatorStatus = "Choose an approved status";
  if (body.compensationModel && !COMPENSATION.includes(body.compensationModel)) errors.compensationModel = "Choose an approved compensation model";
  if (body.rightsStatus && !RIGHTS.includes(body.rightsStatus)) errors.rightsStatus = "Choose an approved rights status";
  if (body.rightsStatus === "Paid Usage Approved" && !isHttpUrl(body.evidenceLink)) errors.evidenceLink = "Approved paid usage requires an evidence link";
  if (body.evidenceLink && !isHttpUrl(body.evidenceLink)) errors.evidenceLink = "Use an http or https evidence link";
  return errors;
}

export function validateAssignment(body) {
  const required = ["creatorId","campaignId","status","paidUsageRights","evidenceStatus"];
  const errors = {};
  for (const key of required) if (!String(body[key] ?? "").trim()) errors[key] = "Required";
  if (body.status && !CREATOR_STATUSES.includes(body.status)) errors.status = "Choose an approved status";
  if (body.paidUsageRights && !ASSIGNMENT_RIGHTS.includes(body.paidUsageRights)) errors.paidUsageRights = "Choose Yes, No, or Pending";
  if (body.evidenceStatus && !EVIDENCE_STATUSES.includes(body.evidenceStatus)) errors.evidenceStatus = "Choose an approved evidence status";
  const fixed = Number(body.fixedContentFee ?? 0);
  const commission = Number(body.commissionRate ?? 0);
  const window = Number(body.attributionWindowDays ?? 30);
  if (!Number.isFinite(fixed) || fixed < 0) errors.fixedContentFee = "Use a nonnegative amount";
  if (!Number.isFinite(commission) || commission < 0 || commission > 1) errors.commissionRate = "Use a decimal from 0 to 1";
  if (!Number.isInteger(window) || window < 1 || window > 365) errors.attributionWindowDays = "Use 1 to 365 days";
  if (body.paidUsageRights === "Yes" && !isHttpUrl(body.signedRightsEvidenceLink)) errors.signedRightsEvidenceLink = "Rights = Yes requires signed evidence";
  if (body.signedRightsEvidenceLink && !isHttpUrl(body.signedRightsEvidenceLink)) errors.signedRightsEvidenceLink = "Use an http or https evidence link";
  return errors;
}

export function isHttpUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}

export function transitionAllowed(current, next, role) {
  if (["PASS","HOLD","CORRECTION_REQUIRED"].includes(next)) return current === "AWAITING_QA" && QA_ROLES.has(role);
  if (next === "IN_PROGRESS") return ["AVAILABLE","CORRECTION_REQUIRED","HOLD"].includes(current);
  if (next === "AWAITING_QA") return current === "IN_PROGRESS";
  return false;
}

export function qaChecklist(record) {
  return {
    permanentId: /^CR-\d+$/.test(record.id),
    identityComplete: Boolean(record.creator_name && record.handle && record.contact),
    controlledPlatform: PLATFORMS.includes(record.primary_platform),
    compensationRecorded: COMPENSATION.includes(record.compensation_model),
    productCampaignFocus: Boolean(record.product_focus),
    rightsEvidence: record.rights_status !== "Paid Usage Approved" || isHttpUrl(record.evidence_link),
  };
}

export function nextEntityId(prefix, ids) {
  const pattern = new RegExp("^" + prefix + "-(\\d+)$");
  const maximum = ids.reduce((max, id) => Math.max(max, Number(pattern.exec(id)?.[1] ?? 99)), 99);
  return prefix + "-" + (maximum + 1);
}
export const nextCreatorId = (ids) => nextEntityId("CR", ids);
export const normalizeCreatorIdentity = (value) => String(value ?? "").trim().toLowerCase();
export const canViewAudit = (role) => AUDIT_ROLES.has(role);
