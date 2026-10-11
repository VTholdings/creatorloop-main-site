import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
test('new Owner relay runs in native Workers runtime and empty configuration rejects without network, signing or execution state',async()=>{
 const root=process.env.OWNER_RELAY_TOOLS||'/home/ubuntu/step18-managed-tools';
 const bundle=process.env.OWNER_RELAY_BUNDLE||'/home/ubuntu/step18-owner-outbound-evidence/build';
 const {Miniflare}=await import(pathToFileURL(resolve(root,'node_modules/miniflare/dist/src/index.js')));
 let outbound=0;
 const mf=new Miniflare({rootPath:bundle,modules:true,modulesRoot:bundle,scriptPath:resolve(bundle,'owner-approval.js'),compatibilityDate:'2025-10-08',compatibilityFlags:['nodejs_compat'],bindings:{OWNER_MAILBOX_CONFIG_JSON:'{}'},durableObjects:{MAILBOX_STATE:{className:'OwnerApprovalMailbox',useSQLite:true}},outboundService:async()=>{outbound++;throw Error('LOCAL TEST NO NETWORK');}});
 try{const r=await mf.dispatchFetch('https://owner.example.test/v1/read',{method:'POST',body:'{}'});assert.equal(r.status,403);assert.equal(outbound,0);assert.match(await r.text(),/refused/);}finally{await mf.dispose();}
});
