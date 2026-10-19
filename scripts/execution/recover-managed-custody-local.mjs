import {readFile,lstat,open,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createManagedState} from '../../workers/training-managed/state.mjs';
import {recoverIsolatedCustody} from '../../workers/training-managed/custody-recovery.mjs';
import {dispatchHash} from '../lib/training-mediated-dispatcher.mjs';

export async function recoverSavedCustody({input,output,expectedHash}){
 const source=resolve(input),destination=resolve(output);
 if(source===destination||!/^[a-f0-9]{64}$/.test(expectedHash||''))throw Error('EXACT_RESTRICTED_FILES_AND_ORIGINAL_HASH_REQUIRED');
 const parent=await lstat(dirname(destination)),file=await lstat(source);
 if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077)!==0||parent.uid!==process.getuid()||!file.isFile()||file.isSymbolicLink()||file.nlink!==1||(file.mode&0o077)!==0||file.uid!==process.getuid()||file.size>32*1024*1024)throw Error('OWNER_RESTRICTED_SNAPSHOT_AND_DESTINATION_REQUIRED');
 const value=JSON.parse(await readFile(source,'utf8'));
 const snapshot=value.snapshot||value;
 if(value.receipt){const {receiptHash,...receipt}=value.receipt;if(receipt.snapshotHash!==snapshot.snapshotHash||receiptHash!==dispatchHash(receipt))throw Error('CUSTODY_EXPORT_RECEIPT_INVALID');}
 // Exclusive file creation; never overwrite an existing target or live database.
 const handle=await open(destination,'wx',0o600);await handle.close();let db;
 try{
  db=new DatabaseSync(destination);
  const sql={exec:(query,...args)=>{if(query.includes('CREATE TABLE')){db.exec(query);return {toArray:()=>[]};}const stmt=db.prepare(query),rows=query.startsWith('SELECT')?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows};}};
  const transactionSync=fn=>{db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  createManagedState({sql,transactionSync,bucket:{put:async()=>{throw Error('OFFLINE_RECOVERY_HAS_NO_REMOTE_STORAGE');}}});
  return recoverIsolatedCustody({snapshot,expectedHash,sql,transactionSync}).result;
 }catch(e){if(db){db.close();db=undefined;}await unlink(destination);throw e;}finally{db?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [input,output,expectedHash,...extra]=process.argv.slice(2);if(!input||!output||extra.length)throw Error('EXACT_OFFLINE_DRILL_ARGUMENTS_REQUIRED');
  process.stdout.write(JSON.stringify(await recoverSavedCustody({input,output,expectedHash}),null,2)+'\n');
 }catch{process.stderr.write('CUSTODY RECOVERY REFUSED: restricted input, new isolated target, original hash and exact reviewed schema required; no live executor changed.\n');process.exitCode=1;}
}
