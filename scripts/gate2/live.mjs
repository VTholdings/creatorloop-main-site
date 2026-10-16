import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {authorizeGate2,fenceGate2} from '../lib/gate2-authorization.mjs';
import {gate2Plan,gate2Client,executeGate2,fingerprint} from '../lib/gate2-atomicity.mjs';
import {schemaReadClient,inspectSchema} from '../lib/d1-schema-inspection.mjs';
import {verifyTrainingPass} from '../lib/production-schema-inspection.mjs';
const e=process.env;let receipt;
try{
 const authorization=await authorizeGate2({context:e});
 const baseline=JSON.parse(await readFile('gate2-private/baselines/TRAINING.json','utf8'));
 const training=JSON.parse(await readFile('gate2-private/training/TRAINING.json','utf8'));
 const production=JSON.parse(await readFile('gate2-private/production/PRODUCTION.json','utf8'));
 const trainingPass=verifyTrainingPass(training,baseline);
 if(production?.environment!=='PRODUCTION'||production.databaseId!=='c4993a97-5835-4c6c-af06-7020fa8d4f2a'||production.runId!=='37251935281'||production.releaseSha!=='9744c6cd64c2ac0691184243a7051b49185b2004'||production.status!=='LIVE_SCHEMA_INSPECTION_PASS'||production.blockers?.length!==0||production.checks?.length!==22||production.checks.some(c=>c.matched!==true||c.rowsWritten!==0||c.changedDatabase!==false)||production.remoteMigrationsApplied!==false||production.productionDeployed!==false||production.authorization?.scope!=='PRODUCTION_ONLY'||fingerprint(production.migrationSha256)!==fingerprint(baseline.migrationSha256))throw Error('ACCEPTED_PRODUCTION_GATE1_REQUIRED');
 const targets=JSON.parse(await readFile(new URL('../acceptance/cloudflare-targets.json',import.meta.url),'utf8'));
 const plan=gate2Plan({runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,baseline});
 const fence=()=>fenceGate2({context:e,authorization});
 const schemaClient=schemaReadClient({token:e.CLOUDFLARE_API_TOKEN,environment:'TRAINING',baseline,targets});
 const request=gate2Client({token:e.CLOUDFLARE_API_TOKEN,targets,authorization,plan});
 receipt=await executeGate2({plan,request,fence,preflight:()=>inspectSchema({baseline,client:schemaClient,normalizeTrainingProvider:true,releaseSha:e.GITHUB_SHA,mainSha:e.EXPECTED_MAIN_SHA,runId:e.GITHUB_RUN_ID,fence})});
 receipt.authorization=authorization;receipt.trainingGate1=trainingPass;receipt.productionGate1={runId:production.runId,releaseSha:production.releaseSha,artifactId:'11322070166',artifactArchiveSha256:'5d74ea4c52188effb27851931b7e1b2df81eaf88084a5f86efd8c2f2103168f7'};
}catch(error){receipt={protocol:'CREATORLOOP_D1_ATOMICITY_V1',environment:'TRAINING',databaseId:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',releaseSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,status:'GATE2_BLOCKED',blockers:[{code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'GATE2_PREPARATION_BLOCKED'}],cleanupStatus:'NOT_STARTED',atomicExecutionCertified:false,remoteMigrationsApplied:false,remoteRestorePerformed:false,productionDeployed:false,productionAccessed:false};}
await mkdir('gate2-evidence',{recursive:true});await writeFile('gate2-evidence/TRAINING.json',JSON.stringify(receipt,null,2)+'\n');
const summary='TRAINING Gate 2: '+receipt.status+'; cleanup '+receipt.cleanupStatus+'; blockers '+receipt.blockers.map(b=>b.code).join(', ')+'. No production access, real migration, restore, deployment, merge or next gate.\n';
console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
if(receipt.status!=='GATE2_ATOMICITY_PASS')process.exitCode=1;
