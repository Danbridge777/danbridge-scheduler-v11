'use strict';
const {randomUUID}=require('node:crypto');
const COMMIT_LEASE_PATH='companies/danbridge/productionRuntimeLocks/recordCommit';
const busy=()=>Object.assign(new Error('正式同步正在依序提交，操作保留待重送'),{code:14});

// Admission only: all existing authorization, full-data verification and native
// Firestore transactions remain authoritative. The token is read inside every
// commit transaction, so expired/replaced holders cannot commit over a new one.
async function withProductionCommitLease(firestore,work,{clock=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random,maxWaitMs=5000,leaseMs=60000}={}){
 const ref=firestore.doc(COMMIT_LEASE_PATH),token=randomUUID(),started=clock();
 let acquired=null;
 while(!acquired){
  const value={schema:'danbridge-production-commit-lease-v1',token,expiresAtMs:clock()+leaseMs};
  try{acquired=await ref.create(value);}
  catch(error){
   if(error?.code!==6){
    // Recover a create whose response was lost, but only for our own token.
    if([4,13,14].includes(error?.code)){
     const saved=await ref.get().catch(()=>null);
     if(saved?.exists&&saved.data()?.token===token){acquired={writeTime:saved.updateTime};continue;}
    }
    throw error;
   }
   if(clock()-started>=maxWaitMs)throw busy();
   const existing=await ref.get(),data=existing.data();
   if(existing.exists&&data?.schema==='danbridge-production-commit-lease-v1'&&Number.isFinite(data.expiresAtMs)&&data.expiresAtMs<=clock()){
    try{acquired=await ref.update(value,{lastUpdateTime:existing.updateTime});}
    catch(race){if(![5,9].includes(race?.code))throw race;}
   }
   if(!acquired)await sleep(20+Math.floor(random()*20));
  }
 }
 try{
  return await work({assertHeld:async transaction=>{
   const snapshot=await transaction.get(ref),data=snapshot.data();
   if(!snapshot.exists||data?.token!==token||data.expiresAtMs<=clock())throw busy();
  }});
 }finally{
  // A release cannot delete a successor's lease. Never turn a committed
  // operation into a false failure solely because cleanup lost its response.
  for(let attempt=0;attempt<3;attempt++){
   try{await ref.delete({lastUpdateTime:acquired.writeTime});break;}
   catch(error){if([5,9].includes(error?.code))break;if(attempt===2){console.warn('PRODUCTION_COMMIT_LEASE_RELEASE_PENDING',{code:error?.code||'unknown'});break;}await sleep(20*(attempt+1));}
  }
 }
}
module.exports={withProductionCommitLease,COMMIT_LEASE_PATH};
