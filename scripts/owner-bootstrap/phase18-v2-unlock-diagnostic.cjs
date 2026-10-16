'use strict';
// Single local diagnostic. No network, writes, signing, dispatch, or key changes.
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const KEY='/Users/tt1/.vt-creatorloop/private-signing/training-executor-github-app-5288606-v2.pem';
const EXPECTED='c9e0a09cf18d01c8b752a718aaed0abdb626233f0faf7932310d9ef1487dbc3c';
const SPKI='bca0fe5ab36dd06d23c4722536edfc08027075361690b0ad958b99a589f72c3e';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const refuse=code=>{const e=new Error();e.safeCode=code;throw e;};
function encryptionInfo(pem) {
  const match=pem.toString('ascii').match(/^-----BEGIN ENCRYPTED PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END ENCRYPTED PRIVATE KEY-----\r?\n?$/);
  if(!match) refuse('V2_ENCRYPTED_PKCS8_FORMAT_REFUSED');
  const der=Buffer.from(match[1].replace(/[\r\n]/g,''),'base64');
  function tlv(offset,limit) {
    let i=offset; const tag=der[i++]; let n=der[i++];
    if(n&128) { const count=n&127; if(!count || count>3) throw new Error(); n=0;
      for(let j=0;j<count;j++) n=(n*256)+der[i++]; }
    if(!Number.isInteger(n) || i+n>limit || i>limit) throw new Error();
    return {tag,start:i,end:i+n};
  }
  function children(x) { if(x.tag!==48) throw new Error(); const a=[];
    for(let i=x.start;i<x.end;) { const c=tlv(i,x.end); a.push(c); i=c.end; if(a.length>8) throw new Error(); } return a; }
  function oid(x,hex) { return x?.tag===6 && der.subarray(x.start,x.end).toString('hex')===hex; }
  function integer(x) { if(x?.tag!==2 || x.end-x.start>4 || (der[x.start]&128)) throw new Error();
    let v=0; for(let i=x.start;i<x.end;i++) v=(v*256)+der[i]; return v; }
  try {
    const top=tlv(0,der.length); if(top.end!==der.length) throw new Error();
    const [alg,ciphertext]=children(top), [pbes2,params]=children(alg);
    if(!oid(pbes2,'2a864886f70d01050d') || ciphertext?.tag!==4) throw new Error();
    const [kdf,cipher]=children(params), [pbkdf2,kparams]=children(kdf), [aes,iv]=children(cipher);
    if(!oid(pbkdf2,'2a864886f70d01050c') || !oid(aes,'60864801650304012a') ||
       iv?.tag!==4 || iv.end-iv.start!==16 || (ciphertext.end-ciphertext.start)%16) throw new Error();
    const kp=children(kparams), salt=kp[0], iterations=integer(kp[1]);
    if(salt?.tag!==4 || salt.end-salt.start<8 || iterations<1000 || iterations>10000000) throw new Error();
    let index=2; if(kp[index]?.tag===2) { if(integer(kp[index++])!==32) throw new Error(); }
    let prf='HMAC-SHA1';
    if(kp[index]) { const [p]=children(kp[index]);
      if(oid(p,'2a864886f70d0209')) prf='HMAC-SHA256';
      else if(!oid(p,'2a864886f70d0207')) throw new Error(); }
    return {format:'encrypted PKCS8',scheme:'PBES2',kdf:'PBKDF2',prf,iterations,cipher:'AES-256-CBC'};
  } finally { der.fill(0); }
}
function main(){
 let encrypted,secretBytes,key,publicDer;
 const result={protocol:'VT_PHASE18_V2_UNLOCK_DIAGNOSTIC_V1',ciphertextVerified:false,encryptionMetadataVerified:false,unlockVerified:false,publicPairVerified:false,cryptoCode:null,networkRequests:0,filesChanged:false,dispatchAttempted:false};
 try{
  if(process.platform!=='darwin'||process.version!=='v22.23.3'||process.env.HOME!=='/Users/tt1')refuse('EXACT_OWNER_MAC_REQUIRED');
  const stat=fs.lstatSync(KEY);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||stat.nlink!==1||(stat.mode&0o777)!==0o400||fs.realpathSync(KEY)!==KEY||stat.size>65536)refuse('PRIVATE_KEY_CUSTODY_GUARD_REFUSED');
  const fd=fs.openSync(KEY,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const opened=fs.fstatSync(fd);if(opened.ino!==stat.ino||opened.dev!==stat.dev||opened.mtimeMs!==stat.mtimeMs)refuse('FILE_CHANGED_DURING_READ');encrypted=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
  if(sha(encrypted)!==EXPECTED)refuse('VERIFIED_V2_CIPHERTEXT_MISMATCH');
  result.ciphertextVerified=true;
  try{result.encryption=encryptionInfo(encrypted);}catch{refuse('ENCRYPTION_METADATA_INCOMPATIBLE');}
  if(!crypto.getCiphers().includes('aes-256-cbc')||!crypto.getHashes().includes(result.encryption.prf==='HMAC-SHA256'?'sha256':'sha1'))refuse('CRYPTO_ALGORITHM_UNAVAILABLE');
  result.encryptionMetadataVerified=true;
  let input;
  try{input=execFileSync('/usr/bin/osascript',['-e','activate','-e','text returned of (display dialog "LOCAL UNLOCK DIAGNOSTIC ONLY. Enter the confirmed saved LOCAL ENCRYPTION passphrase chosen for App 5288606 V2 on October 13. Not a Cloudflare token, GitHub password, or private-key contents. Cancel if that saved record is unavailable. Nothing will be dispatched." with title "CreatorLoop — V2 Unlock Diagnostic" default answer "" buttons {"Cancel", "Check saved V2 passphrase"} default button "Check saved V2 passphrase" cancel button "Cancel" with hidden answer)'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:300000,maxBuffer:8192}).replace(/\r?\n$/,'');}catch{refuse('PRIVATE_INPUT_CANCELLED_OR_UNAVAILABLE');}
  if(!input)refuse('SAVED_PASSPHRASE_UNAVAILABLE');
  if(input.startsWith('cfat_')){input=undefined;refuse('CLOUDFLARE_TOKEN_SUPPLIED_NOT_V2_PASSPHRASE');}
  if(input.includes('-----BEGIN ')){input=undefined;refuse('KEY_CONTENT_SUPPLIED_NOT_V2_PASSPHRASE');}
  secretBytes=Buffer.from(input,'utf8');input=undefined;
  try{key=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase:secretBytes});}
  catch(e){
   const allowed=['ERR_OSSL_BAD_DECRYPT','ERR_OSSL_EVP_BAD_DECRYPT','ERR_OSSL_UNSUPPORTED','ERR_OSSL_EVP_UNSUPPORTED'];
   result.cryptoCode=allowed.includes(e.code)?e.code:'OTHER_CRYPTO_ERROR';
   if(['ERR_OSSL_BAD_DECRYPT','ERR_OSSL_EVP_BAD_DECRYPT'].includes(e.code))refuse('SUPPLIED_VALUE_DOES_NOT_UNLOCK_VERIFIED_V2');
   refuse('DECRYPTION_IMPLEMENTATION_OR_RUNTIME_ERROR');
  }finally{secretBytes.fill(0);secretBytes=undefined;}
  result.unlockVerified=true;
  publicDer=crypto.createPublicKey(key).export({format:'der',type:'spki'});
  if(sha(publicDer)!==SPKI)refuse('UNLOCKED_PUBLIC_KEY_MISMATCH');
  result.publicPairVerified=true;
  const final=fs.readFileSync(KEY);const unchanged=sha(final)===EXPECTED;final.fill(0);
  if(!unchanged)refuse('V2_CHANGED_DURING_DIAGNOSTIC');
  result.status='EXISTING_V2_UNLOCK_AND_PUBLIC_PAIR_VERIFIED';
 }catch(e){result.status=e.safeCode||'UNEXPECTED_LOCAL_DIAGNOSTIC_FAILURE';}
 finally{encrypted?.fill(0);secretBytes?.fill(0);publicDer?.fill(0);key=undefined;}
 console.log(JSON.stringify(result,null,2));
}
main();
