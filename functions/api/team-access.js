// Team metadata is separate from the PNB Acquisition & Launch Control System.
// This first phase saves inactive identities only; it cannot grant login access.
const OWNER_EMAIL = 'team@creatorloop.net';
export const TEAM_ROLES = Object.freeze(['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY']);
export const canManageTeam = user => user?.role === 'ADMINISTRATOR' &&
  user?.account_status === 'ACTIVE' && user?.login_email === OWNER_EMAIL;
const json = (body,status=200) => new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
});
async function metadataReady(db) {
  return Boolean(await db.prepare('SELECT version FROM schema_migrations WHERE version=?').bind('0005_team_directory').first());
}
async function directory(db,ready) {
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
      return json({person,events,historyNotice:'Earlier operational audit events remain preserved. Earlier role-at-action values are not asserted by this directory.'});
    }
    return json({users,approvedRoles:TEAM_ROLES,metadataReady:ready,activationAvailable:false,
      campaigns:(await db.prepare('SELECT id,name FROM campaigns ORDER BY id').all()).results,
      loginUrl:'https://ops.creatorloop.net',notice:'New users are saved inactive. Activation, role/scope changes and deactivation through this screen are pending the approved provisioning rollout.'});
  }
  if(request.method!=='POST'||parts.length!==1)return json({error:'Method not allowed'},405);
  // Explicit same-origin protection for browser personnel writes.
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origin rejected'},403);
  if(!ready)return json({error:'Team directory migration is pending'},503);
  const raw=await request.text();
  if(raw.length>16384)return json({error:'Team request is too large'},413);
  let body;
  try {body=JSON.parse(raw);} catch {return json({error:'A valid Team request is required'},422);}
  const allowed=new Set(['action','fullName','email','role','scopes','employmentStatus']);
  if(!body||Array.isArray(body)||Object.keys(body).some(key=>!allowed.has(key))||body.action!=='addPending')return json({error:'Only inactive Add User is available in this phase'},422);
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
  const id='OP-'+crypto.randomUUID();
  const snapshot={id,fullName:name,email,role:body.role,accessStatus:'DISABLED',employmentStatus:body.employmentStatus,trainingStatus:'NOT_STARTED',lifecycleStatus:'PENDING',proposedScope:scopes};
  try {
    await db.batch([
      db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').bind(id,email,name,body.role,'DISABLED'),
      db.prepare('INSERT INTO console_team_profiles(operator_id,employment_status,proposed_scope_json,updated_by) VALUES(?,?,?,?)').bind(id,body.employmentStatus,JSON.stringify(scopes),user.id),
      db.prepare('INSERT INTO console_team_events(id,target_operator_id,actor_operator_id,actor_email,actor_name,actor_role,action,new_state_json) VALUES(?,?,?,?,?,?,?,?)').bind('TEAM-'+crypto.randomUUID(),id,user.id,user.login_email,user.display_name,user.role,'USER_ADDED_PENDING',JSON.stringify(snapshot))
    ]);
  } catch(error) {
    if(await db.prepare('SELECT id FROM operators WHERE lower(login_email)=?').bind(email).first())return json({error:'Identity already exists. Historical identities cannot be reused or replaced.'},409);
    throw error;
  }
  return json({id,accessStatus:'DISABLED',lifecycleStatus:'PENDING',notice:'User saved inactive. No Cloudflare authorization, scope grant or business authority was created.'},201);
}
