const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('phase18-dispatch-credential-custody-app-bootstrap.cjs','utf8');
const prefix="const githubCurlTransport=(()=>{const module={exports:{}};\n",start=source.indexOf(prefix)+prefix.length,end=source.indexOf('\nreturn module.exports;})();',start);
let calls=[];
const context={module:{exports:{}},Buffer,require:()=>({execFileSync:(file,args,o)=>{calls.push({file,args,input:o.input});return Buffer.from('fixture\n200');}})};
vm.runInNewContext(source.slice(start,end),context);
test('public reviewed raw source and unauthenticated branch reads both use curl',()=>{
 for(const url of ['https://raw.githubusercontent.com/VTholdings/creatorloop-main-site/fixture/workflow.yml','https://api.github.com/repos/VTholdings/creatorloop-main-site/branches/team-access-directory']){
  const r=context.module.exports.curlAuthenticatedOnce(url);assert.equal(r.status,200);
 }
 assert.equal(calls.length,2);assert(calls.every(c=>c.file==='/usr/bin/curl'));assert(!source.includes('await fetch('));
});
test('raw source transport rejects another repository and authentication headers',()=>{
 const run=context.module.exports.curlAuthenticatedOnce;
 assert.throws(()=>run('https://raw.githubusercontent.com/other/repo/file'),/EXACT_GITHUB/);
 assert.throws(()=>run('https://raw.githubusercontent.com/VTholdings/creatorloop-main-site/fixture',{headers:{Authorization:'NONSECRET-FIXTURE'}}),/EXACT_GITHUB/);
});
test('recovery preserves original marker and writes separate one-shot marker only after no-run proof',()=>{
 assert(source.includes("const PRIOR_ATTEMPT=ROOT+'/evidence/phase18-dispatch-credential-custody-app-bootstrap-v1-attempt.json'"));
 assert(!/\b(unlink|rename|rm)Sync\b/.test(source));
 assert(source.indexOf('const reconciliation=await noExistingCustodyRun(')<source.indexOf('exclusiveJson(ATTEMPT,'));
 assert(source.indexOf('exclusiveJson(ATTEMPT,')<source.indexOf("const result=await http('https://api.github.com/repos/'+REPO+'/actions/workflows/"));
});
test('matching workflow run blocks recovery dispatch',async()=>{
 const section=source.slice(source.indexOf('function validatePriorCustodyAttempt'),source.indexOf('async function main(){'));
 const c={REPO:'VTholdings/creatorloop-main-site',WORKFLOW:'phase18-dispatch-credential-custody.yml',stop:s=>{throw Error(s);},http:async()=>({total_count:1,workflow_runs:[{created_at:'2026-10-18T19:38:00Z'}]})};
 vm.createContext(c);vm.runInContext(section,c);await assert.rejects(c.noExistingCustodyRun('NONSECRET','2026-10-18T19:37:00Z'),/EXISTING_CUSTODY_RUN_FOUND/);
});
