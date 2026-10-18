import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
const magic=Buffer.from('CLBACKUP1');
export function requireBackupKey(passphrase){if(typeof passphrase!=='string'||passphrase.length<32||passphrase.length>1024)throw Error('BACKUP_ENCRYPTION_SECRET_REQUIRED');}
const key=(p,s)=>scryptSync(p,s,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
export function encryptBundle(bytes,passphrase){
 requireBackupKey(passphrase);const salt=randomBytes(32),iv=randomBytes(12),header=Buffer.concat([magic,salt,iv]);
 const cipher=createCipheriv('aes-256-gcm',key(passphrase,salt),iv);cipher.setAAD(header);
 const data=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([header,cipher.getAuthTag(),data]);
}
export function decryptBundle(bytes,passphrase){
 requireBackupKey(passphrase);
 try{
  if(bytes.length<69||!bytes.subarray(0,9).equals(magic))throw Error();
  const header=bytes.subarray(0,53),dec=createDecipheriv('aes-256-gcm',key(passphrase,bytes.subarray(9,41)),bytes.subarray(41,53));
  dec.setAAD(header);dec.setAuthTag(bytes.subarray(53,69));return Buffer.concat([dec.update(bytes.subarray(69)),dec.final()]);
 }catch{throw Error('BACKUP_AUTHENTICATION_FAILED');}
}
