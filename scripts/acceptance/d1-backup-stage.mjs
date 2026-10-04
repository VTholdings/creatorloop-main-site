import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {readOnlyClient,verifyCloudflare} from '../lib/cloudflare-readonly.mjs';
import {exportDatabase,fail} from '../lib/d1-backup-export.mjs';
import {requireBackupKey} from '../lib/backup-envelope.mjs';
import {validateDispatch,authorizeBackup,assertCurrentRelease} from '../lib/backup-authorization.mjs';
const e=process.env;
if(process.argv[2]==='validate-dispatch'){
 try{validateDispatch({context:e,event:JSON.parse(await readFile(e.GITHUB_EVENT_PATH,'utf8'))});console.log('OWNER_DISPATCH_ATTESTATION_VALID');}
 catch{console.error('OWNER_DISPATCH_ATTESTATION_REQUIRED');process.exitCode=1;}
}else{
const report={protocol:'CREATORLOOP_BACKUP_STAGE_V1',status:'BACKUP_STAGE_BLOCKED',releaseSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,exports:[],blockers:[],retentionDays:90,offPlatformCopy:'PREPARED_NOT_CONFIRMED',remoteMigrationsApplied:false,productionDeployed:false};
try{
 const event=JSON.parse(await readFile(e.GITHUB_EVENT_PATH,'utf8'));
 validateDispatch({context:e,event});
 if(e.ACCEPTANCE_ENVIRONMENT!=='creatorloop-acceptance')fail('PROTECTED_ENVIRONMENT_REQUIRED');
 requireBackupKey(e.CREATORLOOP_BACKUP_PASSPHRASE);if(e.CREATORLOOP_BACKUP_PASSPHRASE===e.CLOUDFLARE_API_TOKEN)fail('SEPARATE_BACKUP_KEY_REQUIRED');
 const authorization=await authorizeBackup({context:e,event});
 report.authorization=authorization;
 report.lowActivityWindowAttested=true;
 const attestationSummary='Owner backup authorization: '+JSON.stringify(authorization)+'\n';
 console.log(attestationSummary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,attestationSummary);
 const targets=JSON.parse(await readFile(new URL('./cloudflare-targets.json',import.meta.url),'utf8'));
 const metadata=await verifyCloudflare({client:readOnlyClient({token:e.CLOUDFLARE_API_TOKEN,targets}),targets,releaseSha:e.GITHUB_SHA,mainSha:e.EXPECTED_MAIN_SHA});
 if(metadata.status!=='READ_ONLY_METADATA_MATCH')fail('CURRENT_INFRASTRUCTURE_VERIFICATION_BLOCKED');
 report.currentMetadataMatched=true;
 await mkdir('backup-private',{recursive:true,mode:0o700});
 await writeFile('backup-private/current-metadata.json',JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
 for(const environment of ['TRAINING','PRODUCTION']){
  await assertCurrentRelease({context:e,authorization});
  const {bytes}=await exportDatabase({token:e.CLOUDFLARE_API_TOKEN,targets,environment,onEvidence:evidence=>report.exports.push(evidence)});
  await writeFile('backup-private/'+environment+'.sql',bytes,{mode:0o600,flag:'wx'});
 }
 report.status='FRESH_EXPORTS_CAPTURED';
}catch(error){report.blockers.push({code:/^[A-Z_]+$/.test(error.message)?error.message:'BACKUP_STAGE_BLOCKED'});}
await mkdir('backup-private',{recursive:true,mode:0o700});
await writeFile('backup-private/export-evidence.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
const summary='Backup stage: '+report.status+'; captured '+report.exports.filter(x=>x.status==='EXPORT_CAPTURED').length+' / 2. Blockers: '+report.blockers.map(b=>b.code).join(', ')+'. No migration or deployment.\n';
console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
if(report.blockers.length)process.exitCode=1;
}
