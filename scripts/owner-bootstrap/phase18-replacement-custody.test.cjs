'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'),crypto=require('node:crypto');
const {encryptForCustody,verifyRecoveredCopy,fingerprint}=require('./phase18-replacement-custody.cjs');
// Ephemeral test keys only, never registered with GitHub.
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const pem=pair.privateKey.export({format:'pem',type:'pkcs8'}),pass=Buffer.from('NONSECRET-TEST-FIXTURE-ONLY'),fp=fingerprint(pair.publicKey);
test('encrypted copy decrypts and matches independent public key',()=>{const r=encryptForCustody(pem,pass,fp);assert(!r.encrypted.includes(Buffer.from(pem)));assert.equal(verifyRecoveredCopy(Buffer.from(r.encrypted),pass,fp).recoveredCopyVerified,true);});
test('wrong fingerprint fails closed',()=>assert.throws(()=>encryptForCustody(pem,pass,'0'.repeat(64)),/REGISTERED_PUBLIC_KEY_MISMATCH/));
test('wrong recovery passphrase has sanitized error',()=>{const r=encryptForCustody(pem,pass,fp);assert.throws(()=>verifyRecoveredCopy(r.encrypted,Buffer.from('WRONG-NONSECRET-FIXTURE'),fp),/^Error: RECOVERY_UNLOCK_REFUSED$/);});
test('plaintext backup and short passphrase refused',()=>{assert.throws(()=>verifyRecoveredCopy(Buffer.from(pem),pass,fp),/ENCRYPTED_BACKUP_REQUIRED/);assert.throws(()=>encryptForCustody(pem,Buffer.from('short'),fp),/CUSTODY_INPUT_REFUSED/);});
