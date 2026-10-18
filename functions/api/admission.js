// Public-key verification only: this application never holds Cloudflare or signing credentials.
import {environmentName} from './team-policy.js';
const encoder=new TextEncoder();
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
const publicIdentity=k=>JSON.stringify({kty:k.kty,n:k.n,e:k.e});
export function admissionConfiguration(env) {
 const environment=environmentName(env);
 const values=[env.CLOUDFLARE_ACCESS_AUD,env.CONSOLE_DATABASE_ID,env.CONSOLE_DEPLOYMENT_ID];
 const peers=[env.PEER_ACCESS_AUD,env.PEER_DATABASE_ID,env.PEER_DEPLOYMENT_ID];
 if(!['TRAINING','PRODUCTION'].includes(env.CONSOLE_ENVIRONMENT)||values.some(v=>typeof v!=='string'||!v.trim())||peers.some((v,i)=>typeof v!=='string'||!v.trim()||v===values[i])||!env.ADMISSION_VERIFIER_KEYS)return null;
 try {
  const keys=JSON.parse(env.ADMISSION_VERIFIER_KEYS);
  if(!Array.isArray(keys)||!keys.length||keys.some(k=>!k.kid||k.kty!=='RSA'||['d','p','q','dp','dq','qi','oth'].some(f=>k[f])||!k.n||!k.e||decode(k.n).length<256)||new Set(keys.map(k=>k.kid)).size!==keys.length)return null;
  return {environment,audience:values[0],databaseId:values[1],deploymentId:values[2],keys};
 }catch{return null;}
}
export async function edgeState(db,id) {
 const rows=(await db.prepare("SELECT * FROM console_team_events WHERE target_operator_id=? AND action IN ('EDGE_ADMISSION_REQUEST','EDGE_REVOCATION_REQUEST','EDGE_RECEIPT') ORDER BY CAST(json_extract(new_state_json,'$.requestVersion') AS INTEGER) DESC,rowid DESC").bind(id).all()).results;
 const request=rows.find(r=>r.action!=='EDGE_RECEIPT');
 const receipt=request&&rows.find(r=>r.action==='EDGE_RECEIPT'&&JSON.parse(r.new_state_json).requestId===request.id);
 return {request:request?{id:request.id,...JSON.parse(request.new_state_json)}:null,receipt:receipt?{id:receipt.id,...JSON.parse(receipt.new_state_json)}:null};
}
export function validAdmission(state,user,env,now=Math.floor(Date.now()/1000)) {
 const config=admissionConfiguration(env),r=state.receipt;
 return Boolean(config&&config.keys.some(k=>k.kid===r?.signerKeyId&&publicIdentity(k)===r.signerPublicKey)&&state.request?.operation==='ADMIT'&&r?.operation==='ADMIT'&&r.operatorId===user.id&&r.email===user.login_email&&r.environment===config.environment&&r.audience===config.audience&&r.databaseId===config.databaseId&&r.deploymentId===config.deploymentId&&r.expiresAt>now);
}
export async function verifyReceipt(envelope,request,target,env,version) {
 const config=admissionConfiguration(env);
 if(!config)throw Error('Isolated admission verifier configuration is pending');
 if(!envelope||Object.keys(envelope).sort().join(',')!=='keyId,payload,signature'||typeof envelope.payload!=='string'||envelope.payload.length>10000||typeof envelope.signature!=='string'||!/^[A-Za-z0-9_-]+$/.test(envelope.payload)||!/^[A-Za-z0-9_-]+$/.test(envelope.signature))throw Error('A signed executor receipt is required');
 const jwk=config.keys.find(k=>k.kid===envelope.keyId);if(!jwk)throw Error('Untrusted receipt signer');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(envelope.signature),encoder.encode(envelope.payload)))throw Error('Invalid receipt signature');
 const r=JSON.parse(new TextDecoder().decode(decode(envelope.payload))),now=Math.floor(Date.now()/1000);
 const fields=['protocol','requestId','operatorId','email','operation','environment','audience','databaseId','deploymentId','requestVersion','observedAt','expiresAt','evidenceHash','policyId','subject','policyVerified','sessionVerified','revokedBefore'];
 if(Object.keys(r).some(k=>!fields.includes(k))||r.protocol!=='CREATORLOOP_EDGE_V1'||!request||r.requestId!==request.id||r.operation!==request.operation||r.operatorId!==target.id||r.email!==target.login_email||r.requestVersion!==version||request.requestVersion!==version||request.environment!==config.environment||request.audience!==config.audience||request.databaseId!==config.databaseId||request.deploymentId!==config.deploymentId||r.environment!==config.environment||r.audience!==config.audience||r.databaseId!==config.databaseId||r.deploymentId!==config.deploymentId||!Number.isInteger(r.observedAt)||r.observedAt>now||r.observedAt<now-300||r.observedAt<request.requestedAt||!Number.isInteger(r.expiresAt)||r.expiresAt<=now||r.expiresAt>r.observedAt+86400||!/^([a-f0-9]{64})$/.test(r.evidenceHash)||typeof r.policyId!=='string'||!r.policyId||typeof r.subject!=='string'||!r.subject||r.policyVerified!==true||r.sessionVerified!==true)throw Error('Receipt does not match the current individual request and isolated environment');
 if(r.operation==='REVOKE'&&(!Number.isInteger(r.revokedBefore)||r.revokedBefore<request.requestedAt||r.revokedBefore>r.observedAt))throw Error('Policy removal and session revocation evidence required');
 return {...r,signerKeyId:envelope.keyId,signerPublicKey:publicIdentity(jwk),envelope};
}
// Rechecked within the business transaction; immutable receipts cannot be replaced.
export function admissionCommitCheck(user,env) {
 const c=admissionConfiguration(env);
 return {sql:c?`EXISTS (SELECT 1 FROM console_team_events r WHERE r.target_operator_id=? AND r.action='EDGE_RECEIPT' AND json_extract(r.new_state_json,'$.requestId')=(SELECT id FROM console_team_events WHERE target_operator_id=? AND action IN ('EDGE_ADMISSION_REQUEST','EDGE_REVOCATION_REQUEST') ORDER BY CAST(json_extract(new_state_json,'$.requestVersion') AS INTEGER) DESC,rowid DESC LIMIT 1) AND json_extract(r.new_state_json,'$.operation')='ADMIT' AND json_extract(r.new_state_json,'$.expiresAt')>CAST(strftime('%s','now') AS INTEGER) AND json_extract(r.new_state_json,'$.audience')=? AND json_extract(r.new_state_json,'$.databaseId')=? AND json_extract(r.new_state_json,'$.deploymentId')=? AND json_extract(r.new_state_json,'$.environment')=? AND json_extract(r.new_state_json,'$.email')=? AND EXISTS (SELECT 1 FROM json_each(?) k WHERE json_extract(k.value,'$.kid')=json_extract(r.new_state_json,'$.signerKeyId') AND json_extract(r.new_state_json,'$.signerPublicKey')=json_object('kty',json_extract(k.value,'$.kty'),'n',json_extract(k.value,'$.n'),'e',json_extract(k.value,'$.e'))))`:'0',values:c?[user.id,user.id,c.audience,c.databaseId,c.deploymentId,c.environment,user.login_email,JSON.stringify(c.keys)]:[]};
}
