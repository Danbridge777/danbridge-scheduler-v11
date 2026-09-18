import {createHash} from 'node:crypto';
export const PRIVACY_RULE_BASELINES={
 'danbridge-d8877':'f76e51ec1eb6508d191244ad0c25775909c2d3644f2f571e00c041e7cf01b619',
 'danbridge-d8877-staging':'b5f1278ece549e34a0b5914518cc5706d3cb6ccc5e4ceb456abea927226a69ed'
};
const digest=s=>createHash('sha256').update(s).digest('hex');
// Patches only the notification read/ack predicate. All other Rules remain byte-identical.
export function patchNotificationPrivacyRules(source,project){
 if(!PRIVACY_RULE_BASELINES[project]||digest(source)!==PRIVACY_RULE_BASELINES[project])throw Error('Live Rules baseline drift');
 const before="(a.role=='branch_manager'&&n.recipientRole=='branch_manager'&&a.branchIds is list&&a.branchIds.size()>0&&n.branchIds==a.branchIds)";
 if(source.split(before).length!==2)throw Error('Notification predicate is not unique');
 const after=before.slice(0,-1)+"&&(a.get('hideFinancials',false)!=true||n.get('privacyScope','')=='schedule-only-v1'))";
 const candidate=source.replace(before,after);
 return {source:candidate,baseSha256:digest(source),candidateSha256:digest(candidate)};
}
