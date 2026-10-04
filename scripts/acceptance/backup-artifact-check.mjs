// Check actual expiry and make its anchor explicit, not just the YAML request.
import {inspectArtifactRetention} from '../lib/backup-artifact-retention.mjs';
import {appendFile} from 'node:fs/promises';
const e=process.env;
try{
 if(!/^\d+$/.test(e.BACKUP_ARTIFACT_ID||'')||!/^\d+$/.test(e.GITHUB_RUN_ID||''))throw Error();
 const r=await fetch('https://api.github.com/repos/VTholdings/creatorloop-main-site/actions/artifacts/'+e.BACKUP_ARTIFACT_ID,{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error();const a=await r.json();
 const response=await fetch('https://api.github.com/repos/VTholdings/creatorloop-main-site/actions/runs/'+e.GITHUB_RUN_ID,{method:'GET',headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error();
 const result=inspectArtifactRetention(a,await response.json(),{runId:Number(e.GITHUB_RUN_ID),releaseSha:e.GITHUB_SHA});
 const summary='Encrypted artifact 90-day policy corroborated against '+result.policyAnchor+'; actual expiry '+result.expiresAt+'; actual retained seconds from artifact creation '+result.actualSecondsFromArtifactCreation+'. Owner off-platform copy still requires 90 days from capture.\n';
 console.log(summary);if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,summary);
}catch{console.error('BACKUP_ARTIFACT_RETENTION_BLOCKED');process.exitCode=1;}
