'use strict';
const LIMIT=800000,MAX_ROLES=100;
// Read only existing role heads. Return no identities or business contents.
// The 2 KiB margin matches the writer's conservative admission check.
async function readProductionRoleCapacity(firestore){
 const access=await firestore.collection('companyAccess').where('companyId','==','danbridge').where('active','==',true).limit(MAX_ROLES+1).get();
 const candidates=access.docs.slice(0,MAX_ROLES).filter(doc=>['teacher','branch_manager'].includes(doc.data().role));
 const references=candidates.map(doc=>{const row=doc.data();return row.role==='branch_manager'?doc.ref:firestore.doc(`companies/danbridge/${row.canManageSchedule===true?'schedulerViews':'teacherViews'}/${doc.id}`)});
 const heads=references.length?await firestore.getAll(...references):[];
 let maximumBytes=0,roleCount=0,truncated=access.docs.length>MAX_ROLES;
 for(let i=0;i<heads.length;i++){
   const row=heads[i].data(),branch=candidates[i].data().role==='branch_manager';
   if(!row?.roleChunkManifest||!Object.hasOwn(row,branch?'scopedDb':'db'))continue;
   const bytes=Buffer.byteLength(JSON.stringify(row),'utf8')+2048;
   if(!Number.isSafeInteger(bytes)||bytes<2048)throw Error('Invalid role capacity sample');
   maximumBytes=Math.max(maximumBytes,bytes);roleCount++;
 }
 return{schema:'danbridge-role-capacity-v1',roleCount,maximumBytes,budgetBytes:LIMIT,ratio:maximumBytes/LIMIT,truncated};
}
module.exports={readProductionRoleCapacity};
