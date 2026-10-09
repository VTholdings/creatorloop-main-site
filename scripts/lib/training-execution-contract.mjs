import {createHash} from 'node:crypto';

// Public target identities only. No credentials and no default live transport.
export const TRAINING_TARGET=Object.freeze({
 accountId:'2a3b96a0b37850cd03107131baa66b6d',
 project:'creatorloop-operator-training',projectId:'9863d88c-8025-414c-9524-078ee470e9e7',
 appId:'72da9ab5-d951-4de4-8456-fd6660e4d86e',
 databaseId:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',
 audience:'a6b7d2d9e2a0bbe45ac1f1155cbd32593467eac2d66c01aa67d36fb290b7a38d',
 deploymentId:'9863d88c-8025-414c-9524-078ee470e9e7'
});
export const sha256=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function refuse(code){throw Error(code);}
const nonempty=v=>typeof v==='string'&&v.trim()===v&&v.length>0;
const requestFields=['id','operation','operatorId','email','environment','audience','databaseId','deploymentId','requestVersion','requestedAt'];
export function validateManifest(m,now=Math.floor(Date.now()/1000)) {
 if(!m||m.protocol!=='CREATORLOOP_TRAINING_EXECUTION_V1'||m.environment!=='TRAINING'||!m.targets||Object.entries(TRAINING_TARGET).some(([key,value])=>m.targets[key]!==value))refuse('TRAINING_TARGET_REFUSED');
 if(!nonempty(m.ownerDecisionRef)||!nonempty(m.executorPrincipal)||!nonempty(m.signerPrincipal)||m.executorPrincipal===m.signerPrincipal||!nonempty(m.runnerRef)||!nonempty(m.providerCredentialRef)||!nonempty(m.signerKeyRef)||!nonempty(m.keyId))refuse('CUSTODY_PREREQUISITES_MISSING');
 if(!/^[a-f0-9]{40}$/.test(m.executionSha||'')||!Number.isInteger(m.approvedAt)||!Number.isInteger(m.expiresAt)||m.approvedAt>now||m.expiresAt<=now||m.expiresAt-m.approvedAt>3600)refuse('EXECUTION_WINDOW_REFUSED');
 if(!m.subject||!nonempty(m.subject.operatorId)||!nonempty(m.subject.subject)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.subject.email||'')||m.subject.email!==m.subject.email.toLowerCase()||['team@creatorloop.net','support@creatorloop.net'].includes(m.subject.email)||m.subject.trainingOnly!==true||m.subject.crossApplicationRevocationAccepted!==true)refuse('INDIVIDUAL_SUBJECT_REFUSED');
 if(!/^[a-f0-9]{64}$/.test(m.preservedPoliciesHash||'')||!Array.isArray(m.requireRules)||!m.requireRules.length||!Number.isInteger(m.policyPrecedence)||m.policyPrecedence<0||!['ADMIT','REVOKE'].includes(m.operation)||!nonempty(m.requestId)||!Number.isInteger(m.requestVersion)||m.requestVersion<0)refuse('REQUEST_APPROVAL_MISSING');
 if(!Number.isInteger(m.requestedAt)||m.requestedAt>now)refuse('APPROVED_REQUEST_TIME_REQUIRED');
 if(!/^[a-f0-9]{40}$/.test(m.applicationSha||'')||m.requireRules.some(rule=>!rule||Object.keys(rule).length!==1||JSON.stringify(rule).match(/everyone|service_token|email_domain|bypass/i)))refuse('APPROVED_POLICY_REQUIREMENTS_REFUSED');
 if(m.operation==='REVOKE'&&!/^[a-f0-9-]{36}$/.test(m.ownedPolicyId||''))refuse('OWNED_POLICY_ID_REQUIRED');
 return m;
}
export function validateRequest(r,m,now=Math.floor(Date.now()/1000)) {
 validateManifest(m,now);
 if(!r||Object.keys(r).some(k=>!requestFields.includes(k)&&k!=='reason')||r.reason!==undefined&&(typeof r.reason!=='string'||!r.reason.trim())||requestFields.some(k=>r[k]===undefined)||r.id!==m.requestId||r.operation!==m.operation||r.operatorId!==m.subject.operatorId||r.email!==m.subject.email||r.requestVersion!==m.requestVersion||r.environment!=='TRAINING'||r.audience!==TRAINING_TARGET.audience||r.databaseId!==TRAINING_TARGET.databaseId||r.deploymentId!==TRAINING_TARGET.deploymentId||!Number.isInteger(r.requestedAt)||r.requestedAt>now||r.requestedAt!==m.requestedAt)refuse('INDIVIDUAL_REQUEST_REFUSED');
 return r;
}
export async function fence(r,m,{readCurrentRequest,verifyApproval,now}) {
 validateRequest(r,m,now());
 // Host must verify protected Owner authorization and actual principal separation.
 // A manifest boolean or stale exported JSON is not approval/current-request evidence.
 const approval=await verifyApproval({manifest:structuredClone(m),manifestHash:sha256(m)});
 if(!approval||approval.manifestHash!==sha256(m)||approval.ownerDecisionRef!==m.ownerDecisionRef||approval.executionSha!==m.executionSha||approval.independentCustodyEnforced!==true||approval.providerCapabilityVerified!==true||approval.signerPrincipal!==m.signerPrincipal||approval.executorPrincipal!==m.executorPrincipal)refuse('PROTECTED_APPROVAL_NOT_VERIFIED');
 const current=await readCurrentRequest(r.operatorId);
 if(!current||current.personnelVersion!==r.requestVersion||requestFields.some(key=>current.request?.[key]!==r[key]))refuse('CURRENT_REQUEST_FENCE_FAILED');
}
export function policyTemplate(m) {
 return {name:'CL-TRAINING-'+m.subject.operatorId,decision:'allow',include:[{email:{email:m.subject.email}}],require:structuredClone(m.requireRules),exclude:[],precedence:m.policyPrecedence,session_duration:'1h'};
}
export function ownPolicy(policy,m) {
 const desired=policyTemplate(m);
 return policy&&Object.entries(desired).every(([key,value])=>JSON.stringify(policy[key])===JSON.stringify(value));
}
export function preservedHash(policies,m) {
 // Remove only the exact dedicated policy from the preservation projection.
 const other=policies.filter(p=>!ownPolicy(p,m)).map(p=>structuredClone(p)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return sha256(other);
}
export function verifySession(proof,r,m,now,operation=r.operation) {
 if(!proof||proof.operation!==operation||proof.email!==m.subject.email||proof.subject!==m.subject.subject||proof.environment!=='TRAINING'||proof.audience!==TRAINING_TARGET.audience||proof.issuer!==`https://shiny-wildflower-143c.cloudflareaccess.com`||proof.identityBased!==true||proof.independentlyVerified!==true||!Number.isInteger(proof.observedAt)||proof.observedAt<r.requestedAt||proof.observedAt>now||proof.observedAt<now-300)refuse('INDEPENDENT_SESSION_PROOF_REQUIRED');
 if(operation==='ADMIT'&&(proof.freshLoginVerified!==true||proof.signatureVerified!==true||!Number.isInteger(proof.issuedAt)||proof.issuedAt<r.requestedAt||proof.issuedAt>now||!Number.isInteger(proof.expiresAt)||proof.expiresAt<=now))refuse('FRESH_INDIVIDUAL_LOGIN_REQUIRED');
 if(operation==='REVOKE'&&(proof.oldSessionDenied!==true||proof.freshLoginDenied!==true||!Number.isInteger(proof.revokedBefore)||proof.revokedBefore<r.requestedAt||proof.revokedBefore>proof.observedAt))refuse('INDIVIDUAL_SESSION_DENIAL_REQUIRED');
 return proof;
}
export function verifyRuntime(proof,m,now=Math.floor(Date.now()/1000)) {
 if(!proof||proof.independentlyVerified!==true||proof.environment!=='TRAINING'||proof.audience!==TRAINING_TARGET.audience||proof.databaseId!==TRAINING_TARGET.databaseId||proof.deploymentId!==TRAINING_TARGET.deploymentId||proof.applicationSha!==m.applicationSha||!/^([a-f0-9]{40})$/.test(m.applicationSha||'')||!Number.isInteger(proof.observedAt)||proof.observedAt>now||proof.observedAt<now-300)refuse('LIVE_RUNTIME_RECONCILIATION_REQUIRED');
}
