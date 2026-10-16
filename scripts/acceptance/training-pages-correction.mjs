import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {correctTrainingPages} from '../lib/training-pages-correction.mjs';
const env=process.env;
let report={status:'TRAINING_CORRECTION_BLOCKED',writeAttempted:false,blockers:[{code:'PROTECTED_CORRECTION_CONTEXT_REQUIRED'}]};
if(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY==='VTholdings/creatorloop-main-site'&&env.GITHUB_REF==='refs/heads/team-access-directory'&&env.GITHUB_EVENT_NAME==='push'&&env.ACCEPTANCE_ENVIRONMENT==='creatorloop-acceptance'&&env.APPROVED_CHANGE==='CREATORLOOP_TRAINING_BINDINGS_V1'){
 try{report=await correctTrainingPages({token:env.CLOUDFLARE_API_TOKEN,targets:JSON.parse(await readFile(new URL('./cloudflare-targets.json',import.meta.url),'utf8'))});}
 catch{report={status:'TRAINING_CORRECTION_BLOCKED',blockers:[{code:'CORRECTION_CONFIGURATION_UNAVAILABLE'}]};}
}
await mkdir('acceptance-evidence',{recursive:true,mode:0o700});
await writeFile('acceptance-evidence/training-correction.json',JSON.stringify({...report,releaseSha:env.GITHUB_SHA},null,2)+'\n',{mode:0o600});
const summary='Training Pages correction: '+report.status+'\nBlockers: '+report.blockers.map(b=>b.code).join(', ')+'\nNo deployments, D1 writes, Access changes or token changes were requested.\n';
console.log(summary);
if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,summary);
if(!['TRAINING_CORRECTION_VERIFIED','TRAINING_CONFIGURATION_ALREADY_MATCHES'].includes(report.status))process.exitCode=1;
