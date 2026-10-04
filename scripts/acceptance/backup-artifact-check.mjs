// Check the actual applied retention, not just the YAML request.
const e=process.env;
try{
 if(!/^\d+$/.test(e.BACKUP_ARTIFACT_ID||'')||!/^\d+$/.test(e.GITHUB_RUN_ID||''))throw Error();
 const r=await fetch('https://api.github.com/repos/VTholdings/creatorloop-main-site/actions/artifacts/'+e.BACKUP_ARTIFACT_ID,{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error();const a=await r.json();
 if(a.expired||a.workflow_run?.id!==Number(e.GITHUB_RUN_ID)||a.workflow_run?.head_sha!==e.GITHUB_SHA||Date.parse(a.expires_at)-Date.parse(a.created_at)<90*86400000-60000)throw Error();
 console.log('Encrypted artifact retention corroborated: 90 days.');
}catch{console.error('BACKUP_ARTIFACT_RETENTION_BLOCKED');process.exitCode=1;}
