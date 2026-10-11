import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyExecutionHost} from '../lib/training-execution-host.mjs';
import {refuse} from '../lib/training-execution-contract.mjs';
const run=promisify(execFile);
export function plainLinuxAcl(text) {
 const rows=text.split('\n').map(line=>line.trim()).filter(Boolean);
 return rows.length===3&&rows.some(line=>/^user::[r-][w-][x-]$/.test(line))&&rows.some(line=>/^group::[r-][w-][x-]$/.test(line))&&rows.some(line=>/^other::[r-][w-][x-]$/.test(line));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [planFile,...extra]=process.argv.slice(2);if(!planFile||extra.length||process.platform!=='linux')refuse('LINUX_HOST_AND_EXACT_NONSECRET_PLAN_REQUIRED');
  const plan=JSON.parse(await readFile(resolve(planFile),'utf8'));
  const assertNoExtendedAcl=async path=>{
   const {stdout}=await run('/usr/bin/getfacl',['--omit-header','--absolute-names','--',path],{timeout:5000,maxBuffer:16384,encoding:'utf8'});
   return plainLinuxAcl(stdout);
  };
  const result=await verifyExecutionHost({plan,assertNoExtendedAcl});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('PRIVATE EXECUTION HOST CHECK BLOCKED: exact nonroot runtime, immutable code, restricted stores and actual ACL checks are required. No credential contents read or protected operation performed.\n');process.exitCode=1;
 }
}
