import {createHash} from 'node:crypto';
import {assertCurrentRelease} from './backup-authorization.mjs';
const repo='VTholdings/creatorloop-main-site',owner=u=>u?.login==='Creatorloopzone'&&u?.id===245245322;
const fail=c=>{throw Error(c);};
export const windowBody=(run,sha)=>'CREATORLOOP_GATE2_WINDOW_V1\nrun='+run+'\nsha='+sha+'\nattestation=GATE2_TRAINING_NO_ACTIVE_OPERATORS';
const digest=s=>createHash('sha256').update(s).digest('hex');
async function get(e,path,fetcher){
 let r;try{r=await fetcher('https://api.github.com/repos/'+repo+path,{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('GATE2_AUTHORIZATION_UNAVAILABLE');}
 if(!r.ok)fail('GATE2_AUTHORIZATION_UNAVAILABLE');try{return await r.json();}catch{fail('GATE2_AUTHORIZATION_UNAVAILABLE');}
}
export async function authorizeGate2({context:e,fetcher=fetch,now=()=>Date.now()}){
 if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!==repo||e.GITHUB_REF!=='refs/heads/team-access-directory'||e.GITHUB_EVENT_NAME!=='push'||e.GITHUB_RUN_ATTEMPT!=='1'||e.ACCEPTANCE_ENVIRONMENT!=='creatorloop-acceptance'||e.GATE2_SCOPE!=='TRAINING_SYNTHETIC_ONLY'||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||!e.GITHUB_TOKEN)fail('PROTECTED_GATE2_REQUIRED');
 const run=await get(e,'/actions/runs/'+e.GITHUB_RUN_ID,fetcher);
 if(String(run.id)!==e.GITHUB_RUN_ID||run.head_sha!==e.GITHUB_SHA||run.head_branch!=='team-access-directory'||run.run_attempt!==1||run.event!=='push'||run.path!=='.github/workflows/acceptance-gate2.yml'||run.repository?.full_name!==repo)fail('GATE2_RUN_MISMATCH');
 // Environment approval is independent of, and checked before, window expiry.
 const reviews=await get(e,'/actions/runs/'+e.GITHUB_RUN_ID+'/approvals',fetcher);
 if(!Array.isArray(reviews)||reviews.some(r=>r.state==='rejected'&&r.environments?.some(x=>x.name==='creatorloop-acceptance'))||!reviews.some(r=>r.state==='approved'&&owner(r.user)&&r.environments?.some(x=>x.name==='creatorloop-acceptance')))fail('OWNER_ENVIRONMENT_APPROVAL_REQUIRED');
 const plan=await get(e,'/issues/comments/5986789715',fetcher);
 if(!owner(plan.user)||plan.id!==5986789715||digest(plan.body)!=='81ed9ff9c9afcc535386fc0ea530184781f25420f7dc89e5c5c628c1d37b11e3')fail('OWNER_GATE2_PLAN_REQUIRED');
 const wanted=windowBody(e.GITHUB_RUN_ID,e.GITHUB_SHA);let matches=[];
 for(let page=1;page<=3;page++){
  const comments=await get(e,'/issues/18/comments?per_page=100&page='+page,fetcher);
  if(!Array.isArray(comments))fail('GATE2_WINDOW_EVIDENCE_UNAVAILABLE');
  matches.push(...comments.filter(c=>owner(c.user)&&c.body===wanted&&c.created_at===c.updated_at));
  if(comments.length<100)break;if(page===3)fail('GATE2_WINDOW_EVIDENCE_BOUND_EXCEEDED');
 }
 if(matches.length!==1)fail('OWNER_TRAINING_WINDOW_ATTESTATION_REQUIRED');
 const c=matches[0],created=Date.parse(c.created_at),started=Date.parse(run.created_at);
 if(!Number.isSafeInteger(c.id)||!Number.isFinite(created)||!Number.isFinite(started)||created<started||created>now()||now()-created>60*60*1000)fail('GATE2_WINDOW_ATTESTATION_EXPIRED');
 const a={scope:'TRAINING_SYNTHETIC_ONLY',databaseId:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',approvedBy:'Creatorloopzone',environment:'creatorloop-acceptance',runId:e.GITHUB_RUN_ID,releaseSha:e.GITHUB_SHA,attempt:1,planCommentId:plan.id,planBodySha256:digest(plan.body),windowCommentId:c.id,windowBodySha256:digest(wanted),attestedAt:c.created_at,windowExpiresAt:new Date(created+60*60*1000).toISOString(),reviewCommentUsed:false};
 await fenceGate2({context:e,authorization:a,fetcher,now});return a;
}
export async function fenceGate2({context:e,authorization:a,fetcher=fetch,now=()=>Date.now()}){
 if(a?.scope!=='TRAINING_SYNTHETIC_ONLY'||a.databaseId!=='12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0'||a.runId!==e.GITHUB_RUN_ID||a.releaseSha!==e.GITHUB_SHA||a.attempt!==1||!Number.isFinite(Date.parse(a.windowExpiresAt))||now()>Date.parse(a.windowExpiresAt))fail('GATE2_WINDOW_ATTESTATION_EXPIRED');
 const c=await get(e,'/issues/comments/'+a.windowCommentId,fetcher);
 if(!owner(c.user)||c.id!==a.windowCommentId||c.created_at!==a.attestedAt||c.updated_at!==c.created_at||c.body!==windowBody(e.GITHUB_RUN_ID,e.GITHUB_SHA)||digest(c.body)!==a.windowBodySha256)fail('GATE2_WINDOW_ATTESTATION_CHANGED');
 const plan=await get(e,'/issues/comments/'+a.planCommentId,fetcher);
 if(!owner(plan.user)||digest(plan.body)!==a.planBodySha256)fail('GATE2_PLAN_AUTHORIZATION_CHANGED');
 await assertCurrentRelease({context:e,fetcher});
}
