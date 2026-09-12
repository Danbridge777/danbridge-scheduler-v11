// Keep these equality constraints aligned with the server Rules. Filtering
// only after download does not protect historical notifications after a role
// reduction. Never fall back to an email-only query for non-owners.
export function scheduleNotificationReadFilters({email,role,teacherId='',branchIds=[],canManageSchedule=false}={}){
 if(typeof email!=='string'||!email||email!==email.trim().toLowerCase())throw Error('通知收件者無效');
 const filters=[['recipientEmail','==',email]];
 if(role==='owner')return filters;
 if(role==='teacher'&&canManageSchedule===true)return [...filters,['recipientRole','==','scheduler']];
 if(role==='teacher'&&typeof teacherId==='string'&&teacherId)return [...filters,['recipientRole','==','teacher'],['teacherId','==',teacherId]];
 if(role==='branch_manager'&&Array.isArray(branchIds)&&branchIds.length&&branchIds.every(id=>typeof id==='string'&&id)&&new Set(branchIds).size===branchIds.length){
  // Preserve the authoritative access document's array order, as publishers
  // do. Do not turn this into array-contains-any (which permits wider scopes).
  return [...filters,['recipientRole','==','branch_manager'],['branchIds','==',[...branchIds]]];
 }
 throw Error('通知權限範圍無效');
}

export function scheduleNotificationMatchesFilters(notification,filters){
 return filters.every(([field,operator,value])=>operator==='=='&&JSON.stringify(notification?.[field])===JSON.stringify(value));
}
