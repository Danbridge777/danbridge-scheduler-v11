'use strict';

// Coalesce the adapter's synchronous read phase into one native BatchGet.
// This cache lives for ONE transaction attempt only, never across requests or
// retries. Supplied snapshots must have been read by that same transaction.
function createProductionTransactionReader(firestore,transaction,snapshots=[]){
 const reads=new Map(snapshots.map(snapshot=>[snapshot.ref.path,Promise.resolve(snapshot)]));
 let queued=[],scheduled=false;
 return path=>{
  if(reads.has(path))return reads.get(path);
  const result=new Promise((resolve,reject)=>queued.push({path,resolve,reject}));
  reads.set(path,result);
  if(!scheduled){scheduled=true;queueMicrotask(async()=>{
   const batch=queued;queued=[];scheduled=false;
   try{
    const snapshots=await transaction.getAll(...batch.map(row=>firestore.doc(row.path))),byPath=new Map(snapshots.map(snapshot=>[snapshot.ref.path,snapshot]));
    if(batch.some(row=>!byPath.has(row.path)))throw Error('正式交易讀回缺漏，禁止提交');
    for(const row of batch)row.resolve(byPath.get(row.path));
   }catch(error){for(const row of batch)row.reject(error);}
  });}
  return result;
 };
}
module.exports={createProductionTransactionReader};
