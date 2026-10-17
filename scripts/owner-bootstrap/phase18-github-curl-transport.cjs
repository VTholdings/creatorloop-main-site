'use strict';
// Credentials travel only in child stdin; curl defaults, redirects and retries disabled.
const {execFileSync}=require('node:child_process');
function curlAuthenticatedOnce(url,{method='GET',headers={},body}={},run=execFileSync){
 if(!url.startsWith('https://api.github.com/')||!['GET','POST'].includes(method))throw Error('EXACT_GITHUB_TRANSPORT_REQUIRED');
 const lines=['silent','show-error','proto = "=https"','connect-timeout = 10','max-time = 15','retry = 0','max-redirs = 0','request = '+JSON.stringify(method),'url = '+JSON.stringify(url),'write-out = "\\n%{http_code}"'];
 for(const [name,value]of Object.entries(headers)){if(!/^[A-Za-z0-9-]+$/.test(name)||typeof value!=='string'||/[\r\n]/.test(value))throw Error('HEADER_FORMAT_REFUSED');lines.push('header = '+JSON.stringify(name+': '+value));}
 if(body!==undefined)lines.push('data-binary = '+JSON.stringify(body));
 let output;
 try{output=run('/usr/bin/curl',['-q','--config','-'],{input:lines.join('\n')+'\n',encoding:null,stdio:['pipe','pipe','pipe'],timeout:20000,maxBuffer:2004096});}
 catch(e){const safe=new Error('CURL_TRANSPORT_FAILED');const known={5:'CURL_PROXY_RESOLUTION_FAILED',6:'CURL_HOST_RESOLUTION_FAILED',7:'CURL_CONNECTION_FAILED',28:'CURL_TIMEOUT',35:'CURL_TLS_HANDSHAKE_FAILED',52:'CURL_EMPTY_REPLY',55:'CURL_SEND_FAILED',56:'CURL_RECEIVE_FAILED',60:'CURL_CERTIFICATE_REJECTED'};safe.safeCurlCode=known[e.status]||'CURL_LOCAL_OR_TRANSPORT_FAILURE';throw safe;}
 const cut=output.lastIndexOf(10),statusText=output.subarray(cut+1).toString('ascii');
 if(cut<0||!/^\d{3}$/.test(statusText)||Number(statusText)<100||cut>2000000)throw Error('CURL_RESPONSE_FRAMING_REFUSED');
 const status=Number(statusText),bytes=output.subarray(0,cut);
 return {ok:status>=200&&status<300,status,body:(async function*(){yield bytes;})()};
}
module.exports={curlAuthenticatedOnce};
