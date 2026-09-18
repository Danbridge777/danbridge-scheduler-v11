'use strict';
const PROJECT='danbridge-d8877-staging';
// The current daily envelope overrides the immutable baseline, including a
// tombstone. Read inside the leave transaction so a concurrent teacher removal
// cannot authorize a new leave against a stale teacher record.
function stagingTeacherReader(firestore){
 if(firestore.projectId!==PROJECT)throw Error('請假環境不符');
 return async(tx,teacherId)=>{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(teacherId))throw Error('老師識別無效');
  const fence=(await tx.get(firestore.doc('stagingRecordSyncV1PermanentFences/danbridge'))).data();
  const epoch=fence?.targetV2Epoch;
  if(fence?.projectId!==PROJECT||fence?.companyId!=='danbridge'||fence?.state!=='permanently-fenced-after-atomic-v2-structural-activation'||typeof epoch!=='string'||!/^[A-Za-z0-9_.:-]{8,128}$/.test(epoch))throw Error('請假權威資料環境無效');
  const daily=await tx.get(firestore.doc(`stagingActiveRecordV2Records/danbridge/epochs/${epoch}/collections/teachers/records/${teacherId}`));
  const envelope=daily.exists?daily.data():(await tx.get(firestore.doc(`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}/collections/teachers/records/${teacherId}`))).data();
  if(envelope?.collection!=='teachers'||envelope?.activationEpoch!==epoch||envelope?.companyId!=='danbridge'||envelope?.environment!=='staging')throw Error('老師權威資料識別不符');
  return envelope;
 };
}
module.exports={stagingTeacherReader};
