'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const expected='906b44b713ee4129c9cda8d3732bf8b72985c7d9bfa6a86406d1b06a0af379b8';
const context={protocol:'CREATORLOOP_DISPATCH_ENCRYPTED_CUSTODY_V1',environment:'TRAINING',accountId:'2a3b96a0b37850cd03107131baa66b6d',applicationId:'e26c0d01-fc6f-4f98-ab3e-76643e56c695',applicationAud:'b930eec3bb50c1e652a267e2ec83ee4a0a1532f8a341829bed54fa8eb9a39a35',hostname:'execution-training.creatorloop.net',name:'CreatorLoop TRAINING Dispatch 20261013 V1'};
const root='/Users/tt1/.vt-creatorloop',dir=root+'/private-signing',target=dir+'/training-dispatch-credential-20261018.enc.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let bytes,pass,key,plain,stage='PRIVATE_CUSTODY_PREFLIGHT';
try{
 if(process.platform!=='darwin'||process.env.HOME!=='/Users/tt1')throw Error();
 for(const p of [root,dir]){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw Error();}
 const ask=s=>execFileSync('/usr/bin/osascript',['-e',s],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8192,timeout:300000}).replace(/\r?\n$/,'');
 stage='SELECT_DRIVE_CUSTODY_DOWNLOAD';
 const selected=ask('POSIX path of (choose file with prompt "Select the encrypted phase18-dispatch-custody.enc.json downloaded from VT Google Drive")');
 const stat=fs.lstatSync(selected);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||stat.nlink!==1||stat.size>65536||fs.realpathSync(selected).startsWith(root+'/'))throw Error();
 const fd=fs.openSync(selected,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const opened=fs.fstatSync(fd);if(opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error();bytes=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 stage='DRIVE_COPY_HASH_AND_ENVELOPE';
 if(sha(bytes)!==expected)throw Error();
 const e=JSON.parse(bytes.toString('utf8'));
 for(const [k,v]of Object.entries(context))if(e[k]!==v)throw Error();
 if(e.cipher!=='AES-256-GCM'||e.kdf.name!=='scrypt'||e.kdf.N!==32768||e.kdf.r!==8||e.kdf.p!==1)throw Error();
 stage='PRIVATE_CUSTODY_PASSWORD_INPUT';
 pass=Buffer.from(ask('text returned of (display dialog "Enter the separate password labeled CreatorLoop TRAINING Dispatch — Encrypted Custody. This is NOT the V3 App-key passphrase. Recovery only; no network or activation." default answer "" with hidden answer buttons {"Cancel", "Verify recovery"} default button "Verify recovery" cancel button "Cancel")'),'utf8');
 if(pass.length<32||pass.length>1024)throw Error();
 stage='AUTHENTICATED_RECOVERY';
 key=crypto.scryptSync(pass,Buffer.from(e.kdf.salt,'base64'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 pass.fill(0);pass=undefined;
 const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));d.setAAD(Buffer.from(JSON.stringify(context)));d.setAuthTag(Buffer.from(e.tag,'base64'));
 plain=Buffer.concat([d.update(Buffer.from(e.ciphertext,'base64')),d.final()]);
 stage='RUN_RECEIPT_MATCH';
 const value=JSON.parse(plain.toString('utf8'));
 if(value.id!=='ab3ec5b1-e85d-4cd6-99a2-21ff61556bad'||value.clientId!=='5cfd7343e8c3d0b7d5904f3e2c796091.access'||value.expiresAt!=='2026-11-18T19:44:59Z'||typeof value.clientSecret!=='string'||!value.clientSecret)throw Error();
 value.clientSecret=undefined;plain.fill(0);plain=undefined;
 stage='ENCRYPTED_LOCAL_CUSTODY';
 if(fs.existsSync(target)){
  const s=fs.lstatSync(target);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o777)!==0o400||sha(fs.readFileSync(target))!==expected)throw Error();
 }else{const out=fs.openSync(target,'wx',0o400);try{fs.writeFileSync(out,bytes);fs.fsyncSync(out);}finally{fs.closeSync(out);}}
 if(sha(fs.readFileSync(target))!==expected)throw Error();
 console.log(JSON.stringify({status:'PHASE18_DISPATCH_CUSTODY_RECOVERY_VERIFIED',runId:39159887017,credentialId:'ab3ec5b1-e85d-4cd6-99a2-21ff61556bad',encryptedFileSha256:expected,independentRecoveryVerified:true,encryptedLocalCustodyRetained:true,plaintextCredentialWritten:false,networkRequests:0,workerActivated:false}));
}catch{console.error(JSON.stringify({status:'PHASE18_DISPATCH_CUSTODY_RECOVERY_STOPPED',stage,automaticRetryAllowed:false,privateValuesIncluded:false}));process.exitCode=1;}
finally{bytes?.fill(0);pass?.fill(0);key?.fill(0);plain?.fill(0);}
