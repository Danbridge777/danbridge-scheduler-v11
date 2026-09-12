import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js';
import {canonicalJSONString} from './cloud-immutable-migration-backup.js';

// Recover intent, never permission: the normal planner must still compare
// current server revisions and preserve any concurrent conflict before writes.
export function recoverPendingOwnerIntent(rows,cloudDb,{environment,activationEpoch}={}){
 const pending=rows.filter(row=>!['confirmed','superseded'].includes(row.status));
 if(!pending.length)return null;
 const clone=value=>structuredClone(value),baselineDb=clone(cloudDb),localDb=clone(cloudDb),seen=new Set(),changes=[];
 const replace=(db,key,id,record)=>{const list=db[key];if(!Array.isArray(list))throw Error('Recovery collection missing');const index=list.findIndex(row=>String(row.id)===id);if(record===null){if(index>=0)list.splice(index,1)}else if(index>=0)list[index]=clone(record);else list.push(clone(record))};
 for(const entry of pending){
  const op=entry.operation,base=op?.baselineRecord,payload=op?.payload;
  if(!['pending','sending','failed','quarantined'].includes(entry.status)||!op||op.environment!==environment||op.companyId!=='danbridge'||op.activationEpoch!==activationEpoch||!FULL_RECORD_COLLECTIONS.includes(op.collection)||!base||base.environment!==environment||base.activationEpoch!==activationEpoch||base.recordId!==op.recordId||base.collection!==op.collection||!payload||payload.recordId!==op.recordId||payload.collection!==op.collection||payload.environment!==environment)throw Error('Pending Owner recovery identity mismatch');
  if(op.collection==='changes'){
   if(op.type!=='create'||payload.deleted||base.exists)throw Error('Pending history recovery is not append-only');
   if(base.companyId!=='danbridge'||payload.companyId!=='danbridge')throw Error('Pending history recovery company mismatch');
   changes.push({recordId:op.recordId,record:clone(payload.record)});continue;
  }
  if(base.companyId!=='danbridge'||payload.companyId!=='danbridge'||String(payload.record?.id)!==op.recordId||(base.exists&&String(base.record?.id)!==op.recordId))throw Error('Pending Owner recovery record mismatch');
  const key=op.collection+'/'+op.recordId;
  if(!seen.has(key)){replace(baselineDb,op.collection,op.recordId,base.exists&&!base.deleted?base.record:null);seen.add(key)}
  replace(localDb,op.collection,op.recordId,payload.deleted?null:payload.record);
 }
 // Replayed receipts may already be present in the server's append-only log.
 const known=new Map(materializeFullRecordDb(cloudDb).changes.map(row=>[row.recordId,canonicalJSONString(row.record)])),appended=[];
 for(const row of changes){const key=canonicalJSONString(row.record);if(known.has(row.recordId)){if(known.get(row.recordId)!==key)throw Error('Pending history recovery identity collision')}else{known.set(row.recordId,key);appended.push(row.record)}}
 localDb.changes=[...appended.reverse(),...localDb.changes];
 return{baselineDb,localDb,pendingCount:pending.length};
}
