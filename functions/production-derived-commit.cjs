'use strict';

// All inputs are read independently before any write. Starting the existing
// view reads alongside the authority reads removes a serial network round trip;
// the caller still validates all 16 collections and the transactional fence.
async function readProductionRoleViewInputs(firestore,collectionNames){
 const [safetySnapshot,accessSnapshot,teacherSnapshot,schedulerSnapshot,metaSnapshot,...collectionSnapshots]=await Promise.all([
  firestore.doc('companies/danbridge/productionRecordRuntime/safety').get(),
  firestore.collection('companyAccess').where('companyId','==','danbridge').get(),
  firestore.collection('companies/danbridge/teacherViews').get(),
  firestore.collection('companies/danbridge/schedulerViews').get(),
  firestore.collection('companies/danbridge/lessonMeta').get(),
  ...collectionNames.map(name=>firestore.collection(`productionFullRecordShadows/danbridge/collections/${name}/records`).get())
 ]);
 return{safetySnapshot,accessSnapshot,teacherSnapshot,schedulerSnapshot,metaSnapshot,collectionSnapshots};
}

function accessIdentity(value){
 if(!value)return null;
 return JSON.stringify({email:value.email||'',companyId:value.companyId||'',role:value.role||'',active:value.active===true,teacherId:value.teacherId||'',branchIds:[...(value.branchIds||[])].map(String).sort(),canManageSchedule:value.canManageSchedule===true,readOnly:value.readOnly===true,revision:value.revision??null});
}

// The authoritative head and access scope are part of every write transaction.
// A delayed publisher must never overwrite views after a newer save or role change.
async function commitProductionDerivedWrites(firestore,writes,{sourceHash,accessSnapshots=[]}={}){
 if(!/^record-v1:[a-f0-9]{64}$/.test(String(sourceHash||'')))throw new Error('衍生發布缺少有效權威版本');
 const safetyRef=firestore.doc('companies/danbridge/productionRecordRuntime/safety');
 const expectedAccess=accessSnapshots.map(row=>({ref:row.ref,identity:accessIdentity(row.exists?row.data():null)}));
 const chunks=[];
 for(let offset=0;offset<writes.length;offset+=400)chunks.push(writes.slice(offset,offset+400));
 for(let offset=0;offset<chunks.length;offset+=3){
  await Promise.all(chunks.slice(offset,offset+3).map(chunk=>firestore.runTransaction(async transaction=>{
   const [safetySnapshot,...accessRows]=await transaction.getAll(safetyRef,...expectedAccess.map(row=>row.ref));
   const safety=safetySnapshot.exists?safetySnapshot.data():null;
   if(!safety||safety.state!=='active'||safety.readAllowed!==true||safety.writeAllowed!==true||safety.recordDataHash!==sourceHash)throw new Error('衍生發布權威版本已改變，未寫入舊視圖');
   if(accessRows.some((row,index)=>accessIdentity(row.exists?row.data():null)!==expectedAccess[index].identity))throw new Error('衍生發布角色範圍已改變，未寫入舊視圖');
   for(const write of chunk){if(write.type==='delete')transaction.delete(write.ref);else transaction.set(write.ref,write.value,write.options||{merge:false})}
  })));
 }
 return writes.length;
}

module.exports={commitProductionDerivedWrites,readProductionRoleViewInputs};
