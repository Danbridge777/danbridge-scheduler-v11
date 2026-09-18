// Bounded access-only production update. Role views are republished separately
// through the protected Owner callable and verified before release acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Firestore,FieldValue}=require('@google-cloud/firestore');
const {OAuth2Client}=require('google-auth-library');
const {nativeCanonicalSha256:hash}=require('../functions/native-canonical-sha256.cjs');
const project='danbridge-d8877',apply=process.argv[2]==='--apply',emails=['aa0966626336@gmail.com','huberlucas88@gmail.com'];
assert.ok(process.argv.length<=3&&[undefined,'--plan','--apply'].includes(process.argv[2]));
const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),auditRef=db.doc('productionRoleAcceptance/branch-finance-343');
try{
 const accessRefs=emails.map(email=>db.doc(`companyAccess/${email}`)),[...accessSnaps]=await db.getAll(...accessRefs),audit=await auditRef.get();assert.equal(audit.exists,false,'The 343 production access activation already exists; inspect it instead of overwriting');
 const accessRows=accessSnaps.map(snapshot=>snapshot.data());
 for(const row of accessRows){assert.equal(row.role,'branch_manager');assert.equal(row.active,true);assert.equal(row.companyId,'danbridge');assert.deepEqual(row.branchIds,['art_museum']);assert.deepEqual(row.scheduleBranchIds,['art_museum','hexi']);assert.equal(row.hideFinancials,true);assert.equal(row.readOnly,true);assert.equal(row.canMoveSchedule,false);assert.equal(row.canManageSchedule,false);assert.notEqual(row.canViewBranchFinance,true)}
 const users=[];for(const email of emails){const rows=await db.collection('users').where('companyId','==','danbridge').where('email','==',email).get();users.push(...rows.docs.map(doc=>({email,doc})))}
 const originalHashes=accessRows.map(hash);
 if(apply)await db.runTransaction(async tx=>{const current=await tx.getAll(...accessRefs),prior=await tx.get(auditRef);assert.equal(prior.exists,false);current.forEach((snapshot,index)=>assert.equal(hash(snapshot.data()),originalHashes[index]));tx.create(auditRef,{schema:'production-branch-finance-access-v1',release:'20.26.343',state:'access-active-role-view-pending',emails,financeBranchIds:['art_museum'],scheduleBranchIds:['art_museum','hexi'],businessWrites:0,createdAt:FieldValue.serverTimestamp()});for(const ref of accessRefs)tx.update(ref,{canViewBranchFinance:true});for(const row of users)tx.update(row.doc.ref,{canViewBranchFinance:true,hideFinancials:true,scheduleBranchIds:['art_museum','hexi'],canMoveSchedule:false,canManageSchedule:false,readOnly:true,scopedDb:FieldValue.delete(),scopedClientHash:FieldValue.delete()})});
 const current=await db.getAll(...accessRefs);if(apply)current.forEach(snapshot=>assert.equal(snapshot.data().canViewBranchFinance,true));
 console.log(JSON.stringify({project,state:apply?'access-active-role-view-pending':'planned',emails,financeBranchIds:['art_museum'],scheduleBranchIds:['art_museum','hexi'],canViewBranchFinance:true,canMoveSchedule:false,readOnly:true,userMirrors:users.length,businessWrites:0}));
}finally{await db.terminate()}
