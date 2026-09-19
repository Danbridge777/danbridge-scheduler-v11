'use strict';
const TOKEN=/^[A-Za-z0-9_-]{8,128}$/;
const clean=(value,max)=>{if(typeof value!=='string'||value.trim().length>max)throw Error('書籍欄位格式或長度不正確');return value.trim()};
function normalizeInput(input={}){
 const title=clean(input.title,200),publisher=clean(input.publisher||'',120),isbn=clean(input.isbn||'',40),note=clean(input.note||'',500),quantity=Number(input.quantity);
 if(!title||!Number.isSafeInteger(quantity)||quantity<1||quantity>999)throw Error('請填寫書名及 1–999 本的數量');
 return{title,publisher,isbn,note,quantity};
}
async function executeBookPurchase({firestore,identity,request={},nowIso=new Date().toISOString(),serverTimestamp=()=>nowIso,primaryOwnerEmail='a0965487920@gmail.com'}){
 const uid=String(identity?.uid||''),email=String(identity?.email||'').trim().toLowerCase();
 if(!TOKEN.test(uid)||!/^[^\s@]+@[^\s@]+$/.test(email))throw Error('書籍代購需要登入');
 const {action,id,operationId}=request;
 if(!['list','create','update','delete'].includes(action))throw Error('書籍操作無效');
 if(action!=='list'&&(!TOKEN.test(String(id||''))||!TOKEN.test(String(operationId||''))||!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0))throw Error('書籍操作識別碼或版本無效');
 const input=['create','update'].includes(action)?normalizeInput(request.input):null;
 const fingerprint=JSON.stringify({action,id,expectedRevision:request.expectedRevision,input});
 return firestore.runTransaction(async tx=>{
  const accessSnap=await tx.get(firestore.doc('companyAccess/'+email)),access=accessSnap.exists?accessSnap.data():email===primaryOwnerEmail?{active:true,companyId:'danbridge',role:'owner'}:null;
  if(!access||access.active!==true||access.companyId!=='danbridge'||!['owner','teacher','branch_manager'].includes(access.role))throw Error('書籍代購帳號未授權');
  if(action==='list'){
   if(request.cursor&&!TOKEN.test(String(request.cursor)))throw Error('書籍分頁無效');
   let query=firestore.collection('bookPurchaseRequests').orderBy('__name__').limit(200);
   if(request.cursor)query=query.startAfter(request.cursor);
   const result=await tx.get(query),docs=result.docs;
   return{ok:true,records:docs.map(d=>({id:d.id,...d.data()})).filter(row=>!row.deleted&&row.companyId==='danbridge'),nextCursor:docs.length===200?docs.at(-1).id:''};
  }
  const ref=firestore.doc('bookPurchaseRequests/'+id),receiptRef=firestore.doc('bookPurchaseReceipts/'+operationId);
  const [snapshot,receiptSnap]=await Promise.all([tx.get(ref),tx.get(receiptRef)]),current=snapshot.exists?snapshot.data():null;
  // Even Owner cannot edit another person's request. Never trust client creator fields.
  if(current&&(current.companyId!=='danbridge'||current.createdByUid!==uid||current.createdByEmail!==email))throw Error('只能編輯或刪除自己建立的書籍');
  if(receiptSnap.exists){const receipt=receiptSnap.data();if(receipt.uid!==uid||receipt.fingerprint!==fingerprint||receipt.id!==id)throw Error('書籍操作識別衝突');return{ok:true,duplicate:true,record:current}}
  if(action==='create'&&(current||request.expectedRevision!==0))throw Error('這筆書籍已存在');
  if(action!=='create'&&(!current||current.deleted))throw Error('這筆書籍不存在或已刪除');
  if((current?.revision||0)!==request.expectedRevision)throw Error('這筆書籍已更新，請重新載入後再編輯');
  const recipients=(await tx.get(firestore.collection('companyAccess'))).docs.map(d=>({...d.data(),email:d.id})).filter(a=>a.active===true&&a.companyId==='danbridge'&&['owner','teacher','branch_manager'].includes(a.role));
  if(recipients.length>400)throw Error('通知收件人超過安全批次上限，尚未儲存');
  const record={...(current||{}),...(input||{}),id,companyId:'danbridge',revision:(current?.revision||0)+1,createdByUid:uid,createdByEmail:email,createdByName:current?.createdByName||String(access.displayName||access.teacherName||email).slice(0,120),createdAtIso:current?.createdAtIso||nowIso,updatedAtIso:nowIso,deleted:action==='delete'};
  tx.set(ref,record,{merge:false});tx.set(receiptRef,{id,uid,fingerprint,revision:record.revision,at:nowIso},{merge:false});
  tx.set(firestore.doc('companyAudit/book-'+operationId),{companyId:'danbridge',category:'book-purchase',action,targetId:id,actorUid:uid,actorEmail:email,revision:record.revision,createdAtIso:nowIso},{merge:false});
  for(const recipient of recipients){
   const recipientRole=recipient.role==='teacher'&&recipient.canManageSchedule===true?'scheduler':recipient.role;
   tx.set(firestore.doc('companies/danbridge/scheduleNotifications/book_'+operationId+'_'+recipient.email.replace(/[^A-Za-z0-9_-]/g,'_')),{companyId:'danbridge',notificationType:'book-purchase',recipientEmail:recipient.email,recipientRole,teacherId:recipient.teacherId||'',branchIds:recipient.branchIds||[],...(recipientRole==='branch_manager'&&recipient.hideFinancials===true?{privacyScope:'schedule-only-v1'}:{}),title:'書籍代購更新',message:`${record.createdByName} ${action==='create'?'新增':action==='delete'?'刪除':'更新'}「${record.title}」${record.quantity} 本`,changeCount:1,details:[{bookId:id,action,title:record.title,quantity:record.quantity}],read:false,createdAt:serverTimestamp(),createdBy:uid,createdByName:record.createdByName},{merge:false});
  }
  return{ok:true,record};
 });
}
module.exports={executeBookPurchase,normalizeInput};
