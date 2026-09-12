'use strict';

// Re-read authorization inside the same transaction as the acknowledgment.
// Knowing an old notification ID is not authority after revocation or narrowing.
async function acknowledgeScheduleNotifications({firestore,actor,notificationIds,serverTimestamp}){
 const [{assertProductionNotificationRecipient},{scheduleNotificationReadFilters,scheduleNotificationMatchesFilters}]=await Promise.all([
  import('../js/core/production-notification-policy.js'),
  import('../js/core/schedule-notification-read-scope.js')
 ]);
 return firestore.runTransaction(async transaction=>{
  const accessSnapshot=await transaction.get(firestore.doc('companyAccess/'+actor.email));
  const access=accessSnapshot.data();
  if(!accessSnapshot.exists||access?.active!==true||access.companyId!=='danbridge')throw Error('通知確認帳號未通過目前公司權限');
  const filters=scheduleNotificationReadFilters({email:actor.email,role:access.role,teacherId:access.teacherId,branchIds:access.branchIds,canManageSchedule:access.canManageSchedule});
  const refs=notificationIds.map(id=>firestore.doc('companies/danbridge/scheduleNotifications/'+id));
  const rows=await Promise.all(refs.map(ref=>transaction.get(ref)));
  for(const row of rows){
   if(!row.exists)throw Error('找不到通知，請重新整理');
   assertProductionNotificationRecipient(row.data(),actor);
   if(!scheduleNotificationMatchesFilters(row.data(),filters))throw Error('只能確認目前角色與校區範圍的通知');
  }
  let updatedCount=0,alreadyReadCount=0;
  rows.forEach((row,index)=>{
   if(row.data().read===true){alreadyReadCount++;return}
   transaction.update(refs[index],{read:true,acknowledgedAt:serverTimestamp(),acknowledgedBy:actor.uid});updatedCount++;
  });
  return{updatedCount,alreadyReadCount};
 });
}
module.exports={acknowledgeScheduleNotifications};
