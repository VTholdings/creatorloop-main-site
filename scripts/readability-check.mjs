// Temporary visual acceptance runner. Fictional, in-memory API; no production connection.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {fixture} from '../tests/helpers/operator-fixture.js';
import {onRequest} from '../functions/api/console/[[path]].js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const {db,env}=await fixture();
const output=resolve('readability-artifacts');await mkdir(output,{recursive:true});
db.prepare("UPDATE campaigns SET name='TEST / FICTIONAL — operator readability preview',platform='Meta',product_scope='Fictional training scope' WHERE id='CMP-100'").run();
db.prepare("UPDATE creator_enrollments SET sync_status='SYNCED' WHERE id='CR-200'").run();
const roles=['OPERATOR','QA_REVIEWER','OPERATIONS','APPROVAL_AUTHORITY','ADMINISTRATOR'];
const widths=[320,390,560,768,900,901,1024,1440];
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/console/')){
   assert.equal(req.method,'GET','Browser preview is read-only');
   const role=req.headers['x-ui-fixture-role']||'OPERATOR';assert.ok(roles.includes(role));
   const response=await onRequest({env,data:{loginEmail:role.toLowerCase()+'@example.com'},params:{path:url.pathname.slice('/api/console/'.length).split('/')},request:new Request('http://127.0.0.1'+req.url)});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const path=resolve('.'+(url.pathname==='/console/'?'/console/index.html':url.pathname));
  assert.ok(path.startsWith(resolve('.')+'/'));
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
 }catch(e){res.writeHead(404);res.end('Local preview resource unavailable');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
let browser;const results=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const role of roles){
  const page=await browser.newPage({viewport:{width:1440,height:1000},extraHTTPHeaders:{'X-UI-Fixture-Role':role}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const h=new URL(route.request().url()).hostname;return ['127.0.0.1','fonts.googleapis.com','fonts.gstatic.com'].includes(h)?route.continue():route.abort();});
  await page.goto('http://127.0.0.1:'+port+'/console/');await page.locator('#app').waitFor({state:'visible'});
  await page.evaluate(()=>document.fonts.ready);
  for(const width of widths){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>show('home'));
   await check(page,role,width,'home');
   await page.evaluate(()=>show('work'));
   await page.locator('#work-view [data-record="CR-200"]').click();
   await page.locator('#creator-form').waitFor({state:'visible'});
   await check(page,role,width,'work');
   const disabled=await page.locator('#creator-form [name="compensationModel"]').isDisabled();
   assert.equal(disabled,role!=='ADMINISTRATOR','Compensation control role lock');
   assert.equal(await page.locator('#creator-form [name="rightsStatus"]').isDisabled(),role!=='ADMINISTRATOR','Rights control role lock');
   if(role==='QA_REVIEWER')assert.equal(await page.locator('#creator-form [name="creatorName"]').isDisabled(),true);
   await page.evaluate(()=>show('campaigns'));
   await page.locator('#campaigns-view [data-campaign="CMP-100"]').click();
   await page.locator('#campaign-detail .detail-grid').waitFor({state:'visible'});
   await check(page,role,width,'campaigns');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({result:'PASS',checks:results,productionConnections:0,sourceWorkbookWrites:0},null,2));
 console.log(JSON.stringify({result:'PASS',browserChecks:results.length,roles:roles.length,widths,productionConnections:0,sourceWorkbookWrites:0}));
}catch(e){
 await writeFile(resolve(output,'results.json'),JSON.stringify({result:'FAIL',error:e.message,checks:results},null,2));throw e;
}finally{await browser?.close();await new Promise(r=>server.close(r));db.close();}
async function check(page,role,width,view){
 const data=await page.evaluate(()=>{
  const visible=el=>!!(el.getBoundingClientRect().width&&el.getBoundingClientRect().height)&&getComputedStyle(el).display!=='none'&&!el.closest('[hidden]');
  const value=(selector,key)=>{const el=[...document.querySelectorAll(selector)].find(visible);return el?getComputedStyle(el)[key]:null;};
  const overflow=[...document.querySelectorAll('.panel,.hero,.record,.campaign-card,.section-head,.guide,.detail-grid,.form-grid,.status-grid,.search-grid,.topbar')].filter(visible).filter(el=>!el.classList.contains('audit-wrap')&&el.scrollWidth>el.clientWidth+2).map(el=>({tag:el.tagName,class:el.className,client:el.clientWidth,scroll:el.scrollWidth}));
  return {rootOverflow:document.documentElement.scrollWidth>innerWidth+2,overflow,body:getComputedStyle(document.body).fontSize,family:getComputedStyle(document.body).fontFamily,values:value('input,select,textarea','fontSize'),guide:value('.guide b','fontSize'),help:value('.field-help','fontSize'),navVisible:visible(document.querySelector('#menu')),hiddenBroken:[...document.querySelectorAll('[hidden]')].some(el=>getComputedStyle(el).display!=='none'),formColumns:value('.form-grid','gridTemplateColumns')};
 });
 if((['OPERATOR','ADMINISTRATOR'].includes(role)&&[320,390,901,1440].includes(width))||data.rootOverflow||data.overflow.length)await page.screenshot({path:resolve(output,role+'-'+view+'-'+width+'.png'),fullPage:true});
 assert.equal(data.rootOverflow,false,JSON.stringify({role,width,view,...data}));
 assert.deepEqual(data.overflow,[],JSON.stringify({role,width,view,...data}));
 assert.equal(data.body,'16px');assert.match(data.family,/Montserrat/);
 if(data.values)assert.equal(data.values,'16px');
 if(data.guide)assert.equal(data.guide,'12px');
 if(data.help)assert.equal(data.help,'14px');
 assert.equal(data.navVisible,width<=900);assert.equal(data.hiddenBroken,false);
 if(view==='work')assert.equal(data.formColumns.split(' ').length,width<=560?1:2);
 results.push({role,width,view,...data});
}
