import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {authorizeTrainingMigration,fenceTrainingMigration} from '../lib/training-migration-authorization.mjs';
import {MIGRATION_HASHES,verifyAcceptedGate2,trainingMigrationPlan,trainingMigrationClient,executeTrainingMigrations,TRAINING_DB} from '../lib/training-migrations.mjs';
import {schemaReadClient,inspectSchema} from '../lib/d1-schema-inspection.mjs';
const e=process.env;let receipt;
try{
 // No Cloudflare request or private baseline use before independently approved authority.
 const authorization=await authorizeTrainingMigration({context:e});
 const baseline=JSON.parse(await readFile('training-migration-private/baselines/TRAINING.json','utf8'));
 const gate2=verifyAcceptedGate2(await readFile('training-migration-private/gate2/TRAINING.json','utf8'),baseline);
 baseline.acceptedGate2SchemaSha256=gate2.rawSchemaSha256;
 const migrations=Object.fromEntries(await Promise.all(Object.keys(MIGRATION_HASHES).map(async n=>[n,await readFile(new URL('../../migrations/'+n,import.meta.url),'utf8')])));
 const targets=JSON.parse(await readFile(new URL('../acceptance/cloudflare-targets.json',import.meta.url),'utf8'));
 const plan=trainingMigrationPlan({runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,baseline,migrations});
 const fence=()=>fenceTrainingMigration({context:e,authorization});
 const schemaClient=schemaReadClient({token:e.CLOUDFLARE_API_TOKEN,environment:'TRAINING',baseline,targets});
 const request=trainingMigrationClient({token:e.CLOUDFLARE_API_TOKEN,targets,authorization,plan});
 receipt=await executeTrainingMigrations({plan,request,fence,preflight:()=>inspectSchema({baseline,client:schemaClient,normalizeTrainingProvider:true,releaseSha:e.GITHUB_SHA,mainSha:e.EXPECTED_MAIN_SHA,runId:e.GITHUB_RUN_ID,fence})});
 receipt.authorization=authorization;receipt.acceptedGate2=gate2;
 receipt.backup={runId:baseline.backupRunId,releaseSha:baseline.backupReleaseSha,backupSha256:baseline.backupSha256,exportCompletedAt:baseline.exportCompletedAt,localRehearsal:baseline.localRehearsal,coverage:'EXACT_ORIGINAL_ROW_FINGERPRINTS_REQUIRED'};
}catch(error){receipt={protocol:'CREATORLOOP_TRAINING_MIGRATIONS_V1',environment:'TRAINING',databaseId:TRAINING_DB,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,status:'TRAINING_MIGRATION_BLOCKED',blockers:[{code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'TRAINING_MIGRATION_PREPARATION_BLOCKED'}],migrationSubmitted:false,remoteMigrationsApplied:false,productionAccessed:false,productionDeployed:false,remoteRestorePerformed:false,executorActivated:false,operatorAdmitted:false};}
await mkdir('training-migration-evidence',{recursive:true});await writeFile('training-migration-evidence/TRAINING.json',JSON.stringify(receipt,null,2)+'\n');
const summary='TRAINING migrations: '+receipt.status+'; submitted '+receipt.migrationSubmitted+'; rollback '+(receipt.rollbackStatus??'NOT_REQUIRED')+'; blockers '+receipt.blockers.map(b=>b.code).join(', ')+'. No production access, restore, deployment, merge, executor activation, operator admission or later gate.\n';
console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
if(receipt.status!=='TRAINING_MIGRATION_PASS')process.exitCode=1;
