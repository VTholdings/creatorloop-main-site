import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {schemaReadClient} from '../lib/d1-schema-inspection.mjs';
import {authorizeProductionInspection,inspectProductionSchema,verifyTrainingPass} from '../lib/production-schema-inspection.mjs';
import {assertCurrentRelease} from '../lib/backup-authorization.mjs';
const e=process.env;let receipt;
try{
 const authorization=await authorizeProductionInspection({context:e});
 const baseline=JSON.parse(await readFile('production-private/baselines/PRODUCTION.json','utf8'));
 const trainingPass=verifyTrainingPass(JSON.parse(await readFile('production-private/training-pass/TRAINING.json','utf8')),baseline);
 const targets=JSON.parse(await readFile(new URL('../acceptance/cloudflare-targets.json',import.meta.url),'utf8'));
 const client=schemaReadClient({token:e.CLOUDFLARE_API_TOKEN,environment:'PRODUCTION',baseline,targets});
 receipt=await inspectProductionSchema({baseline,client,normalizeProvider:true,releaseSha:e.GITHUB_SHA,mainSha:e.EXPECTED_MAIN_SHA,runId:e.GITHUB_RUN_ID,fence:()=>assertCurrentRelease({context:e})});
 receipt.authorization=authorization;receipt.trainingPass=trainingPass;
}catch(error){receipt={protocol:'CREATORLOOP_D1_SCHEMA_INSPECTION_V1',environment:'PRODUCTION',databaseId:'c4993a97-5835-4c6c-af06-7020fa8d4f2a',status:'LIVE_SCHEMA_INSPECTION_BLOCKED',releaseSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,blockers:[{code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'SCHEMA_INSPECTION_BLOCKED'}],remoteMigrationsApplied:false,remoteRestorePerformed:false,productionDeployed:false};}
await mkdir('production-evidence',{recursive:true});await writeFile('production-evidence/PRODUCTION.json',JSON.stringify(receipt,null,2)+'\n');
const summary='PRODUCTION: '+receipt.status+'; checks '+(receipt.checks?.length??0)+'; blockers '+receipt.blockers.map(b=>b.code).join(', ')+'. Gate 1 only; no writes, Gate 2, migration, restore, deployment or merge.\n';
console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
if(receipt.status!=='LIVE_SCHEMA_INSPECTION_PASS')process.exitCode=1;
