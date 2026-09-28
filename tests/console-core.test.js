import test from "node:test";
import assert from "node:assert/strict";
import { nextCreatorId, qaChecklist, transitionAllowed, validateEnrollment } from "../functions/api/console-core.js";

const valid = {
  creatorName:"Creator One", primaryPlatform:"TikTok", handle:"@creator", contact:"creator@example.com",
  creatorStatus:"Active", compensationModel:"Performance", rightsStatus:"Organic Only", productFocus:"CMP-100",
};

test("AUTO permanent IDs advance and are never recycled",()=>{
  assert.equal(nextCreatorId(["CR-100","CR-103","not-an-id"]),"CR-104");
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
