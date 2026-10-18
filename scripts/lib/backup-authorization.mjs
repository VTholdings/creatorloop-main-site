import {fail} from './d1-backup-export.mjs';
const repository='VTholdings/creatorloop-main-site';
const owner='Creatorloopzone',ownerId=245245322;
const branch='team-access-directory',environment='creatorloop-acceptance';
const attestation='BACKUP_WINDOW_NO_ACTIVE_OPERATORS';
const identity=user=>user?.login===owner&&user?.id===ownerId;

// Use the runner's event file, never a shell-interpolated input or review comment.
export function validateDispatch({context:c,event}){
 if(c.GITHUB_ACTIONS!=='true'||c.GITHUB_REPOSITORY!==repository||c.GITHUB_REF!=='refs/heads/'+branch||c.GITHUB_EVENT_NAME!=='workflow_dispatch'||c.GITHUB_RUN_ATTEMPT!=='1'||!/^\d+$/.test(c.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(c.GITHUB_SHA||''))fail('PROTECTED_FIRST_ATTEMPT_REQUIRED');
 if(c.GITHUB_ACTOR!==owner||c.GITHUB_TRIGGERING_ACTOR!==owner||!identity(event?.sender)||event.repository?.full_name!==repository||![branch,c.GITHUB_REF].includes(event.ref))fail('OWNER_DISPATCH_IDENTITY_REQUIRED');
 if(event.inputs?.low_activity_attestation!==attestation)fail('OWNER_LOW_ACTIVITY_ATTESTATION_REQUIRED');
 if(event.inputs?.expected_release_sha!==c.GITHUB_SHA)fail('ATTESTED_RELEASE_SHA_MISMATCH');
 return {attestation,actor:owner,actorId:ownerId,releaseSha:c.GITHUB_SHA,runId:c.GITHUB_RUN_ID,attempt:1,environment};
}

async function readGitHub(c,path,fetcher){
 if(!c.GITHUB_TOKEN)fail('GITHUB_AUTHORIZATION_EVIDENCE_REQUIRED');
 let response;
 try{response=await fetcher('https://api.github.com/repos/'+repository+path,{method:'GET',headers:{Authorization:'Bearer '+c.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('GITHUB_AUTHORIZATION_EVIDENCE_UNAVAILABLE');}
 if(!response.ok)fail('GITHUB_AUTHORIZATION_EVIDENCE_UNAVAILABLE');
 try{return await response.json();}catch{fail('GITHUB_AUTHORIZATION_EVIDENCE_UNAVAILABLE');}
}

export async function assertCurrentRelease({context:c,authorization,fetcher=fetch,now=()=>Date.now()}){
 if(authorization&&(!Number.isFinite(Date.parse(authorization.windowExpiresAt))||now()>Date.parse(authorization.windowExpiresAt)))fail('BACKUP_WINDOW_ATTESTATION_EXPIRED');
 const head=await readGitHub(c,'/git/ref/heads/'+branch,fetcher);
 if(head.ref!=='refs/heads/'+branch||head.object?.sha!==c.GITHUB_SHA)fail('STALE_BACKUP_RELEASE');
 const main=await readGitHub(c,'/git/ref/heads/main',fetcher);
 if(!/^[a-f0-9]{40}$/.test(c.EXPECTED_MAIN_SHA||'')||main.ref!=='refs/heads/main'||main.object?.sha!==c.EXPECTED_MAIN_SHA)fail('STALE_BACKUP_MAIN');
}

export async function authorizeBackup({context:c,event,fetcher=fetch,now=()=>Date.now()}){
 const receipt=validateDispatch({context:c,event});
 if(c.ACCEPTANCE_ENVIRONMENT!==environment)fail('PROTECTED_ENVIRONMENT_REQUIRED');
 const run=await readGitHub(c,'/actions/runs/'+c.GITHUB_RUN_ID,fetcher);
 if(String(run.id)!==c.GITHUB_RUN_ID||run.run_attempt!==1||run.event!=='workflow_dispatch'||run.head_sha!==c.GITHUB_SHA||run.head_branch!==branch||run.repository?.full_name!==repository||run.path!=='.github/workflows/acceptance-backups.yml'||!identity(run.actor)||!identity(run.triggering_actor))fail('DISPATCH_RUN_EVIDENCE_MISMATCH');
 const created=Date.parse(run.created_at),age=now()-created;
 // A window attestation cannot remain indefinitely usable while approval is pending.
 if(!Number.isFinite(created)||age<0||age>60*60*1000)fail('BACKUP_WINDOW_ATTESTATION_EXPIRED');
 const reviews=await readGitHub(c,'/actions/runs/'+c.GITHUB_RUN_ID+'/approvals',fetcher);
 if(!Array.isArray(reviews)||reviews.some(r=>r.state==='rejected'&&r.environments?.some(e=>e.name===environment)))fail('OWNER_ENVIRONMENT_APPROVAL_REQUIRED');
 const approved=reviews.find(r=>r.state==='approved'&&identity(r.user)&&r.environments?.some(e=>e.name===environment&&Number.isSafeInteger(e.id)));
 if(!approved)fail('OWNER_ENVIRONMENT_APPROVAL_REQUIRED');
 await assertCurrentRelease({context:c,fetcher});
 return {...receipt,source:'WORKFLOW_DISPATCH_EVENT',dispatchedAt:run.created_at,validatedAt:new Date(now()).toISOString(),windowExpiresAt:new Date(created+60*60*1000).toISOString(),approvedBy:owner,environmentId:approved.environments.find(e=>e.name===environment).id,reviewCommentUsed:false};
}
