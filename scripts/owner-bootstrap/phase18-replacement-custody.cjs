'use strict';
// Preparation only. No network, filesystem operations, signing or dispatch.
const crypto = require('node:crypto');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
function fingerprint(key) {
  const publicKey = key.type === 'public' ? key : crypto.createPublicKey(key);
  return digest(publicKey.export({format:'der',type:'spki'}));
}
function encryptForCustody(privatePem, passphrase, expectedPublicFingerprint) {
  if (!Buffer.isBuffer(passphrase) || passphrase.length < 20 || !/^[a-f0-9]{64}$/.test(expectedPublicFingerprint || '')) throw Error('CUSTODY_INPUT_REFUSED');
  let key;
  try { key = crypto.createPrivateKey(privatePem); } catch { throw Error('REPLACEMENT_KEY_PARSE_REFUSED'); }
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048 || fingerprint(key) !== expectedPublicFingerprint) throw Error('REGISTERED_PUBLIC_KEY_MISMATCH');
  const encrypted = key.export({format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase});
  const restored = verifyRecoveredCopy(Buffer.from(encrypted),passphrase,expectedPublicFingerprint);
  return {encrypted:Buffer.from(encrypted),publicFingerprint:restored.publicFingerprint,ciphertextSha256:digest(encrypted)};
}
function verifyRecoveredCopy(encrypted, passphrase, expectedPublicFingerprint) {
  if (!Buffer.isBuffer(encrypted) || !encrypted.toString('ascii').startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----')) throw Error('ENCRYPTED_BACKUP_REQUIRED');
  let key;
  try { key = crypto.createPrivateKey({key:encrypted,format:'pem',passphrase}); } catch { throw Error('RECOVERY_UNLOCK_REFUSED'); }
  if (fingerprint(key) !== expectedPublicFingerprint) throw Error('RECOVERY_PUBLIC_KEY_MISMATCH');
  return {publicFingerprint:expectedPublicFingerprint,recoveredCopyVerified:true};
}
module.exports={encryptForCustody,verifyRecoveredCopy,fingerprint};
