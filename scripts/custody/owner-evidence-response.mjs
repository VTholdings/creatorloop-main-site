import {readFile,writeFile,lstat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {prepareOwnerEvidence,OWNER_EVIDENCE_AUDIENCE} from '../lib/training-owner-approval-protocol.mjs';
import {verifyJwt} from '../../workers/training-managed/security.mjs';
import {refuse} from '../lib/training-execution-contract.mjs';
export async function prepareSavedOwnerResponse({pending,decision,issuer,keyId,now}){return prepareOwnerEvidence({pending,decision,issuer,keyId,now});}
export async function completeSavedOwnerResponse({prepared,signature,publicKeys,issuer,now}){
 if(typeof signature!=='string'||!/^[A-Za-z0-9_-]+$/.test(signature)||typeof prepared?.signingInput!=='string')refuse('BOUNDED_OWNER_RESPONSE_SIGNATURE_REQUIRED');
 const jws=prepared.signingInput+'.'+signature;
 const p=await verifyJwt(jws,{issuer,audience:OWNER_EVIDENCE_AUDIENCE,jwks:publicKeys,now});
 if(p.pendingHash!==prepared.pendingHash)refuse('OWNER_RESPONSE_PREPARATION_MISMATCH');return {jws};
}
async function privateJson(path){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.size>65536)refuse('OWNER_RESTRICTED_LOCAL_INPUT_REQUIRED');return JSON.parse(await readFile(path,'utf8'));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,inputFile,outputFile]=process.argv.slice(2);if(!['prepare','complete'].includes(mode)||!inputFile||!outputFile)throw Error('Usage: node scripts/custody/owner-evidence-response.mjs prepare|complete restricted-input.json new-output.json');
 const input=await privateJson(inputFile);const now=Math.floor(Date.now()/1000);
 const output=mode==='prepare'?await prepareSavedOwnerResponse({...input,now}):await completeSavedOwnerResponse({...input,now});
 await writeFile(outputFile,JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({outputFile,mode,privateKeyRead:false,signingPerformed:false,networkPerformed:false}));
}
