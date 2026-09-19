// Read-only, exact authorized staging accounts. This is not Google-login acceptance.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877-staging';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
try{
 const accounts=[['Daniel','a0965487920@gmail.com'],['Catherine','catherine890202@gmail.com'],['AA','aa0966626336@gmail.com'],['張毅','yamiiii8549@gmail.com']];
 const evidence=[];
 for(const [name,email] of accounts){const snap=await db.doc('companyAccess/'+email).get(),profile=snap.data();evidence.push({name,exists:snap.exists,active:profile?.active===true,companyMatches:profile?.companyId==='danbridge',role:profile?.role||null,teacherLinked:!!profile?.teacherId,branchCount:profile?.branchIds?.length||0,bookRoleAllowed:['owner','teacher','branch_manager'].includes(profile?.role)})}
 console.log(JSON.stringify({project,remoteWrites:0,evidence},null,2));
 if(process.argv.includes('--leave-fixture')){
  const rows=await db.collection('productionTeacherLeaveRecords').where('note','==','STAGING_LEAVE_355_COMPLETE_ACCEPTANCE').get();
  const result=[];
  for(const row of rows.docs){
   const data=row.data(),receipts=await db.collection('productionTeacherLeaveOperationReceipts').where('leaveId','==',row.id).get(),notifications=[];
   for(const receipt of receipts.docs)for(const [name,email]of accounts){
    const note=await db.doc('companies/danbridge/scheduleNotifications/leave_'+receipt.id+'_'+email.replace(/[^A-Za-z0-9_-]/g,'_')).get();
    notifications.push({name,action:receipt.data().action,revision:receipt.data().revision,exists:note.exists,read:note.data()?.read===true,leaveMatches:note.data()?.details?.[0]?.leaveId===row.id});
   }
   result.push({id:row.id,environment:data.environment,teacherId:data.teacherId,date:data.date,start:data.start,end:data.end,hours:data.hours,days:data.days,status:data.status,revision:data.revision,requiresCompletion:data.requiresCompletion,completedAtIso:data.completedAtIso||null,receiptCount:receipts.size,notifications});
  }
  console.log(JSON.stringify({project,remoteWrites:0,leaveFixtureCount:rows.size,result},null,2));
 }
 if(process.argv.includes('--teacher-leave-notices')){
  const notes=await db.collection('companies/danbridge/scheduleNotifications').where('recipientEmail','==',accounts[3][1]).get();
  console.log(JSON.stringify({project,remoteWrites:0,teacherLeaveNotices:notes.docs.filter(d=>d.data().notificationType==='teacher-leave'&&d.data().details?.some(x=>x.teacherName==='STAGING_SHADOW_TEACHER')).map(d=>({id:d.id,read:d.data().read===true,message:d.data().message}))},null,2));
 }
 if(process.argv.includes('--book-fixture')){
  const title=process.argv.includes('--conflict-fixture')?'STAGING_BOOK_357_CONFLICT_ACCEPTANCE':process.argv.includes('--teacher-fixture')?'STAGING_BOOK_353_TEACHER_ACCEPTANCE':process.argv.includes('--catherine-fixture')?'STAGING_BOOK_353_CATHERINE_ACCEPTANCE':process.argv.includes('--daniel-fixture')?'STAGING_BOOK_353_ACCEPTANCE':'STAGING_BOOK_353_AA_ACCEPTANCE';
  const books=await db.collection('bookPurchaseRequests').where('title','==',title).get();
  const result=[];
  for(const book of books.docs){
   const row=book.data(),receipts=await db.collection('bookPurchaseReceipts').where('id','==',book.id).get();
   const notifications=[];
   for(const receipt of receipts.docs)for(const [name,email]of accounts){
    const note=await db.doc('companies/danbridge/scheduleNotifications/book_'+receipt.id+'_'+email.replace(/[^A-Za-z0-9_-]/g,'_')).get(),data=note.data();
    notifications.push({name,action:data?.details?.[0]?.action,revision:receipt.data().revision,exists:note.exists,read:data?.read===true,role:data?.recipientRole,bookMatches:data?.details?.[0]?.bookId===book.id});
   }
   result.push({id:book.id,title:row.title,quantity:row.quantity,revision:row.revision,deleted:row.deleted,creatorIsAA:row.createdByEmail===accounts[2][1],creatorIsTeacher:row.createdByEmail===accounts[3][1],receiptCount:receipts.size,notifications});
  }
  console.log(JSON.stringify({project,remoteWrites:0,fixtureCount:books.size,result},null,2));
 }
}finally{await db.terminate()}
