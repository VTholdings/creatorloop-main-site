// Application readiness only. Never certify live infrastructure from local metadata.
import {canManageTeam,environmentName} from './team-policy.js';
import {admissionConfiguration,edgeState,validAdmission} from './admission.js';
export async function readiness({env},actor) {
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!canManageTeam(actor))return json({error:'Owner readiness review required'},403);
 const db=env.OPERATIONS_DB;
 const registered=(await db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).results.map(r=>r.version);
 const required=['0005_team_directory','0006_audit_history','0007_team_governance'];
 const missing=required.filter(v=>!registered.includes(v)),config=admissionConfiguration(env);
 const people=[];
 if(!missing.length){
  const users=(await db.prepare('SELECT o.*,p.lifecycle_status,p.training_status,p.certified_role,p.environment,p.edge_revocation_status,p.proposed_scope_json,p.system_scope_json FROM operators o JOIN console_team_profiles p ON p.operator_id=o.id ORDER BY o.id').all()).results;
  for(const user of users){const edge=await edgeState(db,user.id);people.push({operatorId:user.id,lifecycleStatus:user.lifecycle_status,environment:user.environment,certificationCurrent:user.training_status==='CERTIFIED'&&user.certified_role===user.role,explicitScope:Boolean(JSON.parse(user.proposed_scope_json).length||JSON.parse(user.system_scope_json).length),individualAdmissionCurrent:validAdmission(edge,user,env),edgeRevocationStatus:user.edge_revocation_status,requestId:edge.request?.id||null});}
 }
 return json({environment:environmentName(env),missingMigrations:missing,isolationConfigured:Boolean(config),people,applicationGatesPrepared:!missing.length&&Boolean(config),liveAcceptanceComplete:false,productionCertified:false,deferredLiveGates:['fresh remote schema and restore-tested backups','D1 atomic migration behavior','actual database/deployment/AUD isolation','Cloudflare individual policy and session evidence','individually authenticated lifecycle','bound source bridge and canonical mapping round-trip','external report retention destination and restore','role-specific Operator Readiness handoff'],notice:'Configuration pins and local application evidence are prerequisites, not live certification.'});
}
