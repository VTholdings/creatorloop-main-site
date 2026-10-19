import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {readOnlyClient} from '../lib/cloudflare-readonly.mjs';
import {trainingApplicationMetadata} from '../lib/training-application-readiness.mjs';
import {reviewedApplicationReference} from '../lib/training-release-references.mjs';
const env=process.env;
let report;
if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='VTholdings/creatorloop-main-site'||env.GITHUB_REF!=='refs/heads/team-access-directory'||env.GITHUB_EVENT_NAME!=='push'||env.ACCEPTANCE_ENVIRONMENT!=='creatorloop-acceptance'){
 report={status:'TRAINING_METADATA_BLOCKED',blockers:[{code:'PROTECTED_RUN_CONTEXT_REQUIRED'}],step18Complete:false,step19Ready:false};
}else{
 try{
  const targets=JSON.parse(await readFile(new URL('./cloudflare-targets.json',import.meta.url),'utf8'));
  let applicationSha=env.GITHUB_SHA;
  if(env.EXPECTED_TRAINING_APPLICATION_SHA){
   const proposal=JSON.parse(await readFile(new URL('../../docs/proposals/step18-training-readiness-release.json',import.meta.url),'utf8'));
   applicationSha=reviewedApplicationReference({executionSha:env.GITHUB_SHA,proposal,expectedApplicationSha:env.EXPECTED_TRAINING_APPLICATION_SHA}).applicationSha;
  }
  report=await trainingApplicationMetadata({client:readOnlyClient({token:env.CLOUDFLARE_API_TOKEN,targets}),targets,releaseSha:applicationSha});
  report.executionSha=env.GITHUB_SHA;
 }catch{report={status:'TRAINING_METADATA_BLOCKED',blockers:[{code:'METADATA_CONFIGURATION_UNAVAILABLE'}],step18Complete:false,step19Ready:false};}
}
await mkdir('acceptance-evidence',{recursive:true,mode:0o700});
await writeFile('acceptance-evidence/training-application-readiness.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
const summary='TRAINING GET-only metadata: '+report.status+'\nBlockers: '+report.blockers.map(b=>b.code).join(', ')+'\nNo D1 queries, application login, fixtures, policies, signing, deployment, migrations or production operations. Step 18 and Step 19 are not certified by metadata.\n';
if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,summary);
console.log(summary);if(report.status!=='TRAINING_METADATA_MATCH')process.exitCode=1;
