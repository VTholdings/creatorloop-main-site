// The protected checkout and reviewed manifest bind the application SHA separately
// from the workflow execution SHA. No provider calls or write authority here.
export function reviewedApplicationReference({executionSha,proposal,expectedApplicationSha}) {
 const sha=/^[a-f0-9]{40}$/;
 if(!sha.test(executionSha||'')||!proposal||proposal.protocol!=='CREATORLOOP_STEP18_TRAINING_RELEASE_PREPARATION_V1'||proposal.repository!=='VTholdings/creatorloop-main-site'||proposal.branch!=='team-access-directory'||!sha.test(proposal.applicationReleaseSha||''))throw Error('REVIEWED_APPLICATION_REFERENCE_REQUIRED');
 if(expectedApplicationSha!==proposal.applicationReleaseSha)throw Error('EXPECTED_APPLICATION_SHA_NOT_BOUND_TO_REVIEWED_MANIFEST');
 return {executionSha,applicationSha:proposal.applicationReleaseSha};
}
