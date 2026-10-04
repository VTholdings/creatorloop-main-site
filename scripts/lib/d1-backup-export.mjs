import {createHash} from 'node:crypto';
const account='2a3b96a0b37850cd03107131baa66b6d';
const ids={TRAINING:'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0',PRODUCTION:'c4993a97-5835-4c6c-af06-7020fa8d4f2a'};
export const fail=code=>{throw Error(code);};
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function windowApproved(reviews){return Array.isArray(reviews)&&reviews.some(r=>r.state==='approved'&&r.user?.login?.toLowerCase()==='creatorloopzone'&&r.comment?.trim()==='BACKUP_WINDOW_NO_ACTIVE_OPERATORS'&&r.environments?.some(e=>e.name==='creatorloop-acceptance'));}
export function validateDownload(value){
 let u;try{u=new URL(value);}catch{fail('EXPORT_DOWNLOAD_TARGET_REFUSED');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!/^([a-z0-9-]+\.)*r2\.cloudflarestorage\.com$/.test(u.hostname))fail('EXPORT_DOWNLOAD_TARGET_REFUSED');
 return u.href;
}
async function bounded(response,limit){
 const reader=response.body?.getReader();if(!reader)fail('EXPORT_RESPONSE_EMPTY');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)fail('EXPORT_SIZE_LIMIT');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks);
}
export async function exportDatabase({token,targets,environment,fetcher=fetch,now=()=>new Date().toISOString(),pause=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>Date.now(),onEvidence=()=>{}}){
 const pin=targets?.[environment?.toLowerCase()];
 if(!token||targets.accountId!==account||pin?.databaseId!==ids[environment]||targets.training?.databaseId!==ids.TRAINING||targets.production?.databaseId!==ids.PRODUCTION)fail('BACKUP_TARGET_REFUSED');
 const path='/accounts/'+account+'/d1/database/'+ids[environment]+'/export';
 const evidence={environment,databaseId:ids[environment],startedAt:now(),requests:[],status:'EXPORT_PENDING'};
 onEvidence(evidence);
 const started=clock();let bookmark;
 for(let poll=0;poll<180;poll++){
  if(clock()-started>300000)fail('EXPORT_POLL_DEADLINE_NO_RESTART');
  const body={output_format:'polling',...(bookmark?{current_bookmark:bookmark}:{})};
  let response;try{response=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('EXPORT_OUTCOME_UNKNOWN_NO_RESTART');}
  evidence.requests.push({method:'POST',path,status:response.status,phase:poll===0?'INITIATE':'POLL'});
  let result;try{result=JSON.parse((await bounded(response,4000000)).toString());}catch{fail('EXPORT_RESPONSE_INVALID_NO_RESTART');}
  if(!response.ok||result.success!==true||result.result?.success===false||result.result?.status==='error')fail('EXPORT_DENIED_OR_FAILED_NO_RESTART');
  const data=result.result;
  if(data?.status==='complete'){
   const url=validateDownload(data.result?.signed_url);
   let download;try{download=await fetcher(url,{method:'GET',headers:{Accept:'application/sql'},redirect:'error',signal:AbortSignal.timeout(120000)});}catch{fail('EXPORT_DOWNLOAD_FAILED');}
   if(!download.ok)fail('EXPORT_DOWNLOAD_FAILED');
   const bytes=await bounded(download,64*1024*1024);if(!bytes.length)fail('EXPORT_RESPONSE_EMPTY');
   evidence.completedAt=now();evidence.sha256=digest(bytes);evidence.bytes=bytes.length;evidence.status='EXPORT_CAPTURED';
   evidence.download={method:'GET',status:download.status,credentialForwarded:false};
   return {bytes,evidence};
  }
  if(typeof data?.at_bookmark!=='string'||!data.at_bookmark.length||data.at_bookmark.length>1024)fail('EXPORT_BOOKMARK_MISSING_NO_RESTART');
  if(bookmark&&bookmark!==data.at_bookmark)fail('EXPORT_BOOKMARK_CHANGED_NO_RESTART');
  bookmark=data.at_bookmark;await pause(1000);
 }
 fail('EXPORT_POLL_LIMIT_NO_RESTART');
}
