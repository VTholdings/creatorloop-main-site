// Portable executor contract. No provider credentials, URLs or policy writes are embedded.
// A reviewed external adapter must implement these ports in the secure execution environment.
export async function executeEdgeRequest({request,provider,currentRequest,sign,now=()=>Math.floor(Date.now()/1000)}) {
 // Keep the approved selection fixed even if an adapter mutates its argument.
 request=Object.freeze(structuredClone(request));
 const fields=['id','operation','operatorId','email','environment','audience','databaseId','deploymentId','requestVersion','requestedAt'];
 if(!request||fields.some(f=>request[f]===undefined)||!['ADMIT','REVOKE'].includes(request.operation)||!['TRAINING','PRODUCTION'].includes(request.environment)||!Number.isInteger(request.requestVersion)||!Number.isInteger(request.requestedAt)||request.requestedAt>now()||![request.id,request.operatorId,request.email,request.audience,request.databaseId,request.deploymentId].every(v=>typeof v==='string'&&v))throw Error('Invalid isolated individual request');
 const fence=async()=>{const current=await currentRequest(request.operatorId);if(fields.some(f=>current?.[f]!==request[f]))throw Error('Personnel request changed; do not acknowledge stale work');};
 await fence();
 // Provider operations must be individual, retry-safe, and preserve Owner/service policies.
 // ADMIT prepares only already-approved admission, never broader roles or business authority.
 if(request.operation==='ADMIT')await provider.ensureApprovedIndividualAdmission(request);
 else await provider.revokeIndividualAdmissionAndSessions(request);
 const evidence=await provider.verifyIndividualState(request);
 if(!evidence||evidence.email!==request.email||evidence.environment!==request.environment||evidence.audience!==request.audience||evidence.databaseId!==request.databaseId||evidence.deploymentId!==request.deploymentId||evidence.ownerPolicyUnchanged!==true||evidence.servicePoliciesUnchanged!==true||evidence.policyVerified!==true||evidence.sessionVerified!==true||![evidence.policyId,evidence.subject].every(v=>typeof v==='string'&&v)||evidence.operation!==request.operation)throw Error('Individual policy/session/isolation evidence incomplete');
 const observedAt=now();if(!Number.isInteger(observedAt)||observedAt<request.requestedAt)throw Error('Invalid observation time');
 if(request.operation==='REVOKE'&&(!Number.isInteger(evidence.revokedBefore)||evidence.revokedBefore<request.requestedAt||evidence.revokedBefore>observedAt))throw Error('Individual revocation boundary not verified');
 await fence();
 // Hash only explicit evidence projections; never retain API tokens, JWTs or provider responses.
 const proof={email:evidence.email,operation:evidence.operation,environment:evidence.environment,audience:evidence.audience,databaseId:evidence.databaseId,deploymentId:evidence.deploymentId,policyId:evidence.policyId,subject:evidence.subject,policyVerified:true,sessionVerified:true,ownerPolicyUnchanged:true,servicePoliciesUnchanged:true,...(request.operation==='REVOKE'?{revokedBefore:evidence.revokedBefore}:{})};
 const evidenceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(proof))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const receipt={protocol:'CREATORLOOP_EDGE_V1',requestId:request.id,operatorId:request.operatorId,email:request.email,operation:request.operation,environment:request.environment,audience:request.audience,databaseId:request.databaseId,deploymentId:request.deploymentId,requestVersion:request.requestVersion,observedAt,expiresAt:observedAt+86400,evidenceHash,policyId:evidence.policyId,subject:evidence.subject,policyVerified:true,sessionVerified:true,...(request.operation==='REVOKE'?{revokedBefore:evidence.revokedBefore}:{})};
 const bytes=new TextEncoder().encode(JSON.stringify(receipt));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 const payload=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const signature=await sign(payload);await fence();
 if(!signature||typeof signature.keyId!=='string'||!signature.keyId||typeof signature.signature!=='string'||!/^[A-Za-z0-9_-]+$/.test(signature.signature))throw Error('Invalid protected signer result');
 return {keyId:signature.keyId,payload,signature:signature.signature};
}
