import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { onRequest } from '../../functions/api/console/[[path]].js';
export class D1Statement {
 constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
 bind(...values){return new D1Statement(this.db,this.sql,values);}
 first(){return this.db.prepare(this.sql).get(...this.values)||null;}
 all(){return {results:this.db.prepare(this.sql).all(...this.values)};}
 run(){return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.values).changes)}};}
}
export class D1Database {
 constructor(db){this.db=db;}
 prepare(sql){return new D1Statement(this.db,sql);}
 async batch(statements){this.db.exec('BEGIN');try{const results=statements.map(s=>s.run());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
export async function fixture() {
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_bm01','0002_operations_console_v2','0003_pnb_source_contract','0004_operator_permissions']) {
  db.exec('BEGIN');db.exec(await readFile('migrations/'+file+'.sql','utf8'));db.exec('COMMIT');
 }
 const roles=['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','ADMINISTRATOR'];
 for(const role of roles)db.prepare('INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES(?,?,?,?,?)').run('OP-'+role,role.toLowerCase()+'@example.com',role,role,'ACTIVE');
 db.prepare("UPDATE campaigns SET cash_budget=777,promo_credit=88,notes='PRIVATE MANAGEMENT NOTES' WHERE id='CMP-100'").run();
 db.prepare("INSERT INTO campaigns(id,name,brand_code,status,source_reference) VALUES('CMP-200','Isolated unrelated campaign','PNB','NOT_STARTED','TRAINING ONLY')").run();
 for(const [id,campaign] of [['CR-200','CMP-100'],['CR-201','CMP-100'],['CR-202','CMP-200']])db.prepare(`INSERT INTO creator_enrollments(id,campaign_id,creator_name,primary_platform,handle,contact,creator_status,compensation_model,rights_status,product_focus,workflow_status,enrollment_date,last_updated,evidence_link) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,campaign,'Fictional '+id,'TikTok','@'+id,id+'@example.com','In Progress','N/A','Not Reviewed','PNB_META_ACQ_3ITEMS_202609 — 3-product campaign','IN_PROGRESS','2026-10-01','2026-10-01','https://example.com/training/'+id);
 for(const role of roles.filter(r=>r!=='ADMINISTRATOR'))db.prepare('INSERT INTO console_access_grants(operator_id,campaign_id,record_id,granted_by) VALUES(?,?,?,?)').run('OP-'+role,'CMP-100','CR-200','OP-ADMINISTRATOR');
 db.prepare(`INSERT INTO creator_assignments(id,environment,creator_id,campaign_id,status,paid_usage_rights,evidence_status,last_updated,fixed_content_fee,commission_rate) VALUES('ASG-200','TEST','CR-200','CMP-100','In Progress','Pending','Planned','2026-10-01',50,.1)`).run();
 return {db,env:{OPERATIONS_DB:new D1Database(db)}};
}
export async function call(env,role,method,path,body) {
 const response=await onRequest({env,data:{loginEmail:role.toLowerCase()+'@example.com'},params:{path:path.split('?')[0].split('/')},request:new Request('https://ops.creatorloop.net/api/console/'+path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json',Origin:'https://ops.creatorloop.net'},body:body===undefined?undefined:JSON.stringify(body)})});
 return {status:response.status,body:await response.json()};
}
