import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {authorizeParserDiagnostic,fenceParserDiagnostic} from '../lib/training-parser-authorization.mjs';
import {PARSER_MIGRATION_HASHES,TRAINING_PARSER_DB,verifyParserMigrations,verifyParserSource,parserClient,executeParserDiagnostic} from '../lib/training-parser.mjs';
export async function runParserDiagnostic({context:e,githubFetcher=fetch,cloudflareFetcher=fetch,read=readFile,now=()=>Date.now()}){
 try{
  // No Cloudflare request until independently recorded approval AND PR attestation pass.
  const authorization=await authorizeParserDiagnostic({context:e,fetcher:githubFetcher,now});
  verifyParserMigrations(Object.fromEntries(await Promise.all(Object.keys(PARSER_MIGRATION_HASHES).map(async n=>[n,await read(new URL('../../migrations/'+n,import.meta.url),'utf8')]))));
  const source=verifyParserSource(await read('training-parser-source/TRAINING.json','utf8'));
  const request=parserClient({token:e.CLOUDFLARE_API_TOKEN,authorization,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,fetcher:cloudflareFetcher,now});
  const receipt=await executeParserDiagnostic({source,request,fence:()=>fenceParserDiagnostic({context:e,authorization,fetcher:githubFetcher,now}),runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,now});
  return {...receipt,authorization};
 }catch(error){return {protocol:'CREATORLOOP_TRAINING_PARSER_DIAGNOSTIC_V1',environment:'TRAINING',databaseId:TRAINING_PARSER_DB,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,status:'PARSER_DIAGNOSTIC_BLOCKED',blockers:[{code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'PARSER_DIAGNOSTIC_PREPARATION_BLOCKED'}],remoteMigrationsApplied:false,productionAccessed:false,remoteRestorePerformed:false,productionDeployed:false,executorActivated:false,operatorAdmitted:false};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=process.env,receipt=await runParserDiagnostic({context:e});
 await mkdir('training-parser-evidence',{recursive:true});await writeFile('training-parser-evidence/TRAINING.json',JSON.stringify(receipt,null,2)+'\n');
 const summary=receipt.status+'; observations '+(receipt.observations?.length??0)+'/24; blockers '+receipt.blockers.map(b=>b.code).join(', ')+'. EXPLAIN only; no migration, restore, production access or deployment.\n';
 console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
 if(receipt.status!=='PARSER_DIAGNOSTIC_COMPLETE')process.exitCode=1;
}
