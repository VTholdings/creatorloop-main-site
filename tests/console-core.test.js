import test from "node:test";
import assert from "node:assert/strict";
import { canViewAudit, nextCreatorId, nextEntityId, normalizeCreatorIdentity, qaChecklist, transitionAllowed, validateAssignment, validateEnrollment } from "../functions/api/console-core.js";

const valid = {
  campaignId:"CMP-100", creatorName:"Creator One", primaryPlatform:"TikTok", handle:"@creator", contact:"creator@example.com",
  creatorStatus:"Active", compensationModel:"Performance", rightsStatus:"Organic Only", productFocus:"PNB_META_ACQ_3ITEMS_202609 — 3-product campaign",
};

test("AUTO permanent IDs advance and are never recycled",()=>{
  assert.equal(nextCreatorId(["CR-100","CR-103","not-an-id"]),"CR-104");
});

test("creator identity comparison is stable for duplicate control",()=>{
  assert.equal(normalizeCreatorIdentity("  @Creator.ONE "), "@creator.one");
  assert.equal(normalizeCreatorIdentity(" Creator@Example.COM "), "creator@example.com");
});

test("controlled fields reject unapproved values",()=>{
  assert.deepEqual(validateEnrollment(valid),{});
  assert.equal(validateEnrollment({...valid,primaryPlatform:"MySpace"}).primaryPlatform,"Choose an approved platform");
});

test("paid usage approval requires actual evidence",()=>{
  const errors=validateEnrollment({...valid,rightsStatus:"Paid Usage Approved",evidenceLink:""});
  assert.match(errors.evidenceLink,/requires an evidence link/);
  assert.deepEqual(validateEnrollment({...valid,rightsStatus:"Paid Usage Approved",evidenceLink:"https://drive.google.com/evidence"}),{});
});

test("workflow and QA authority are enforced",()=>{
  assert.equal(transitionAllowed("AVAILABLE","IN_PROGRESS","OPERATOR"),true);
  assert.equal(transitionAllowed("IN_PROGRESS","AWAITING_QA","MARKETING"),true);
  assert.equal(transitionAllowed("AWAITING_QA","PASS","OPERATOR"),false);
  assert.equal(transitionAllowed("AWAITING_QA","PASS","QA_REVIEWER"),true);
  assert.equal(transitionAllowed("PASSED","IN_PROGRESS","ADMINISTRATOR"),false);
});

test("QA checklist preserves ID, evidence, and controlled-source rules",()=>{
  const record={id:"CR-104",creator_name:"Creator",handle:"@creator",contact:"creator@example.com",primary_platform:"Meta",compensation_model:"Hybrid",product_focus:"CMP-100",rights_status:"Paid Usage Approved",evidence_link:"https://drive.google.com/evidence"};
  assert.ok(Object.values(qaChecklist(record)).every(Boolean));
  assert.equal(qaChecklist({...record,id:"104"}).permanentId,false);
  assert.equal(qaChecklist({...record,evidence_link:""}).rightsEvidence,false);
});


test("V2 assignment controls preserve economics and evidence gates", () => {
  const validAssignment = {
    creatorId:"CR-100", campaignId:"CMP-100", status:"Active",
    fixedContentFee:"50", commissionRate:"0.1", paidUsageRights:"Yes",
    attributionWindowDays:"30", evidenceStatus:"Verified",
    signedRightsEvidenceLink:"https://example.com/signed"
  };
  assert.deepEqual(validateAssignment(validAssignment),{});
  assert.match(validateAssignment({...validAssignment,commissionRate:"1.5"}).commissionRate,/0 to 1/);
  assert.match(validateAssignment({...validAssignment,signedRightsEvidenceLink:""}).signedRightsEvidenceLink,/requires signed evidence/);
  assert.equal(nextEntityId("ASG",["ASG-100","ASG-102"]),"ASG-103");
});

test("audit visibility is reserved for the administrator / project owner role", () => {
  assert.equal(canViewAudit("OPERATOR"),false);
  assert.equal(canViewAudit("QA_REVIEWER"),false);
  assert.equal(canViewAudit("ADMINISTRATOR"),true);
});

 test("PNB options reject invented Product Focus and preserve an unchanged legacy platform", () => {
  assert.match(validateEnrollment({...valid,productFocus:"CMP-100"}).productFocus,/LISTS/);
  assert.deepEqual(validateEnrollment({...valid,creatorStatus:"Live",rightsStatus:"N/A"}),{});
  assert.deepEqual(validateEnrollment({...valid,primaryPlatform:"TikTok + Instagram"},{primary_platform:"TikTok + Instagram"}),{});
  assert.ok(validateEnrollment({...valid,primaryPlatform:"TikTok + Instagram"}).primaryPlatform);
  assert.ok(validateEnrollment({...valid,compensationModel:"Organic Only"}).compensationModel);
});
