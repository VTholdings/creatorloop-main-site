import {accessPrincipal,independentEvidence,exact} from './security.mjs';
import {dispatchHash} from '../../scripts/lib/training-mediated-dispatcher.mjs';
import {refuse} from '../../scripts/lib/training-execution-contract.mjs';
export const CUSTODY_BODY_LIMIT=32*1024*1024;
export async function authorizeCustodyExport({request,body,env,config,fetchImpl,now}){
 if(!exact(body,['protocol','exportId','decisionRef','expectedVersionId'])||body.protocol!=='CREATORLOOP_OWNER_CUSTODY_EXPORT_V1'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.exportId||'')||typeof body.decisionRef!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(body.decisionRef)||typeof body.expectedVersionId!=='string'||!body.expectedVersionId||env.WORKER_VERSION_METADATA?.id!==body.expectedVersionId)refuse('EXACT_OWNER_EXPORT_VERSION_REQUEST_REQUIRED');
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 const principal=await accessPrincipal(token,config,{fetchImpl,now});
 if(principal.role!=='owner')refuse('OWNER_ONLY_CUSTODY_EXPORT');
 const query={requestHash:dispatchHash(body),ownerId:principal.id,versionId:body.expectedVersionId,configHash:dispatchHash(config)};
 const proof=await independentEvidence(config,'custodyExport',query,{fetchImpl,now,identityToken:token,identityType:'access'});
 if(!exact(proof,['protocol','requestHash','ownerId','versionId','configHash','decisionRef','exportId','dataExportAuthorized','approvedAt','expiresAt'])||proof.protocol!=='CREATORLOOP_OWNER_CUSTODY_EXPORT_APPROVAL_V1'||proof.requestHash!==query.requestHash||proof.ownerId!==principal.id||proof.versionId!==query.versionId||proof.configHash!==query.configHash||proof.decisionRef!==body.decisionRef||proof.exportId!==body.exportId||proof.dataExportAuthorized!==true||!Number.isInteger(proof.approvedAt)||!Number.isInteger(proof.expiresAt)||proof.approvedAt>now||proof.approvedAt<now-300||proof.expiresAt<=now||proof.expiresAt-proof.approvedAt>300)refuse('CURRENT_INDEPENDENT_OWNER_EXPORT_APPROVAL_REQUIRED');
 return {ownerId:principal.id,versionId:query.versionId,configHash:query.configHash,requestHash:query.requestHash,approvalHash:dispatchHash(proof),expiresAt:proof.expiresAt};
}
