import {lstat,realpath,readFile,readdir} from 'node:fs/promises';
import {isAbsolute,normalize,dirname,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {refuse} from './training-execution-contract.mjs';

export function validateExecutionHostPlan(plan) {
 if(plan?.protocol!=='CREATORLOOP_PRIVATE_EXECUTION_HOST_V1'||!Number.isSafeInteger(plan.runtimeUid)||plan.runtimeUid<=0||!Number.isSafeInteger(plan.codeOwnerUid)||plan.codeOwnerUid<0||plan.runtimeUid===plan.codeOwnerUid||!/^[a-f0-9]{40}$/.test(plan.sourceSha||'')||typeof plan.hostRef!=='string'||!plan.hostRef||!Array.isArray(plan.codeFiles)||!plan.codeFiles.length)refuse('EXACT_PRIVATE_EXECUTION_HOST_PLAN_REQUIRED');
 const paths=['codeDirectory','credentialDirectory','auditDirectory'].map(k=>plan[k]);
 if(paths.some(p=>typeof p!=='string'||!isAbsolute(p)||normalize(p)!==p||p==='/')||paths.some((p,i)=>paths.some((q,j)=>i!==j&&(p===q||p.startsWith(q+'/')))))refuse('SEPARATE_EXACT_EXECUTION_DIRECTORIES_REQUIRED');
 const entries=plan.codeFiles;
 if(entries.some(e=>typeof e.path!=='string'||!e.path||e.path.startsWith('/')||e.path.split('/').some(x=>!x||x==='.'||x==='..')||!/^[a-f0-9]{64}$/.test(e.sha256||''))||new Set(entries.map(e=>e.path)).size!==entries.length)refuse('EXACT_PINNED_EXECUTION_FILES_REQUIRED');
 return plan;
}
export function validateExecutionHostFacts({plan,facts}) {
 validateExecutionHostPlan(plan);
 const entries=plan.codeFiles;
 if(facts?.observedUid!==plan.runtimeUid||facts.runtimeIsRoot!==false)refuse('SEPARATE_NONROOT_EXECUTION_IDENTITY_REQUIRED');
 for(const [key,uid,mode] of [['codeDirectory',plan.codeOwnerUid,0o555],['credentialDirectory',plan.runtimeUid,0o700],['auditDirectory',plan.runtimeUid,0o700]]){
  const stat=facts[key];if(!stat||stat.path!==plan[key]||stat.realPath!==plan[key]||stat.kind!=='directory'||stat.uid!==uid||stat.mode!==mode||stat.extendedAcl!==false)refuse('EXACT_EXECUTION_DIRECTORY_CONTROL_REQUIRED');
 }
 if(!Array.isArray(facts.ancestors)||!facts.ancestors.length||facts.ancestors.some(s=>s.kind!=='directory'||s.path!==s.realPath||s.extendedAcl!==false||s.uid===plan.runtimeUid||(s.mode&0o022)!==0))refuse('NONWRITABLE_EXECUTION_PATH_ANCESTORS_REQUIRED');
 if(!Array.isArray(facts.codeInventory)||[...facts.codeInventory].sort().join('|')!==entries.map(e=>e.path).sort().join('|'))refuse('UNREVIEWED_EXECUTION_CODE_PRESENT');
 if(!Array.isArray(facts.codeFiles)||facts.codeFiles.length!==entries.length)refuse('PINNED_EXECUTION_CODE_INVENTORY_REQUIRED');
 for(const expected of entries){
  const stat=facts.codeFiles.find(f=>f.relativePath===expected.path);
  if(!stat||stat.kind!=='file'||stat.nlink!==1||stat.uid!==plan.codeOwnerUid||stat.mode!==0o444||stat.extendedAcl!==false||stat.sha256!==expected.sha256||stat.path!==join(plan.codeDirectory,expected.path)||stat.path!==stat.realPath)refuse('IMMUTABLE_PINNED_EXECUTION_CODE_REQUIRED');
 }
 return {protocol:plan.protocol,hostRef:plan.hostRef,sourceSha:plan.sourceSha,readOnlyHostChecksVerified:true,credentialContentsRead:false,signingCustodyVerified:false,protectedActivationAuthorized:false};
}
export async function verifyExecutionHost({plan,assertNoExtendedAcl}) {
 if(typeof assertNoExtendedAcl!=='function')refuse('ACTUAL_HOST_ACL_VERIFIER_REQUIRED');
 const inspect=async path=>{
  const stat=await lstat(path);const acl=await assertNoExtendedAcl(path);
  return {path,realPath:await realpath(path),kind:stat.isSymbolicLink()?'symlink':stat.isDirectory()?'directory':stat.isFile()?'file':'other',uid:stat.uid,mode:stat.mode&0o777,nlink:stat.nlink,extendedAcl:acl===true?false:null};
 };
 // Validate shape before filesystem reads; synthetic facts cannot authorize live activation.
 validateExecutionHostPlan(plan);
 const facts={observedUid:process.getuid(),runtimeIsRoot:process.getuid()===0,ancestors:[],codeFiles:[],codeInventory:[]};
 const seen=new Set();
 for(const key of ['codeDirectory','credentialDirectory','auditDirectory']){
  facts[key]=await inspect(plan[key]);
  for(let p=dirname(plan[key]);;p=dirname(p)){
   if(!seen.has(p)){seen.add(p);facts.ancestors.push(await inspect(p));}
   if(p==='/')break;
  }
 }
 const inventory=async path=>{
  const stat=await inspect(path);
  if(stat.kind!=='directory'||stat.realPath!==path||stat.uid!==plan.codeOwnerUid||stat.mode!==0o555||stat.extendedAcl!==false)refuse('PINNED_EXECUTION_SUBDIRECTORY_REQUIRED');
  for(const entry of await readdir(path,{withFileTypes:true})){
   const child=join(path,entry.name);
   if(entry.isDirectory())await inventory(child);
   else if(entry.isFile())facts.codeInventory.push(relative(plan.codeDirectory,child));
   else refuse('UNREVIEWED_EXECUTION_CODE_PRESENT');
  }
 };
 await inventory(plan.codeDirectory);
 if(facts.codeInventory.sort().join('|')!==plan.codeFiles.map(e=>e.path).sort().join('|'))refuse('UNREVIEWED_EXECUTION_CODE_PRESENT');
 for(const entry of plan.codeFiles){
  if(typeof entry.path!=='string'||!entry.path||isAbsolute(entry.path)||entry.path.split('/').some(x=>!x||x==='.'||x==='..'))refuse('EXACT_PINNED_EXECUTION_FILES_REQUIRED');
  const path=join(plan.codeDirectory,entry.path),stat=await inspect(path);
  if(stat.kind!=='file'||stat.nlink!==1||stat.mode!==0o444||stat.uid!==plan.codeOwnerUid||stat.realPath!==path)refuse('IMMUTABLE_PINNED_EXECUTION_CODE_REQUIRED');
  for(let p=dirname(path);p!==plan.codeDirectory;p=dirname(p)){
   if(relative(plan.codeDirectory,p).startsWith('..'))refuse('EXECUTION_CODE_PATH_ESCAPE');
   const directory=await inspect(p);if(directory.kind!=='directory'||directory.path!==directory.realPath||directory.uid!==plan.codeOwnerUid||directory.mode!==0o555||directory.extendedAcl!==false)refuse('PINNED_EXECUTION_SUBDIRECTORY_REQUIRED');
  }
  // Read code only; never enumerate or open credential-store contents.
  stat.relativePath=entry.path;stat.sha256=createHash('sha256').update(await readFile(path)).digest('hex');facts.codeFiles.push(stat);
 }
 return validateExecutionHostFacts({plan,facts});
}
