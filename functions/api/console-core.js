export const ROLES = ["OPERATOR","MARKETING","MERCH","LOOPERS","OPERATIONS","QA_REVIEWER","APPROVAL_AUTHORITY","ADMINISTRATOR"];
export const QA_ROLES = new Set(["OPERATIONS","QA_REVIEWER","APPROVAL_AUTHORITY","ADMINISTRATOR"]);
export const PLATFORMS = ["Meta","TikTok","Google","Shopify","Klaviyo","Recharge","Clipster","Other"];
export const COMPENSATION = ["Performance","Fixed Content Fee","Hybrid","Product Seeding","Performance Bonus","Organic Only","N/A"];
export const RIGHTS = ["Not Reviewed","Organic Only","Paid Usage Approved","Expired","Blocked"];

export function validateEnrollment(body) {
  const required = ["creatorName","primaryPlatform","handle","contact","creatorStatus","compensationModel","rightsStatus","productFocus"];
  const errors = {};
  for (const key of required) if (!String(body[key] ?? "").trim()) errors[key] = "Required";
  if (body.primaryPlatform && !PLATFORMS.includes(body.primaryPlatform)) errors.primaryPlatform = "Choose an approved platform";
  if (body.compensationModel && !COMPENSATION.includes(body.compensationModel)) errors.compensationModel = "Choose an approved compensation model";
  if (body.rightsStatus && !RIGHTS.includes(body.rightsStatus)) errors.rightsStatus = "Choose an approved rights status";
  if (body.rightsStatus === "Paid Usage Approved" && !isHttpUrl(body.evidenceLink)) errors.evidenceLink = "Approved paid usage requires an evidence link";
  if (body.evidenceLink && !isHttpUrl(body.evidenceLink)) errors.evidenceLink = "Use an http or https evidence link";
  return errors;
}

function isHttpUrl(value) { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; } }

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

export function nextCreatorId(ids) {
  const maximum = ids.reduce((max, id) => Math.max(max, Number(/^CR-(\d+)$/.exec(id)?.[1] ?? 99)), 99);
  return `CR-${maximum + 1}`;
}
