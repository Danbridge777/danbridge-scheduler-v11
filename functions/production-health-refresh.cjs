'use strict';
const PATH='companies/danbridge/systemHealth/ownerAlert';
const maxAgeMs=45*60*1000;
const millis=value=>typeof value?.toMillis==='function'?value.toMillis():Date.parse(value||'');

// Independent of maintenance: reads health inputs and writes ONE health
// snapshot. No deletion, notification acknowledgment or lesson capability.
async function refreshProductionHealth({firestore,primaryOwnerEmail,readProtection,readRoleCapacity=()=>require('./production-role-capacity.cjs').readProductionRoleCapacity(firestore),serverTimestamp,now=Date.now}){
 if(!firestore||typeof primaryOwnerEmail!=='string'||!primaryOwnerEmail.includes('@')||typeof readProtection!=='function'||typeof serverTimestamp!=='function')throw Error('Invalid health dependencies');
 const startedAt=now(),{isResolvedProductionHealthError,buildProductionHealthAssessment}=await import('../js/core/production-maintenance-policy.js');
 const errorsQuery=firestore.collection('companies/danbridge/errorEvents').where('occurredAt','>=',new Date(startedAt-86400000)).select('area','code','release').limit(501);
 const pendingQuery=firestore.collection('companies/danbridge/scheduleRequests').where('status','==','pending');
 const unreadQuery=firestore.collection('companies/danbridge/scheduleNotifications').where('recipientEmail','==',primaryOwnerEmail).where('read','==',false);
 const [errors,pending,unread,protection,capacity]=await Promise.all([errorsQuery.get(),pendingQuery.count().get(),unreadQuery.count().get(),readProtection(),readRoleCapacity()]);
 const count=row=>{const value=row.data()?.count;if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid health aggregate count');return value};
 const recentErrors=errors.docs.filter(row=>!isResolvedProductionHealthError(row.data())).length,checkedAt=now();
 const health=buildProductionHealthAssessment({runId:new Date(startedAt).toISOString(),checkedAt,recentErrors,pendingRequests:count(pending),unreadNotifications:count(unread),...protection});
 const payload={...health,checkedAt:new Date(checkedAt),maxAgeMs,sampleStartedAt:new Date(startedAt),recentErrorsTruncated:errors.docs.length===501,formalDataWrites:0,updatedAt:serverTimestamp()};
 if(capacity?.schema!=='danbridge-role-capacity-v1'||!Number.isSafeInteger(capacity.maximumBytes)||capacity.maximumBytes<0||capacity.budgetBytes!==800000||typeof capacity.truncated!=='boolean'||!Number.isSafeInteger(capacity.roleCount)||capacity.roleCount<0)throw Error('Invalid role capacity assessment');
 payload.roleCapacity=capacity;
 const ratio=capacity.maximumBytes/capacity.budgetBytes;
 if(capacity.truncated||ratio>=0.9){payload.state='attention';payload.alerts=[...payload.alerts,capacity.truncated?'角色容量樣本達上限，需進一步檢查':'角色相容資料已達容量安全預算的 90%，需安排容量遷移']}
 else if(ratio>=0.7)payload.reminders=[...payload.reminders,`角色相容資料使用約 ${Math.ceil(ratio*100)}% 安全預算，請安排容量遷移`];
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
