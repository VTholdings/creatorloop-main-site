import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {readOnlyClient,verifyCloudflare} from '../lib/cloudflare-readonly.mjs';
import {exportDatabase,windowApproved,fail} from '../lib/d1-backup-export.mjs';
import {requireBackupKey} from '../lib/backup-envelope.mjs';
const e=process.env;
const report={protocol:'CREATORLOOP_BACKUP_STAGE_V1',status:'BACKUP_STAGE_BLOCKED',releaseSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,exports:[],blockers:[],retentionDays:90,offPlatformCopy:'PREPARED_NOT_CONFIRMED',remoteMigrationsApplied:false,productionDeployed:false};
try{
 if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!=='VTholdings/creatorloop-main-site'||e.GITHUB_REF!=='refs/heads/team-access-directory'||e.GITHUB_EVENT_NAME!=='push'||e.ACCEPTANCE_ENVIRONMENT!=='creatorloop-acceptance'||e.GITHUB_RUN_ATTEMPT!=='1'||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||''))fail('PROTECTED_FIRST_ATTEMPT_REQUIRED');
 requireBackupKey(e.CREATORLOOP_BACKUP_PASSPHRASE);if(e.CREATORLOOP_BACKUP_PASSPHRASE===e.CLOUDFLARE_API_TOKEN)fail('SEPARATE_BACKUP_KEY_REQUIRED');
 const review=await fetch('https://api.github.com/repos/VTholdings/creatorloop-main-site/actions/runs/'+e.GITHUB_RUN_ID+'/approvals',{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!review.ok||!windowApproved(await review.json()))fail('OWNER_LOW_ACTIVITY_ATTESTATION_REQUIRED');
 report.lowActivityWindowAttested=true;
 const targets=JSON.parse(await readFile(new URL('./cloudflare-targets.json',import.meta.url),'utf8'));
 const metadata=await verifyCloudflare({client:readOnlyClient({token:e.CLOUDFLARE_API_TOKEN,targets}),targets,releaseSha:e.GITHUB_SHA,mainSha:e.EXPECTED_MAIN_SHA});
 if(metadata.status!=='READ_ONLY_METADATA_MATCH')fail('CURRENT_INFRASTRUCTURE_VERIFICATION_BLOCKED');
 report.currentMetadataMatched=true;
 await mkdir('backup-private',{recursive:true,mode:0o700});
 await writeFile('backup-private/current-metadata.json',JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
 for(const environment of ['TRAINING','PRODUCTION']){
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
