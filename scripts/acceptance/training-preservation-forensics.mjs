import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {inspectPreservation} from '../lib/training-preservation-forensics.mjs';
const env=process.env;
let report={status:'PRESERVATION_UNRESOLVED',changesMade:false,blockers:[{code:'PROTECTED_FORENSIC_CONTEXT_REQUIRED'}]};
if(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY==='VTholdings/creatorloop-main-site'&&env.GITHUB_REF==='refs/heads/team-access-directory'&&env.GITHUB_EVENT_NAME==='push'&&env.ACCEPTANCE_ENVIRONMENT==='creatorloop-acceptance'){
 try{report=await inspectPreservation({token:env.CLOUDFLARE_API_TOKEN,targets:JSON.parse(await readFile(new URL('./cloudflare-targets.json',import.meta.url),'utf8')),correction:JSON.parse(await readFile('forensic-input/correction/training-correction.json','utf8')),baseline:JSON.parse(await readFile('forensic-input/baseline/cloudflare-readonly.json','utf8'))});}
 catch{report={status:'PRESERVATION_UNRESOLVED',changesMade:false,blockers:[{code:'FORENSIC_INPUT_UNAVAILABLE'}]};}
}
await mkdir('acceptance-evidence',{recursive:true,mode:0o700});
await writeFile('acceptance-evidence/training-preservation-forensics.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
const summary='GET-only preservation forensics: '+report.status+'\nBlockers: '+report.blockers.map(b=>b.code).join(', ')+'\nNo mutation, correction retry, rollback, migration or deployment was requested.\n';console.log(summary);
if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,summary);
if(report.blockers.length)process.exitCode=1;
