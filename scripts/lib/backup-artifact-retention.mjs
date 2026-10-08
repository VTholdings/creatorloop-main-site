// Corroborate provider-reported expiry against the 90-day Actions run policy.
// Report the actual interval as well; never claim 90 full days from upload when
// the workflow/run expiration cap truncates it by the protected approval wait.
export function inspectArtifactRetention(artifact,run,{runId,releaseSha,now=Date.now()}){
 const a=Date.parse(artifact?.created_at),r=Date.parse(run?.created_at),x=Date.parse(artifact?.expires_at);
 if(!Number.isSafeInteger(runId)||artifact?.workflow_run?.id!==runId||run?.id!==runId||artifact?.workflow_run?.head_sha!==releaseSha||run?.head_sha!==releaseSha||artifact.expired||![a,r,x,now].every(Number.isFinite)||a<r||a>now+60000||x<=now)throw Error('BACKUP_ARTIFACT_RETENTION_BLOCKED');
 const minimum=90*86400000-60000;
 const uploadAnchored=x-a>=minimum,runAnchored=x-r>=minimum;
 if(!uploadAnchored&&!runAnchored)throw Error('BACKUP_ARTIFACT_RETENTION_BLOCKED');
 return {requestedPolicyDays:90,policyAnchor:uploadAnchored?'ARTIFACT_CREATED_AT':'WORKFLOW_RUN_CREATED_AT',createdAt:artifact.created_at,expiresAt:artifact.expires_at,actualSecondsFromArtifactCreation:Math.floor((x-a)/1000),full90DaysFromArtifactCreation:x-a>=90*86400000,offPlatformRetentionRequiredDays:90};
}
