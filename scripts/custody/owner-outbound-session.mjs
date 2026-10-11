import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createOwnerOutboundResponder} from '../lib/training-owner-outbound-client.mjs';
import {validatePublicVerifierKeys} from '../lib/creatorloop-training-signer.mjs';
const [adapterPath,expectedHash]=process.argv.slice(2);
if(!adapterPath||!/^([a-f0-9]{64})$/.test(expectedHash||''))throw Error('Usage: node scripts/custody/owner-outbound-session.mjs /absolute/Owner-only/pinned-adapter.mjs exact-sha256');
if(!adapterPath.startsWith('/'))throw Error('Absolute Owner adapter path required');
const stat=await lstat(adapterPath);
if(stat.isSymbolicLink()||!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)||(stat.mode&0o200)||await realpath(adapterPath)!==adapterPath)throw Error('Immutable Owner-only adapter required (0400; no symlink)');
const data=await readFile(adapterPath);if(createHash('sha256').update(data).digest('hex')!==expectedHash)throw Error('Owner private adapter integrity mismatch');
// Adapter is Owner-installed only; no dynamic repository update, listener or fallback.
const adapter=await import(pathToFileURL(adapterPath).href);
if(typeof adapter.pollOwnerPending!=='function')throw Error('Owner outbound authenticated polling port not installed');
const keys=await validatePublicVerifierKeys(adapter.publicKeys);
const responder=createOwnerOutboundResponder({...adapter,publicKeys:keys});
const started=Date.now(),deadline=started+30*60*1000;
const seen=new Set();
console.log('Owner-controlled outbound session started; no inbound listener. Stop with Ctrl-C. Maximum 30 minutes.');
while(Date.now()<deadline){
 let entries;try{entries=await adapter.pollOwnerPending();}catch{throw Error('Owner outbound poll refused; private error redacted');}
 if(!Array.isArray(entries)||entries.length>20)throw Error('Bounded pending response required');
 for(const pending of entries){if(seen.has(pending.id))continue;seen.add(pending.id);try{await responder(pending);}catch{console.error('Owner response refused or unresolved; no retry. Review restricted local evidence.');}}
 await new Promise(r=>setTimeout(r,400));
}
console.log('Owner session closed; managed execution waits fail closed until a new approved session.');
