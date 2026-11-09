// PRIVATE OWNER/CUSTODIAN ONLY. Obtain separate private authorization before
// --execute-read-only. This flag acknowledges intent; it does not prove approval.
// Only the already-private OS environment supplies the existing source token.
// Never pass the token on the command line, prompt for it or read a key file.
import {pathToFileURL} from 'node:url';
import {blockedTokenCustodyReport,preflightSourceToken} from '../lib/cloudflare-token-custody-preflight.mjs';
function parseArguments(argv){
 let tokenType,executeReadOnly=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--token-type'&&tokenType===undefined){
   tokenType=argv[++i];
   if(tokenType===undefined)return {code:'TOKEN_TYPE_REQUIRED'};
   if(!['account','user'].includes(tokenType))return {code:'UNKNOWN_TOKEN_TYPE'};
  }else if(argv[i]==='--execute-read-only'&&!executeReadOnly)executeReadOnly=true;
  else return {code:'INVALID_CLI_ARGUMENTS'};
 }
 if(tokenType===undefined)return {code:'TOKEN_TYPE_REQUIRED'};
 return {tokenType,executeReadOnly};
}
// Environment/fetch/clock injection is for isolated mocked tests only; no CLI
// flags expose these hooks. The production call uses process.env and native fetch.
export async function runPrivateTokenPreflight(argv,{environment=process.env,fetcher=globalThis.fetch,now=Date.now}={}){
 let token;
 try{
  const parsed=parseArguments(argv);
  if(parsed.code)return blockedTokenCustodyReport(parsed.code);
  if(!parsed.executeReadOnly)return blockedTokenCustodyReport('EXECUTION_NOT_AUTHORIZED',parsed.tokenType);
  token=environment.CLOUDFLARE_API_TOKEN;
  delete environment.CLOUDFLARE_API_TOKEN;
  const pending=preflightSourceToken({tokenType:parsed.tokenType,executeReadOnly:true,token,fetcher,now});
  token=undefined;
  return await pending;
 }catch{return blockedTokenCustodyReport('PREFLIGHT_BLOCKED');}
 finally{
  // Delete even in offline/invalid-argument mode, without reading the value.
  try{delete environment.CLOUDFLARE_API_TOKEN;}catch{}
  token=undefined;
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const report=await runPrivateTokenPreflight(process.argv.slice(2));
 console.log(JSON.stringify(report));
 process.exitCode=report.sourceTokenVerified?0:1;
}
