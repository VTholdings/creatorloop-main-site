// Ephemeral fictional executor: never a live Cloudflare credential or admission claim.
import {edgeState} from '../../functions/api/admission.js';
export async function verifier(f,environment=f.env.CONSOLE_ENVIRONMENT||'PRODUCTION') {
 if(f.signingKey)return;
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 f.signingKey=keys.privateKey;
 Object.assign(f.env,{CONSOLE_ENVIRONMENT:environment,CLOUDFLARE_ACCESS_AUD:'fictional-'+environment,CONSOLE_DATABASE_ID:'db-'+environment,CONSOLE_DEPLOYMENT_ID:'project-'+environment,PEER_ACCESS_AUD:'fictional-peer',PEER_DATABASE_ID:'db-peer',PEER_DEPLOYMENT_ID:'project-peer',ADMISSION_VERIFIER_KEYS:JSON.stringify([{...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'fictional-executor'}])});
}
export async function envelope(f,person,overrides={}) {
 const {request}=await edgeState(f.env.OPERATIONS_DB,person.id),now=Math.floor(Date.now()/1000);
 const data={protocol:'CREATORLOOP_EDGE_V1',requestId:request.id,operatorId:person.id,email:person.email,operation:request.operation,environment:f.env.CONSOLE_ENVIRONMENT,audience:f.env.CLOUDFLARE_ACCESS_AUD,databaseId:f.env.CONSOLE_DATABASE_ID,deploymentId:f.env.CONSOLE_DEPLOYMENT_ID,requestVersion:request.requestVersion,observedAt:now,expiresAt:now+3600,evidenceHash:'a'.repeat(64),policyId:'fictional-policy',subject:'fictional-subject',policyVerified:true,sessionVerified:true,...(request.operation==='REVOKE'?{revokedBefore:now}:{}),...overrides};
 const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
 const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',f.signingKey,new TextEncoder().encode(payload))).toString('base64url');
 return {keyId:'fictional-executor',payload,signature};
}
export async function admit(f,person,change) {
 await verifier(f);
 const r=await change(f,person,'requestAdmission');if(r.status!==200)throw Error(JSON.stringify(r));
 const result=await change(f,person,'recordEdgeReceipt',{receipt:await envelope(f,person)});if(result.status!==200)throw Error(JSON.stringify(result));
}
export async function revoke(f,person,change) {
 const r=await change(f,person,'recordEdgeReceipt',{receipt:await envelope(f,person)});if(r.status!==200)throw Error(JSON.stringify(r));
}
export async function admittedFixture(f,person) {
 await verifier(f);
 const version=f.db.prepare('SELECT version FROM console_team_profiles WHERE operator_id=?').get(person.id).version;
 const id='EDGE-'+crypto.randomUUID();
 f.db.prepare("INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) VALUES(?,?,'OP-ADMINISTRATOR','administrator@example.com','Fictional fixture','ADMINISTRATOR','EDGE_ADMISSION_REQUEST',?)").run(id,person.id,JSON.stringify({operation:'ADMIT',environment:f.env.CONSOLE_ENVIRONMENT,audience:f.env.CLOUDFLARE_ACCESS_AUD,databaseId:f.env.CONSOLE_DATABASE_ID,deploymentId:f.env.CONSOLE_DEPLOYMENT_ID,requestVersion:version,requestedAt:Math.floor(Date.now()/1000)}));
 const {verifyReceipt,edgeState}=await import('../../functions/api/admission.js');
 const target=f.db.prepare('SELECT * FROM operators WHERE id=?').get(person.id);
 const receipt=await verifyReceipt(await envelope(f,person),(await edgeState(f.env.OPERATIONS_DB,person.id)).request,target,f.env,version);
 f.db.prepare("INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) VALUES(?,?,'OP-ADMINISTRATOR','administrator@example.com','Fictional fixture','ADMINISTRATOR','EDGE_RECEIPT',?)").run('RECEIPT-'+crypto.randomUUID(),person.id,JSON.stringify(receipt));
}
