import {assertCurrentRelease} from './backup-authorization.mjs';
import {fingerprint} from './gate2-atomicity.mjs';
const repo='VTholdings/creatorloop-main-site',env='creatorloop-acceptance';
const owner=u=>u?.login==='Creatorloopzone'&&u?.id===245245322;
const fail=c=>{throw Error(c);};
export const migrationWindowBody=(run,sha)=>'CREATORLOOP_TRAINING_MIGRATION_WINDOW_V1\nrun='+run+'\nsha='+sha+'\nattestation=TRAINING_MIGRATION_NO_ACTIVE_OPERATORS';
function context(e){
 if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!==repo||e.GITHUB_REF!=='refs/heads/team-access-directory'||e.GITHUB_EVENT_NAME!=='push'||e.GITHUB_RUN_ATTEMPT!=='1'||e.ACCEPTANCE_ENVIRONMENT!==env||e.TRAINING_MIGRATION_SCOPE!=='TRAINING_0005_0007_ONLY'||!/^\d{1,20}$/.test(e.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||!e.GITHUB_TOKEN)fail('PROTECTED_TRAINING_MIGRATION_REQUIRED');
}
async function get(e,path,fetcher){
 let r;try{r=await fetcher('https://api.github.com/repos/'+repo+path,{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('MIGRATION_AUTHORIZATION_UNAVAILABLE');}
 if(!r.ok)fail('MIGRATION_AUTHORIZATION_UNAVAILABLE');try{return await r.json();}catch{fail('MIGRATION_AUTHORIZATION_UNAVAILABLE');}
}
async function runApproval(e,fetcher){
 context(e);const run=await get(e,'/actions/runs/'+e.GITHUB_RUN_ID,fetcher);
 if(String(run.id)!==e.GITHUB_RUN_ID||run.head_sha!==e.GITHUB_SHA||run.head_branch!=='team-access-directory'||run.run_attempt!==1||run.event!=='push'||run.path!=='.github/workflows/acceptance-training-migrations.yml'||run.repository?.full_name!==repo||!Number.isFinite(Date.parse(run.created_at)))fail('MIGRATION_RUN_MISMATCH');
 const reviews=await get(e,'/actions/runs/'+e.GITHUB_RUN_ID+'/approvals',fetcher);
 if(!Array.isArray(reviews)||reviews.some(r=>r.state==='rejected'&&r.environments?.some(x=>x.name===env))||!reviews.some(r=>r.state==='approved'&&owner(r.user)&&r.environments?.some(x=>x.name===env)))fail('OWNER_ENVIRONMENT_APPROVAL_REQUIRED');
 return run;
}
function validWindow(c,e,run,now){
 const created=Date.parse(c?.created_at),started=Date.parse(run.created_at);
 if(!owner(c?.user)||!Number.isSafeInteger(c.id)||c.issue_url!=='https://api.github.com/repos/'+repo+'/issues/18'||c.body!==migrationWindowBody(e.GITHUB_RUN_ID,e.GITHUB_SHA)||c.created_at!==c.updated_at)fail('OWNER_MIGRATION_WINDOW_ATTESTATION_REQUIRED');
 if(!Number.isFinite(created)||created<started||created>now()||now()-created>=60*60*1000)fail('MIGRATION_WINDOW_ATTESTATION_EXPIRED');
 return created;
}
export async function authorizeTrainingMigration({context:e,fetcher=fetch,now=()=>Date.now()}){
 const run=await runApproval(e,fetcher),wanted=migrationWindowBody(e.GITHUB_RUN_ID,e.GITHUB_SHA);let matches=[];
 for(let page=1;page<=3;page++){
  const comments=await get(e,'/issues/18/comments?per_page=100&page='+page,fetcher);
  if(!Array.isArray(comments))fail('MIGRATION_WINDOW_EVIDENCE_UNAVAILABLE');
  matches.push(...comments.filter(c=>owner(c.user)&&c.body===wanted));
  if(comments.length<100)break;if(page===3)fail('MIGRATION_WINDOW_EVIDENCE_BOUND_EXCEEDED');
 }
 if(matches.length!==1)fail('OWNER_MIGRATION_WINDOW_ATTESTATION_REQUIRED');
 const c=matches[0],created=validWindow(c,e,run,now);
 const a=Object.freeze({scope:'TRAINING_0005_0007_ONLY',databaseId:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',approvedBy:'Creatorloopzone',environment:env,runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,attempt:1,windowCommentId:c.id,windowBodySha256:fingerprint(wanted),attestedAt:c.created_at,windowExpiresAt:new Date(created+60*60*1000).toISOString(),reviewCommentUsed:false});
 await fenceTrainingMigration({context:e,authorization:a,fetcher,now});return a;
}
export async function fenceTrainingMigration({context:e,authorization:a,fetcher=fetch,now=()=>Date.now()}){
 context(e);
 if(a?.scope!=='TRAINING_0005_0007_ONLY'||a.databaseId!=='12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0'||a.runId!==e.GITHUB_RUN_ID||a.releaseSha!==e.GITHUB_SHA||a.attempt!==1||!Number.isFinite(Date.parse(a.windowExpiresAt))||now()>=Date.parse(a.windowExpiresAt))fail('MIGRATION_WINDOW_ATTESTATION_EXPIRED');
 const run=await runApproval(e,fetcher),c=await get(e,'/issues/comments/'+a.windowCommentId,fetcher);
 validWindow(c,e,run,now);
 if(c.id!==a.windowCommentId||c.created_at!==a.attestedAt||fingerprint(c.body)!==a.windowBodySha256)fail('MIGRATION_WINDOW_ATTESTATION_CHANGED');
 await assertCurrentRelease({context:e,fetcher});
 if(now()>=Date.parse(a.windowExpiresAt))fail('MIGRATION_WINDOW_ATTESTATION_EXPIRED');
}
