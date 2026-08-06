import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, Timestamp, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyB4tID5Dl1c_6MCev1OZxMSpiYFq3t3_EU",
  authDomain: "danbridge-d8877.firebaseapp.com",
  projectId: "danbridge-d8877",
  messagingSenderId: "251283850754",
  appId: "1:251283850754:web:105a2813d86918af03091b",
  measurementId: "G-K6ZH7DF7RS"
};

const COMPANY_ID='danbridge';
const OWNER_EMAIL='a0965487920@gmail.com';
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const cloud=getFirestore(app);
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});

// 舊版 Header 使用 onclick="authLogout()"；公開相容 API，避免 Header 重建前點擊失效。
window.authLogout=async function authLogout(){
 try{await signOut(auth)}
 catch(error){
   console.error('Firebase logout failed:',error);
   cloudStatus('登出失敗：'+(error?.message||error),'error');
 }
};
try{await setPersistence(auth,browserLocalPersistence)}catch(e){console.warn(e)}
try{await enableIndexedDbPersistence(cloud)}catch(e){console.warn('Firestore offline persistence:',e?.code||e)}

let cloudRole='';
let cloudTeacherId='';
let cloudBranchIds=[];
let cloudUid='';
let cloudEmailKey='';
let cloudRoleAccessSignature='';
let applyingCloud=false;
let unsubscribeState=null;
let unsubscribeAccessGuard=null;
let syncTimer=null;
let unsubscribeReports=null;
let unsubscribeScheduleNotifications=null;
let scheduleNotificationDocuments=[];
let lastPublishedOwnerDB=null;
let ownerBaselineReady=false;
let lessonReportDocuments=[];
let ownerUploadInFlight=false;
let ownerUploadQueued=false;
let ownerRetryTimer=null;
let ownerRetryCount=0;
const scheduleNotificationDeliveryJobs=new Map();
let roleViewPublishInFlight=false;
let roleViewPublishQueued=false;
let roleViewRetryCount=0;
let roleViewRetryTimer=null;
let lastUploadedHash='';
let lastCloudSnapshotHash='';
// 本機資料一旦修改，在雲端確認寫入前禁止舊 snapshot 倒灌覆蓋。
let localDirtyHash='';
let localMutationVersion=0;
let reportSyncTimer=null;
let lessonMetaSignatureCache=new Map();
let lessonMetaCacheReady=false;
let scopedViewHashCache=new Map();
let companyAccessCache=null;
let companyAccessCacheAt=0;
let legacyMigrationStarted=false;
const COMPANY_ACCESS_CACHE_TTL=30000;
let originalSaveDB=window.saveDB;
const originalEditLesson=window.editLesson;

function emptyDB(){return {students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[],branches:[]}}
function deepCopy(x){return JSON.parse(JSON.stringify(x||emptyDB()))}
function localRoleCacheKey(){
 if(cloudRole==='owner')return 'danbridge_scheduler_v1';
 const identity=(cloudEmailKey||cloudUid||'unknown').replace(/[^a-z0-9@._-]/gi,'_');
 return `danbridge_scheduler_view_${cloudRole||'signed_out'}_${identity}`;
}
function persistCurrentLocalView(){try{localStorage.setItem(localRoleCacheKey(),JSON.stringify(window.__danbridgeGetDB()))}catch{}}
let cloudStatusHideTimer=null;
function cloudStatus(text,kind=''){let el=document.getElementById('firebaseCloudStatus');if(!el){el=document.createElement('div');el.id='firebaseCloudStatus';el.style.cssText='position:fixed;left:12px;bottom:12px;z-index:10001;padding:8px 11px;border-radius:10px;background:#172033;color:#fff;font-size:12px;font-weight:800;box-shadow:0 8px 20px rgba(0,0,0,.2);pointer-events:none';document.body.appendChild(el)}clearTimeout(cloudStatusHideTimer);el.hidden=false;el.textContent=text;el.dataset.kind=kind||'';el.style.background=kind==='error'?'#991b1b':kind==='ok'?'#18794e':kind==='pending'?'#9a6700':kind==='offline'?'#475569':'#172033';if(kind==='ok')cloudStatusHideTimer=setTimeout(()=>{if(el.dataset.kind==='ok')el.hidden=true},2200)}
function dataHash(value){try{const text=JSON.stringify(value||{});let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+':'+text.length}catch{return String(Date.now())}}
function withSyncTimeout(promise,ms=15000){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('雲端連線逾時，將自動重試')),ms))])}
function scheduleOwnerRetry(){clearTimeout(ownerRetryTimer);if(cloudRole!=='owner'||!ownerUploadQueued)return;const delay=Math.min(30000,1000*Math.pow(2,Math.min(ownerRetryCount,5)));ownerRetryTimer=setTimeout(()=>uploadOwnerState(),delay)}
function setOfflineStatus(){if(!navigator.onLine){cloudStatus('目前離線；所有變更已先保存在這台裝置，恢復網路後會自動同步。','offline')}}
function setAuthCard(message='Sign in with your authorized Google account to continue.'){
 const screen=document.getElementById('authScreen');
 screen.innerHTML=`<div class="auth-minimal-shell">
  <section class="auth-minimal-brand" aria-label="Danbridge Operations">
    <div class="auth-minimal-wordmark">Danbridge</div>
    <div class="auth-feather-scene" aria-hidden="true">
      <span class="auth-feather-halo"></span>
      <img class="auth-gold-feather" src="./assets/images/danbridge-gold-feather-v2.png" alt="">
      <span class="auth-feather-line"></span>
    </div>
    <div class="auth-minimal-copy">
      <span>EDUCATION OPERATIONS</span>
      <h1>Quiet precision.<br><em>Exceptional learning.</em></h1>
      <p>Private education operations, refined.</p>
    </div>
  </section>

  <section class="auth-minimal-panel">
    <div class="auth-card auth-card-minimal">
    <div class="auth-card-seal"><i></i> SECURE ACCESS</div>
    <div class="auth-card-kicker">WELCOME BACK</div>
    <h1>Enter the workspace.</h1>
    <p>${message}</p>
    <button id="googleCloudLogin" type="button" class="auth-google-btn"><span class="auth-google-mark">G</span><span class="auth-google-label">Continue with Google</span><span class="auth-google-arrow">→</span></button>
    <div id="cloudLoginError" class="auth-error"></div>
    <div class="auth-minimal-security"><span>Authorized accounts only</span><i></i><span>Role-based access</span></div>
    <div class="auth-meta"><span>Danbridge English Co., Ltd.</span><strong>Private Cloud</strong></div>
    </div>
  </section>
</div>`;
 document.getElementById('googleCloudLogin').onclick=async()=>{const btn=document.getElementById('googleCloudLogin');btn.disabled=true;btn.querySelector('.auth-google-label').textContent='Signing in…';try{await signInWithPopup(auth,provider)}catch(e){console.error(e);if(['auth/popup-blocked','auth/cancelled-popup-request','auth/popup-closed-by-user'].includes(e.code)){try{await signInWithRedirect(auth,provider);return}catch(e2){showCloudLoginError(e2.message)}}else showCloudLoginError(e.message);btn.disabled=false;btn.querySelector('.auth-google-label').textContent='Continue with Google'}};
}
function showCloudLoginError(msg){const e=document.getElementById('cloudLoginError');if(e){e.textContent=msg;e.classList.add('show')}}
function showCloudApp(){document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.classList.add('hidden')}
function showCloudLogin(){document.body.classList.add('auth-locked');document.getElementById('authScreen')?.classList.remove('hidden');setAuthCard()}

async function ensureProfile(user){
 const emailKey=(user.email||'').trim().toLowerCase();
 if(!emailKey)throw new Error('This Google account does not have a usable email address.');

 // Owner 保留 users/{uid} 個人檔案；老師與校區管理者則直接以 companyAccess 為唯一權限來源。
 // 登入流程不再要求一般帳號寫入 users，避免任何 users 規則或舊資料欄位造成登入被拒絕。
 if(emailKey===OWNER_EMAIL){
   const ref=doc(cloud,'users',user.uid);let snap=await getDoc(ref);
   if(!snap.exists()){
     await setDoc(ref,{email:user.email,displayName:user.displayName||'Daniel',role:'owner',companyId:COMPANY_ID,createdAt:serverTimestamp(),active:true});
     snap=await getDoc(ref);
   }
   const p=snap.data();
   if(p.active===false)throw new Error('This account has been deactivated.');
   if(p.companyId!==COMPANY_ID||p.role!=='owner')throw new Error('The owner account profile is not configured correctly.');
   return p;
 }

 const accessSnap=await getDoc(doc(cloud,'companyAccess',emailKey));
 if(!accessSnap.exists())throw new Error('This Google account has not been authorized for Danbridge. Please ask the owner to add it in Security Settings.');
 const a=accessSnap.data()||{};
 if(a.active!==true)throw new Error('This account has been deactivated.');
 if(a.companyId!==COMPANY_ID)throw new Error('This account does not belong to Danbridge.');
 if(!['teacher','branch_manager'].includes(a.role))throw new Error('The role assigned to this account is not valid.');
 if(!a.teacherId)throw new Error('No teacher profile is linked to this account. Please ask the owner to update the account settings.');
 if(a.role==='branch_manager'&&(!Array.isArray(a.branchIds)||!a.branchIds.length))throw new Error('No branch has been assigned to this manager account.');
 return {
   email:user.email,
   displayName:user.displayName||'',
   role:a.role,
   companyId:a.companyId,
   active:true,
   teacherId:String(a.teacherId),
   teacherName:a.teacherName||'',
   managerName:a.managerName||'',
   branchIds:Array.isArray(a.branchIds)?a.branchIds:[],
   branchNames:Array.isArray(a.branchNames)?a.branchNames:[],
   readOnly:a.readOnly===true,
   canSubmitOwnReports:a.canSubmitOwnReports!==false
 };
}
function teacherBadgeName(t){return String(t?.displayName||t?.name||'').trim()}

function filteredTeacherDB(source,teacherId){
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft&&(Array.isArray(l.teacherIds)?l.teacherIds:[l.teacherId]).includes(teacherId));
 const safeLessons=lessons.map(l=>{const {paymentStatus,chargeStudent,payTeacher,draftOriginal,...safe}=l;return safe});
 const studentIds=new Set(lessons.map(l=>l.studentId));
 const lessonIds=new Set(lessons.map(l=>String(l.id)));
 const students=(source.students||[]).filter(s=>studentIds.has(s.id)).map(s=>({id:s.id,name:s.name||'',courseType:s.courseType||'',preferredTeacherId:String(s.preferredTeacherId||'')===String(teacherId)?String(teacherId):''}));
 const teachers=(source.teachers||[]).filter(t=>String(t.id)===String(teacherId)).map(t=>({id:t.id,name:t.name||'',displayName:t.displayName||'',color:t.color||'',type:t.type||'',subjects:t.subjects||''}));
 return {...emptyDB(),students,teachers,lessons:safeLessons,makeups:(source.makeups||[]).filter(m=>String(m.teacherId)===String(teacherId)||lessonIds.has(String(m.sourceLessonId||m.lessonId||''))||lessonIds.has(String(m.scheduledLessonId||''))).map(m=>{const {amount,rate,paymentStatus,...safe}=m;return safe}),changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[]};
}

function lessonBranchId(l){return l?.branchId||window.DanbridgeAccess?.branchIdFromLocation?.(l?.location||'')||'art_museum'}
function filteredBranchDB(source,branchIds){
 const allowed=new Set(Array.isArray(branchIds)?branchIds:[]);
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft&&allowed.has(lessonBranchId(l)));
 const studentIds=new Set(lessons.map(l=>l.studentId));
 const teacherIds=new Set(lessons.flatMap(l=>Array.isArray(l.teacherIds)&&l.teacherIds.length?l.teacherIds:[l.teacherId]).filter(Boolean));
 const branches=(source.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).filter(b=>allowed.has(b.id));
 const lessonById=new Map((source.lessons||[]).map(l=>[String(l.id),l]));
 const students=(source.students||[]).filter(st=>studentIds.has(st.id)||(st.branchIds||[]).some(id=>allowed.has(id)));
 const visibleStudentIds=new Set(students.map(st=>String(st.id)));
 return {...emptyDB(),branches,students,teachers:(source.teachers||[]).filter(t=>teacherIds.has(t.id)||(t.assignedBranchIds||[]).some(id=>allowed.has(id))),lessons,makeups:(source.makeups||[]).filter(m=>{const sourceLesson=lessonById.get(String(m.sourceLessonId||m.lessonId||''));return allowed.has(m.branchId||lessonBranchId(sourceLesson||m))}),changes:(source.changes||[]).filter(c=>{const lesson=lessonById.get(String(c.lessonId))||c.after||c.before;return lesson&&allowed.has(lessonBranchId(lesson))}),teacherGroups:[],winterTeacherGroups:[],summerCampClasses:(source.summerCampClasses||[]).filter(c=>allowed.has(c.branchId||lessonBranchId(c))),summerCampRegistrations:(source.summerCampRegistrations||[]).filter(r=>allowed.has(r.branchId)),winterCampRegistrations:(source.winterCampRegistrations||[]).filter(r=>allowed.has(r.branchId)),winterCampClasses:(source.winterCampClasses||[]).filter(c=>allowed.has(c.branchId||lessonBranchId(c))),settlementRecords:(source.settlementRecords||[]).filter(r=>allowed.has(r.branchId)),fixedExpenses:(source.fixedExpenses||[]).filter(e=>allowed.has(e.branchId)),oneTimeExpenses:(source.oneTimeExpenses||[]).filter(e=>allowed.has(e.branchId)),collectionRecords:(source.collectionRecords||[]).filter(r=>allowed.has(r.branchId)).map(r=>({...r,studentIds:(r.studentIds||[]).filter(id=>visibleStudentIds.has(String(id)))}))};
}

async function renderCloudUserManager(){
 if(cloudRole!=='owner')return;
 const sec=document.getElementById('security');if(!sec)return;
 let card=document.getElementById('cloudUserManager');
 if(!card){card=document.createElement('div');card.id='cloudUserManager';card.className='card col-4';sec.querySelector('.grid')?.appendChild(card)}
 card.innerHTML=`<h2>老師帳號</h2><div class="small">選擇老師並綁定 Gmail。老師登入後只能查看自己的課表。</div><label>老師</label><select id="cloudTeacherSelect"></select><label>老師 Gmail</label><input id="cloudTeacherEmail" type="email" placeholder="teacher@gmail.com"><br><button class="btn primary" id="saveCloudTeacherAccess">新增／更新老師權限</button><div id="cloudTeacherAccessList" class="backup-list" style="margin-top:12px"></div>`;
 const sel=document.getElementById('cloudTeacherSelect');sel.innerHTML='<option value="">請選擇老師</option>'+window.__danbridgeGetDB().teachers.map(t=>`<option value="${t.id}">${teacherBadgeName(t)||t.name}</option>`).join('');
 document.getElementById('saveCloudTeacherAccess').onclick=async()=>{
   const teacherId=sel.value,email=document.getElementById('cloudTeacherEmail').value.trim().toLowerCase();
   if(!teacherId||!email)return alert('請選老師並輸入 Gmail');
   const t=window.__danbridgeGetDB().teachers.find(x=>x.id===teacherId);
   invalidateCompanyAccessCache();
   await setDoc(doc(cloud,'companyAccess',email),{email,role:'teacher',companyId:COMPANY_ID,teacherId,teacherName:teacherBadgeName(t),active:true,updatedAt:serverTimestamp()},{merge:true});
   try{const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));await Promise.all(userQs.docs.map(u=>setDoc(u.ref,{active:true,role:'teacher',teacherId,teacherName:teacherBadgeName(t),updatedAt:serverTimestamp()},{merge:true})))}catch(e){console.warn('重新啟用老師帳號失敗：',e)}
   await setDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email),{db:filteredTeacherDB(window.__danbridgeGetDB(),teacherId),updatedAt:serverTimestamp(),teacherId,email},{merge:false});
   alert('老師權限與專屬課表已建立。請老師使用此 Gmail 登入。');
   document.getElementById('cloudTeacherEmail').value='';await listCloudTeacherAccess();
 };
 await listCloudTeacherAccess();
}
async function removeCloudTeacherAccess(email,teacherName='老師'){
 if(cloudRole!=='owner')return;
 email=String(email||'').trim().toLowerCase();
 if(!email)return;
 if(!confirm(`確定要刪除 ${teacherName}（${email}）的登入權限嗎？\n刪除後該帳號將無法再登入。`))return;
 try{
   cloudStatus('正在刪除老師權限…','pending');
   // 先停用已建立的 users 登入資料，避免只刪 companyAccess 後仍可登入。
   const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
   await Promise.all(userQs.docs.map(u=>setDoc(u.ref,{active:false,updatedAt:serverTimestamp()},{merge:true})));
   invalidateCompanyAccessCache();
   await Promise.all([
     deleteDoc(doc(cloud,'companyAccess',email)),
     deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email))
   ]);
   await listCloudTeacherAccess();
   cloudStatus('老師權限已刪除','ok');
 }catch(e){
   console.error(e);
   cloudStatus('刪除權限失敗','error');
   alert('刪除失敗：'+(e?.message||e));
 }
}
async function listCloudTeacherAccess(){
 const box=document.getElementById('cloudTeacherAccessList');if(!box||cloudRole!=='owner')return;
 const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID)));
 box.innerHTML=qs.docs.map(d=>{const x=d.data();const email=String(x.email||d.id).toLowerCase();return `<div class="backup-item"><div class="info"><b>${x.teacherName||'老師'}</b><div class="small">${email}</div></div><div class="row-actions"><span class="pill ${x.active===false?'red':'green'}">${x.active===false?'停用':'啟用'}</span><button type="button" class="btn danger cloud-access-delete" data-email="${email.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" data-name="${String(x.teacherName||'老師').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">刪除權限</button></div></div>`}).join('')||'<span class="small">尚未建立老師 Gmail 權限。</span>';
 box.querySelectorAll('.cloud-access-delete').forEach(btn=>btn.onclick=()=>removeCloudTeacherAccess(btn.dataset.email,btn.dataset.name));
}


function branchManagerFormStatus(message='',kind=''){
 const el=document.getElementById('cloudBranchManagerStatus');
 if(!el)return;
 el.textContent=message;
 el.dataset.kind=kind;
 el.style.display=message?'block':'none';
 el.style.color=kind==='error'?'#b91c1c':kind==='ok'?'#15803d':'#475569';
}
function validGmailAddress(email){
 return /^[^\s@]+@gmail\.com$/i.test(String(email||'').trim());
}
async function saveCloudBranchManagerAccess(){
 if(cloudRole!=='owner')return alert('只有 Owner 可以設定校區管理者權限。');
 const emailInput=document.getElementById('cloudBranchManagerEmail');
 const saveButton=document.getElementById('saveCloudBranchManager');
 const email=String(emailInput?.value||'').trim().toLowerCase();
 const branchIds=[...document.querySelectorAll('#cloudBranchChoices input[type="checkbox"]:checked')].map(x=>x.value);
 const teacherId=String(document.getElementById('cloudBranchManagerTeacher')?.value||'').trim();
 if(!validGmailAddress(email)){
   branchManagerFormStatus('請輸入有效的 Gmail，例如 manager@gmail.com。','error');
   emailInput?.focus();
   return;
 }
 if(!teacherId){
   branchManagerFormStatus('請選擇校區管理者本人對應的老師身分。','error');
   return;
 }
 if(!branchIds.length){
   branchManagerFormStatus('請至少選擇一個校區。','error');
   return;
 }
 if(saveButton?.dataset.saving==='1')return;
 try{
   if(saveButton){saveButton.dataset.saving='1';saveButton.disabled=true;saveButton.textContent='儲存中…'}
   branchManagerFormStatus('正在建立校區管理者權限…','pending');
   cloudStatus('正在儲存校區管理者權限…','pending');
   const branches=window.__danbridgeGetDB()?.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[];
   const branchNames=branches.filter(b=>branchIds.includes(b.id)).map(b=>b.name);
   const existing=await getDoc(doc(cloud,'companyAccess',email));
   if(existing.exists()&&existing.data()?.role==='teacher'){
     throw new Error('這個 Gmail 已經綁定為老師帳號，請先刪除老師權限後再設定為校區管理者。');
   }
   const managerTeacher=(window.__danbridgeGetDB()?.teachers||[]).find(t=>t.id===teacherId);
   if(!managerTeacher)throw new Error('找不到所選老師，請重新選擇。');
   const scopedDb=filteredBranchDB(window.__danbridgeGetDB(),branchIds);
   // 將管理者可讀取的校區快照直接存進自己的 companyAccess 文件。
   // 這條路徑已被現有登入規則允許，避免新 branchViews 路徑因規則尚未部署而失敗。
   const payload={email,role:'branch_manager',companyId:COMPANY_ID,branchIds,branchNames,teacherId,teacherName:teacherBadgeName(managerTeacher),managerName:teacherBadgeName(managerTeacher),active:true,readOnly:true,canSubmitOwnReports:true,scopedDb,scopedUpdatedAt:serverTimestamp(),updatedAt:serverTimestamp()};
   invalidateCompanyAccessCache();
   await setDoc(doc(cloud,'companyAccess',email),payload,{merge:true});
   try{
     const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
     await Promise.all(userQs.docs.map(u=>setDoc(u.ref,payload,{merge:true})));
   }catch(e){console.warn('同步既有使用者資料失敗：',e)}
   // 不再把儲存成功綁在 branchViews / teacherViews 上。
   // 舊 Firebase 規則若不允許這些路徑，主權限仍已完整儲存在 companyAccess。
   // 先更新本機畫面，不等待下一次 Firestore 查詢或快取刷新。
   const optimistic={email,role:'branch_manager',companyId:COMPANY_ID,branchIds,branchNames,teacherId,teacherName:teacherBadgeName(managerTeacher),managerName:teacherBadgeName(managerTeacher),active:true,readOnly:true,canSubmitOwnReports:true};
   renderCloudBranchManagerList([...branchManagerAccessCache.filter(x=>String(x.email||x.id||'').toLowerCase()!==email),optimistic]);
   if(emailInput)emailInput.value='';
   const managerTeacherSelect=document.getElementById('cloudBranchManagerTeacher');if(managerTeacherSelect)managerTeacherSelect.value='';
   document.querySelectorAll('#cloudBranchChoices input[type="checkbox"]').forEach(x=>x.checked=false);
   listCloudBranchManagerAccess();
   branchManagerFormStatus('校區管理者權限已建立。','ok');
   cloudStatus('校區管理者權限已建立','ok');
 }catch(e){
   console.error('saveCloudBranchManagerAccess failed:',e);
   branchManagerFormStatus('儲存失敗：'+(e?.message||e),'error');
   cloudStatus('儲存校區管理者權限失敗','error');
 }finally{
   if(saveButton){saveButton.dataset.saving='0';saveButton.disabled=false;saveButton.textContent='新增／更新管理者權限'}
 }
}
function installBranchManagerAccessEvents(){
 if(document.documentElement.dataset.branchManagerEventsInstalled==='1')return;
 document.documentElement.dataset.branchManagerEventsInstalled='1';
 document.addEventListener('click',event=>{
   const button=event.target.closest?.('#saveCloudBranchManager');
   if(!button)return;
   event.preventDefault();
   event.stopPropagation();
   saveCloudBranchManagerAccess();
 });
}
async function renderBranchManagerAccess(){
 if(cloudRole!=='owner')return;
 const card=document.getElementById('cloudBranchManager');
 if(!card)return;
 const branches=window.__danbridgeGetDB()?.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[];
 const choices=document.getElementById('cloudBranchChoices');
 if(choices){
   choices.innerHTML=branches.map(b=>`<label><input type="checkbox" value="${b.id}"> <span>${b.name}</span></label>`).join('');
 }
 const managerTeacherSelect=document.getElementById('cloudBranchManagerTeacher');
 if(managerTeacherSelect){
   const current=managerTeacherSelect.value;
   managerTeacherSelect.innerHTML='<option value="">請選擇管理者本人</option>'+((window.__danbridgeGetDB()?.teachers||[]).map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.name||'未命名老師')}</option>`).join(''));
   if(current)managerTeacherSelect.value=current;
 }
 const button=document.getElementById('saveCloudBranchManager');
 if(button){button.type='button';button.disabled=false;button.dataset.saving='0'}
 branchManagerFormStatus('','');
 await listCloudBranchManagerAccess();
}
let branchManagerAccessCache=[];
function escapeHTML(value=''){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function renderCloudBranchManagerList(records=branchManagerAccessCache){
 const box=document.getElementById('cloudBranchManagerList');if(!box||cloudRole!=='owner')return;
 branchManagerAccessCache=Array.isArray(records)?records:[];
 box.innerHTML=branchManagerAccessCache.map(x=>{const email=String(x.email||x.id||'').toLowerCase();return `<div class="backup-item branch-access-item"><div class="info"><b>${escapeHTML((x.branchNames||x.branchIds||[]).join('、')||'未指定校區')}</b><div class="small" title="${escapeHTML(email)}">${escapeHTML(email)}｜${escapeHTML(x.teacherName||x.managerName||'未綁定老師')}｜可回報本人課程</div></div><button type="button" class="btn danger branch-access-delete" data-email="${escapeHTML(email)}">刪除權限</button></div>`}).join('')||'<span class="small">尚未建立校區管理者。</span>';
 box.querySelectorAll('.branch-access-delete').forEach(btn=>btn.onclick=()=>removeCloudBranchManagerAccess(btn.dataset.email));
}
async function listCloudBranchManagerAccess(){
 const box=document.getElementById('cloudBranchManagerList');if(!box||cloudRole!=='owner')return;
 try{
   const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID),where('role','==','branch_manager')));
   renderCloudBranchManagerList(qs.docs.map(d=>({id:d.id,...d.data()})));
 }catch(e){
   console.error('listCloudBranchManagerAccess failed:',e);
   if(!branchManagerAccessCache.length)box.innerHTML='<span class="small" style="color:#b91c1c">管理者清單讀取失敗，請重新整理後再試。</span>';
 }
}
async function removeCloudBranchManagerAccess(email){
 if(!confirm(`確定刪除 ${email} 的校區管理權限？`))return;
 const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
 await Promise.all(userQs.docs.map(u=>setDoc(u.ref,{active:false,updatedAt:serverTimestamp()},{merge:true})));
 invalidateCompanyAccessCache();
 await deleteDoc(doc(cloud,'companyAccess',email));
 // 舊檢視只做清理，不讓未部署的 Firestore 規則阻斷刪除流程。
 await Promise.allSettled([
   deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email)),
   deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email))
 ]);
 renderCloudBranchManagerList(branchManagerAccessCache.filter(x=>String(x.email||x.id||'').toLowerCase()!==String(email).toLowerCase()));
 listCloudBranchManagerAccess();
}


const REPORT_STATUS_LABELS={completed:'已完成',student_leave:'學生請假',teacher_leave:'老師請假',no_show:'缺席',makeup_completed:'補課完成'};
const REPORT_TO_LESSON_STATUS={completed:'已上課',student_leave:'學生請假',teacher_leave:'老師請假',no_show:'缺席',makeup_completed:'補課完成'};
function reportStatusLabel(v){return REPORT_STATUS_LABELS[v]||'尚未回報'}
function lessonBelongsToTeacher(l,teacherId){return (Array.isArray(l?.teacherIds)?l.teacherIds:[l?.teacherId]).filter(Boolean).includes(teacherId)}
function canUseTeacherReporting(){return cloudRole==='owner'||((cloudRole==='teacher'||cloudRole==='branch_manager')&&!!cloudTeacherId)}
function canActAsTeacherForLesson(lesson){return !!lesson&&!!cloudTeacherId&&(cloudRole==='teacher'||cloudRole==='branch_manager')&&lessonBelongsToTeacher(lesson,cloudTeacherId)}
function lessonReportDeadline(lesson){
 if(!lesson?.date)return null;
 const [y,m,d]=String(lesson.date).split('-').map(Number);
 if(!y||!m||!d)return null;
 // Teachers and branch managers may submit only on the lesson's calendar day.
 // The window closes exactly when the local date changes at 00:00.
 return new Date(y,m-1,d,23,59,59,999);
}
function teacherReportWindowOpen(lesson){
 const deadline=lessonReportDeadline(lesson);
 return !!deadline&&!Number.isNaN(deadline.getTime())&&Date.now()<=deadline.getTime()&&Date.now()>=new Date(`${lesson.date}T00:00:00`).getTime();
}
function canReportLesson(lesson){
 if(cloudRole==='owner')return !!lesson;
 if(!canUseTeacherReporting()||!canActAsTeacherForLesson(lesson))return false;
 // 老師與校區管理者只能在課程當天回報；跨日後立即關閉。
 return teacherReportWindowOpen(lesson);
}
function canViewLessonReport(lesson){
 if(!lesson)return false;
 if(cloudRole==='owner')return true;
 if(cloudRole==='branch_manager')return cloudBranchIds.includes(lessonBranchId(lesson));
 return cloudRole==='teacher'&&lessonBelongsToTeacher(lesson,cloudTeacherId);
}
function setTeacherReportReadOnly(readOnly,message=''){
 const modal=document.getElementById('teacherReportModal');if(!modal)return;
 modal.dataset.readOnly=readOnly?'true':'false';
 modal.querySelectorAll('input[name="teacherReportStatus"], textarea').forEach(el=>el.disabled=!!readOnly);
 ['saveTeacherReportBtn','quickCompleteTeacherReportBtn','startClassFocusBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=!!readOnly});
 const note=document.getElementById('teacherReportPermissionNote');
 if(note){note.hidden=!message;note.textContent=message}
}
function applyReportToLesson(lesson,report){
 if(!lesson||!report)return false;
 const next={teacherReportStatus:report.status||'',teacherReportContent:report.content||'',teacherReportHomework:report.homework||'',teacherReportFeedback:report.feedback||'',teacherReportNote:report.note||'',teacherReportUpdatedAt:report.updatedAtClient||'',teacherReportBy:report.teacherName||'',teacherReportEmail:report.teacherEmail||''};
 let changed=false;
 for(const [k,v] of Object.entries(next)){if((lesson[k]||'')!==v){lesson[k]=v;changed=true}}
 const mapped=REPORT_TO_LESSON_STATUS[report.status];
 if(mapped&&lesson.status!==mapped){lesson.status=mapped;changed=true}
 if(report.status==='student_leave'&&window.addMakeupForLesson){const list=window.__danbridgeGetDB?.().makeups||[],before=list.find(m=>m.sourceLessonId===lesson.id),beforeStatus=before?.status||'';const makeup=window.addMakeupForLesson(lesson);if(!before||makeup?.status!==beforeStatus)changed=true;}
 if(report.status!=='student_leave'&&!window.lessonIsLinkedMakeup?.(lesson)&&window.cancelOpenMakeupForSourceLesson?.(lesson))changed=true;
 if(report.status==='makeup_completed'&&window.completeMakeupForLesson?.(lesson))changed=true;
 return changed;
}

function applyCachedLessonReportsToCurrentDB(){
 const local=window.__danbridgeGetDB?.();
 if(!local||!Array.isArray(local.lessons)||!Array.isArray(lessonReportDocuments)||!lessonReportDocuments.length)return false;
 let changed=false;
 for(const report of lessonReportDocuments){
   const lesson=local.lessons.find(x=>x.id===(report.lessonId||report.id));
   if(lesson&&canViewLessonReport(lesson))changed=applyReportToLesson(lesson,report)||changed;
 }
 return changed;
}
function openTeacherReportModal(lessonId,options={}){
 if(!canUseTeacherReporting())return originalEditLesson?.(lessonId);
 const lesson=window.__danbridgeGetDB().lessons.find(l=>l.id===lessonId);
 const readOnly=options.readOnly===true;
 if(!lesson||!canViewLessonReport(lesson)||(!readOnly&&cloudRole!=='owner'&&!lessonBelongsToTeacher(lesson,cloudTeacherId)))return alert('你沒有這堂課的回報權限。');
 document.getElementById('teacherReportLessonId').value=lesson.id;
 const s=window.__danbridgeGetDB().students.find(x=>x.id===lesson.studentId)||{};
 document.getElementById('teacherReportLessonInfo').innerHTML=`<b>${lesson.date} ${lesson.start}–${lesson.end}</b><br>${s.name||'未命名學生'}｜${lesson.title||'課程'}｜${lesson.location||''} ${lesson.room||''}`;
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value===(lesson.teacherReportStatus||''));
 document.getElementById('teacherReportContent').value=lesson.teacherReportContent||'';
 document.getElementById('teacherReportHomework').value=lesson.teacherReportHomework||'';
 document.getElementById('teacherReportFeedback').value=lesson.teacherReportFeedback||'';
 document.getElementById('teacherReportNote').value=lesson.teacherReportNote||'';
 const deadline=lessonReportDeadline(lesson);
 const locked=!readOnly&&cloudRole!=='owner'&&!teacherReportWindowOpen(lesson);
 let permissionMessage='';
 if(readOnly)permissionMessage='唯讀模式：你可以查看此校區的課堂回報，但不能修改其他老師的內容。';
 else if(deadline)permissionMessage=`僅限課程當天回報，將於隔日 00:00 關閉。`;
 setTeacherReportReadOnly(readOnly||locked,locked?'此課程已非當天，課堂回報已關閉。':permissionMessage);
 document.getElementById('teacherReportModal').classList.add('show');
 if(locked){const modal=document.querySelector('#teacherReportModal .modal');if(modal)modal.scrollTop=0;}
}
async function getTrustedLessonMeta(lessonId){
 const metaSnap=await getDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId));
 if(!metaSnap.exists())throw new Error('找不到這堂課的雲端權限資料，請 Owner 登入並重新同步課表。');
 const meta=metaSnap.data()||{};
 if(meta.active!==true)throw new Error('這堂課目前未啟用回報。');
 const teacherIds=(Array.isArray(meta.teacherIds)?meta.teacherIds:[]).filter(Boolean).map(String);
 if(!cloudUid)throw new Error('登入狀態尚未完成，請重新登入後再試。');
 if(!cloudTeacherId)throw new Error('此帳號尚未綁定老師資料，請 Owner 重新儲存帳號設定。');
 if(!teacherIds.includes(String(cloudTeacherId)))throw new Error('雲端課程尚未綁定目前老師，請 Owner 登入後重新同步一次課表。');
 return {...meta,teacherIds};
}
function quickCompleteTeacherReport(){
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value==='completed');
 return saveTeacherReport();
}
function closeTeacherReportModal(){document.getElementById('teacherReportModal')?.classList.remove('show')}
async function saveTeacherReport(){
 if(!canUseTeacherReporting())return;
 const lessonId=document.getElementById('teacherReportLessonId').value;
 const lesson=window.__danbridgeGetDB().lessons.find(l=>l.id===lessonId);
 if(!lesson)return alert('找不到可回報的課程。');
 if(cloudRole!=='owner'&&!canActAsTeacherForLesson(lesson))return alert('你沒有這堂課的回報權限。');
 if(cloudRole!=='owner'&&!teacherReportWindowOpen(lesson))return alert('此課程已非當天，課堂回報已關閉。');
 const status=document.querySelector('input[name="teacherReportStatus"]:checked')?.value||'';
 if(!status)return alert('請選擇上課狀態。');
 const btn=document.getElementById('saveTeacherReportBtn');btn.disabled=true;btn.textContent='儲存中…';
 try{
   const trustedMeta=await getTrustedLessonMeta(lessonId);
   const lessonTeacherId=(Array.isArray(lesson.teacherIds)?lesson.teacherIds:[lesson.teacherId]).filter(Boolean)[0]||'';
   const reporterName=(document.body.dataset.cloudDisplayName||auth.currentUser?.displayName||auth.currentUser?.email||'').trim();
   const trustedDeadline=trustedMeta.editableUntil?.toDate?.()||null;
   const report={companyId:COMPANY_ID,lessonId,branchId:trustedMeta.branchId,teacherId:cloudRole==='owner'?(cloudTeacherId||lessonTeacherId):cloudTeacherId,teacherUid:cloudUid,teacherEmail:auth.currentUser?.email?.toLowerCase()||'',teacherName:reporterName,reportedByRole:cloudRole,reportedForTeacherIds:Array.isArray(trustedMeta.teacherIds)?trustedMeta.teacherIds:[],isOwnerReport:cloudRole==='owner',status,content:document.getElementById('teacherReportContent').value.trim(),homework:document.getElementById('teacherReportHomework').value.trim(),feedback:document.getElementById('teacherReportFeedback').value.trim(),note:document.getElementById('teacherReportNote').value.trim(),editableUntil:trustedMeta.editableUntil,editableUntilClient:trustedDeadline?.toISOString()||'',updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};
   await setDoc(doc(cloud,'companies',COMPANY_ID,'lessonReports',lessonId),report,{merge:true});
   applyReportToLesson(lesson,report);window.renderAll?.();closeTeacherReportModal();
   cloudStatus('課程回報已儲存','ok');
   return true;
 }catch(e){
   console.error('saveTeacherReport failed',e);
   const code=String(e?.code||'');
   let detail=e?.message||'未知錯誤';
   if(code.includes('permission-denied')){
     detail='課程回報寫入被 Firestore 拒絕。請部署本版本 firebase/firestore.rules；老師與主管只能在課程當天儲存，隔日 00:00 後會關閉。';
   }
   alert('課程回報儲存失敗：'+detail);
   cloudStatus('回報儲存失敗','error');return false
 }
 finally{btn.disabled=false;btn.textContent='儲存回報'}
}


let classFocusLessonId='';
let classFocusTimerHandle=null;
const CLASS_FOCUS_DRAFT_PREFIX='danbridge_class_focus_v31_';
function classFocusDraftKey(id){return CLASS_FOCUS_DRAFT_PREFIX+id}
function getClassFocusDraft(id){try{return JSON.parse(localStorage.getItem(classFocusDraftKey(id))||'null')}catch{return null}}
function saveClassFocusDraft(){
 if(!classFocusLessonId)return;
 const status=document.querySelector('input[name="classFocusStatus"]:checked')?.value||'';
 const draft={content:document.getElementById('classFocusContent')?.value||'',homework:document.getElementById('classFocusHomework')?.value||'',feedback:document.getElementById('classFocusFeedback')?.value||'',note:document.getElementById('classFocusNote')?.value||'',status,updatedAt:new Date().toISOString()};
 try{localStorage.setItem(classFocusDraftKey(classFocusLessonId),JSON.stringify(draft))}catch{}
}
function clearClassFocusDraft(id){try{localStorage.removeItem(classFocusDraftKey(id))}catch{}}
function classFocusEndTime(lesson){
 const [y,m,d]=(lesson.date||'').split('-').map(Number),[h,mi]=(lesson.end||'00:00').split(':').map(Number);
 return new Date(y,m-1,d,h,mi,0,0);
}
function updateClassFocusTimer(){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===classFocusLessonId),box=document.getElementById('classFocusTimer'),label=document.getElementById('classFocusTimerLabel'),value=document.getElementById('classFocusTimerValue');
 if(!lesson||!box||!label||!value)return;
 const diff=classFocusEndTime(lesson)-new Date(),over=diff<0,total=Math.floor(Math.abs(diff)/1000),hh=Math.floor(total/3600),mm=Math.floor((total%3600)/60),ss=total%60;
 value.textContent=(hh?String(hh).padStart(2,'0')+':':'')+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
 label.textContent=over?'已超過下課時間':'距離下課';box.classList.toggle('overtime',over);
}
function openClassFocusMode(){
 if(!canUseTeacherReporting())return;
 const lessonId=document.getElementById('teacherReportLessonId')?.value||'';
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 if(!lesson||!canReportLesson(lesson))return alert('找不到可開始的課程。');
 const student=window.__danbridgeGetDB().students.find(x=>x.id===lesson.studentId)||{},draft=getClassFocusDraft(lessonId);
 classFocusLessonId=lessonId;
 document.getElementById('classFocusTitle').textContent=student.name||lesson.title||'課程';
 document.getElementById('classFocusMeta').textContent=`${lesson.date} ${lesson.start}–${lesson.end}｜${lesson.title||'課程'}｜${lesson.location||''} ${lesson.room||''}`.trim();
 document.getElementById('classFocusContent').value=draft?.content ?? document.getElementById('teacherReportContent').value;
 document.getElementById('classFocusHomework').value=draft?.homework ?? document.getElementById('teacherReportHomework').value;
 document.getElementById('classFocusFeedback').value=draft?.feedback ?? document.getElementById('teacherReportFeedback').value;
 document.getElementById('classFocusNote').value=draft?.note ?? document.getElementById('teacherReportNote').value;
 const selected=draft?.status||document.querySelector('input[name="teacherReportStatus"]:checked')?.value||'completed';
 document.querySelectorAll('input[name="classFocusStatus"]').forEach(r=>r.checked=r.value===selected);
 closeTeacherReportModal();
 document.getElementById('classFocusMode').classList.add('show');document.getElementById('classFocusMode').setAttribute('aria-hidden','false');document.body.classList.add('class-focus-open');
 clearInterval(classFocusTimerHandle);updateClassFocusTimer();classFocusTimerHandle=setInterval(updateClassFocusTimer,1000);
 setTimeout(()=>document.getElementById('classFocusContent')?.focus(),80);
}
function closeClassFocusMode({discard=false,reopen=false}={}){
 if(!classFocusLessonId)return;
 const id=classFocusLessonId;
 if(discard)clearClassFocusDraft(id);else saveClassFocusDraft();
 clearInterval(classFocusTimerHandle);classFocusTimerHandle=null;
 document.getElementById('classFocusMode')?.classList.remove('show');document.getElementById('classFocusMode')?.setAttribute('aria-hidden','true');document.body.classList.remove('class-focus-open');
 classFocusLessonId='';
 if(reopen)openTeacherReportModal(id);
}
async function completeClassFocusMode(){
 if(!classFocusLessonId)return;
 const id=classFocusLessonId,status=document.querySelector('input[name="classFocusStatus"]:checked')?.value||'';
 if(!status)return alert('請先選擇課程狀態。');
 document.getElementById('teacherReportLessonId').value=id;
 document.getElementById('teacherReportContent').value=document.getElementById('classFocusContent').value;
 document.getElementById('teacherReportHomework').value=document.getElementById('classFocusHomework').value;
 document.getElementById('teacherReportFeedback').value=document.getElementById('classFocusFeedback').value;
 document.getElementById('teacherReportNote').value=document.getElementById('classFocusNote').value;
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value===status);
 const btn=document.getElementById('classFocusCompleteBtn');btn.disabled=true;btn.textContent='同步中…';
 try{const saved=await saveTeacherReport();if(saved){clearClassFocusDraft(id);closeClassFocusMode({discard:true,reopen:false})}}
 finally{btn.disabled=false;btn.textContent='完成並儲存'}
}
function installClassFocusMode(){
 document.getElementById('startClassFocusBtn')?.addEventListener('click',openClassFocusMode);
 document.getElementById('quickCompleteTeacherReportBtn')?.addEventListener('click',quickCompleteTeacherReport);
 document.getElementById('classFocusExitBtn')?.addEventListener('click',()=>closeClassFocusMode({reopen:true}));
 document.getElementById('classFocusDiscardBtn')?.addEventListener('click',()=>{if(confirm('確定放棄這次尚未同步的輸入？'))closeClassFocusMode({discard:true,reopen:true})});
 document.getElementById('classFocusCompleteBtn')?.addEventListener('click',completeClassFocusMode);
 ['classFocusContent','classFocusHomework','classFocusNote'].forEach(id=>document.getElementById(id)?.addEventListener('input',saveClassFocusDraft));
 document.querySelectorAll('input[name="classFocusStatus"]').forEach(r=>r.addEventListener('change',saveClassFocusDraft));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('classFocusMode')?.classList.contains('show')){e.preventDefault();closeClassFocusMode({reopen:true})}},true);
}


window.openLessonReport=function(lessonId){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 if(!lesson)return alert('找不到課程。');
 if(cloudRole==='owner'||canActAsTeacherForLesson(lesson))return openTeacherReportModal(lessonId);
 if(cloudRole==='branch_manager'&&canViewLessonReport(lesson))return openTeacherReportModal(lessonId,{readOnly:true});
 return alert('你沒有這堂課的回報權限。');
};
window.canCurrentUserReportLesson=function(lessonId){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 return !!lesson&&canReportLesson(lesson);
};
window.currentCloudRole=function(){return cloudRole};

function installTeacherReportUI(){
 window.editLesson=(id)=>{
   if(cloudRole==='teacher')return openTeacherReportModal(id);
   if(cloudRole==='branch_manager'){
     const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===id);
     return canActAsTeacherForLesson(lesson)?openTeacherReportModal(id):openTeacherReportModal(id,{readOnly:true});
   }
   return originalEditLesson?.(id);
 };
 document.getElementById('closeTeacherReportModal')?.addEventListener('click',closeTeacherReportModal);
 document.getElementById('cancelTeacherReportBtn')?.addEventListener('click',closeTeacherReportModal);
 document.getElementById('saveTeacherReportBtn')?.addEventListener('click',saveTeacherReport);
 document.getElementById('teacherReportModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('teacherReportModal'))closeTeacherReportModal()});
}
function subscribeLessonReports(){
 unsubscribeReports?.();unsubscribeReports=null;
 if(cloudRole!=='owner'&&!canUseTeacherReporting())return;
 const reportsRef=collection(cloud,'companies',COMPANY_ID,'lessonReports');
 let qy=reportsRef;
 if(cloudRole==='teacher')qy=query(reportsRef,where('reportedForTeacherIds','array-contains',cloudTeacherId));
 else if(cloudRole==='branch_manager'){
   if(!cloudBranchIds.length)return;
   qy=cloudBranchIds.length===1?query(reportsRef,where('branchId','==',cloudBranchIds[0])):query(reportsRef,where('branchId','in',cloudBranchIds.slice(0,30)));
 }
 unsubscribeReports=onSnapshot(qy,snap=>{
   lessonReportDocuments=snap.docs.map(d=>({id:d.id,...d.data()}));
   window.DanbridgeNotifications?.render?.();
   const local=window.__danbridgeGetDB();
   const changed=applyCachedLessonReportsToCurrentDB();
   const modal=document.getElementById('teacherReportModal');
   if(modal?.classList.contains('show')){const id=document.getElementById('teacherReportLessonId')?.value;const l=local.lessons.find(x=>x.id===id);if(l)setTimeout(()=>openTeacherReportModal(id,{readOnly:modal.dataset.readOnly==='true'&&cloudRole==='branch_manager'&&!canActAsTeacherForLesson(l)}),0)}
   if(!changed)return;
   persistCurrentLocalView();
   window.renderAll?.();
   window.renderDashboard?.();
   if(cloudRole==='owner'){clearTimeout(reportSyncTimer);reportSyncTimer=setTimeout(uploadOwnerState,500)}
 },e=>{
   console.error('lessonReports listener',e);
   if(cloudRole==='teacher'&&String(e?.code||'').includes('permission-denied')){
     lessonReportDocuments=[];
     cloudStatus('老師課表已同步','ok');
     return;
   }
   cloudStatus('課程回報同步失敗：'+e.message,'error');
 });
}

const OWNER_DISPLAY_NAME='Daniel';
function roleAccessSignature(value={}){
 const branchIds=(Array.isArray(value.branchIds)?value.branchIds:[]).map(String).sort();
 return JSON.stringify({role:String(value.role||''),teacherId:String(value.teacherId||''),branchIds,readOnly:value.readOnly===true,canSubmitOwnReports:value.canSubmitOwnReports!==false});
}
function applyRoleUI(profile,user){
 const normalizedRole=String(profile?.role||'').trim().toLowerCase();
 cloudRole=normalizedRole;cloudTeacherId=profile.teacherId==null?'':String(profile.teacherId);cloudBranchIds=Array.isArray(profile.branchIds)?profile.branchIds:[];cloudUid=user.uid;cloudEmailKey=(user.email||'').trim().toLowerCase();window.__danbridgeLessonIdMigrationAuthority=cloudRole==='owner';
 cloudRoleAccessSignature=cloudRole==='owner'?'':roleAccessSignature({...profile,role:cloudRole,teacherId:cloudTeacherId,branchIds:cloudBranchIds});
 if(cloudRole==='owner'){const current=window.__danbridgeGetDB?.();if(current)window.__danbridgeSetDB(deepCopy(current));}
 window.DanbridgeAccess?.setContext({role:cloudRole,branchIds:cloudBranchIds,teacherId:cloudTeacherId,email:cloudEmailKey,readOnly:profile.readOnly===true||cloudRole==='branch_manager',canSubmitOwnReports:profile.canSubmitOwnReports!==false});
 const signedInName=(cloudRole==='owner'?OWNER_DISPLAY_NAME:cloudRole==='teacher'?(profile.teacherName||profile.displayName):cloudRole==='branch_manager'?(profile.managerName||profile.teacherName||profile.displayName):(profile.displayName||user.displayName))||user.displayName||user.email||'';
 document.body.dataset.cloudDisplayName=String(signedInName).trim();
 if(cloudRole==='owner'&&profile.displayName!==OWNER_DISPLAY_NAME){
   const ownerRef=doc(cloud,'companies',COMPANY_ID,'accounts',user.uid);
   setDoc(ownerRef,{displayName:OWNER_DISPLAY_NAME,updatedAt:serverTimestamp()},{merge:true}).catch(error=>console.warn('owner display name sync failed',error));
 }
 const header=document.querySelector('.header-auth-actions');
 if(header)header.innerHTML=`<span style="font-size:12px;font-weight:800">${window.DanbridgeAccess?.ROLE_LABELS?.[profile.role]||profile.role}｜${String(signedInName).trim()}</span>${profile.role==='owner'?'<button type="button" class="btn notification-bell" onclick="DanbridgeNotifications.open()" aria-label="開啟通知中心"><span class="notification-bell-icon">🔔</span><span id="notificationCount" class="notification-count" hidden>0</span></button>':''}<button type="button" class="btn" id="firebaseLogoutBtn">登出</button>`;
 document.getElementById('firebaseLogoutBtn')?.addEventListener('click',()=>signOut(auth));
 document.body.classList.toggle('teacher-cloud-role',profile.role==='teacher');
 document.body.classList.toggle('branch-manager-cloud-role',profile.role==='branch_manager');
 document.body.dataset.cloudRole=cloudRole;
 document.body.dataset.roleUx=cloudRole;
 window.ensureTeacherHoursMetric?.();

 const teacherOnly=profile.role==='teacher';
 if(teacherOnly){
   applyingCloud=true;
   window.__danbridgeSetDB(emptyDB());
   window.renderAll?.();
   applyingCloud=false;

   const teacherAllowedTabs=new Set(['dashboard','calendar','lessons']);
   const teacherTabLabels={dashboard:'我的總覽',calendar:'我的課表',lessons:'課程回報'};
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{
     const allowed=teacherAllowedTabs.has(b.dataset.tab);
     if(allowed)b.textContent=teacherTabLabels[b.dataset.tab];
     b.hidden=!allowed;
     b.classList.toggle('teacher-nav-hidden',!allowed);
     b.style.setProperty('display',allowed?'':'none',allowed?'':'important');
     b.setAttribute('aria-hidden',allowed?'false':'true');
     if(!allowed)b.tabIndex=-1;else b.removeAttribute('tabindex');
   });
   const activeSection=document.querySelector('main section.active');
   if(activeSection&&!teacherAllowedTabs.has(activeSection.id))switchTab('dashboard');

   // 老師唯讀：只保留總覽、自己的課表與課程回報。
   document.querySelectorAll('.owner-only-action,.floating-actions,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar #selectionBar,#dashboard .owner-v33-only,#dashboard .branch-scope-bar,#calendarTeacherFilter,#calendarLocationFilter,#calendarStudentFilter,#calendarRoomFilter,#calendarStateFilter,#filterStudent,#filterTeacher,#lessons .toolbar button').forEach(e=>{const target=e.matches('select')?e.closest('.calendar-field,#lessons .toolbar>div')||e:e;target.hidden=true;target.style.setProperty('display','none','important')});
   const teacherAnalysis=document.getElementById('calendarAnalysis');if(teacherAnalysis){teacherAnalysis.hidden=true;teacherAnalysis.replaceChildren();teacherAnalysis.style.setProperty('display','none','important')}
   document.querySelectorAll('.floating-actions').forEach(e=>e.remove());
   document.querySelectorAll('#students,#teachers,#drafts,#makeups,#camps,#winterCamps,#settlement,#finance,#data,#security').forEach(e=>{e.hidden=true;e.classList.remove('active');e.style.setProperty('display','none','important')});

   // 隱藏公司營收、未收款、薪資、老師總數與公司異動等敏感資訊。
   ['mTeachers','mRevenue','mUnpaid','mPayroll','mChanges'].forEach(id=>{
     document.getElementById(id)?.closest('.metric')?.style.setProperty('display','none');
   });
   document.querySelector('.dashboard-changes')?.style.setProperty('display','none');
   document.querySelector('#dashboard .card:nth-of-type(2)')?.style.setProperty('display','none');
   window.DanbridgeRoleResponsive?.apply?.();
   setTimeout(()=>window.DanbridgeRoleResponsive?.apply?.(),500);
 }else if(profile.role==='branch_manager'){
   applyingCloud=true;window.__danbridgeSetDB(emptyDB());window.renderAll?.();applyingCloud=false;
   const allowedTabs=new Set(['dashboard','students','teachers','calendar','lessons','makeups','settlement','finance']);
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{const allowed=allowedTabs.has(b.dataset.tab);b.hidden=!allowed;b.style.setProperty('display',allowed?'':'none',allowed?'':'important');if(!allowed)b.tabIndex=-1;else b.removeAttribute('tabindex')});
   const active=document.querySelector('main section.active');if(active&&!allowedTabs.has(active.id))switchTab('dashboard');
   document.querySelectorAll('.owner-only-action,.floating-actions,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar #selectionBar,#students button,#teachers button,#lessons .toolbar button,#makeups button,#settlement button,#finance button').forEach(e=>e.style.setProperty('display','none','important'));
   // 課程清單保留查看入口；點到本人授課課程時會開啟課堂回報，其他課程維持唯讀詳情。
   document.querySelectorAll('#drafts,#camps,#winterCamps,#data,#security').forEach(e=>{e.hidden=true;e.classList.remove('active');e.style.setProperty('display','none','important')});
   window.DanbridgeRoleResponsive?.apply?.();
 }else{
   const ownerTabLabels={dashboard:'總覽',students:'學生／家長',teachers:'老師',calendar:'拖曳課表',lessons:'課程紀錄',makeups:'補課中心',camps:'冬／夏令營',finance:'公司財務',data:'備份／iPad',security:'安全設定'};
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{b.hidden=false;b.classList.remove('teacher-nav-hidden');b.style.removeProperty('display');b.removeAttribute('aria-hidden');b.removeAttribute('tabindex');if(ownerTabLabels[b.dataset.tab])b.textContent=ownerTabLabels[b.dataset.tab]});
   document.querySelectorAll('#students,#teachers,#drafts,#makeups,#camps,#winterCamps,#settlement,#finance,#data,#security').forEach(e=>{e.hidden=false;e.style.removeProperty('display')});
   document.querySelectorAll('.owner-only-action,.owner-v33-only,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar .day-add,#lessons .toolbar button,#dashboard .row-actions').forEach(e=>{e.hidden=false;e.style.removeProperty('display')});
   document.querySelectorAll('#calendarTeacherFilter,#calendarLocationFilter,#calendarStudentFilter,#calendarRoomFilter,#calendarStateFilter,#filterStudent,#filterTeacher').forEach(e=>{const target=e.closest('.calendar-field,#lessons .toolbar>div')||e;target.hidden=false;target.style.removeProperty('display');target.classList.remove('teacher-redundant-filter')});
   const analysis=document.getElementById('calendarAnalysis');if(analysis){analysis.hidden=false;analysis.style.removeProperty('display')}
   if(!document.querySelector('.floating-actions')){
     const floating=document.createElement('div');floating.className='floating-actions';floating.innerHTML='<button class="btn v20-owner-action" onclick="openRecentChanges()">最近修改</button><button id="undoBtn" class="btn" onclick="undoLast()">↶ 復原</button><button id="redoBtn" class="btn" onclick="redoLast()">↷ 重做</button><button class="btn primary" onclick="openLessonModal()">＋ 新增</button>';
     const toast=document.getElementById('toast');toast?.parentNode?.insertBefore(floating,toast);
   }
   ['mTeachers','mRevenue','mUnpaid','mPayroll','mChanges'].forEach(id=>{
     document.getElementById(id)?.closest('.metric')?.style.removeProperty('display');
   });
   document.querySelector('.dashboard-changes')?.style.removeProperty('display');
   document.querySelector('#dashboard .card:nth-of-type(2)')?.style.removeProperty('display');
   setTimeout(()=>{window.DanbridgeRoleResponsive?.apply?.();window.renderAll?.()},0);
 }
}
function lessonMetaSignature(value){
 const teacherIds=(Array.isArray(value?.teacherIds)?value.teacherIds:[]).filter(Boolean).map(String).sort();
 const editableFrom=value?.editableFrom instanceof Date?value.editableFrom.toISOString():(value?.editableFrom?.toDate?.()?.toISOString?.()||String(value?.editableFrom||''));
 const editableUntil=value?.editableUntil instanceof Date?value.editableUntil.toISOString():(value?.editableUntil?.toDate?.()?.toISOString?.()||String(value?.editableUntil||''));
 return dataHash({companyId:String(value?.companyId||COMPANY_ID),lessonId:String(value?.lessonId||''),branchId:String(value?.branchId||''),lessonDate:String(value?.lessonDate||''),lessonStart:String(value?.lessonStart||''),lessonEnd:String(value?.lessonEnd||''),studentId:String(value?.studentId||''),teacherIds,editableFrom,editableUntil,active:value?.active!==false});
}
async function publishLessonMeta(){
 if(cloudRole!=='owner')return;
 const lessons=(window.__danbridgeGetDB()?.lessons||[]).filter(l=>l?.id&&!l.isDraft);
 const metaRef=collection(cloud,'companies',COMPANY_ID,'lessonMeta');
 if(!lessonMetaCacheReady){
   const existing=await getDocs(metaRef);
   lessonMetaSignatureCache=new Map(existing.docs.map(d=>[d.id,lessonMetaSignature({...d.data(),lessonId:d.id})]));
   lessonMetaCacheReady=true;
 }
 const nextIds=new Set();
 const jobs=[];
 lessons.forEach(lesson=>{
   const deadline=lessonReportDeadline(lesson);
   const [y,m,d]=String(lesson.date||'').split('-').map(Number);
   const editableFrom=new Date(y,m-1,d,0,0,0,0);
   const teacherIds=(Array.isArray(lesson.teacherIds)?lesson.teacherIds:[lesson.teacherId]).filter(Boolean).map(String).sort();
   if(!deadline||Number.isNaN(editableFrom.getTime())||!teacherIds.length)return;
   const lessonId=String(lesson.id);
   nextIds.add(lessonId);
   const payload={companyId:COMPANY_ID,lessonId,branchId:lessonBranchId(lesson),lessonDate:String(lesson.date||''),lessonStart:String(lesson.start||''),lessonEnd:String(lesson.end||''),studentId:String(lesson.studentId||''),teacherIds,editableFrom,editableUntil:deadline,active:true};
   const signature=lessonMetaSignature(payload);
   if(lessonMetaSignatureCache.get(lessonId)===signature)return;
   jobs.push(setDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId),{...payload,editableFrom:Timestamp.fromDate(editableFrom),editableUntil:Timestamp.fromDate(deadline),updatedAt:serverTimestamp()},{merge:false}).then(()=>lessonMetaSignatureCache.set(lessonId,signature)));
 });
 for(const lessonId of [...lessonMetaSignatureCache.keys()]){
   if(nextIds.has(lessonId))continue;
   jobs.push(deleteDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId)).then(()=>lessonMetaSignatureCache.delete(lessonId)));
 }
 await Promise.all(jobs);
}
async function getCompanyAccessDocs(){
 const now=Date.now();
 if(companyAccessCache&&now-companyAccessCacheAt<COMPANY_ACCESS_CACHE_TTL)return companyAccessCache;
 const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID)));
 companyAccessCache=qs.docs;
 companyAccessCacheAt=now;
 return companyAccessCache;
}
function invalidateCompanyAccessCache(){companyAccessCache=null;companyAccessCacheAt=0}
async function publishScopedViews(){
 if(cloudRole!=='owner')return;
 try{
   const sourceDb=window.__danbridgeGetDB();
   const accessDocs=await getCompanyAccessDocs();
   const jobs=[];
   for(const d of accessDocs){
     const p=d.data();
     const email=(p.email||d.id||'').trim().toLowerCase();
     if(p.active===false||!email)continue;
     if(p.role==='teacher'&&p.teacherId){
       const viewDb=filteredTeacherDB(sourceDb,p.teacherId);
       const hash=dataHash(viewDb);
       const key='teacher:'+email;
       if(scopedViewHashCache.get(key)===hash)continue;
       jobs.push(setDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email),{db:viewDb,updatedAt:serverTimestamp(),teacherId:p.teacherId,email,clientHash:hash},{merge:false}).then(()=>scopedViewHashCache.set(key,hash)));
     }else if(p.role==='branch_manager'&&Array.isArray(p.branchIds)&&p.branchIds.length){
       const scopedDb=filteredBranchDB(sourceDb,p.branchIds);
       const hash=dataHash(scopedDb);
       const key='branch:'+email;
       if(scopedViewHashCache.get(key)===hash||p.scopedClientHash===hash){scopedViewHashCache.set(key,hash);continue}
       jobs.push(setDoc(d.ref,{scopedDb,scopedClientHash:hash,scopedUpdatedAt:serverTimestamp(),branchIds:p.branchIds,active:true},{merge:true}).then(()=>scopedViewHashCache.set(key,hash)));
     }
   }
   await Promise.all(jobs);
 }catch(e){
   console.error('publishScopedViews',e);
   throw e;
 }
}
async function publishRoleViewsWithRetry(){
 if(cloudRole!=='owner')return;
 roleViewPublishQueued=true;if(roleViewPublishInFlight)return;
 roleViewPublishInFlight=true;roleViewPublishQueued=false;clearTimeout(roleViewRetryTimer);
 try{await Promise.all([publishScopedViews(),publishLessonMeta()]);roleViewRetryCount=0}
 catch(e){roleViewPublishQueued=true;roleViewRetryCount++;lessonMetaCacheReady=false;console.error('Role view background sync failed',e);cloudStatus(roleViewRetryCount<3?'主資料已同步；老師端資料正在背景補送。':'主資料已同步，但老師端資料持續補送中，請保持網路連線。',roleViewRetryCount<3?'pending':'error');roleViewRetryTimer=setTimeout(publishRoleViewsWithRetry,Math.min(30000,1000*Math.pow(2,Math.min(roleViewRetryCount,5))))}
 finally{roleViewPublishInFlight=false;if(roleViewPublishQueued&&!roleViewRetryCount)queueMicrotask(publishRoleViewsWithRetry)}
}
async function migrateLegacyLessonCloudDocuments(){
 if(cloudRole!=='owner')return;
 let migrations=[];try{migrations=JSON.parse(localStorage.getItem('danbridge_lesson_id_migration_v15_28_3')||'[]')}catch{}
 if(!Array.isArray(migrations)||!migrations.length)return;
 const byOld=new Map();
 for(const item of migrations){
   const oldId=String(item?.oldId||''),newId=String(item?.newId||'');
   if(!oldId||!newId||oldId===newId)continue;
   if(!byOld.has(oldId))byOld.set(oldId,[]);
   byOld.get(oldId).push(item);
 }
 const normalizedTeachers=v=>(Array.isArray(v?.teacherIds)?v.teacherIds:(Array.isArray(v?.reportedForTeacherIds)?v.reportedForTeacherIds:[v?.teacherId])).filter(Boolean).map(String).sort();
 const fingerprintKey=v=>[String(v?.lessonDate||v?.date||''),String(v?.lessonStart||v?.start||''),String(v?.lessonEnd||v?.end||''),String(v?.studentId||''),normalizedTeachers(v).join(',')].join('|');
 const chooseTarget=(oldId,data)=>{
   const candidates=byOld.get(oldId)||[];
   if(candidates.length===1)return candidates[0];
   const key=fingerprintKey(data||{});
   const exact=candidates.filter(x=>String(x.fingerprintKey||'')===key);
   return exact.length===1?exact[0]:null;
 };
 const unresolved=[];
 for(const [oldId,candidates] of byOld){
   try{
     for(const col of ['lessonMeta','lessonReports']){
       const oldRef=doc(cloud,'companies',COMPANY_ID,col,oldId),snap=await getDoc(oldRef);
       if(!snap.exists())continue;
       const data=snap.data()||{},target=chooseTarget(oldId,data);
       if(!target){unresolved.push({collection:col,oldId,reason:'ambiguous-fingerprint'});continue}
       await setDoc(doc(cloud,'companies',COMPANY_ID,col,target.newId),{...data,lessonId:target.newId},{merge:false});
       await deleteDoc(oldRef);
     }

   }catch(e){console.error('Legacy lesson cloud migration failed',oldId,e);unresolved.push({oldId,reason:e?.message||String(e)})}
 }
 if(unresolved.length){
   try{localStorage.setItem('danbridge_lesson_id_cloud_migration_issues_v15_28_3',JSON.stringify(unresolved))}catch{}
   console.warn('Lesson ID cloud migration has unresolved legacy documents',unresolved);
   return;
 }
 localStorage.removeItem('danbridge_lesson_id_migration_v15_28_3');
 localStorage.removeItem('danbridge_lesson_id_cloud_migration_issues_v15_28_3');
}


const SCHEDULE_NOTIFICATION_FIELDS=['date','start','end','studentId','title','location','room','branchId','deliveryMode','address','onlinePlatform','meetingUrl','status','lessonState','note'];
function lessonTeacherIds(lesson){return (Array.isArray(lesson?.teacherIds)?lesson.teacherIds:[lesson?.teacherId]).filter(Boolean).map(String)}
function lessonFingerprintForNotification(lesson){return SCHEDULE_NOTIFICATION_FIELDS.map(k=>String(lesson?.[k]??'')).join('|')+'|'+lessonTeacherIds(lesson).slice().sort().join(',')}
function lessonDisplayName(lesson,sourceDb){
 const student=(sourceDb?.students||[]).find(s=>String(s.id)===String(lesson?.studentId));
 return String(student?.name||lesson?.studentName||lesson?.title||'未命名課程');
}
function lessonTimeLabel(lesson){return [lesson?.date,lesson?.start&&lesson?.end?`${lesson.start}–${lesson.end}`:lesson?.start||''].filter(Boolean).join(' ')}
function scheduleChangeSummary(type,before,after,sourceDb){
 const target=after||before||{};
 const student=lessonDisplayName(target,sourceDb);
 if(type==='added')return `新增：${student}｜${lessonTimeLabel(target)}`;
 if(type==='removed')return `取消：${student}｜${lessonTimeLabel(target)}`;
 const changes=[];
 if(String(before?.date||'')!==String(after?.date||''))changes.push(`日期 ${before?.date||'—'} → ${after?.date||'—'}`);
 if(String(before?.start||'')!==String(after?.start||'')||String(before?.end||'')!==String(after?.end||''))changes.push(`時間 ${(before?.start||'—')}–${(before?.end||'—')} → ${(after?.start||'—')}–${(after?.end||'—')}`);
 if(String(before?.location||'')!==String(after?.location||''))changes.push(`地點 ${before?.location||'—'} → ${after?.location||'—'}`);
 if(String(before?.branchId||'')!==String(after?.branchId||''))changes.push(`校區 ${before?.branchId||'—'} → ${after?.branchId||'—'}`);
 if(String(before?.room||'')!==String(after?.room||''))changes.push(`教室 ${before?.room||'—'} → ${after?.room||'—'}`);
 if(String(before?.deliveryMode||'')!==String(after?.deliveryMode||''))changes.push(`上課方式 ${before?.deliveryMode||'—'} → ${after?.deliveryMode||'—'}`);
 if(String(before?.address||'')!==String(after?.address||''))changes.push('到府地址已更新');
 if(String(before?.meetingUrl||'')!==String(after?.meetingUrl||''))changes.push('線上課連結已更新');
 if(String(before?.title||'')!==String(after?.title||''))changes.push(`課程 ${before?.title||'—'} → ${after?.title||'—'}`);
 if(lessonTeacherIds(before).slice().sort().join(',')!==lessonTeacherIds(after).slice().sort().join(','))changes.push('授課老師已更新');
 if(String(before?.note||'')!==String(after?.note||''))changes.push('課程備註已更新');
 if(String(before?.status||'')!==String(after?.status||''))changes.push(`狀態 ${before?.status||'—'} → ${after?.status||'—'}`);
 return `修改：${student}｜${changes.slice(0,3).join('；')||lessonTimeLabel(target)}`;
}
function buildScheduleNotificationChanges(previousDb,currentDb){
 const beforeMap=new Map((previousDb?.lessons||[]).map(l=>[String(l.id),l]));
 const afterMap=new Map((currentDb?.lessons||[]).map(l=>[String(l.id),l]));
 const changes=[];
 for(const [id,after] of afterMap){
   const before=beforeMap.get(id);
   if(!before){
     for(const teacherId of lessonTeacherIds(after))changes.push({teacherId,type:'added',lessonId:id,before:null,after});
     continue;
   }
   if(lessonFingerprintForNotification(before)===lessonFingerprintForNotification(after))continue;
   const oldTeachers=new Set(lessonTeacherIds(before));
   const newTeachers=new Set(lessonTeacherIds(after));
   for(const teacherId of oldTeachers){
     if(!newTeachers.has(teacherId))changes.push({teacherId,type:'removed',lessonId:id,before,after:null});
     else changes.push({teacherId,type:'modified',lessonId:id,before,after});
   }
   for(const teacherId of newTeachers){if(!oldTeachers.has(teacherId))changes.push({teacherId,type:'added',lessonId:id,before:null,after});}
 }
 for(const [id,before] of beforeMap){
   if(afterMap.has(id))continue;
   for(const teacherId of lessonTeacherIds(before))changes.push({teacherId,type:'removed',lessonId:id,before,after:null});
 }
 return changes;
}
function buildScheduleLessonChanges(previousDb,currentDb){
 const beforeMap=new Map((previousDb?.lessons||[]).map(l=>[String(l.id),l]));
 const afterMap=new Map((currentDb?.lessons||[]).map(l=>[String(l.id),l]));
 const changes=[];
 for(const [id,after] of afterMap){
   const before=beforeMap.get(id);
   if(!before)changes.push({type:'added',lessonId:id,before:null,after});
   else if(lessonFingerprintForNotification(before)!==lessonFingerprintForNotification(after))changes.push({type:'modified',lessonId:id,before,after});
 }
 for(const [id,before] of beforeMap){if(!afterMap.has(id))changes.push({type:'removed',lessonId:id,before,after:null})}
 return changes;
}
async function publishScheduleChangeNotifications(previousDb,currentDb,batchKey){
 if(cloudRole!=='owner'||!ownerBaselineReady||!previousDb)return;
 const teacherChanges=buildScheduleNotificationChanges(previousDb,currentDb);
 const lessonChanges=buildScheduleLessonChanges(previousDb,currentDb);
 if(!lessonChanges.length)return;
 const accessDocs=await getCompanyAccessDocs();
 const accessByTeacher=new Map();
 const managers=[];
 for(const d of accessDocs){
   const a=d.data()||{};
   const email=String(a.email||d.id||'').trim().toLowerCase();
   if(a.active===false||!email)continue;
   if(a.role==='branch_manager'&&Array.isArray(a.branchIds)&&a.branchIds.length){
     managers.push({email,role:'branch_manager',teacherName:a.managerName||a.teacherName||'',branchIds:a.branchIds.map(String)});
     continue;
   }
   if(a.role!=='teacher'||!a.teacherId)continue;
   const teacherId=String(a.teacherId);
   if(!accessByTeacher.has(teacherId))accessByTeacher.set(teacherId,[]);
   accessByTeacher.get(teacherId).push({email,role:'teacher',teacherName:a.teacherName||''});
 }
 const grouped=new Map();
 const addRecipientItem=(recipient,item,teacherId='')=>{
   const key=recipient.email;
   if(!grouped.has(key))grouped.set(key,{recipient,teacherId,items:new Map()});
   grouped.get(key).items.set(`${item.type}:${item.lessonId}`,item);
 };
 for(const change of teacherChanges){
   const recipients=accessByTeacher.get(String(change.teacherId))||[];
   for(const recipient of recipients)addRecipientItem(recipient,change,String(change.teacherId));
 }
 for(const change of lessonChanges){
   const affectedBranches=new Set([change.before&&lessonBranchId(change.before),change.after&&lessonBranchId(change.after)].filter(Boolean).map(String));
   for(const manager of managers){if(manager.branchIds.some(branchId=>affectedBranches.has(branchId)))addRecipientItem(manager,change,'')}
 }
 const jobs=[];
 for(const {recipient,teacherId,items:itemsByKey} of grouped.values()){
   if(!recipient.email)continue;
   const items=[...itemsByKey.values()];
   const safeBatch=String(batchKey||dataHash(currentDb)).replace(/[^a-zA-Z0-9_-]/g,'_');
   const safeRecipient=recipient.email.replace(/[^a-zA-Z0-9_-]/g,'_');
   const notificationRef=doc(cloud,'companies',COMPANY_ID,'scheduleNotifications',`${safeBatch}_${safeRecipient}`);
   const details=items.map(item=>({
     type:item.type,lessonId:item.lessonId,
     summary:scheduleChangeSummary(item.type,item.before,item.after,currentDb),
     studentName:lessonDisplayName(item.after||item.before,currentDb),
     beforeTime:item.before?lessonTimeLabel(item.before):'',
     afterTime:item.after?lessonTimeLabel(item.after):'',
     before:item.before?{date:item.before.date||'',start:item.before.start||'',end:item.before.end||'',studentId:item.before.studentId||'',title:item.before.title||'',location:item.before.location||'',branchId:item.before.branchId||'',deliveryMode:item.before.deliveryMode||'',room:item.before.room||'',address:item.before.address||'',onlinePlatform:item.before.onlinePlatform||'',meetingUrl:item.before.meetingUrl||'',status:item.before.status||'',note:item.before.note||'',teacherIds:lessonTeacherIds(item.before)}:null,
     after:item.after?{date:item.after.date||'',start:item.after.start||'',end:item.after.end||'',studentId:item.after.studentId||'',title:item.after.title||'',location:item.after.location||'',branchId:item.after.branchId||'',deliveryMode:item.after.deliveryMode||'',room:item.after.room||'',address:item.after.address||'',onlinePlatform:item.after.onlinePlatform||'',meetingUrl:item.after.meetingUrl||'',status:item.after.status||'',note:item.after.note||'',teacherIds:lessonTeacherIds(item.after)}:null
   }));
   const manager=recipient.role==='branch_manager';
   jobs.push(setDoc(notificationRef,{companyId:COMPANY_ID,recipientEmail:recipient.email,recipientRole:recipient.role,teacherId,branchIds:manager?recipient.branchIds:[],teacherName:recipient.teacherName||'',title:'課表更新通知',message:manager?`您管理的校區課表有 ${items.length} 個變更`:`您的課表有 ${items.length} 個變更`,changeCount:items.length,details,read:false,createdAt:serverTimestamp(),createdBy:cloudUid,createdByName:'Daniel'}));
 }
 if(jobs.length)await withSyncTimeout(Promise.all(jobs),15000);
}
function queueScheduleChangeNotifications(previousDb,currentDb,batchKey){
 if(cloudRole!=='owner'||!ownerBaselineReady||!previousDb)return;
 const key=String(batchKey||dataHash(currentDb));
 const job={previousDb:deepCopy(previousDb),currentDb:deepCopy(currentDb),batchKey:key,attempts:0,timer:null};
 scheduleNotificationDeliveryJobs.set(key,job);
 const deliver=async()=>{
   if(!scheduleNotificationDeliveryJobs.has(key)||cloudRole!=='owner')return;
   try{await publishScheduleChangeNotifications(job.previousDb,job.currentDb,job.batchKey);scheduleNotificationDeliveryJobs.delete(key)}
   catch(e){job.attempts++;console.error('Schedule notification background delivery failed',e);cloudStatus(job.attempts<3?'課表已同步；老師通知正在背景補送。':'課表已同步，但老師通知持續補送中，請保持網路連線。',job.attempts<3?'pending':'error');job.timer=setTimeout(deliver,Math.min(30000,1000*Math.pow(2,Math.min(job.attempts,5))))}
 };
 deliver();
}
function installScheduleNotificationUI(){
 if(document.getElementById('scheduleNotificationModal'))return;
 const modal=document.createElement('div');
 modal.id='scheduleNotificationModal';modal.className='schedule-notification-backdrop';modal.hidden=true;
 modal.innerHTML=`<div class="schedule-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="scheduleNotificationTitle"><div class="schedule-notification-head"><div><div class="schedule-notification-eyebrow">SCHEDULE UPDATE</div><h2 id="scheduleNotificationTitle">課表更新通知</h2></div></div><div id="scheduleNotificationBody" class="schedule-notification-body"></div><div class="schedule-notification-actions"><button type="button" class="btn" id="scheduleNotificationLater">稍後查看</button><button type="button" class="btn primary" id="scheduleNotificationAcknowledge">知道了</button></div></div>`;
 document.body.appendChild(modal);
 document.getElementById('scheduleNotificationLater').onclick=()=>{modal.hidden=true};
 document.getElementById('scheduleNotificationAcknowledge').onclick=acknowledgeCurrentScheduleNotification;
}
function formatNotificationTimestamp(value){try{const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return ''}}
function renderScheduleNotification(notification){
 installScheduleNotificationUI();
 const modal=document.getElementById('scheduleNotificationModal');
 const body=document.getElementById('scheduleNotificationBody');
 if(!modal||!body||!notification)return;
 const details=Array.isArray(notification.details)?notification.details:[];
 body.innerHTML=`<p class="schedule-notification-lead"><b>Daniel 已更新您的課表</b><span>${escapeHTML(notification.message||`共有 ${details.length} 個變更`)}，已合併整理如下。</span></p><div class="schedule-notification-table-wrap"><table class="schedule-notification-table"><thead><tr><th>異動</th><th>學生／課程</th><th>原課程</th><th>新課程</th><th>內容</th></tr></thead><tbody>${details.map(item=>`<tr data-type="${escapeHTML(item.type||'modified')}"><td><span class="schedule-notification-type">${item.type==='added'?'新增':item.type==='removed'?'取消':'修改'}</span></td><td><b>${escapeHTML(item.studentName||'課程')}</b></td><td>${escapeHTML(item.beforeTime||'—')}</td><td>${escapeHTML(item.afterTime||'—')}</td><td>${escapeHTML(item.summary||'課表內容已更新')}</td></tr>`).join('')}</tbody></table></div><div class="schedule-notification-time">更新時間：${escapeHTML(formatNotificationTimestamp(notification.createdAt)||'剛剛')}</div>`;
 modal.dataset.notificationId=notification.id||'';
 modal.dataset.notificationIds=JSON.stringify(Array.isArray(notification.notificationIds)?notification.notificationIds.filter(Boolean):[notification.id].filter(Boolean));
 modal.hidden=false;
}
async function acknowledgeCurrentScheduleNotification(){
 const modal=document.getElementById('scheduleNotificationModal');
 let ids=[];try{ids=JSON.parse(modal?.dataset.notificationIds||'[]')}catch{}
 if(!ids.length&&modal?.dataset.notificationId)ids=[modal.dataset.notificationId];
 if(!ids.length)return;
 const button=document.getElementById('scheduleNotificationAcknowledge');
 try{
   if(button){button.disabled=true;button.textContent='處理中…'}
   await Promise.all(ids.map(id=>setDoc(doc(cloud,'companies',COMPANY_ID,'scheduleNotifications',id),{read:true,acknowledgedAt:serverTimestamp(),acknowledgedBy:cloudUid},{merge:true})));
   if(modal)modal.hidden=true;
 }catch(e){console.error('Acknowledge schedule notification failed',e);cloudStatus('通知確認失敗：'+(e?.message||e),'error')}
 finally{if(button){button.disabled=false;button.textContent='知道了'}}
}
function subscribeScheduleNotifications(){
 unsubscribeScheduleNotifications?.();unsubscribeScheduleNotifications=null;scheduleNotificationDocuments=[];
 if(!['teacher','branch_manager'].includes(cloudRole)||!cloudEmailKey)return;
 installScheduleNotificationUI();
 const q=query(collection(cloud,'companies',COMPANY_ID,'scheduleNotifications'),where('recipientEmail','==',cloudEmailKey));
 unsubscribeScheduleNotifications=onSnapshot(q,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.hasPendingWrites)return;
   scheduleNotificationDocuments=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.read!==true).sort((a,b)=>{const at=a.createdAt?.toMillis?.()||0,bt=b.createdAt?.toMillis?.()||0;return at-bt});
   const current=scheduleNotificationDocuments[0];
   if(current&&!document.getElementById('scheduleNotificationModal')?.hidden)return;
   if(current){
     const details=scheduleNotificationDocuments.flatMap(n=>Array.isArray(n.details)?n.details:[]);
     renderScheduleNotification({...current,notificationIds:scheduleNotificationDocuments.map(n=>n.id),details,message:current.recipientRole==='branch_manager'?`您管理的校區課表共有 ${details.length} 個變更`:`您的課表共有 ${details.length} 個變更`});
   }
 },e=>{console.error('Schedule notification listener failed',e);cloudStatus('課表通知讀取失敗：'+(e?.message||e),'error')});
}

async function uploadOwnerState(force=false){
 if(cloudRole!=='owner'||applyingCloud)return;
 ownerUploadQueued=true;
 if(ownerUploadInFlight)return;
 if(!navigator.onLine){setOfflineStatus();return}
 const current=deepCopy(window.__danbridgeGetDB());
 const previousPublished=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):null;
 const currentScore=window.__danbridgeDataScore?.(current)||0;
 if(currentScore===0){cloudStatus('已阻止空白資料上傳；請先確認本機或版本紀錄中的資料。','error');ownerUploadQueued=false;return}
 const hash=dataHash(current);
 const uploadMutationVersion=localMutationVersion;
 if(!force&&hash===lastUploadedHash){ownerUploadQueued=false;localDirtyHash='';cloudStatus('資料已是最新版本','ok');return}
 ownerUploadInFlight=true;ownerUploadQueued=false;cloudStatus('雲端同步中…','pending');
 let syncStage='主資料';
 try{
   // V15.29.2：主資料是同步成功的唯一必要條件。老師／校區檢視與舊 ID 遷移改為背景工作，
   // 避免任何附屬文件或歷史遷移卡住，讓畫面永久停在「準備同步」。
   await withSyncTimeout(setDoc(doc(cloud,'companies',COMPANY_ID,'data','main'),{db:current,updatedAt:serverTimestamp(),updatedBy:cloudUid,clientHash:hash},{merge:false}),7000);
   lastUploadedHash=hash;lastCloudSnapshotHash=hash;ownerRetryCount=0;
   const latestHash=dataHash(window.__danbridgeGetDB());
   if(localMutationVersion===uploadMutationVersion&&latestHash===hash){localDirtyHash='';}
   else{ownerUploadQueued=true;}
   cloudStatus(localDirtyHash?'目前變更已同步，另有新變更準備同步…':'已同步到雲端','ok');

   // 主資料成功後立即發布各角色檢視，不等待通知文件完成。
   publishRoleViewsWithRetry();

   queueScheduleChangeNotifications(previousPublished,current,hash);
   lastPublishedOwnerDB=deepCopy(current);ownerBaselineReady=true;
   if(!legacyMigrationStarted){
     legacyMigrationStarted=true;
     migrateLegacyLessonCloudDocuments().catch(e=>console.error('Legacy lesson migration background task failed',e));
   }
 }catch(e){
   console.error('Owner cloud sync failed at '+syncStage,e);ownerUploadQueued=true;ownerRetryCount++;
   const retrying=navigator.onLine&&ownerRetryCount<3;
   cloudStatus((navigator.onLine?`雲端連線較慢（${syncStage}），系統正在自動重試：`:'目前離線，變更已保存在本機：')+(e.message||e),navigator.onLine?(retrying?'pending':'error'):'offline');
   scheduleOwnerRetry();
 }finally{
   ownerUploadInFlight=false;
   if(ownerUploadQueued&&navigator.onLine){clearTimeout(syncTimer);if(ownerRetryCount)scheduleOwnerRetry();else syncTimer=setTimeout(()=>uploadOwnerState(),80);}
 }
}
function queueOwnerCloudSave(){
 if(cloudRole!=='owner')return;
 localMutationVersion++;
 localDirtyHash=dataHash(window.__danbridgeGetDB());
 ownerUploadQueued=true;
 cloudStatus(navigator.onLine?'變更已儲存，準備同步…':'變更已保存在本機；恢復網路後自動同步。',navigator.onLine?'pending':'offline');
 clearTimeout(syncTimer);syncTimer=setTimeout(()=>uploadOwnerState(),120);
}
function installCloudSave(){
 window.__danbridgeQueueCloudSave=queueOwnerCloudSave;
 window.saveDB=function(){
   if(cloudRole==='teacher'||cloudRole==='branch_manager'){alert(cloudRole==='teacher'?'老師帳號目前為唯讀，只能查看自己的課表。':'校區管理者目前為唯讀，只能查看指定校區資料。');return}
   return originalSaveDB?.();
 };
}
function subscribeOwner(){
 const ref=doc(cloud,'companies',COMPANY_ID,'data','main');
 unsubscribeState?.();
 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},async snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   const localBest=window.__danbridgeRecoverBestLocalDB?.();
   if(!snap.exists()){
     if(localBest){
       applyingCloud=true;window.__danbridgeSetDB(deepCopy(localBest.db));window.renderAll?.();applyingCloud=false;
       cloudStatus('雲端尚無資料，已載入 '+localBest.label+'，正在建立雲端資料…');
       await uploadOwnerState();
     }else cloudStatus('雲端尚無資料，且這台裝置找不到可恢復的資料。','error');
     return;
   }
   const incoming=snap.data()?.db;
   const incomingHash=snap.data()?.clientHash||dataHash(incoming);
   const incomingScore=window.__danbridgeDataScore?.(incoming)||0;
   if(!incoming||incomingScore===0){
     if(localBest){
       applyingCloud=true;window.__danbridgeSetDB(deepCopy(localBest.db));
       try{localStorage.setItem('danbridge_scheduler_v1',JSON.stringify(window.__danbridgeGetDB()))}catch{}
       window.renderAll?.();applyingCloud=false;
       cloudStatus('偵測到空白雲端資料，已從 '+localBest.label+' 恢復並重新同步…','error');
       await uploadOwnerState();
     }else cloudStatus('雲端資料為空，這台裝置也找不到可恢復版本；系統沒有再寫入空資料。','error');
     return;
   }
   if(snap.metadata.hasPendingWrites)return;
   const currentHash=dataHash(window.__danbridgeGetDB());
   // 本機尚有未確認上傳的修改時，任何不同版本的遠端快照都視為舊資料。
   // 這可防止拖曳、編輯或批次操作在 debounce / 網路延遲期間被倒灌復原。
   if(localDirtyHash&&incomingHash!==localDirtyHash){
     cloudStatus('本機變更等待雲端確認，已忽略較舊的雲端資料…','pending');
     if(!ownerUploadInFlight){clearTimeout(syncTimer);syncTimer=setTimeout(()=>uploadOwnerState(),80);}
     return;
   }
   if(incomingHash===lastCloudSnapshotHash&&incomingHash===currentHash)return;
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());
   setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   lastCloudSnapshotHash=incomingHash;lastUploadedHash=incomingHash;
   lastPublishedOwnerDB=deepCopy(incoming);ownerBaselineReady=true;
   if(localDirtyHash===incomingHash)localDirtyHash='';
   cloudStatus(`雲端資料已更新：學生 ${incoming.students?.length||0}、老師 ${incoming.teachers?.length||0}、課程 ${incoming.lessons?.length||0}`,'ok');
 },err=>{console.error('owner snapshot',err);cloudStatus('讀取雲端主資料失敗：'+(err.message||err),'error')});
}
async function subscribeTeacher(){
 if(!cloudTeacherId)throw new Error('老師帳號尚未綁定 teacherId。');
 if(!cloudEmailKey)throw new Error('無法取得老師 Gmail。');
 // 老師檢視以 Gmail 作為文件 ID：老闆可在老師首次登入前就建立與更新。
 const ref=doc(cloud,'companies',COMPANY_ID,'teacherViews',cloudEmailKey);
 unsubscribeState?.();

 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   if(snap.metadata.hasPendingWrites)return;
   if(!snap.exists()){
     const best=window.__danbridgeRecoverBestLocalDB?.();
     if(best){applyingCloud=true;window.__danbridgeSetDB(filteredTeacherDB(best.db,cloudTeacherId));window.renderAll?.();applyingCloud=false;}
     cloudStatus('尚未建立這位老師的課表檢視；已保留最後可用資料，請老闆登入重新發布。','error');
     return;
   }
   const raw=snap.data()?.db||emptyDB();
   if((window.__danbridgeDataScore?.(raw)||0)===0){cloudStatus('老師課表檢視為空；已保留最後可用資料。','error');return;}
   // 前端再次依 teacherId 過濾，防止舊檢視夾帶其他老師資料。
   const incoming=filteredTeacherDB(raw,cloudTeacherId);
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   cloudStatus('老師課表已同步','ok');
 },err=>{
   console.error('讀取老師課表失敗',err);
   cloudStatus('讀取老師課表失敗：'+(err.message||err),'error');
 });
}

function revokeCurrentRoleAccess(message){
 applyingCloud=true;window.__danbridgeSetDB(emptyDB());window.renderAll?.();applyingCloud=false;
 cloudStatus(message,'error');setTimeout(()=>signOut(auth).catch(e=>console.error('forced role sign-out failed',e)),0);
}
function subscribeRoleAccessGuard(){
 unsubscribeAccessGuard?.();unsubscribeAccessGuard=null;
 if(cloudRole==='owner'||!cloudEmailKey)return;
 const accessRef=doc(cloud,'companyAccess',cloudEmailKey);
 unsubscribeAccessGuard=onSnapshot(accessRef,snap=>{
   const access=snap.exists()?snap.data()||{}:null;
   const valid=!!access&&access.active===true&&access.companyId===COMPANY_ID&&roleAccessSignature(access)===cloudRoleAccessSignature;
   if(!valid)revokeCurrentRoleAccess('此帳號權限已被移除或變更，系統已安全登出。');
 },e=>{console.error('role access guard failed',e);cloudStatus('權限狀態暫時無法確認，系統正在重新連線。','pending')});
}

async function subscribeBranchManager(){
 if(!cloudEmailKey||!cloudBranchIds.length)throw new Error('校區管理者尚未綁定校區。');
 unsubscribeState?.();
 // 直接監聽自己的 companyAccess 文件。此路徑同時保存角色與 scopedDb，
 // 不需要另外部署 branchViews Firestore 規則。
 const accessRef=doc(cloud,'companyAccess',cloudEmailKey);
 unsubscribeState=onSnapshot(accessRef,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   if(snap.metadata.hasPendingWrites)return;
   if(!snap.exists()){
     cloudStatus('校區管理權限已被移除，請聯絡 Owner。','error');
     return;
   }
   const access=snap.data()||{};
   if(access.active===false){cloudStatus('校區管理者帳號已停用。','error');return}
   const latestBranchIds=Array.isArray(access.branchIds)&&access.branchIds.length?access.branchIds:cloudBranchIds;
   cloudBranchIds=latestBranchIds;
   cloudTeacherId=access.teacherId||cloudTeacherId||'';
   window.DanbridgeAccess?.setContext({role:'branch_manager',branchIds:cloudBranchIds,teacherId:cloudTeacherId,email:cloudEmailKey,readOnly:true,canSubmitOwnReports:true});
   const raw=access.scopedDb;
   if(!raw){
     cloudStatus('校區資料尚未發布；請 Owner 登入並儲存一次資料。','error');
     return;
   }
   const incoming=filteredBranchDB(raw,cloudBranchIds);
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());
   setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   cloudStatus(`校區資料已同步：學生 ${incoming.students?.length||0}、老師 ${incoming.teachers?.length||0}、課程 ${incoming.lessons?.length||0}`,'ok');
 },err=>{
   console.error('讀取校區權限資料失敗',err);
   cloudStatus('讀取校區資料失敗：'+(err.message||err),'error');
 });
}



window.addEventListener('offline',()=>setOfflineStatus());
window.addEventListener('online',()=>{cloudStatus('網路已恢復，正在檢查待同步變更…','pending');if(cloudRole==='owner'){ownerUploadQueued=true;clearTimeout(ownerRetryTimer);uploadOwnerState()}else cloudStatus('網路已恢復，正在重新連線…','pending')});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloudRole==='owner'&&ownerUploadQueued&&navigator.onLine)uploadOwnerState()});

setAuthCard();
installCloudSave();
installTeacherReportUI();
installClassFocusMode();
installBranchManagerAccessEvents();
onAuthStateChanged(auth,async user=>{
 unsubscribeState?.();unsubscribeState=null;unsubscribeReports?.();unsubscribeReports=null;unsubscribeScheduleNotifications?.();unsubscribeScheduleNotifications=null;scheduleNotificationDocuments=[];lessonReportDocuments=[];lessonMetaSignatureCache=new Map();lessonMetaCacheReady=false;scopedViewHashCache=new Map();
 unsubscribeAccessGuard?.();unsubscribeAccessGuard=null;
 if(!user){lastPublishedOwnerDB=null;ownerBaselineReady=false;scheduleNotificationDeliveryJobs.forEach(job=>clearTimeout(job.timer));scheduleNotificationDeliveryJobs.clear();clearTimeout(roleViewRetryTimer);roleViewPublishInFlight=false;roleViewPublishQueued=false;roleViewRetryCount=0;cloudRole='';cloudTeacherId='';cloudBranchIds=[];cloudUid='';cloudEmailKey='';cloudRoleAccessSignature='';window.__danbridgeLessonIdMigrationAuthority=false;window.DanbridgeAccess?.setContext({role:'',branchIds:[],teacherId:'',email:'',readOnly:true});showCloudLogin();cloudStatus('尚未登入');return}
 try{
   cloudStatus('正在載入權限…');const profile=await ensureProfile(user);applyRoleUI(profile,user);showCloudApp();
   if(profile.role==='owner'){subscribeOwner();setTimeout(()=>{renderCloudUserManager();renderBranchManagerAccess()},0)}else if(profile.role==='teacher')subscribeTeacher();else if(profile.role==='branch_manager')subscribeBranchManager();else throw new Error('不支援的角色：'+profile.role);subscribeRoleAccessGuard();subscribeLessonReports();subscribeScheduleNotifications();
 }catch(e){console.error(e);await signOut(auth);showCloudLogin();showCloudLoginError(e.message);cloudStatus(e.message,'error')}
});
