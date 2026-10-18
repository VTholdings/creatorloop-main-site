// Owner utility as well as the protected runner. Pass the key through a secure
// environment, never arguments, source, logs or ChatGPT.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {encryptBundle,decryptBundle} from './lib/backup-envelope.mjs';
import {digest} from './lib/d1-backup-export.mjs';
try{
 const [mode,input,output]=process.argv.slice(2);
 if(!['encrypt','decrypt'].includes(mode)||!input||!output||(await stat(input)).size>140*1024*1024)throw Error();
 const data=await readFile(input),bytes=mode==='encrypt'?encryptBundle(data,process.env.CREATORLOOP_BACKUP_PASSPHRASE):decryptBundle(data,process.env.CREATORLOOP_BACKUP_PASSPHRASE);
 await writeFile(output,bytes,{mode:0o600,flag:'wx'});
 if(mode==='encrypt')await writeFile(output+'.sha256',digest(bytes)+'  '+output.split('/').at(-1)+'\n',{mode:0o600,flag:'wx'});
 console.log('Backup envelope '+mode+' completed; no contents or key logged.');
}catch{console.error('BACKUP_ENVELOPE_BLOCKED');process.exitCode=1;}
