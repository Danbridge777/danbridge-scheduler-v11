import {createHash} from 'node:crypto';

export const NOTIFICATION_SCOPE_BASE_SHA256='2a397d540d36487ed15a70a6168ebebced40888e95a0cdebc996789637b78852';
const digest=value=>createHash('sha256').update(value).digest('hex');
const oldBlock='match/companies/{companyId}/scheduleNotifications/{notificationId}{allow read:if isOwner()||(activeMember(companyId)&&resource.data.recipientEmail==emailKey());}';
const newBlock=`match/companies/{companyId}/scheduleNotifications/{notificationId}{
 function notificationCurrentScope(n){
  let a=access();
  return activeMember(companyId)&&n.recipientEmail==emailKey()&&(
   (a.role=='teacher'&&a.get('canManageSchedule',false)==true&&n.recipientRole=='scheduler')
   ||(a.role=='teacher'&&a.get('canManageSchedule',false)!=true&&n.recipientRole=='teacher'&&n.teacherId==a.teacherId)
   ||(a.role=='branch_manager'&&n.recipientRole=='branch_manager'&&a.branchIds is list&&a.branchIds.size()>0&&n.branchIds==a.branchIds));
 }
 allow read:if isOwner()||notificationCurrentScope(resource.data);
}`;

// Preparation only; no deployment. Pin the read-back production baseline,
// preserve every other rule, and retain the server-only write prohibition.
export function patchProductionNotificationScopeRules(source){
 if(typeof source!=='string'||digest(source)!==NOTIFICATION_SCOPE_BASE_SHA256)throw Error('Notification Rules baseline drift');
 if(source.split(oldBlock).length!==2)throw Error('Notification Rules block mismatch');
 const candidate=source.replace(oldBlock,newBlock);
 return {source:candidate,baseSha256:digest(source),afterSha256:digest(candidate)};
}

export const STAGING_NOTIFICATION_SCOPE_BASE_SHA256='287caf3e92a388f9fb541ad065d78e7435ecb72f83db05308c213babec5fb85d';
export function patchStagingNotificationScopeRules(source){
 if(typeof source!=='string'||digest(source)!==STAGING_NOTIFICATION_SCOPE_BASE_SHA256)throw Error('Staging notification Rules baseline drift');
 const before="match/companies/{companyId}/scheduleNotifications/{notificationId}{allow read:if f3()||(fd(companyId)&&resource.data.recipientEmail==f1());allow create,delete:if f3()&&fb(companyId);allow update:if f3()||(fd(companyId)&&resource.data.recipientEmail==f1()&&request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read','acknowledgedAt','acknowledgedBy']));}";
 if(source.split(before).length!==2)throw Error('Staging notification Rules block mismatch');
 const scope=newBlock.slice(newBlock.indexOf(' function'),newBlock.indexOf(' allow read:')).replace('activeMember(companyId)','fd(companyId)').replace('emailKey()','f1()');
 const after=before.replace('{allow read:','{'+scope+'allow read:').replaceAll('fd(companyId)&&resource.data.recipientEmail==f1()','notificationCurrentScope(resource.data)');
 const candidate=source.replace(before,after);
 return {source:candidate,baseSha256:digest(source),afterSha256:digest(candidate)};
}
