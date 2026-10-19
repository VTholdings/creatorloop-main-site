import {sha256,refuse} from './training-execution-contract.mjs';
export const TRAINING_REPOSITORY='VTholdings/creatorloop-main-site';
export const TRAINING_BRANCH='team-access-directory';
export const TRAINING_GITHUB_ENVIRONMENTS=Object.freeze({provider:'creatorloop-training-provider-execution',release:'creatorloop-training-release'});
export function prepareGithubEnvironmentConfiguration({reviewer}) {
 if(!reviewer||reviewer.type!=='User'||!Number.isSafeInteger(reviewer.id)||reviewer.id<=0||typeof reviewer.login!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(reviewer.login))refuse('APPOINTED_OWNER_REVIEWER_REQUIRED');
 return {protocol:'CREATORLOOP_TRAINING_GITHUB_SETUP_V1',executable:false,repository:TRAINING_REPOSITORY,reviewer:structuredClone(reviewer),existingAcceptanceEnvironment:'UNCHANGED',environments:Object.values(TRAINING_GITHUB_ENVIRONMENTS).map(name=>({name,environmentRequest:{method:'PUT',path:`/repos/${TRAINING_REPOSITORY}/environments/${name}`,body:{wait_timer:0,prevent_self_review:true,reviewers:[{type:'User',id:reviewer.id}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}}},branchRequest:{method:'POST',path:`/repos/${TRAINING_REPOSITORY}/environments/${name}/deployment-branch-policies`,body:{name:TRAINING_BRANCH,type:'branch'}},administratorUiAction:'Deselect Allow administrators to bypass configured protection rules; Save protection rules.',expectedReadback:{can_admins_bypass:false,prevent_self_review:true,reviewerId:reviewer.id,branchRules:[{name:TRAINING_BRANCH,type:'branch'}]},secretsToPopulateNow:[]})),holds:['Owner administrator executes protected configuration only','No keys or credentials created/populated','No workflow activation/dispatch','No changes to creatorloop-acceptance','No production, admission or deployment']};
}
export function verifyGithubEnvironment({environmentName,snapshot,branchPolicies,reviewerId,observedAt,now=Math.floor(Date.now()/1000)}) {
 if(!Object.values(TRAINING_GITHUB_ENVIRONMENTS).includes(environmentName))refuse('ISOLATED_TRAINING_ENVIRONMENT_REQUIRED');
 if(!Number.isInteger(observedAt)||observedAt>now||observedAt<now-300)refuse('FRESH_GITHUB_SETTINGS_REQUIRED');
 if(!Number.isSafeInteger(reviewerId)||reviewerId<=0)refuse('APPOINTED_OWNER_REVIEWER_REQUIRED');
 if(!snapshot||snapshot.name!==environmentName||!Number.isSafeInteger(snapshot.id)||snapshot.id<=0)refuse('GITHUB_ENVIRONMENT_NOT_PROVISIONED');
 if(snapshot.can_admins_bypass!==false)refuse('ADMINISTRATOR_BYPASS_NOT_DISABLED_OR_UNKNOWN');
 const rules=snapshot.protection_rules?.filter(rule=>rule.type==='required_reviewers');
 if(!rules||rules.length!==1||rules[0].prevent_self_review!==true||rules[0].reviewers?.length!==1||rules[0].reviewers[0].type!=='User'||rules[0].reviewers[0].reviewer?.id!==reviewerId)refuse('OWNER_REVIEW_CONTROLS_NOT_VERIFIED');
 if(snapshot.deployment_branch_policy?.protected_branches!==false||snapshot.deployment_branch_policy?.custom_branch_policies!==true||branchPolicies?.total_count!==1||branchPolicies.branch_policies?.length!==1||branchPolicies.branch_policies[0].type!=='branch'||branchPolicies.branch_policies[0].name!==TRAINING_BRANCH)refuse('EXACT_TRAINING_BRANCH_ONLY_REQUIRED');
 return {protocol:'CREATORLOOP_TRAINING_GITHUB_ENVIRONMENT_VERIFICATION_V1',environmentName,environmentId:snapshot.id,reviewerId,observedAt,settingsSha256:sha256({snapshot,branchPolicies}),settingsVerified:true,custodyVerified:false,capabilityVerified:false,releaseOrAdmissionAuthorized:false};
}
