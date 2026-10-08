import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {inspectBackupKeyDelivery} from '../lib/backup-key-delivery.mjs';
const e=process.env;
let report={protocol:'CREATORLOOP_BACKUP_KEY_DELIVERY_V1',code:'PROTECTED_DIAGNOSTIC_CONTEXT_REQUIRED',exportsExecuted:false,infrastructureCallsExecuted:false};
if(e.GITHUB_ACTIONS==='true'&&e.GITHUB_REPOSITORY==='VTholdings/creatorloop-main-site'&&e.GITHUB_REF==='refs/heads/team-access-directory'&&e.GITHUB_EVENT_NAME==='push'&&e.ACCEPTANCE_ENVIRONMENT==='creatorloop-acceptance'){
 report={...report,...inspectBackupKeyDelivery(e.CREATORLOOP_BACKUP_PASSPHRASE,e.BACKUP_SECRET_CONTEXT_PRESENT)};
}
await mkdir('diagnostic-evidence',{recursive:true,mode:0o700});
await writeFile('diagnostic-evidence/backup-key-delivery.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
const summary='Backup key delivery diagnostic: '+report.code+'. No secret value, exact length or fingerprint disclosed. No Cloudflare call or export executed.\n';
console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
if(report.code!=='SECRET_DELIVERY_AND_VALIDATION_PASS')process.exitCode=1;
