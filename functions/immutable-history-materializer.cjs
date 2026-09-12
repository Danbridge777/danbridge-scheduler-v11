'use strict';
const {canonicalJson}=require('./native-canonical-sha256.cjs');

// Runtime-private, weak, identity-only memo. Call ONLY for native snapshots
// returned by the transaction history version reader: that reader rechecks the
// complete membership and updateTime in the current transaction on every call.
// No ID/revision supplied by a browser can select a remembered payload.
function createImmutableHistoryMaterializer(){
 const snapshots=new WeakMap(),canonicalRecords=new WeakMap(),ownedRows=new WeakSet();
 const freeze=(value,seen=new WeakSet())=>{
  if(!value||typeof value!=='object'||seen.has(value))return;
  seen.add(value);
  for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))){
   if(!('value' in descriptor))throw Error('History payload cannot contain accessors');
   freeze(descriptor.value,seen);
  }
  Object.freeze(value);
 };
 return Object.freeze({
  materialize(snapshot){
   if(!snapshot?.exists||typeof snapshot.data!=='function'||!snapshot.updateTime)throw Error('Invalid native history snapshot');
   if(snapshots.has(snapshot))return snapshots.get(snapshot);
   // Native data() returns a detached graph. Freezing it does not change the
   // SDK snapshot or the independent copies used by the mutation adapter.
   const data=snapshot.data();if(!data||typeof data!=='object')throw Error('Invalid history payload');freeze(data);ownedRows.add(data);snapshots.set(snapshot,data);return data;
  },
  seedHashMemo(rows,memo){
   if(!(memo instanceof WeakMap))throw Error('Invalid history hash memo');
   for(const {data} of rows){
    const record=data?.record;
    if(!ownedRows.has(data)||!record||!Object.isFrozen(data)||!Object.isFrozen(record))throw Error('History hash reuse requires immutable validated records');
    let canonical=canonicalRecords.get(record);
    if(canonical===undefined){canonical=canonicalJson(record);canonicalRecords.set(record,canonical)}
    memo.set(record,canonical);
   }
  }
 });
}
module.exports={createImmutableHistoryMaterializer};
