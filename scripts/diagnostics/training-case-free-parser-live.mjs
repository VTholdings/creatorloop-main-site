import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {authorizeCaseFreeParserDiagnostic,fenceCaseFreeParserDiagnostic} from '../lib/training-case-free-parser-authorization.mjs';
import {CASE_FREE_MIGRATION_HASHES,TRAINING_PARSER_DB,verifyCaseFreeParserMigrations,verifyParserSource,caseFreeParserClient,executeCaseFreeParserDiagnostic} from '../lib/training-case-free-parser.mjs';
export async function runCaseFreeParserDiagnostic({context:e,githubFetcher=fetch,cloudflareFetcher=fetch,read=readFile,now=()=>Date.now()}){
 try{
  const authorization=await authorizeCaseFreeParserDiagnostic({context:e,fetcher:githubFetcher,now});
  verifyCaseFreeParserMigrations(Object.fromEntries(await Promise.all(Object.keys(CASE_FREE_MIGRATION_HASHES).map(async name=>[name,await read(new URL('../../migrations/'+name,import.meta.url),'utf8')]))));
  const source=verifyParserSource(await read('training-case-free-parser-source/TRAINING.json','utf8'));
  const request=caseFreeParserClient({token:e.CLOUDFLARE_API_TOKEN,authorization,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,fetcher:cloudflareFetcher,now});
  const receipt=await executeCaseFreeParserDiagnostic({source,request,fence:()=>fenceCaseFreeParserDiagnostic({context:e,authorization,fetcher:githubFetcher,now}),runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,now});
  return {...receipt,authorization};
 }catch(error){return {protocol:'CREATORLOOP_TRAINING_CASE_FREE_PARSER_DIAGNOSTIC_V1',environment:'TRAINING',databaseId:TRAINING_PARSER_DB,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,status:'CASE_FREE_PARSER_DIAGNOSTIC_BLOCKED',probesAttempted:0,successfulProbes:0,observations:[],snapshots:[],blockers:[{code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'CASE_FREE_PARSER_PREPARATION_BLOCKED'}],remoteMigrationsApplied:false,productionAccessed:false,remoteRestorePerformed:false,productionDeployed:false,executorActivated:false,operatorAdmitted:false};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=process.env,receipt=await runCaseFreeParserDiagnostic({context:e});
 await mkdir('training-case-free-parser-evidence',{recursive:true});await writeFile('training-case-free-parser-evidence/TRAINING.json',JSON.stringify(receipt,null,2)+'\n');
 const summary=receipt.status+'; attempted '+receipt.probesAttempted+'/12, accepted '+receipt.successfulProbes+'/12; blockers '+receipt.blockers.map(b=>b.code).join(', ')+'. EXPLAIN only; no migration, restore, production access or deployment.\n';
 console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
 if(receipt.status!=='CASE_FREE_PARSER_DIAGNOSTIC_COMPLETE')process.exitCode=1;
}
