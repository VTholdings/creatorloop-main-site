import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {readOnlyClient,verifyCloudflare} from '../lib/cloudflare-readonly.mjs';

// Only the protected Actions step receives the environment secret. Do not print
// environment, request headers, raw provider bodies, error objects or stack traces.
const env=process.env;
let report;
if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='VTholdings/creatorloop-main-site'||env.GITHUB_REF!=='refs/heads/team-access-directory'||env.GITHUB_EVENT_NAME!=='push'||env.ACCEPTANCE_ENVIRONMENT!=='creatorloop-acceptance'){
 report={status:'READ_ONLY_VERIFICATION_BLOCKED',blockers:[{code:'PROTECTED_RUN_CONTEXT_REQUIRED'}],productionCertified:false,operatorReadinessCertified:false};
}else{
 try{
  const targets=JSON.parse(await readFile(new URL('./cloudflare-targets.json',import.meta.url),'utf8'));
  const client=readOnlyClient({token:env.CLOUDFLARE_API_TOKEN,targets});
  report=await verifyCloudflare({client,targets,releaseSha:env.GITHUB_SHA,mainSha:env.EXPECTED_MAIN_SHA});
 }catch{
  report={status:'READ_ONLY_VERIFICATION_BLOCKED',blockers:[{code:'VERIFIER_CONFIGURATION_UNAVAILABLE'}],productionCertified:false,operatorReadinessCertified:false};
 }
}
await mkdir('acceptance-evidence',{recursive:true,mode:0o700});
await writeFile('acceptance-evidence/cloudflare-readonly.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
const summary='Read-only Cloudflare verification: '+report.status+'\n'+
 'Release: '+(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'')?env.GITHUB_SHA:'unavailable')+'\n'+
 'Blockers: '+report.blockers.map(b=>b.code).join(', ')+'\n'+
 'No migrations, deployments, configuration changes, provisioning, revocation or receipt signing were executed.\n'+
 'Live Lifecycle and Operator Readiness remain pending.\n';
if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,summary);
console.log(summary);
if(report.status!=='READ_ONLY_METADATA_MATCH')process.exitCode=1;
