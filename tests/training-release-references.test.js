import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedApplicationReference} from '../scripts/lib/training-release-references.mjs';
const proposal={protocol:'CREATORLOOP_STEP18_TRAINING_RELEASE_PREPARATION_V1',repository:'VTholdings/creatorloop-main-site',branch:'team-access-directory',applicationReleaseSha:'a'.repeat(40)};
test('reviewed application and execution SHAs remain distinct and explicitly manifest-bound',()=>{
 assert.deepEqual(reviewedApplicationReference({executionSha:'b'.repeat(40),proposal,expectedApplicationSha:proposal.applicationReleaseSha}),{executionSha:'b'.repeat(40),applicationSha:'a'.repeat(40)});
});
test('arbitrary expected SHA, wrong repository/branch and malformed execution references are rejected',()=>{
 for(const changes of [{expectedApplicationSha:'c'.repeat(40)},{executionSha:'moving-branch'},{proposal:{...proposal,repository:'wrong'}},{proposal:{...proposal,branch:'main'}},{proposal:{...proposal,applicationReleaseSha:null}}])assert.throws(()=>reviewedApplicationReference({executionSha:'b'.repeat(40),proposal,expectedApplicationSha:proposal.applicationReleaseSha,...changes}));
});
