import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExecutionHostFacts,verifyExecutionHost} from '../scripts/lib/training-execution-host.mjs';
import {plainLinuxAcl} from '../scripts/execution/verify-private-execution-host.mjs';
function fixture(){
 const plan={protocol:'CREATORLOOP_PRIVATE_EXECUTION_HOST_V1',hostRef:'FICTIONAL-NOT-A-LIVE-HOST',runtimeUid:1234,codeOwnerUid:0,sourceSha:'a'.repeat(40),codeDirectory:'/opt/fictional/code-v1',credentialDirectory:'/var/lib/fictional/credentials',auditDirectory:'/var/lib/fictional/audit',codeFiles:[{path:'main.mjs',sha256:'b'.repeat(64)}]};
 const dir=(path,uid,mode)=>({path,realPath:path,kind:'directory',uid,mode,extendedAcl:false});
 const facts={observedUid:1234,runtimeIsRoot:false,codeDirectory:dir(plan.codeDirectory,0,0o555),credentialDirectory:dir(plan.credentialDirectory,1234,0o700),auditDirectory:dir(plan.auditDirectory,1234,0o700),ancestors:[dir('/',0,0o755),dir('/opt',0,0o755),dir('/var',0,0o755),dir('/var/lib',0,0o755),dir('/var/lib/fictional',0,0o755)],codeInventory:['main.mjs'],codeFiles:[{path:plan.codeDirectory+'/main.mjs',realPath:plan.codeDirectory+'/main.mjs',relativePath:'main.mjs',kind:'file',uid:0,mode:0o444,nlink:1,extendedAcl:false,sha256:'b'.repeat(64)}]};return {plan,facts};
}
test('new host controls verify only exact nonroot, separate restricted stores and pinned nonwritable code facts',()=>{
 const f=fixture(),out=validateExecutionHostFacts(f);assert.equal(out.readOnlyHostChecksVerified,true);assert.equal(out.credentialContentsRead,false);assert.equal(out.signingCustodyVerified,false);assert.equal(out.protectedActivationAuthorized,false);
});
test('new host controls refuse runtime-root/shared uid, path overlap, writable parent, symlink, ACL and unpinned code',()=>{
 for(const mutate of [f=>f.facts.runtimeIsRoot=true,f=>f.plan.codeOwnerUid=f.plan.runtimeUid,f=>f.plan.auditDirectory=f.plan.credentialDirectory,f=>f.facts.ancestors[0].mode=0o777,f=>f.facts.codeDirectory.realPath='/different',f=>f.facts.credentialDirectory.extendedAcl=true,f=>f.facts.codeFiles[0].sha256='c'.repeat(64),f=>f.facts.codeFiles[0].mode=0o644,f=>f.facts.codeFiles[0].nlink=2,f=>f.plan.codeFiles[0].path='../private-key',f=>f.facts.codeFiles=[],f=>f.facts.codeInventory.push('unapproved.mjs')]){
  const f=fixture();mutate(f);assert.throws(()=>validateExecutionHostFacts(f));
 }
});
test('real host verification refuses without an actual ACL inspection port before reading any files',async()=>{
 await assert.rejects(verifyExecutionHost({plan:fixture().plan}),/ACTUAL_HOST_ACL/);
});
test('plain Linux ACL verification rejects named-user/group/mask/default ACLs and unknown output',()=>{
 const plain='user::rwx\ngroup::---\nother::---\n';assert.equal(plainLinuxAcl(plain),true);
 for(const value of [plain+'user:owner:rwx\n',plain+'default:user::rwx\n',plain+'mask::rwx\n','',plain+'# unexpected\n'])assert.equal(plainLinuxAcl(value),false);
});
