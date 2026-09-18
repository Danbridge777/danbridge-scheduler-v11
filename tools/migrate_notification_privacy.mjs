// Exact AA/Lucas derived-notice migration. Dry-run by default; no lesson/profile writes.
// Applying requires the exact dry-run digest, checks concurrent changes, and
// retains each original envelope in an Admin-only backup collection.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{sanitizeScheduleOnlyNotification}=require('../functions/notification-privacy.cjs');
const {nativeCanonicalSha256}=require('../functions/native-canonical-sha256.cjs');
const [project,mode='--check',expected]=process.argv.slice(2);
assert.ok(['danbridge-d8877-staging','danbridge-d8877'].includes(project));
assert.ok(['--check','--apply'].includes(mode));
if(mode==='--apply')assert.match(expected||'',/^[a-f0-9]{64}$/);
const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Firestore,FieldValue}=require('@google-cloud/firestore'),{OAuth2Client}=require('google-auth-library');
const authClient=new OAuth2Client(),token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]);
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
// Normalize Firestore Timestamp values, then hash order-independent map keys.
const hash=value=>nativeCanonicalSha256(JSON.parse(JSON.stringify(value)));
try{
 const plans=[];
 for(const email of ['aa0966626336@gmail.com','huberlucas88@gmail.com']){
  const profile=await db.doc('companyAccess/'+email).get();
  if(!profile.exists)continue;
  assert.equal(profile.data().companyId,'danbridge');
  const rows=await db.collection('companies/danbridge/scheduleNotifications').where('recipientEmail','==',email).get();
  for(const row of rows.docs){
   const value=row.data();if(value.recipientRole!=='branch_manager')continue;
   const after=sanitizeScheduleOnlyNotification(value);
   if(hash(value)===hash(after))continue;
   plans.push({path:row.ref.path,beforeHash:hash(value),afterHash:hash(after),value,after,profilePath:profile.ref.path,profileHash:hash(profile.data())});
  }
 }
 plans.sort((a,b)=>a.path.localeCompare(b.path));
 const digest=hash(plans.map(({path,beforeHash,afterHash,profileHash})=>({path,beforeHash,afterHash,profileHash})));
 if(mode==='--check'){console.log(JSON.stringify({project,mode,count:plans.length,digest,writes:0}));}
 else{
  assert.equal(digest,expected,'Plan drift; repeat dry-run and inspect');
  let changed=0;
  for(const p of plans){
   const ref=db.doc(p.path),backup=db.doc('notificationPrivacyMigrationBackups/'+hash({path:p.path,before:p.beforeHash}));
   await db.runTransaction(async tx=>{
    const [live,profile,oldBackup]=await Promise.all([tx.get(ref),tx.get(db.doc(p.profilePath)),tx.get(backup)]);
    assert.ok(live.exists);assert.equal(hash(live.data()),p.beforeHash,'Notification changed; no overwrite');
    assert.equal(hash(profile.data()),p.profileHash,'Access changed; abort');
    if(oldBackup.exists)assert.equal(oldBackup.data().beforeHash,p.beforeHash);
    else tx.create(backup,{schema:'schedule-notification-privacy-backup-v1',sourcePath:p.path,beforeHash:p.beforeHash,afterHash:p.afterHash,original:p.value,createdAt:FieldValue.serverTimestamp()});
    tx.set(ref,p.after); // allowlist replacement, not deletion of a notification
   });
   const check=await ref.get();assert.equal(hash(check.data()),p.afterHash,'Readback mismatch');changed++;
  }
  console.log(JSON.stringify({project,mode,count:changed,digest,lessonWrites:0,profileWrites:0,backupsRetained:true}));
 }
}finally{await db.terminate()}
