import {readFile} from 'node:fs/promises';
import {createPublicKey,createHash,verify} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validatePublicVerifierKeys} from '../lib/creatorloop-training-signer.mjs';

export const CUSTODY_CHALLENGE_PREFIX='CREATORLOOP_TRAINING_CUSTODY_CHALLENGE_V1\nNOT_AN_ADMISSION_RECEIPT\n';
export async function publicKeyHandoff({publicPem,keyId,challenge,signature}) {
 if(typeof publicPem!=='string'||!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(publicPem)||/PRIVATE KEY/.test(publicPem)||!publicPem.trim().endsWith('-----END PUBLIC KEY-----'))throw Error('PUBLIC_SPKI_PEM_ONLY');
 if(typeof keyId!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(keyId))throw Error('UNIQUE_KEY_ID_REQUIRED');
 const key=createPublicKey(publicPem),jwk=key.export({format:'jwk'});
 const [approved]=await validatePublicVerifierKeys([{...jwk,kid:keyId}]);
 const canonical=JSON.stringify({e:approved.e,kty:approved.kty,n:approved.n});
 const digest=createHash('sha256').update(canonical).digest();
 if((challenge===undefined)!==(signature===undefined))throw Error('CHALLENGE_AND_SIGNATURE_REQUIRED_TOGETHER');
 let challengeVerified=false;
 if(challenge!==undefined){
  const challengeText=Buffer.from(challenge).toString('utf8');
  if(!challengeText.startsWith(CUSTODY_CHALLENGE_PREFIX)||!/^[a-f0-9]{64}\n$/.test(challengeText.slice(CUSTODY_CHALLENGE_PREFIX.length)))throw Error('NON_ADMISSION_CHALLENGE_REQUIRED');
  if(!verify('RSA-SHA256',Buffer.from(challenge),key,Buffer.from(signature)))throw Error('CUSTODY_CHALLENGE_SIGNATURE_INVALID');
  challengeVerified=true;
 }
 return {protocol:'CREATORLOOP_PUBLIC_KEY_HANDOFF_V1',environment:'TRAINING',keyId,modulusBits:key.asymmetricKeyDetails.modulusLength,publicJwk:approved,publicJwkSha256:digest.toString('hex'),rfc7638Thumbprint:digest.toString('base64url'),admissionVerifierKeys:JSON.stringify([approved]),challengeVerified,...(challengeVerified?{challengeSha256:createHash('sha256').update(challenge).digest('hex')}:{ }),identityOrProviderAuthorityVerified:false,executable:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [publicPath,keyId,challengePath,signaturePath,...extra]=process.argv.slice(2);
  if(!publicPath||!keyId||extra.length)throw Error('USAGE_PUBLIC_PEM_KEY_ID_OPTIONAL_CHALLENGE_SIGNATURE');
  const result=await publicKeyHandoff({publicPem:await readFile(publicPath,'utf8'),keyId,...(challengePath?{challenge:await readFile(challengePath)}:{}),...(signaturePath?{signature:await readFile(signaturePath)}:{})});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{process.stderr.write('Public handoff verification refused. Supply only public SPKI PEM, a key ID, and optionally both non-admission challenge and signature files.\n');process.exitCode=1;}
}
