import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectArtifactRetention} from '../scripts/lib/backup-artifact-retention.mjs';
const sha='a'.repeat(40),run={id:1,head_sha:sha,created_at:'2026-10-04T21:43:08Z'};
const artifact={created_at:'2026-10-04T21:49:58Z',expires_at:'2027-01-02T21:43:09Z',expired:false,workflow_run:{id:1,head_sha:sha}};
const options={runId:1,releaseSha:sha,now:Date.parse('2026-10-04T22:00:00Z')};
test('90-day workflow expiry is corroborated without falsely claiming 90 full days after a protected upload wait',()=>{
 const result=inspectArtifactRetention(artifact,run,options);assert.equal(result.policyAnchor,'WORKFLOW_RUN_CREATED_AT');assert.equal(result.full90DaysFromArtifactCreation,false);assert.equal(result.actualSecondsFromArtifactCreation,90*86400-409);assert.equal(result.offPlatformRetentionRequiredDays,90);
 const upload={...artifact,expires_at:'2027-01-02T21:49:58Z'};assert.equal(inspectArtifactRetention(upload,run,options).full90DaysFromArtifactCreation,true);
});
test('short policies, expiration, identity substitution and malformed chronology remain retention blockers',()=>{
 for(const altered of [{...artifact,expires_at:'2026-10-18T21:49:58Z'},{...artifact,expired:true},{...artifact,workflow_run:{id:2,head_sha:sha}},{...artifact,workflow_run:{id:1,head_sha:'b'.repeat(40)}},{...artifact,expires_at:'invalid'},{...artifact,created_at:'2026-10-04T21:00:00Z'}])assert.throws(()=>inspectArtifactRetention(altered,run,options),/RETENTION_BLOCKED/);
 assert.throws(()=>inspectArtifactRetention(artifact,{...run,id:2},options),/RETENTION_BLOCKED/);
 assert.throws(()=>inspectArtifactRetention(artifact,run,{...options,now:Date.parse('2027-02-01T00:00:00Z')}),/RETENTION_BLOCKED/);
});
