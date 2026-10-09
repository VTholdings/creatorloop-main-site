import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicKey} from 'node:crypto';
import {publicKeyHandoff,CUSTODY_CHALLENGE_PREFIX} from '../scripts/custody/public-key-handoff.mjs';
import {publicJwk} from './helpers/training-execution-fixture.js';
const publicPem=createPublicKey({key:publicJwk,format:'jwk'}).export({type:'spki',format:'pem'});
test('public-only Owner handoff exports exact admission variable and matching public fingerprints without custody certification',async()=>{
 const result=await publicKeyHandoff({publicPem,keyId:'TRAINING-PUBLIC-TEST'});
 assert.equal(result.modulusBits,2048);
 assert.equal(result.rfc7638Thumbprint,'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
 assert.equal(result.publicJwkSha256,Buffer.from(result.rfc7638Thumbprint,'base64url').toString('hex'));
 assert.equal(JSON.parse(result.admissionVerifierKeys)[0].kid,'TRAINING-PUBLIC-TEST');
 assert.equal(result.challengeVerified,false);assert.equal(result.executable,false);assert.equal(result.identityOrProviderAuthorityVerified,false);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE KEY|"d":|"p":|"q":/);
});
test('private/malformed PEM, bad key ID, incomplete or non-nonce challenge and invalid signatures fail closed',async()=>{
 for(const args of [{publicPem:'-----BEGIN PRIVATE KEY-----\nfictional\n-----END PRIVATE KEY-----'},{keyId:'bad key'},{challenge:Buffer.from(CUSTODY_CHALLENGE_PREFIX)},{challenge:Buffer.from(CUSTODY_CHALLENGE_PREFIX),signature:Buffer.from('invalid')},{challenge:Buffer.from(CUSTODY_CHALLENGE_PREFIX+'a'.repeat(64)+'\n'),signature:Buffer.from('invalid')}])await assert.rejects(publicKeyHandoff({publicPem,keyId:'TRAINING-PUBLIC-TEST',...args}));
});
