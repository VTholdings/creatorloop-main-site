import {assertCurrentRelease} from '../lib/backup-authorization.mjs';
const repository='VTholdings/creatorloop-main-site';
const owner=user=>user?.login==='Creatorloopzone'&&user?.id===245245322;
const fail=code=>{throw Error(code);};
export async function authorizeInspection({context:e,fetcher=fetch}){
 if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!==repository||e.GITHUB_REF!=='refs/heads/team-access-directory'||e.GITHUB_EVENT_NAME!=='push'||e.GITHUB_RUN_ATTEMPT!=='1'||e.ACCEPTANCE_ENVIRONMENT!=='creatorloop-acceptance'||e.SCHEMA_INSPECTION_SCOPE!=='TRAINING_ONLY'||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||!e.GITHUB_TOKEN)fail('PROTECTED_SCHEMA_INSPECTION_REQUIRED');
 const get=async suffix=>{
  let r;try{r=await fetcher('https://api.github.com/repos/'+repository+'/actions/runs/'+e.GITHUB_RUN_ID+suffix,{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('INSPECTION_APPROVAL_EVIDENCE_UNAVAILABLE');}
  if(!r.ok)fail('INSPECTION_APPROVAL_EVIDENCE_UNAVAILABLE');try{return await r.json();}catch{fail('INSPECTION_APPROVAL_EVIDENCE_UNAVAILABLE');}
 };
 const run=await get('');
 if(String(run.id)!==e.GITHUB_RUN_ID||run.run_attempt!==1||run.head_sha!==e.GITHUB_SHA||run.head_branch!=='team-access-directory'||run.event!=='push'||run.repository?.full_name!==repository||run.path!=='.github/workflows/acceptance-d1-schema.yml')fail('INSPECTION_RUN_EVIDENCE_MISMATCH');
 const reviews=await get('/approvals');
 if(!Array.isArray(reviews)||reviews.some(r=>r.state==='rejected'&&r.environments?.some(x=>x.name==='creatorloop-acceptance'))||!reviews.some(r=>r.state==='approved'&&owner(r.user)&&r.environments?.some(x=>x.name==='creatorloop-acceptance')))fail('OWNER_ENVIRONMENT_APPROVAL_REQUIRED');
 await assertCurrentRelease({context:e,fetcher});
 return {approvedBy:'Creatorloopzone',environment:'creatorloop-acceptance',scope:'TRAINING_ONLY',ownerAuthorizationComment:'https://github.com/VTholdings/creatorloop-main-site/pull/18#issuecomment-5986047219',reviewCommentUsed:false,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,firstAttempt:true};
}
