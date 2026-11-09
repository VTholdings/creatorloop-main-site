import {edgeState,validAdmission,admissionCommitCheck} from './admission.js';
// Console personnel concepts; never substitute these for source workbook fields.
export const OWNER_EMAIL='team@creatorloop.net';
export const ROLE_CATALOG=Object.freeze({
 OPERATOR:'Operator',QA_REVIEWER:'QA Reviewer',OPERATIONS:'Operations — record authorized decisions',
 APPROVAL_AUTHORITY:'Approval Authority — explicit delegation required',OPERATIONS_MANAGER:'Operations Manager',
 MARKETING_CAMPAIGN_MANAGER:'Marketing / Campaign Manager',TECHNICIAN:'Technician',READ_ONLY_AUDITOR:'Read Only / Auditor'
});
export const TEAM_ROLES=Object.freeze(Object.keys(ROLE_CATALOG));
export const NEW_ROLES=new Set(['OPERATIONS_MANAGER','MARKETING_CAMPAIGN_MANAGER','TECHNICIAN','READ_ONLY_AUDITOR']);
export const VISIBILITY=['creator_pii','creator_compensation','financial_economics','audit_history','finalized_reports'];
export const EXPORTS=['creators','campaigns','audit','reports'];
export const canManageTeam=user=>user?.role==='ADMINISTRATOR'&&user?.account_status==='ACTIVE'&&user?.login_email===OWNER_EMAIL;
export const environmentName=env=>env.CONSOLE_ENVIRONMENT==='TRAINING'?'TRAINING':'PRODUCTION';
export const defaultVisibility=role=>['OPERATOR','OPERATIONS','APPROVAL_AUTHORITY'].includes(role)?['creator_pii','creator_compensation']:role==='QA_REVIEWER'?['creator_pii']:[];
export const visibility=user=>user.teamProfile?JSON.parse(user.teamProfile.visibility_json):defaultVisibility(user.role);
export const canViewAudit=user=>user.role==='ADMINISTRATOR'||visibility(user).includes('audit_history');
export const canExport=(user,dataset)=>canManageTeam(user)||Boolean(user.teamProfile&&JSON.parse(user.teamProfile.export_permissions_json).includes(dataset));
export async function loadMembership(db,user,env,issuedAt,subject) {
 let ready;try{ready=await db.prepare("SELECT version FROM schema_migrations WHERE version='0007_team_governance'").first();}catch{return user;}
 if(!ready)return user;
 user.teamGovernance=true;
 user.teamProfile=await db.prepare('SELECT * FROM console_team_profiles WHERE operator_id=?').bind(user.id).first();
 const p=user.teamProfile;
 if(p&&(p.environment!==environmentName(env)||!['TRAINING','ACTIVE'].includes(p.lifecycle_status)))return null;
 if(p&&p.auth_not_before>0&&(!Number.isFinite(issuedAt)||issuedAt<p.auth_not_before))return {reauthenticate:true};
 if(p&&p.managed_scope&&!(user.login_email===OWNER_EMAIL&&user.role==='ADMINISTRATOR')){
  const edge=await edgeState(db,user.id);
  if(!validAdmission(edge,user,env)||typeof subject!=='string'||subject!==edge.receipt.subject)return null;
  user.admissionCheck=admissionCommitCheck(user,env);
 }
 return user;
}
export const canDiagnose=user=>user.role==='ADMINISTRATOR'||Boolean(user.role==='TECHNICIAN'&&user.teamProfile&&JSON.parse(user.teamProfile.system_scope_json).includes('console_diagnostics'));
export function guardedDatabase(db,user) {
 if(!user.teamGovernance)return db;
 return {
 prepare(sql){return db.prepare(sql);},
 async batch(statements){
  const id=crypto.randomUUID();
  const checks=[...(user.commitChecks||[]),...(user.admissionCheck?[user.admissionCheck]:[])];
  const expectedVersion=checks.length?'CASE WHEN '+checks.map(check=>'('+check.sql+')').join(' AND ')+' THEN ? ELSE -1 END':'?';
  const results=await db.batch([
   db.prepare('INSERT INTO console_mutation_guards(id,operator_id,expected_role,expected_version) VALUES(?,?,?,'+expectedVersion+')').bind(id,user.id,user.role,...checks.flatMap(check=>check.values),user.teamProfile?.version||0),
   ...statements,db.prepare('DELETE FROM console_mutation_guards WHERE id=?').bind(id)
  ]);
  return results.slice(1,-1);
 }
 };
}
