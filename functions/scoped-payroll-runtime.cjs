'use strict';
const {calculateScopedPayroll}=require('./scoped-payroll-calculator.cjs');
const PRIMARY_OWNER='a0965487920@gmail.com';
const fail=(message,code='failed-precondition')=>{throw Object.assign(Error(message),{code})};
function authorizeScope(identity,access,scope){
 if(!identity?.uid||identity.emailVerified!==true||identity.appVerified!==true)fail('有效登入與 App Check 必填','unauthenticated');
 const email=String(identity.email||'').trim().toLowerCase();
 if(!['hexi','art_museum','unassigned'].includes(scope))fail('校區範圍無效','invalid-argument');
 if(email===PRIMARY_OWNER)return;
 if(access?.active!==true||access.companyId!=='danbridge')fail('帳號已停用','permission-denied');
 if(access.role==='owner')return;
 if(access.role!=='branch_manager'||access.canViewBranchFinance!==true||!Array.isArray(access.branchIds)||!access.branchIds.includes(scope))fail('不可讀取此校區財務','permission-denied');
}
function recordRows(snapshot,collection,environment,epoch){
 return snapshot.docs.map(doc=>{
  const r=doc.data();
  if(r?.companyId!=='danbridge'||r.collection!==collection||r.environment!==environment||String(r.recordId)!==doc.id||typeof r.deleted!=='boolean'||(epoch&&r.activationEpoch!==epoch))fail('財務來源識別不符');
  if(!r.deleted&&String(r.record?.id)!==doc.id)fail('財務紀錄識別不符');
  return {id:doc.id,...r};
 });
}
// Read-only transaction: access, authority fence, monthly lessons, rate history
// and approved annual leave share one snapshot. No business writes or role changes.
async function readScopedPayroll({firestore,identity,input,environment,now=()=>Date.now()}){
 if(!input||Object.keys(input).some(k=>!['month','scope'].includes(k))||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month||''))fail('月份格式無效','invalid-argument');
 if(!['production','staging'].includes(environment))fail('財務環境無效');
 if(!identity?.uid||identity.emailVerified!==true||identity.appVerified!==true)fail('需要有效登入','unauthenticated');
 const email=String(identity.email||'').trim().toLowerCase();
 if(!email||email.includes('/'))fail('登入識別無效','unauthenticated');
 const {month,scope}=input;
 return firestore.runTransaction(async tx=>{
  const access=(await tx.get(firestore.doc(`companyAccess/${email}`))).data();
  authorizeScope(identity,access,scope);
  let epoch='',sourceRevision;
  if(environment==='production'){
   const safety=(await tx.get(firestore.doc('companies/danbridge/productionRecordRuntime/safety'))).data();
   if(safety?.state!=='active'||safety.readAllowed!==true||!safety.recordDataHash)fail('財務權威來源尚未就緒');
   sourceRevision=safety.recordDataHash;
  }else{
   const fence=(await tx.get(firestore.doc('stagingRecordSyncV1PermanentFences/danbridge'))).data();
   epoch=fence?.targetV2Epoch;
   if(fence?.projectId!=='danbridge-d8877-staging'||fence.companyId!=='danbridge'||fence.state!=='permanently-fenced-after-atomic-v2-structural-activation'||!/^[A-Za-z0-9_.:-]{8,128}$/.test(epoch||''))fail('測試財務權威來源尚未就緒');
   const head=(await tx.get(firestore.doc(`stagingActiveRecordV2Heads/danbridge/epochs/${epoch}`))).data();
   if(!head?.headHash)fail('測試財務版本未就緒');sourceRevision=head.headHash;
  }
  const db={students:[],teachers:[],lessons:[]};
  for(const collection of Object.keys(db)){
   const range=query=>collection==='lessons'?query.where('record.date','>=',month+'-01').where('record.date','<=',month+'-31'):query;
   const cap=collection==='lessons'?50000:10000;
   const read=async path=>{const snapshot=await tx.get(range(firestore.collection(path)).limit(cap+1));if(snapshot.docs.length>cap)fail('本月財務資料超出驗證範圍，未回傳不完整金額');return recordRows(snapshot,collection,environment,epoch)};
   let rows;
   if(environment==='production')rows=await read(`productionFullRecordShadows/danbridge/collections/${collection}/records`);
   else{
    const base=`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}/collections/${collection}/records`,daily=`stagingActiveRecordV2Records/danbridge/epochs/${epoch}/collections/${collection}/records`;
    const baseline=await read(base),changes=await read(daily),merged=new Map(baseline.map(r=>[r.id,r]));
    // A deleted or moved-out record may no longer match the date query. Read
    // the current envelope for each baseline ID so it cannot reappear.
    for(let i=0;i<baseline.length;i+=100){
     const snapshots=await tx.getAll(...baseline.slice(i,i+100).map(r=>firestore.doc(`${daily}/${r.id}`)));
     for(const r of recordRows({docs:snapshots.filter(s=>s.exists)},collection,environment,epoch))merged.set(r.id,r);
    }
    changes.forEach(r=>merged.set(r.id,r));rows=[...merged.values()];
   }
   db[collection]=rows.filter(r=>!r.deleted&&(collection!=='lessons'||String(r.record.date||'').startsWith(month+'-'))).map(r=>r.record).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  }
  const leaveSnapshot=await tx.get(firestore.collection('productionTeacherLeaveRecords').where('companyId','==','danbridge').limit(10001));
  if(leaveSnapshot.docs.length>10000)fail('請假資料超出驗證範圍，未回傳不完整薪資');
  const leaves=leaveSnapshot.docs.map(s=>s.data());
  return {schema:'danbridge-scoped-payroll-v1',month,scope,sourceRevision,verifiedAt:now(),rows:calculateScopedPayroll({db,leaves,month,scope})};
 },{readOnly:true});
}
module.exports={readScopedPayroll,authorizeScope,recordRows};
