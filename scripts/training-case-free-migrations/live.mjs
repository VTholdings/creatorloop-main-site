import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {authorizeCaseFreeTrainingMigration,fenceCaseFreeTrainingMigration} from '../lib/training-case-free-migration-authorization.mjs';
import {MIGRATION_HASHES,verifyCorrectedParserEvidence,verifyHistoricalGate2ForCaseFree,caseFreeTrainingMigrationPlan,caseFreeTrainingMigrationClient,executeCaseFreeTrainingMigrations,TRAINING_DB} from '../lib/training-case-free-migrations.mjs';
import {schemaReadClient,inspectSchema} from '../lib/d1-schema-inspection.mjs';
const e=process.env;let receipt;
try{
 // No Cloudflare request or private baseline use before independently approved authority.
 const authorization=await authorizeCaseFreeTrainingMigration({context:e});
 const acceptedParser=verifyCorrectedParserEvidence(await readFile('training-case-free-migration-private/parser/TRAINING.json','utf8'));
 const baseline=JSON.parse(await readFile('training-case-free-migration-private/baselines/TRAINING.json','utf8'));
 const gate2=verifyHistoricalGate2ForCaseFree(await readFile('training-case-free-migration-private/gate2/TRAINING.json','utf8'),baseline);
 baseline.acceptedGate2SchemaSha256=gate2.rawSchemaSha256;
 const migrations=Object.fromEntries(await Promise.all(Object.keys(MIGRATION_HASHES).map(async n=>[n,await readFile(new URL('../../migrations/'+n,import.meta.url),'utf8')])));
 const targets=JSON.parse(await readFile(new URL('../acceptance/cloudflare-targets.json',import.meta.url),'utf8'));
 const plan=caseFreeTrainingMigrationPlan({runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,baseline,migrations,acceptedParser});
 const fence=()=>fenceCaseFreeTrainingMigration({context:e,authorization});
 const schemaClient=schemaReadClient({token:e.CLOUDFLARE_API_TOKEN,environment:'TRAINING',baseline,targets});
 const request=caseFreeTrainingMigrationClient({token:e.CLOUDFLARE_API_TOKEN,targets,authorization,plan});
 receipt=await executeCaseFreeTrainingMigrations({plan,request,fence,preflight:()=>inspectSchema({baseline,client:schemaClient,normalizeTrainingProvider:true,releaseSha:e.GITHUB_SHA,mainSha:e.EXPECTED_MAIN_SHA,runId:e.GITHUB_RUN_ID,fence})});
 receipt.authorization=authorization;receipt.acceptedGate2=gate2;
 receipt.backup={runId:baseline.backupRunId,releaseSha:baseline.backupReleaseSha,backupSha256:baseline.backupSha256,exportCompletedAt:baseline.exportCompletedAt,localRehearsal:baseline.localRehearsal,coverage:'EXACT_ORIGINAL_ROW_FINGERPRINTS_REQUIRED'};
}catch(error){receipt={protocol:'CREATORLOOP_TRAINING_CASE_FREE_MIGRATIONS_V1',environment:'TRAINING',databaseId:TRAINING_DB,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,status:'TRAINING_MIGRATION_BLOCKED',blockers:[{code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'TRAINING_MIGRATION_PREPARATION_BLOCKED'}],migrationSubmitted:false,remoteMigrationsApplied:false,productionAccessed:false,productionDeployed:false,remoteRestorePerformed:false,executorActivated:false,operatorAdmitted:false};}
await mkdir('training-case-free-migration-evidence',{recursive:true});await writeFile('training-case-free-migration-evidence/TRAINING.json',JSON.stringify(receipt,null,2)+'\n');
const summary='TRAINING migrations: '+receipt.status+'; submitted '+receipt.migrationSubmitted+'; rollback '+(receipt.rollbackStatus??'NOT_REQUIRED')+'; blockers '+receipt.blockers.map(b=>b.code).join(', ')+'. No production access, restore, deployment, merge, executor activation, operator admission or later gate.\n';
console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
if(receipt.status!=='TRAINING_MIGRATION_PASS')process.exitCode=1;
