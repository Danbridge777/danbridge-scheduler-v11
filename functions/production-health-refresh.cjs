'use strict';
const PATH='companies/danbridge/systemHealth/ownerAlert';
const maxAgeMs=45*60*1000;
const millis=value=>typeof value?.toMillis==='function'?value.toMillis():Date.parse(value||'');

// Independent of maintenance: reads health inputs and writes ONE health
// snapshot. No deletion, notification acknowledgment or lesson capability.
async function refreshProductionHealth({firestore,primaryOwnerEmail,readProtection,serverTimestamp,now=Date.now}){
 if(!firestore||typeof primaryOwnerEmail!=='string'||!primaryOwnerEmail.includes('@')||typeof readProtection!=='function'||typeof serverTimestamp!=='function')throw Error('Invalid health dependencies');
 const startedAt=now(),{isResolvedProductionHealthError,buildProductionHealthAssessment}=await import('../js/core/production-maintenance-policy.js');
 const errorsQuery=firestore.collection('companies/danbridge/errorEvents').where('occurredAt','>=',new Date(startedAt-86400000)).select('area','code','release').limit(501);
 const pendingQuery=firestore.collection('companies/danbridge/scheduleRequests').where('status','==','pending');
 const unreadQuery=firestore.collection('companies/danbridge/scheduleNotifications').where('recipientEmail','==',primaryOwnerEmail).where('read','==',false);
 const [errors,pending,unread,protection]=await Promise.all([errorsQuery.get(),pendingQuery.count().get(),unreadQuery.count().get(),readProtection()]);
 const count=row=>{const value=row.data()?.count;if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid health aggregate count');return value};
 const recentErrors=errors.docs.filter(row=>!isResolvedProductionHealthError(row.data())).length,checkedAt=now();
 const health=buildProductionHealthAssessment({runId:new Date(startedAt).toISOString(),checkedAt,recentErrors,pendingRequests:count(pending),unreadNotifications:count(unread),...protection});
 const payload={...health,checkedAt:new Date(checkedAt),maxAgeMs,sampleStartedAt:new Date(startedAt),recentErrorsTruncated:errors.docs.length===501,formalDataWrites:0,updatedAt:serverTimestamp()};
 // Saturation is never a healthy result, even if known resolved rows occupied
 // the whole bounded sample and hid a newer unresolved error.
 if(payload.recentErrorsTruncated){payload.state='attention';payload.alerts=[...payload.alerts,'近 24 小時錯誤樣本達上限，需進一步檢查']}
 const ref=firestore.doc(PATH);
 return firestore.runTransaction(async tx=>{
  const previous=(await tx.get(ref)).data();
  if(millis(previous?.sampleStartedAt||previous?.checkedAt)>startedAt)return{state:'superseded',formalDataWrites:0,healthWrites:0};
  tx.set(ref,payload,{merge:false});
  return{state:payload.state,checkedAt:payload.checkedAt,metrics:payload.metrics,alerts:payload.alerts,reminders:payload.reminders,formalDataWrites:0,healthWrites:1};
 });
}
module.exports={refreshProductionHealth};
