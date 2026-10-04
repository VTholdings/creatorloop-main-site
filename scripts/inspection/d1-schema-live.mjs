import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {schemaReadClient,inspectSchema,inspectionPlan} from '../lib/d1-schema-inspection.mjs';
import {assertCurrentRelease} from '../lib/backup-authorization.mjs';
import {authorizeInspection} from './d1-schema-context.mjs';
const e=process.env,receipts=[];
const ids={TRAINING:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',PRODUCTION:'c4993a97-5835-4c6c-af06-7020fa8d4f2a'};
let authorization;
try{
 authorization=await authorizeInspection({context:e});
 const targets=JSON.parse(await readFile(new URL('../acceptance/cloudflare-targets.json',import.meta.url),'utf8'));
 const baselines={};
 // Validate both accepted baselines before the first Cloudflare query.
 for(const environment of ['TRAINING','PRODUCTION']){baselines[environment]=JSON.parse(await readFile('schema-private/baselines/'+environment+'.json','utf8'));inspectionPlan(baselines[environment]);}
 for(const environment of ['TRAINING','PRODUCTION']){
  const baseline=baselines[environment],client=schemaReadClient({token:e.CLOUDFLARE_API_TOKEN,environment,baseline,targets});
  const receipt=await inspectSchema({baseline,client,releaseSha:e.GITHUB_SHA,mainSha:e.EXPECTED_MAIN_SHA,runId:e.GITHUB_RUN_ID,fence:()=>assertCurrentRelease({context:e})});
  receipt.authorization=authorization;receipts.push(receipt);
  if(receipt.status!=='LIVE_SCHEMA_INSPECTION_PASS')break;
 }
}catch(error){receipts.push({protocol:'CREATORLOOP_D1_SCHEMA_INSPECTION_V1',status:'LIVE_SCHEMA_INSPECTION_BLOCKED',releaseSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,blockers:[{code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'SCHEMA_INSPECTION_BLOCKED'}],remoteMigrationsApplied:false,remoteRestorePerformed:false,productionDeployed:false});}
await mkdir('schema-evidence',{recursive:true});
for(const environment of ['TRAINING','PRODUCTION']){
 const receipt=receipts.find(r=>r.environment===environment)??{protocol:'CREATORLOOP_D1_SCHEMA_INSPECTION_V1',environment,databaseId:ids[environment],status:'NOT_EXECUTED_AFTER_BLOCKER',releaseSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,blockers:receipts.flatMap(r=>r.blockers??[]),remoteMigrationsApplied:false,remoteRestorePerformed:false,productionDeployed:false};
 await writeFile('schema-evidence/'+environment+'.json',JSON.stringify(receipt,null,2)+'\n');
 const summary=environment+': '+receipt.status+'; checks '+(receipt.checks?.length??0)+'; blockers '+receipt.blockers.map(b=>b.code).join(', ')+'. No migrations, restore, atomicity test or deployment.\n';
 console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
}
if(receipts.length!==2||receipts.some(r=>r.status!=='LIVE_SCHEMA_INSPECTION_PASS'))process.exitCode=1;
