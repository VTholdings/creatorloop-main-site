import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateCustodySnapshot,compareCustodySnapshots} from '../../workers/training-managed/custody-snapshot.mjs';

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [original,recovered,...extra]=process.argv.slice(2);
  if(!original||extra.length)throw Error('EXACT_SAVED_CUSTODY_FILES_REQUIRED');
  const read=async path=>{
   const text=await readFile(resolve(path),'utf8');
   if(Buffer.byteLength(text)>32*1024*1024)throw Error('BOUNDED_OFFLINE_SNAPSHOT_REQUIRED');
   return JSON.parse(text);
  };
  const first=await read(original);
  const result=recovered?compareCustodySnapshots(first,await read(recovered)):validateCustodySnapshot(first);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('MANAGED CUSTODY SNAPSHOT REFUSED: exact complete snapshot, hashes, claims and immutable history are required; no restore performed.\n');process.exitCode=1;
 }
}
