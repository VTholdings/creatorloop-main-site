// Team metadata is separate from the PNB Acquisition & Launch Control System.
// Human admission is a separate, verified gate; never mutate Cloudflare policies here.
import { OWNER_EMAIL, TEAM_ROLES, ROLE_CATALOG, VISIBILITY, EXPORTS, canManageTeam, environmentName, defaultVisibility } from './team-policy.js';
import { AUTHORIZATION_FIELDS } from './console-policy.js';
import {admissionConfiguration,edgeState,validAdmission,verifyReceipt,admissionCommitCheck} from './admission.js';
export { TEAM_ROLES,canManageTeam };
const json = (body,status=200) => new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
});
async function metadataReady(db) {
  return Boolean(await db.prepare('SELECT version FROM schema_migrations WHERE version=?').bind('0007_team_governance').first());
}
export async function directory(db,ready) {
  const users=(await db.prepare('SELECT id,display_name,login_email,role,account_status,last_activity_at,created_at FROM operators ORDER BY display_name,id').all()).results;
  const grants=(await db.prepare('SELECT operator_id,campaign_id,record_id FROM console_access_grants ORDER BY campaign_id,record_id').all()).results;
  const assignments=(await db.prepare('SELECT assigned_operator_id,id,campaign_id FROM creator_enrollments WHERE assigned_operator_id IS NOT NULL ORDER BY campaign_id,id').all()).results;
  const delegations=(await db.prepare('SELECT operator_id,campaign_id,field_key,expires_at FROM console_approval_delegations ORDER BY campaign_id,field_key').all()).results;
  const profiles=ready?(await db.prepare('SELECT * FROM console_team_profiles').all()).results:[];
  return users.map(user=>({
    id:user.id,fullName:user.display_name,email:user.login_email,role:user.role,
    accessStatus:user.account_status,lastAccess:user.last_activity_at,createdAt:user.created_at,
    ownerReserved:user.login_email===OWNER_EMAIL,retiredIdentity:user.login_email==='support@creatorloop.net',
    profile:profiles.find(profile=>profile.operator_id===user.id)||null,
    scope:grants.filter(grant=>grant.operator_id===user.id),
    assignedRecords:assignments.filter(record=>record.assigned_operator_id===user.id),
    delegations:delegations.filter(delegation=>delegation.operator_id===user.id)
  }));
}
export async function teamAccess({env,request,params},user) {
  if(!canManageTeam(user))return json({error:'Authorized Owner / Administrator required'},403);
  const parts=params.path||[],db=env.OPERATIONS_DB;
  const ready=await metadataReady(db);
  if(request.method==='GET') {
    const users=await directory(db,ready);
    if(parts.length>2)return json({error:'Not found'},404);
    if(parts[1]) {
      const person=users.find(person=>person.id===parts[1]);
      if(!person)return json({error:'User not found'},404);
      const events=ready?(await db.prepare('SELECT * FROM console_team_events WHERE target_operator_id=? ORDER BY created_at,id').bind(person.id).all()).results:[];
      return json({person,events,edge:ready?await edgeState(db,person.id):null,historyNotice:'Earlier operational audit events remain preserved. Earlier role-at-action values are not asserted by this directory.'});
    }
    const provisioningQueue=[];if(ready)for(const person of users){const state=await edgeState(db,person.id);if(state.request)provisioningQueue.push({operatorId:person.id,email:person.email,...state,status:state.receipt?(state.receipt.operation==='ADMIT'&&state.receipt.expiresAt<=Math.floor(Date.now()/1000)?'EXPIRED':'EVIDENCE_RECORDED'):'PENDING_EXTERNAL_EXECUTION'});}
    return json({users,provisioningQueue,approvedRoles:TEAM_ROLES,metadataReady:ready,activationAvailable:Boolean(admissionConfiguration(env)),environment:environmentName(env),roleCatalog:ROLE_CATALOG,visibilityCategories:VISIBILITY,exportCategories:EXPORTS,authorityFields:[...new Set(Object.values(AUTHORIZATION_FIELDS).flat())],
      campaigns:(await db.prepare('SELECT id,name FROM campaigns ORDER BY id').all()).results,
      loginUrl:'https://ops.creatorloop.net',notice:'New users start invited and inactive. Production activation requires separate certification and verified admission. Suspension and deactivation immediately block Console access; edge revocation is tracked separately.'});
  }
  if(request.method!=='POST'||parts.length!==1)return json({error:'Method not allowed'},405);
  // Explicit same-origin protection for browser personnel writes.
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origin rejected'},403);
  if(!ready)return json({error:'Team directory migration is pending'},503);
  const raw=await request.text();
  if(raw.length>16384)return json({error:'Team request is too large'},413);
  let body;
  try {body=JSON.parse(raw);} catch {return json({error:'A valid Team request is required'},422);}
  if(body?.action!=='addPending')return manageUser({env,request,db},user,body);
  const allowed=new Set(['action','fullName','email','role','scopes','employmentStatus','technicalLevel']);
  if(!body||Array.isArray(body)||Object.keys(body).some(key=>!allowed.has(key))||body.action!=='addPending')return json({error:'Use supported Add User fields; new identities remain inactive'},422);
  const name=typeof body.fullName==='string'?body.fullName.trim():'';
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(!name||name.length>150||/[\x00-\x1f\x7f]/.test(name))return json({error:'Enter the individual’s full name'},422);
  if(email.length>254||!/^([^\s<>\[\](),;:"\\]+)@([^\s<>\[\](),;:"\\]+)\.[^\s<>\[\](),;:"\\]+$/.test(email)||email==='support@creatorloop.net'||email===OWNER_EMAIL)return json({error:'Enter a new individual email; reserved and retired identities cannot be provisioned'},422);
  if(!TEAM_ROLES.includes(body.role))return json({error:'Choose an approved employee role; Administrator is reserved for the Owner'},422);
  if(!['PENDING_START','EMPLOYED'].includes(body.employmentStatus))return json({error:'Choose an employment status'},422);
  if(!Array.isArray(body.scopes)||body.scopes.length>100)return json({error:'Choose a valid proposed scope'},422);
  const scopes=[],seen=new Set();
  for(const scope of body.scopes) {
    if(!scope||Array.isArray(scope)||Object.keys(scope).sort().join(',')!=='campaignId,recordId'||typeof scope.campaignId!=='string'||typeof scope.recordId!=='string')return json({error:'Choose an existing Campaign ID and Creator ID or explicit campaign scope'},422);
    if(!await db.prepare('SELECT id FROM campaigns WHERE id=?').bind(scope.campaignId).first())return json({error:'Choose an existing Campaign ID'},422);
    if(scope.recordId!=='*'&&!await db.prepare('SELECT id FROM creator_enrollments WHERE id=? AND campaign_id=?').bind(scope.recordId,scope.campaignId).first())return json({error:'Creator ID must belong to the selected Campaign ID'},422);
    const key=JSON.stringify([scope.campaignId,scope.recordId]);
    if(!seen.has(key)){seen.add(key);scopes.push({campaignId:scope.campaignId,recordId:scope.recordId});}
  }
  if(await db.prepare('SELECT id FROM operators WHERE lower(login_email)=?').bind(email).first())return json({error:'Identity already exists. Historical identities cannot be reused or replaced.'},409);
  const level=body.role==='TECHNICIAN'?(body.technicalLevel||'TRAINING'):null;
  if(level&&!['TRAINING','PRODUCTION_SUPPORT','INFRASTRUCTURE_ADMIN'].includes(level))return json({error:'Choose a valid technical level'},422);
  if(level==='TRAINING'&&environmentName(env)!=='TRAINING')return json({error:'Technician — Training belongs in the isolated training environment'},422);
  const id='OP-'+crypto.randomUUID();
  const snapshot={id,fullName:name,email,role:body.role,accessStatus:'DISABLED',employmentStatus:body.employmentStatus,trainingStatus:'NOT_STARTED',lifecycleStatus:'INVITED',proposedScope:scopes};
  try {
    await db.batch([
      db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').bind(id,email,name,body.role,'DISABLED'),
      db.prepare('INSERT INTO console_team_profiles(operator_id,employment_status,proposed_scope_json,updated_by,environment,technical_level,visibility_json) VALUES(?,?,?,?,?,?,?)').bind(id,body.employmentStatus,JSON.stringify(scopes),user.id,environmentName(env),level,JSON.stringify(defaultVisibility(body.role))),
      db.prepare('INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) VALUES(?,?,?,?,?,?,?,?)').bind('TEAM-'+crypto.randomUUID(),id,user.id,user.login_email,user.display_name,user.role,'USER_INVITED',JSON.stringify(snapshot))
    ]);
  } catch(error) {
    if(await db.prepare('SELECT id FROM operators WHERE lower(login_email)=?').bind(email).first())return json({error:'Identity already exists. Historical identities cannot be reused or replaced.'},409);
    throw error;
  }
  return json({id,accessStatus:'DISABLED',lifecycleStatus:'INVITED',notice:'User saved inactive. No Cloudflare authorization, scope grant or business authority was created. Training and production are administered independently.'},201);
}

async function manageUser({env,db},actor,body) {
 const actions={requestAdmission:[],requestRevocation:[],recordEdgeReceipt:['receipt'],editEmployment:['employmentStatus'],startTraining:[],certify:['evidenceLink','attestation'],activate:[],suspend:[],deactivate:[],changeRole:['role','technicalLevel'],editScope:['scopes','systems'],manageAuthority:['delegations'],visibility:['categories','exports']};
 if(!body||typeof body!=='object'||Array.isArray(body)||!actions[body.action])return json({error:'Choose a supported Team action'},422);
 const keys=new Set(['action','operatorId','version','reason',...actions[body.action]]);
 if(Object.keys(body).some(k=>!keys.has(k))||!Number.isInteger(body.version)||body.version<0||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000)return json({error:'A current version and reason are required; restricted fields cannot be supplied'},422);
 const target=await db.prepare('SELECT * FROM operators WHERE id=?').bind(body.operatorId||'').first();
 if(!target)return json({error:'User not found'},404);
 if(target.id===actor.id||target.role==='ADMINISTRATOR'||[OWNER_EMAIL,'support@creatorloop.net'].includes(target.login_email))return json({error:'Reserved Owner and retired identities cannot be changed by routine personnel administration'},403);
 if(!TEAM_ROLES.includes(target.role))return json({error:'Legacy role requires an explicitly reviewed role transition'},409);
 const current=await db.prepare('SELECT * FROM console_team_profiles WHERE operator_id=?').bind(target.id).first();
 if((current?.version||0)!==body.version)return json({error:'User changed. Refresh before continuing.'},409);
 const effective=await directory(db,true);const person=effective.find(person=>person.id===target.id);
 const scopes=current?JSON.parse(current.proposed_scope_json):[...person.scope.map(g=>({campaignId:g.campaign_id,recordId:g.record_id})),...person.assignedRecords.map(r=>({campaignId:r.campaign_id,recordId:r.id}))];
 const p=current||{employment_status:'EMPLOYED',training_status:'NOT_STARTED',lifecycle_status:target.account_status==='ACTIVE'?'ACTIVE':target.account_status==='SUSPENDED'?'SUSPENDED':'INACTIVE',environment:environmentName(env),technical_level:null,visibility_json:JSON.stringify(defaultVisibility(target.role)),export_permissions_json:'[]',system_scope_json:'[]',auth_not_before:0,certification_evidence:null,certified_role:null,edge_revocation_status:'NOT_REQUIRED'};
 if(p.environment!==environmentName(env))return json({error:'Manage this identity in its authorized environment'},403);
 let role=target.role,status=target.account_status,nextScope=scopes,nextDelegations=person.delegations.map(d=>({campaignId:d.campaign_id,fieldKey:d.field_key,expiresAt:d.expires_at}));
 let permissionChange=false;
 const edge=await edgeState(db,target.id);let edgeOperation=null,receipt=null;
 if(body.action==='requestAdmission'){
  if(!admissionConfiguration(env))return json({error:'Isolated admission verifier configuration is pending'},503);
  if(status==='ACTIVE')return json({error:'Suspend access before requesting a replacement admission'},409);
  if(p.edge_revocation_status==='PENDING_VERIFICATION')return json({error:'Complete the pending individual edge revocation first'},409);
  edgeOperation='ADMIT';
 }else if(body.action==='requestRevocation'){
  status='SUSPENDED';p.lifecycle_status='SUSPENDED';p.edge_revocation_status='PENDING_VERIFICATION';nextDelegations=[];p.export_permissions_json='[]';permissionChange=true;edgeOperation='REVOKE';
 }else if(body.action==='recordEdgeReceipt'){
  if(edge.receipt)return json({error:'This request already has an immutable receipt'},409);
  try{receipt=await verifyReceipt(body.receipt,edge.request,target,env,body.version);}catch(e){return json({error:e.message},422);}
  if(receipt.operation==='REVOKE')p.edge_revocation_status='VERIFIED';
 }
 if(body.action==='editEmployment'){
  if(!['PENDING_START','EMPLOYED'].includes(body.employmentStatus))return json({error:'Choose an approved employment status'},422);
  if(target.account_status==='ACTIVE'&&body.employmentStatus==='PENDING_START')return json({error:'Suspend active access before returning employment to pending start'},422);
  p.employment_status=body.employmentStatus;
 } else if(body.action==='startTraining') {
  if(!['INVITED','PENDING','INACTIVE','SUSPENDED'].includes(p.lifecycle_status))return json({error:'This lifecycle state cannot enter training'},409);
  p.lifecycle_status='TRAINING';p.training_status='IN_PROGRESS';p.certified_role=null;
  if(p.environment==='TRAINING') {
   if(!validAdmission(edge,target,env))return json({error:'Current individual training admission receipt required'},503);
   (actor.commitChecks||=[]).push(admissionCommitCheck(target,env));status='ACTIVE';
  }else status='DISABLED';
  permissionChange=true;
 } else if(body.action==='certify') {
  let evidence=false;try{evidence=new URL(body.evidenceLink).protocol==='https:';}catch{}
  if(p.lifecycle_status!=='TRAINING'||!evidence||body.attestation!==true)return json({error:'Verify role-specific training and provide certification evidence while the user is in Training'},422);
  p.training_status='CERTIFIED';p.certified_role=role;p.certification_evidence=body.evidenceLink;p.lifecycle_status='CERTIFIED';status='DISABLED';permissionChange=true;
 } else if(body.action==='activate') {
  if(!validAdmission(edge,target,env))return json({error:'Current individual Cloudflare admission receipt required'},503);
  if(p.employment_status!=='EMPLOYED')return json({error:'Confirmed employment is required for operational activation'},422);
  if(p.training_status!=='CERTIFIED'||p.certified_role!==role||!p.certification_evidence||!['CERTIFIED','SUSPENDED','INACTIVE','TRAINING'].includes(p.lifecycle_status)||(!scopes.length&&!(role==='TECHNICIAN'&&JSON.parse(p.system_scope_json).includes('console_diagnostics'))))return json({error:'Current-role certification evidence and explicit record/system scope are required'},422);
  if(role==='TECHNICIAN'&&p.technical_level==='TRAINING'&&p.environment!=='TRAINING')return json({error:'Technician — Training cannot access production'},403);
  (actor.commitChecks||=[]).push(admissionCommitCheck(target,env));
  status='ACTIVE';p.lifecycle_status='ACTIVE';permissionChange=true;
 } else if(['suspend','deactivate'].includes(body.action)) {
  status=body.action==='suspend'?'SUSPENDED':'DISABLED';p.lifecycle_status=body.action==='suspend'?'SUSPENDED':'INACTIVE';
  p.edge_revocation_status=target.account_status==='ACTIVE'?'PENDING_VERIFICATION':p.edge_revocation_status;
  nextDelegations=[];p.export_permissions_json='[]';permissionChange=true;
 } else if(body.action==='changeRole') {
  if(!TEAM_ROLES.includes(body.role))return json({error:'Choose an approved employee role; Owner authority is reserved'},422);
  const level=body.role==='TECHNICIAN'?body.technicalLevel:null;
  if(body.role==='TECHNICIAN'&&(!['TRAINING','PRODUCTION_SUPPORT','INFRASTRUCTURE_ADMIN'].includes(level)||(level==='TRAINING'&&p.environment!=='TRAINING')))return json({error:'Technical level must match the authorized environment'},422);
  role=body.role;p.technical_level=level;p.certified_role=null;p.training_status='IN_PROGRESS';p.lifecycle_status='TRAINING';status='DISABLED';
  p.visibility_json=JSON.stringify(defaultVisibility(role));p.export_permissions_json='[]';p.system_scope_json='[]';nextDelegations=[];permissionChange=true;
  if(target.account_status==='ACTIVE')p.edge_revocation_status='PENDING_VERIFICATION';
 } else if(body.action==='editScope') {
  if(!Array.isArray(body.scopes)||body.scopes.length>100||!Array.isArray(body.systems||[]))return json({error:'Choose explicit record and system scope'},422);
  nextScope=[];
  for(const s of body.scopes) {
   if(!s||Object.keys(s).sort().join(',')!=='campaignId,recordId'||typeof s.campaignId!=='string'||typeof s.recordId!=='string'||!await db.prepare('SELECT id FROM campaigns WHERE id=?').bind(s.campaignId).first()||(s.recordId!=='*'&&!await db.prepare('SELECT id FROM creator_enrollments WHERE id=? AND campaign_id=?').bind(s.recordId,s.campaignId).first()))return json({error:'Campaign ID and Creator ID must match an established record'},422);
   if(!nextScope.some(n=>n.campaignId===s.campaignId&&n.recordId===s.recordId))nextScope.push(s);
  }
  if((body.systems||[]).some(s=>s!=='console_diagnostics')||((body.systems||[]).length&&role!=='TECHNICIAN'))return json({error:'Only explicit Technician diagnostic scope is supported'},422);
  p.system_scope_json=JSON.stringify([...new Set(body.systems||[])]);
  nextDelegations=nextDelegations.filter(d=>nextScope.some(s=>s.campaignId===d.campaignId));permissionChange=true;
 } else if(body.action==='manageAuthority') {
  const fields=new Set(Object.values(AUTHORIZATION_FIELDS).flat());
  if(!Array.isArray(body.delegations)||body.delegations.length>100)return json({error:'Choose explicit limited approval delegations'},422);
  nextDelegations=[];
  for(const d of body.delegations) {
   if(!d||Object.keys(d).sort().join(',')!=='campaignId,expiresAt,fieldKey'||!fields.has(d.fieldKey)||!nextScope.some(s=>s.campaignId===d.campaignId)||!Number.isFinite(Date.parse(d.expiresAt))||Date.parse(d.expiresAt)<=Date.now())return json({error:'Delegation must match approved scope, a supported field and a future expiry; Owner Approval, budgets and launch are reserved'},422);
   if(nextDelegations.some(n=>n.campaignId===d.campaignId&&n.fieldKey===d.fieldKey))return json({error:'Duplicate delegation'},422);
   nextDelegations.push({...d,expiresAt:new Date(d.expiresAt).toISOString()});
  }
  permissionChange=true;
 } else if(body.action==='visibility') {
  if(!Array.isArray(body.categories)||body.categories.some(c=>!VISIBILITY.includes(c))||!Array.isArray(body.exports)||body.exports.some(e=>!EXPORTS.includes(e)))return json({error:'Choose supported visibility and export categories'},422);
  if(body.exports.includes('audit')&&!body.categories.includes('audit_history'))return json({error:'Audit export also requires audit visibility'},422);
  if(body.exports.includes('reports')&&!body.categories.includes('finalized_reports'))return json({error:'Report export also requires finalized report visibility'},422);
  p.visibility_json=JSON.stringify([...new Set(body.categories)]);p.export_permissions_json=JSON.stringify([...new Set(body.exports)]);permissionChange=true;
 }
 const mutation=crypto.randomUUID(),newVersion=body.version+1;
 if(permissionChange){p.auth_not_before=Math.floor(Date.now()/1000)+1;if(target.account_status==='ACTIVE'&&status!=='ACTIVE'){p.edge_revocation_status='PENDING_VERIFICATION';edgeOperation='REVOKE';}}
 if(!edgeOperation&&!receipt&&p.edge_revocation_status==='PENDING_VERIFICATION')edgeOperation='REVOKE';
 const after={role,accessStatus:status,profile:{...p,version:newVersion,proposed_scope_json:JSON.stringify(nextScope)},scope:status==='ACTIVE'?nextScope:[],delegations:nextDelegations,reason:body.reason.trim()};
 const exists="EXISTS (SELECT 1 FROM console_team_profiles WHERE operator_id=? AND last_mutation_id=?)";
 const statements=[];
 if(!current)statements.push(db.prepare('INSERT OR IGNORE INTO console_team_profiles(operator_id,employment_status,training_status,lifecycle_status,proposed_scope_json,version,updated_by,environment,visibility_json,managed_scope) VALUES(?,?,?,?,?,0,?,?,?,1)').bind(target.id,p.employment_status,p.training_status,p.lifecycle_status,JSON.stringify(scopes),actor.id,p.environment,p.visibility_json));
 const updateIndex=statements.length;
 statements.push(db.prepare('UPDATE console_team_profiles SET employment_status=?,training_status=?,lifecycle_status=?,proposed_scope_json=?,technical_level=?,visibility_json=?,export_permissions_json=?,system_scope_json=?,auth_not_before=?,certification_evidence=?,certified_role=?,edge_revocation_status=?,managed_scope=1,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP,last_mutation_id=? WHERE operator_id=? AND version=?').bind(p.employment_status,p.training_status,p.lifecycle_status,JSON.stringify(nextScope),p.technical_level,p.visibility_json,p.export_permissions_json,p.system_scope_json,p.auth_not_before,p.certification_evidence,p.certified_role,p.edge_revocation_status,actor.id,mutation,target.id,body.version));
 statements.push(db.prepare('UPDATE operators SET role=?,account_status=? WHERE id=? AND '+exists).bind(role,status,target.id,target.id,mutation));
 statements.push(db.prepare('DELETE FROM console_access_grants WHERE operator_id=? AND '+exists).bind(target.id,target.id,mutation));
 if(status==='ACTIVE')for(const scope of nextScope)statements.push(db.prepare('INSERT OR IGNORE INTO console_access_grants(operator_id,campaign_id,record_id,granted_by) SELECT ?,?,?,? WHERE '+exists).bind(target.id,scope.campaignId,scope.recordId,actor.id,target.id,mutation));
 statements.push(db.prepare('DELETE FROM console_approval_delegations WHERE operator_id=? AND '+exists).bind(target.id,target.id,mutation));
 for(const d of nextDelegations)statements.push(db.prepare('INSERT INTO console_approval_delegations(operator_id,campaign_id,field_key,delegated_by,expires_at) SELECT ?,?,?,?,? WHERE '+exists).bind(target.id,d.campaignId,d.fieldKey,actor.id,d.expiresAt,target.id,mutation));
 statements.push(db.prepare('INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,previous_state_json,new_state_json) SELECT ?,?,?,?,?,?,?,?,? WHERE '+exists).bind('TEAM-'+crypto.randomUUID(),target.id,actor.id,actor.login_email,actor.display_name,actor.role,'TEAM_'+body.action.toUpperCase(),JSON.stringify(person),JSON.stringify(after),target.id,mutation));
 if(edgeOperation){const id='EDGE-'+crypto.randomUUID();statements.push(db.prepare('INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) SELECT ?,?,?,?,?,?,?,? WHERE '+exists).bind(id,target.id,actor.id,actor.login_email,actor.display_name,actor.role,edgeOperation==='ADMIT'?'EDGE_ADMISSION_REQUEST':'EDGE_REVOCATION_REQUEST',JSON.stringify({operation:edgeOperation,operatorId:target.id,email:target.login_email,environment:p.environment,audience:env.CLOUDFLARE_ACCESS_AUD||null,databaseId:env.CONSOLE_DATABASE_ID||null,deploymentId:env.CONSOLE_DEPLOYMENT_ID||null,requestVersion:newVersion,requestedAt:Math.floor(Date.now()/1000),reason:body.reason.trim()}),target.id,mutation));}
 if(receipt)statements.push(db.prepare('INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) SELECT ?,?,?,?,?,?,?,? WHERE '+exists).bind('RECEIPT-'+crypto.randomUUID(),target.id,actor.id,actor.login_email,actor.display_name,actor.role,'EDGE_RECEIPT',JSON.stringify(receipt),target.id,mutation));
 const result=await db.batch(statements);
 if(!result[updateIndex].meta.changes)return json({error:'User changed. Refresh before continuing.'},409);
 return json({id:target.id,version:newVersion,accessStatus:status,lifecycleStatus:p.lifecycle_status,edgeRevocationStatus:p.edge_revocation_status,...(edgeOperation||receipt?{edge:await edgeState(db,target.id)}:{}),notice:status==='ACTIVE'?'Application access recorded. A fresh individual Access session is required.':'Application state recorded. History is preserved. Any pending Cloudflare session revocation remains a separate verification gate.'});
}
