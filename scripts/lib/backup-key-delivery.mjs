import {requireBackupKey} from './backup-envelope.mjs';
// Report only permitted delivery/validation booleans. Never return the value,
// exact length, characters, encoding, fingerprint or encryption output.
export function inspectBackupKeyDelivery(value,contextPresent){
 const processValuePresent=typeof value==='string'&&value.length>0;
 const minimumLengthMet=processValuePresent&&value.length>=32;
 const maximumLengthMet=processValuePresent&&value.length<=1024;
 const secretContextPresent=contextPresent==='true';
 let validForBackup=false;try{requireBackupKey(value);validForBackup=true;}catch{}
 const consistent=['true','false'].includes(contextPresent)&&secretContextPresent===processValuePresent;
 const code=!consistent?'SECRET_CONTEXT_PROCESS_MISMATCH':!processValuePresent?'SECRET_NOT_DELIVERED':!minimumLengthMet?'SECRET_BELOW_MINIMUM':!maximumLengthMet?'SECRET_ABOVE_MAXIMUM':'SECRET_DELIVERY_AND_VALIDATION_PASS';
 return {secretContextPresent,processValuePresent,minimumLengthMet,maximumLengthMet,validForBackup,contextConsistent:consistent,code};
}
