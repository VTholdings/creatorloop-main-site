'use strict';
const fs=require('node:fs'),c=require('node:crypto'),{execFileSync}=require('node:child_process');
const root='/Users/tt1/.vt-creatorloop',dir=root+'/private-signing';
const source=dir+'/training-executor-github-app-5288606-v3.pem';
const target=dir+'/training-executor-github-app-5288606-v3-resecured.pem';
const v2=dir+'/training-executor-github-app-5288606-v2.pem';
const fp='f4e8f518b9f6910e86102bf5d72a7ddcf8e9f91b4ee467daef6853e403233c97';
const hash=b=>c.createHash('sha256').update(b).digest('hex');
const publicHash=k=>hash(c.createPublicKey(k).export({format:'der',type:'spki'}));
const prompt=s=>execFileSync('/usr/bin/osascript',['-e',s],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8192,timeout:600000}).replace(/\r?\n$/,'');
const secret=s=>Buffer.from(prompt('text returned of (display dialog '+JSON.stringify(s)+' default answer "" with hidden answer buttons {"Cancel", "Continue"} default button "Continue" cancel button "Cancel")'),'utf8');
let oldPass,newPass,confirmation,encrypted,original,restoredBytes;
try{
 if(process.platform!=='darwin'||process.env.HOME!=='/Users/tt1')throw Error();
 for(const p of [root,dir]){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw Error();}
 if(fs.existsSync(target))throw Error();
 const st=fs.lstatSync(source);
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||st.nlink!==1||(st.mode&0o777)!==0o400||st.size>65536)throw Error();
 const v2hash=hash(fs.readFileSync(v2));
 if(v2hash!=='c9e0a09cf18d01c8b752a718aaed0abdb626233f0faf7932310d9ef1487dbc3c')throw Error();
 const fd=fs.openSync(source,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const opened=fs.fstatSync(fd);if(opened.ino!==st.ino||opened.dev!==st.dev)throw Error();original=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 const originalHash=hash(original);
 if(!original.toString('ascii').startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----'))throw Error();
 oldPass=secret('Enter the CURRENT exposed V3 local encryption passphrase privately. It will only unlock the existing local key.');
 const key=c.createPrivateKey({key:original,format:'pem',passphrase:oldPass});
 if(publicHash(key)!==fp)throw Error();
 newPass=secret('Choose a DIFFERENT NEW V3 passphrase, at least 20 characters. Do not capture or share screenshots during this procedure.');
 confirmation=secret('Confirm the NEW V3 passphrase.');
 if(newPass.length<20||newPass.equals(oldPass)||!newPass.equals(confirmation))throw Error();
 oldPass.fill(0);oldPass=undefined;confirmation.fill(0);confirmation=undefined;
 prompt('display dialog "Save the NEW passphrase in your existing private password manager as CreatorLoop App 5288606 V3 LOCAL ENCRYPTION — ROTATED. Preserve independent access to that record. Do not save it beside the encrypted key. Click Recorded only after saving." buttons {"Cancel", "Recorded"} default button "Recorded" cancel button "Cancel"');
 encrypted=Buffer.from(key.export({format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase:newPass}));
 if(publicHash(c.createPrivateKey({key:encrypted,format:'pem',passphrase:newPass}))!==fp)throw Error();
 const dest=fs.openSync(target,'wx',0o400);
 try{fs.writeFileSync(dest,encrypted);fs.fsyncSync(dest);}finally{fs.closeSync(dest);}
 restoredBytes=fs.readFileSync(target);
 if(hash(restoredBytes)!==hash(encrypted)||publicHash(c.createPrivateKey({key:restoredBytes,format:'pem',passphrase:newPass}))!==fp)throw Error();
 if(hash(fs.readFileSync(source))!==originalHash||hash(fs.readFileSync(v2))!==v2hash)throw Error();
 console.log(JSON.stringify({status:'V3_PASSPHRASE_ROTATED_LOCAL_COPY_VERIFIED',appId:5288606,publicSpkiSha256:fp,ciphertextSha256:hash(restoredBytes),registeredKeyUnchanged:true,v2Unchanged:true,oldV3FileUnchanged:true,newEncryptedFile:target,independentBackupVerified:false,oldBackupSuperseded:true,dispatchAttempted:false}));
}catch{console.error('V3_ROTATION_STOPPED: LOCAL_ROTATION_NOT_COMPLETED_DO_NOT_RERUN');process.exitCode=1;}
finally{oldPass?.fill(0);newPass?.fill(0);confirmation?.fill(0);encrypted?.fill(0);original?.fill(0);restoredBytes?.fill(0);}
