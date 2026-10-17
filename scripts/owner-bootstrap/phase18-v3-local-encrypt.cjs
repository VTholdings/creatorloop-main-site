'use strict';
const fs=require('node:fs'),c=require('node:crypto'),{execFileSync}=require('node:child_process');
const root='/Users/tt1/.vt-creatorloop',dir=root+'/private-signing',out=dir+'/training-executor-github-app-5288606-v3.pem';
const old=dir+'/training-executor-github-app-5288606-v2.pem';
const fp='f4e8f518b9f6910e86102bf5d72a7ddcf8e9f91b4ee467daef6853e403233c97';
const hash=b=>c.createHash('sha256').update(b).digest('hex');
const dialog=s=>execFileSync('/usr/bin/osascript',['-e',s],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8192}).replace(/\r?\n$/,'');
let raw,pass,confirm,encrypted;
try{
 if(process.platform!=='darwin'||process.env.HOME!=='/Users/tt1')throw Error();
 for(const p of [root,dir]){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw Error();}
 if(fs.existsSync(out))throw Error();
 const oldHash=hash(fs.readFileSync(old));
 if(oldHash!=='c9e0a09cf18d01c8b752a718aaed0abdb626233f0faf7932310d9ef1487dbc3c')throw Error();
 const source=dialog('POSIX path of (choose file with prompt "Select the NEW V3 downloaded PEM for App 5288606")');
 if(source.startsWith(root+'/'))throw Error();
 const s=fs.lstatSync(source);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==process.getuid()||s.size>65536)throw Error();
 const fd=fs.openSync(source,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const opened=fs.fstatSync(fd);if(opened.ino!==s.ino||opened.dev!==s.dev)throw Error();raw=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 const key=c.createPrivateKey(raw);raw.fill(0);raw=undefined;
 if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048||hash(c.createPublicKey(key).export({format:'der',type:'spki'}))!==fp)throw Error();
 pass=Buffer.from(dialog('text returned of (display dialog "Create a NEW V3 encryption passphrase: at least 20 characters. Keep it private. You will record it securely before encryption." default answer "" with hidden answer buttons {"Cancel", "Continue"} default button "Continue" cancel button "Cancel")'),'utf8');
 confirm=Buffer.from(dialog('text returned of (display dialog "Enter the SAME new V3 passphrase again." default answer "" with hidden answer buttons {"Cancel", "Continue"} default button "Continue" cancel button "Cancel")'),'utf8');
 if(pass.length<20||pass.length!==confirm.length||!c.timingSafeEqual(pass,confirm))throw Error();
 confirm.fill(0);confirm=undefined;
 dialog('display dialog "Save this new passphrase privately in your existing password manager under: CreatorLoop App 5288606 V3 LOCAL ENCRYPTION. Keep its recovery accessible independently of this Mac. Do not put it in chat, a repository, or beside the key backup. Click Recorded only after saving it." buttons {"Cancel", "Recorded"} default button "Recorded" cancel button "Cancel"');
 encrypted=Buffer.from(key.export({format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase:pass}));
 const recovered=c.createPrivateKey({key:encrypted,format:'pem',passphrase:pass});
 if(hash(c.createPublicKey(recovered).export({format:'der',type:'spki'}))!==fp)throw Error();
 const dest=fs.openSync(out,'wx',0o400);
 try{fs.writeFileSync(dest,encrypted);fs.fsyncSync(dest);}finally{fs.closeSync(dest);}
 if(hash(fs.readFileSync(out))!==hash(encrypted)||hash(fs.readFileSync(old))!==oldHash)throw Error();
 console.log(JSON.stringify({status:'V3_LOCAL_ENCRYPTED_CUSTODY_VERIFIED',appId:5288606,publicSpkiSha256:fp,ciphertextSha256:hash(encrypted),encryptedPkcs8:true,privateFileMode:'0400',v2Unchanged:true,independentBackupVerified:false,downloadedOriginalRetained:true,dispatchAttempted:false}));
}catch{console.error('V3_CUSTODY_STOPPED: LOCAL_ENCRYPTION_NOT_COMPLETED_DO_NOT_RERUN');process.exitCode=1;}
finally{raw?.fill(0);pass?.fill(0);confirm?.fill(0);encrypted?.fill(0);}
