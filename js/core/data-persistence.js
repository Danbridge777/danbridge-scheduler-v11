/** Danbridge Scheduler V15.20 — local persistence, backup, and branch migration layer. */


const LESSON_ID_MIGRATION_KEY='danbridge_lesson_id_migration_v15_28_3';
const LESSON_ID_MIGRATION_ISSUES_KEY='danbridge_lesson_id_migration_issues_v15_28_3';
function lessonIdentityFingerprint(lesson={}){
 const teacherIds=(Array.isArray(lesson.teacherIds)?lesson.teacherIds:[lesson.teacherId]).filter(Boolean).map(String).sort();
 return {
   lessonDate:String(lesson.date||lesson.lessonDate||''),
   lessonStart:String(lesson.start||lesson.lessonStart||''),
   lessonEnd:String(lesson.end||lesson.lessonEnd||''),
   studentId:String(lesson.studentId||''),
   teacherIds
 };
}
function lessonFingerprintKey(value={}){
 const f=lessonIdentityFingerprint(value);
 return [f.lessonDate,f.lessonStart,f.lessonEnd,f.studentId,f.teacherIds.join(',')].join('|');
}
function recordLessonMigrationIssue(issue){
 try{
   const previous=JSON.parse(localStorage.getItem(LESSON_ID_MIGRATION_ISSUES_KEY)||'[]');
   const next=[...previous,{...issue,at:new Date().toISOString()}].slice(-200);
   localStorage.setItem(LESSON_ID_MIGRATION_ISSUES_KEY,JSON.stringify(next));
 }catch(e){console.warn('Lesson ID migration issue record failed',e)}
}
function lessonIdMigrationAllowed(){return window.__danbridgeLessonIdMigrationAuthority===true}
function normalizeLessonIdentityData(x,{allowMigration=lessonIdMigrationAllowed()}={}){
 const lessons=Array.isArray(x?.lessons)?x.lessons:[];
 const originalGroups=new Map();
 for(const lesson of lessons){
   const oldId=String(lesson?.id||'').trim();
   if(!originalGroups.has(oldId))originalGroups.set(oldId,[]);
   originalGroups.get(oldId).push(lesson);
 }
 if(!allowMigration){
   const seen=new Set();
   for(const lesson of lessons){
     const id=String(lesson?.id||'').trim();
     if(!id||seen.has(id)||!isCanonicalLessonId(id))lesson.__lessonIdMigrationRequired=true;
     seen.add(id);
   }
   return x;
 }
 const used=new Set(),migration=[];
 for(const lesson of lessons){
   const oldId=String(lesson?.id||'').trim();
   let newId=oldId;
   if(!isCanonicalLessonId(oldId)||used.has(oldId))newId=createLessonId();
   while(used.has(newId))newId=createLessonId();
   used.add(newId);lesson.id=newId;delete lesson.__lessonIdMigrationRequired;
   if(oldId!==newId){migration.push({oldId,newId,fingerprint:lessonIdentityFingerprint(lesson),fingerprintKey:lessonFingerprintKey(lesson)});}
 }
 const migrationsByOld=new Map();
 for(const item of migration){if(!migrationsByOld.has(item.oldId))migrationsByOld.set(item.oldId,[]);migrationsByOld.get(item.oldId).push(item)}
 const remapRecord=(record,oldId)=>{
   const candidates=migrationsByOld.get(String(oldId||''))||[];
   if(!candidates.length)return oldId;
   if(candidates.length===1)return candidates[0].newId;
   const key=lessonFingerprintKey(record||{});
   const exact=candidates.filter(c=>c.fingerprintKey===key);
   if(exact.length===1)return exact[0].newId;
   recordLessonMigrationIssue({type:'ambiguous-related-record',oldId:String(oldId||''),fingerprintKey:key,candidateIds:candidates.map(c=>c.newId)});
   return oldId;
 };
 const walk=value=>{
   if(Array.isArray(value)){value.forEach(walk);return}
   if(!value||typeof value!=='object')return;
   for(const [k,v] of Object.entries(value)){
     if(k==='lessonId'&&typeof v==='string')value[k]=remapRecord(value,v);
     else if(k==='lessonIds'&&Array.isArray(v))value[k]=v.map(id=>remapRecord(value,id));
     else walk(v);
   }
 };
 for(const [k,v] of Object.entries(x||{})){if(k!=='lessons')walk(v)}
 if(migration.length){
   try{
     const previous=JSON.parse(localStorage.getItem(LESSON_ID_MIGRATION_KEY)||'[]');
     const merged=[...previous,...migration].filter((m,i,a)=>a.findIndex(x=>x.oldId===m.oldId&&x.newId===m.newId)===i);
     localStorage.setItem(LESSON_ID_MIGRATION_KEY,JSON.stringify(merged));
   }catch(e){console.warn('Lesson ID migration record failed',e)}
 }
 return x;
}

function defaultBranches(){return (window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).map(x=>({...x}))}
function deliveryModeForRecord(x={}){return x.deliveryMode||(x.location==='到府'?'home':x.location==='線上課'?'online':'onsite')}
function branchIdForRecord(x){if(x?.branchId)return x.branchId;const mode=deliveryModeForRecord(x);return mode==='onsite'?(window.DanbridgeAccess?.branchIdFromLocation?.(x?.location||'')||'art_museum'):'unassigned'}
function normalizeBranchData(x){
 x.branches=Array.isArray(x.branches)&&x.branches.length?x.branches:defaultBranches();
 x.winterCampRegistrations=(Array.isArray(x.winterCampRegistrations)?x.winterCampRegistrations:[]).map(r=>({...r,season:'winter'}));
 x.students=(x.students||[]).map(st=>({...st,branchIds:Array.isArray(st.branchIds)&&st.branchIds.length?[...new Set(st.branchIds)]:[]}));
 x.teachers=(x.teachers||[]).map(t=>({...t,assignedBranchIds:Array.isArray(t.assignedBranchIds)&&t.assignedBranchIds.length?[...new Set(t.assignedBranchIds)]:[]}));
 x.lessons=(x.lessons||[]).map(l=>{const deliveryMode=deliveryModeForRecord(l),branchId=branchIdForRecord(l);return {...l,deliveryMode,branchId,location:deliveryMode==='onsite'?(window.DanbridgeAccess?.branchName?.(branchId)||l.location||'美術東四路'):(deliveryMode==='home'?'到府':'線上課'),room:deliveryMode==='onsite'?(l.room||''):'',address:deliveryMode==='home'?(l.address||''):'',onlinePlatform:deliveryMode==='online'?(l.onlinePlatform||'Google Meet'):'',meetingUrl:deliveryMode==='online'?(l.meetingUrl||''):''}});
 // Loading/saving unrelated records must never merge registrations or reprice
 // an existing agreement. Registration IDs and amounts belong to the ledger;
 // only an explicit registration edit may recalculate its fee.
 x.summerCampRegistrations=Array.isArray(x.summerCampRegistrations)?x.summerCampRegistrations:[];
 x.makeups=(x.makeups||[]).map(m=>({...m,branchId:m.branchId||branchIdForRecord((x.lessons||[]).find(l=>l.id===m.lessonId)||m)}));
 x.fixedExpenses=(x.fixedExpenses||[]).map(e=>({...e,branchId:e.branchId||'company'}));
 x.oneTimeExpenses=(x.oneTimeExpenses||[]).map(e=>({...e,branchId:e.branchId||'company'}));
 return normalizeLessonIdentityData(x);
}

function loadDB(){try{const raw=localStorage.getItem(LS_KEY);const x=JSON.parse(raw||'{"students":[],"teachers":[],"lessons":[],"makeups":[],"changes":[],"teacherGroups":[],"winterTeacherGroups":[],"summerCampClasses":[],"summerCampRegistrations":[],"winterCampClasses":[],"settlementRecords":[],"fixedExpenses":[],"oneTimeExpenses":[]}');x.students||=[];x.teachers||=[];x.lessons||=[];x.makeups||=[];x.changes||=[];x.teacherGroups||=[];x.winterTeacherGroups||=[];x.summerCampClasses||=[];x.summerCampRegistrations||=[];x.winterCampClasses||=[];x.settlementRecords||=[];x.fixedExpenses||=[];x.oneTimeExpenses||=[];x.students=x.students.map(st=>({...st,homeAddress:st.homeAddress||''}));x.teachers=x.teachers.map(t=>({...t,minWeeklyHours:+t.minWeeklyHours||0,workDays:Array.isArray(t.workDays)&&t.workDays.length?[...new Set(t.workDays.map(Number))]:[1,2,3,4,5]}));x.lessons=x.lessons.map(l=>({...l,room:l.room||'',paymentStatus:l.paymentStatus||'unpaid',chargeStudent:l.chargeStudent||'yes',payTeacher:l.payTeacher||'yes',seriesId:l.seriesId||'',location:l.location||'美術東四路',address:l.address||'',campId:normalizeCampCode(l.campId||''),teacherIds:Array.isArray(l.teacherIds)&&l.teacherIds.length?[...new Set(l.teacherIds)]:[l.teacherId].filter(Boolean),lessonState:(l.lessonState||(l.isDraft?'draft':'active')),isDraft:(l.lessonState?l.lessonState==='draft':!!l.isDraft),draftOriginal:null}));return normalizeBranchData(x)}catch{return normalizeBranchData({students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[]})}}
function normalizeLessonStates(){db.lessons=(db.lessons||[]).map(l=>{const state=l.lessonState||(l.isDraft?'draft':'active');return{...l,lessonState:state,isDraft:state==='draft',draftOriginal:null}})}
let scheduleLocalSaveTimer=null,scheduleLocalSaveIdle=null;
let largeLocalSnapshotConnection=null,localSnapshotSequence=0,largeSnapshotChain=Promise.resolve();
function openLargeLocalSnapshots(){
 if(largeLocalSnapshotConnection)return largeLocalSnapshotConnection;
 largeLocalSnapshotConnection=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(new Error('瀏覽器不支援大容量本機備份'));return}
  const request=window.indexedDB.open('danbridge-local-snapshots',1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots')};
  request.onerror=()=>reject(request.error||new Error('無法開啟本機備份'));
  request.onblocked=()=>reject(new Error('本機備份正被其他舊分頁占用'));
  request.onsuccess=()=>{const connection=request.result;connection.onversionchange=()=>{connection.close();largeLocalSnapshotConnection=null};resolve(connection)};
 }).catch(error=>{largeLocalSnapshotConnection=null;throw error});
 return largeLocalSnapshotConnection;
}
function persistLargeLocalSnapshot(serialized,sequence){
 // Serialize transactions, so an older asynchronous fallback cannot replace
 // a newer snapshot. This store is a recovery copy, never cloud authority.
 largeSnapshotChain=largeSnapshotChain.catch(()=>{}).then(async()=>{
  const connection=await openLargeLocalSnapshots();
  await new Promise((resolve,reject)=>{
   const transaction=connection.transaction('snapshots','readwrite');
   transaction.objectStore('snapshots').put({schema:'danbridge-local-snapshot-v1',serialized,savedAt:new Date().toISOString()},LS_KEY);
   transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error||new Error('本機備份交易未完成'));transaction.onerror=()=>reject(transaction.error||new Error('本機備份寫入失敗'));
  });
  if(sequence===localSnapshotSequence)window.__danbridgeLocalSnapshotState={state:'saved',storage:'indexeddb'};
 });
 return largeSnapshotChain;
}
window.__danbridgeReadLargeLocalSnapshot=async()=>{
 const connection=await openLargeLocalSnapshots();
 return new Promise((resolve,reject)=>{const transaction=connection.transaction('snapshots','readonly'),request=transaction.objectStore('snapshots').get(LS_KEY);let value;request.onsuccess=()=>{value=request.result};transaction.oncomplete=()=>resolve(value?.schema==='danbridge-local-snapshot-v1'?value:null);transaction.onabort=()=>reject(transaction.error);transaction.onerror=()=>reject(transaction.error)});
};
function flushScheduleLocalSnapshot(){
 if(scheduleLocalSaveTimer!==null){clearTimeout(scheduleLocalSaveTimer);scheduleLocalSaveTimer=null}
 if(scheduleLocalSaveIdle!==null&&typeof cancelIdleCallback==='function'){cancelIdleCallback(scheduleLocalSaveIdle);scheduleLocalSaveIdle=null}
 const sequence=++localSnapshotSequence;let serialized;
 try{serialized=JSON.stringify(db);localStorage.setItem(LS_KEY,serialized);window.__danbridgeLocalSnapshotState={state:'saved',storage:'localstorage'};updateLastBackupInfo()}
 catch(error){
  if(serialized&&(error?.name==='QuotaExceededError'||error?.name==='NS_ERROR_DOM_QUOTA_REACHED')){
   window.__danbridgeLocalSnapshotState={state:'saving',storage:'indexeddb'};
   persistLargeLocalSnapshot(serialized,sequence).catch(failure=>{if(sequence!==localSnapshotSequence)return;window.__danbridgeLocalSnapshotState={state:'failed',storage:'indexeddb',error:String(failure?.message||failure)};console.error('Local recovery snapshot failed:',failure);window.toast?.('本機備份空間不足；請保持頁面開啟，確認雲端同步並匯出備份。')});
  }else{window.__danbridgeLocalSnapshotState={state:'failed',error:String(error?.message||error)};console.error('Deferred schedule snapshot failed:',error)}
 }
}
function scheduleLocalSnapshot(){
 if(scheduleLocalSaveTimer!==null)clearTimeout(scheduleLocalSaveTimer);
 if(scheduleLocalSaveIdle!==null&&typeof cancelIdleCallback==='function'){cancelIdleCallback(scheduleLocalSaveIdle);scheduleLocalSaveIdle=null}
 scheduleLocalSaveTimer=setTimeout(()=>{
  scheduleLocalSaveTimer=null;
  if(typeof requestIdleCallback==='function')scheduleLocalSaveIdle=requestIdleCallback(()=>{scheduleLocalSaveIdle=null;flushScheduleLocalSnapshot()},{timeout:2500});
  else flushScheduleLocalSnapshot();
 },700);
}
window.addEventListener('pagehide',flushScheduleLocalSnapshot);
function saveDB(options={}){
 let saveError=null;
 const scheduleMutation=typeof options.scheduleAction==='string'&&options.scheduleAction.length>0;
 try{
  // Calendar commands already create normalized lesson records. Re-normalizing
  // every collection here rebuilt the entire database for each drag, paste or
  // delete and blocked the next pointer event. Full normalization remains the
  // boundary for every non-calendar save, import and cloud readback.
  if(!scheduleMutation){normalizeLessonStates();db=normalizeBranchData(db)}
  if(!scheduleMutation){try{window.__danbridgeReconcileLockedSettlements?.()}catch(error){console.error('Settlement adjustment reconciliation failed:',error)}flushScheduleLocalSnapshot()}
  else scheduleLocalSnapshot();
  try{if(!options.skipRender)((options.calendarOnly||options.scheduleAction&&calendarSectionIsActive())?renderCalendar({deferAnalysis:true}):renderAll())}
  catch(error){
   console.error('Saved data, but a view renderer failed:',error);
   try{renderCalendar()}catch(calendarError){console.error('Calendar rerender failed after save:',calendarError)}
  }
 }
 catch(error){saveError=error;console.error('Local save failed:',error)}
 finally{
  if(!scheduleMutation)try{updateLastBackupInfo()}catch(error){console.error('Backup status update failed:',error)}
  try{updateUndoRedoButtons()}catch(error){console.error('Undo/redo status update failed:',error)}
  /* Every mutation path ends here. The cloud module installs this hook after authentication. */
  try{window.__danbridgeQueueCloudSave?.(options)}catch(error){console.error('Cloud save scheduling failed:',error)}
 }
 if(saveError)throw saveError;
}
function ensureV81Migration(){if(localStorage.getItem(MIGRATION_KEY))return;try{const raw=localStorage.getItem(LS_KEY);if(raw){const versions=getVersions();versions.unshift({id:uid(),createdAt:new Date().toISOString(),reason:'V8.1 升級前自動備份',data:JSON.parse(raw)});setVersions(versions)}localStorage.setItem(MIGRATION_KEY,new Date().toISOString());localStorage.setItem(LS_KEY,JSON.stringify(db))}catch(e){console.error('Migration backup failed',e)}}
function getVersions(){try{return JSON.parse(localStorage.getItem(VERSION_KEY)||'[]')}catch{return[]}}
function setVersions(v){localStorage.setItem(VERSION_KEY,JSON.stringify(v.slice(0,20)))}
function versionStats(data){return `${(data.students||[]).length}位學生・${(data.teachers||[]).length}位老師・${(data.lessons||[]).length}堂課`}
function createVersion(reason='手動版本'){const versions=getVersions(),now=new Date();versions.unshift({id:uid(),createdAt:now.toISOString(),reason,data:JSON.parse(JSON.stringify(db))});setVersions(versions);renderBackupHistory();toast('已建立安全版本')}
function createManualVersion(){createVersion('手動建立')}
function renderBackupHistory(){const box=$('backupHistory');if(!box)return;const versions=getVersions();box.innerHTML=versions.length?`<table class="backup-history-table"><thead><tr><th>版本時間</th><th>來源／原因</th><th>內容</th><th>操作</th></tr></thead><tbody>${versions.map(v=>{const d=new Date(v.createdAt);return `<tr><td>${d.toLocaleString('zh-TW')}</td><td><b>${esc(v.reason||'安全版本')}</b></td><td>${versionStats(v.data)}</td><td class="row-actions"><button class="btn" onclick="restoreVersion('${v.id}')">復原</button><button class="btn danger" onclick="deleteVersion('${v.id}')">刪除</button></td></tr>`}).join('')}</tbody></table>`:'<div class="small" style="padding:12px">目前沒有版本紀錄。</div>'}
async function restoreVersion(id){const v=getVersions().find(x=>x.id===id);if(!v)return;let restored;try{restored=normalizeImported(v.data)}catch(error){alert('版本未復原：'+(error?.message||error));return}if(window.__DANBRIDGE_ENVIRONMENT__==='production'&&window.__danbridgeRunProductionHighRiskMutation){try{const result=await window.__danbridgeRunProductionHighRiskMutation({reason:'restore',mutate:target=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,JSON.parse(JSON.stringify(restored)));return{reason:v.reason,stats:versionStats(restored)}},requirePreview:true,confirmPreview:preview=>{const ok=confirm(`復原差異預覽已由後端驗證\n版本：${v.reason}\n影響集合：${preview.collections.join('、')||'無'}\n原子變更：${preview.operationCount} 筆\n預覽有效至：${new Date(preview.expiresAt).toLocaleString('zh-TW')}\n操作日誌會保留現有紀錄，僅補入備份缺少的歷史；同 ID 內容衝突時停止。\n\n確定執行？目前資料會先建立本機版本。`);if(ok)createVersion('復原前自動備份');return ok}});if(result.state==='complete')toast('版本已由後端原子復原並讀回確認')}catch(error){console.error(error);alert('版本未復原：'+(error?.message||error))}return}if(!confirm(`確定復原到「${v.reason}」？目前資料會先自動備份，操作日誌保留現有紀錄。`))return;createVersion('復原前自動備份');db=prepareBackupRestore(db,restored).db;saveDB();toast('版本已復原')}
function deleteVersion(id){if(!confirm('刪除此版本紀錄？'))return;setVersions(getVersions().filter(x=>x.id!==id));renderBackupHistory()}
function timestampName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`}
const BACKUP_COLLECTION_KEYS=['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampClasses','winterCampRegistrations','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
function backupCollectionCounts(data){return Object.fromEntries(BACKUP_COLLECTION_KEYS.map(key=>[key,Array.isArray(data?.[key])?data[key].length:0]))}
function backupChecksum(data){const text=JSON.stringify(Object.fromEntries(BACKUP_COLLECTION_KEYS.map(key=>[key,Array.isArray(data?.[key])?data[key]:[]])));let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}return `fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}-${text.length}`}
function verifyBackupEnvelope(data){const meta=data?._meta||{};if(!meta.checksum)return true;if(meta.checksum!==backupChecksum(data))throw new Error('備份檔校驗碼不符，檔案可能不完整或已損壞。');if(meta.counts){const actual=backupCollectionCounts(data);for(const key of BACKUP_COLLECTION_KEYS){if(Number(meta.counts[key]||0)!==actual[key])throw new Error(`備份檔集合數量不符：${key}`)}}return true}
function updateLastBackupInfo(){const el=$('lastBackupInfo');if(!el)return;const x=localStorage.getItem(LAST_EXPORT_KEY);el.textContent=x?`上次匯出：${new Date(x).toLocaleString('zh-TW')}`:'尚未匯出備份。'}
async function saveFileCrossBrowser({content,type,fileName,shareTitle='Danbridge 備份'}){const file=new File([content],fileName,{type});const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);try{if(isiOS&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:shareTitle,text:'請儲存到「檔案」或 iCloud Drive'});return true}const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},4000);return true}catch(err){if(err?.name==='AbortError')return false;console.error('saveFileCrossBrowser',err);if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:shareTitle});return true}catch(e){if(e?.name==='AbortError')return false}}throw err}}
async function downloadBackup(){try{const payload={...db};payload._meta={app:'Danbridge Scheduler',version:'Cloud Backup V3',schemaVersion:3,exportedAt:new Date().toISOString(),source:'current-synced-state',counts:backupCollectionCounts(payload),checksum:backupChecksum(payload)};const ok=await saveFileCrossBrowser({content:JSON.stringify(payload,null,2),type:'application/json;charset=utf-8',fileName:`Danbridge_Backup_${timestampName()}.json`,shareTitle:'Danbridge 最新資料備份'});if(!ok)return;localStorage.setItem(LAST_EXPORT_KEY,new Date().toISOString());updateLastBackupInfo();toast(/iPad|iPhone|iPod/.test(navigator.userAgent)?'請在分享選單選「儲存到檔案」':'備份已驗證並匯出，請存到 iCloud Drive')}catch(err){console.error(err);alert('備份匯出失敗：'+(err.message||err))}}
function prepareBackupRestore(current,incoming){
 const target=normalizeImported(incoming),existing=normalizeImported(current).changes;
 const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value);
 const fingerprint=row=>JSON.stringify(canonical(row)),counts=new Map(),byId=new Map();
 for(const row of existing){const key=fingerprint(row);counts.set(key,(counts.get(key)||0)+1);if(typeof row.id==='string'&&row.id){if(byId.has(row.id)&&byId.get(row.id)!==key)throw new Error('現有操作日誌有同 ID 不同內容，未執行還原');byId.set(row.id,key)}}
 const missing=[];
 for(const row of target.changes){
  const key=fingerprint(row);
  if(typeof row.id==='string'&&row.id&&byId.has(row.id)&&byId.get(row.id)!==key)throw new Error('備份操作日誌與現有同 ID 內容衝突，未執行還原');
  if(typeof row.id==='string'&&row.id)byId.set(row.id,key);
  const count=counts.get(key)||0;if(count)counts.set(key,count-1);else missing.push(row);
 }
 target.changes=[...missing,...existing];
 return{db:target,history:{existing:existing.length,imported:missing.length,total:target.changes.length}};
}
function normalizeImported(x){
 if(!x||!Array.isArray(x.students)||!Array.isArray(x.teachers)||!Array.isArray(x.lessons))throw new Error('備份格式不符');
 verifyBackupEnvelope(x);
 const restored={};
 for(const key of BACKUP_COLLECTION_KEYS){
  if(x[key]!==undefined&&!Array.isArray(x[key]))throw new Error('備份集合格式不符：'+key);
  const rows=x[key]||[];
  if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('備份紀錄格式不符：'+key);
  restored[key]=JSON.parse(JSON.stringify(rows));
 }
 // Restore is lossless, not an implicit data migration. In particular, never
 // merge camp registrations, recalculate historical fees, or drop receipts.
 // Legacy defaults belong in presentation/read adapters, not the restore plan.
 return restored;
}
function importBackup(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const parsed=JSON.parse(r.result);verifyBackupEnvelope(parsed);const incoming=normalizeImported(parsed);const exportedAt=parsed._meta?.exportedAt,verified=parsed._meta?.checksum?'已通過完整性驗證':'舊版備份（無校驗碼）';if(window.__DANBRIDGE_ENVIRONMENT__==='production'&&window.__danbridgeRunProductionHighRiskMutation){const result=await window.__danbridgeRunProductionHighRiskMutation({reason:'restore',mutate:target=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,JSON.parse(JSON.stringify(incoming)));return{fileName:f.name,verified,stats:versionStats(incoming)}},requirePreview:true,confirmPreview:preview=>{const ok=confirm(`備份復原差異預覽已由後端驗證\n檔案：${f.name}\n${exportedAt?'匯出時間：'+new Date(exportedAt).toLocaleString('zh-TW')+'\n':''}狀態：${verified}\n內容：${versionStats(incoming)}\n影響集合：${preview.collections.join('、')||'無'}\n原子變更：${preview.operationCount} 筆\n操作日誌會保留現有紀錄，僅補入備份缺少的歷史；同 ID 內容衝突時停止。\n\n確定取代目前資料？`);if(ok)createVersion('匯入前自動備份');return ok}});if(result.state==='complete')toast('匯入完成，後端已原子復原並讀回確認');return}const msg=`檔案：${f.name}\n${exportedAt?'匯出時間：'+new Date(exportedAt).toLocaleString('zh-TW')+'\n':''}狀態：${verified}\n內容：${versionStats(incoming)}\n操作日誌會保留現有紀錄，僅補入備份缺少的歷史；同 ID 內容衝突時停止。\n\n確定以此檔案取代目前資料？`;if(!confirm(msg))return;createVersion('匯入前自動備份');db=prepareBackupRestore(db,incoming).db;saveDB();toast('匯入完成，備份內容已驗證')}catch(err){alert(err?.message||'JSON 格式錯誤或不是 Danbridge 備份檔。')}finally{e.target.value=''}};r.readAsText(f)}
async function resetData(){if(!confirm('確定清空全部資料？系統會先建立可復原版本，永久操作日誌不會清除。'))return;const empty=normalizeBranchData({students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],branches:defaultBranches()});if(window.__DANBRIDGE_ENVIRONMENT__==='production'&&window.__danbridgeRunProductionHighRiskMutation){try{const result=await window.__danbridgeRunProductionHighRiskMutation({reason:'restore',mutate:target=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,JSON.parse(JSON.stringify(empty)));return{reason:'clear-all'}},requirePreview:true,confirmPreview:preview=>{const ok=confirm(`清空差異預覽已由後端驗證\n影響集合：${preview.collections.join('、')||'無'}\n原子變更：${preview.operationCount} 筆\n操作日誌會保留現有紀錄，僅補入備份缺少的歷史；同 ID 內容衝突時停止。\n\n確定清空？正式資料只會在同一交易完整成功時變更。`);if(ok)createVersion('清空前自動備份');return ok}});if(result.state==='complete')toast('資料已由後端原子清空並讀回確認')}catch(error){console.error(error);alert('資料未清空：'+(error?.message||error))}return}createVersion('清空前自動備份');db=prepareBackupRestore(db,empty).db;saveDB();toast('資料已清空')}
