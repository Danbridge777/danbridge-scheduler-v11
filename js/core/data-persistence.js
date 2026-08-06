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
 const registrationMap=new Map();
 (x.summerCampRegistrations||[]).forEach(r=>{const st=(x.students||[]).find(a=>a.id===r.studentId),lessonBranch=(x.lessons||[]).find(l=>l.studentId===r.studentId&&l.branchId&&l.branchId!=='unassigned')?.branchId,branchId=r.branchId||(st?.branchIds||[])[0]||lessonBranch||'unassigned',dates=[...new Set(Array.isArray(r.dates)?r.dates:[])].filter(d=>typeof d==='string'&&(!r.month||d.startsWith(r.month+'-'))).sort(),month=r.month||(dates[0]||'').slice(0,7),key=`${r.studentId||''}|${month}`;if(!r.studentId||!month)return;const pricingMode=r.pricingMode||'daily',dailyRate=+r.dailyRate||0,weeklyRate=+r.weeklyRate||0,monthlyRate=+r.monthlyRate||0,frontWeeks=+r.frontWeeks||0,frontWeeklyRate=+r.frontWeeklyRate||0,backWeeklyRate=+r.backWeeklyRate||0,weekCount=new Set(dates.map(d=>{const dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return localDate(monday)})).size,monthWeeks=month?[...new Set(Array.from({length:new Date(+month.slice(0,4),+month.slice(5,7),0).getDate()},(_,i)=>{const d=`${month}-${String(i+1).padStart(2,'0')}`,dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return localDate(monday)}))].sort():[],selectedWeekKeys=[...new Set(dates.map(d=>{const dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return localDate(monday)}))].sort(),totalFee=pricingMode==='weeklySplit'?selectedWeekKeys.reduce((sum,key)=>sum+(monthWeeks.indexOf(key)<frontWeeks?frontWeeklyRate:backWeeklyRate),0):pricingMode==='weekly'?weekCount*weeklyRate:pricingMode==='monthly'?(dates.length?monthlyRate:0):dates.length*dailyRate,prev=registrationMap.get(key),current={...r,id:r.id||uid(),branchId,month,dates,pricingMode,dailyRate,weeklyRate,monthlyRate,frontWeeks,frontWeeklyRate,backWeeklyRate,totalFee,updatedAt:r.updatedAt||new Date(0).toISOString()};if(!prev){registrationMap.set(key,current);return}const newer=String(current.updatedAt)>=String(prev.updatedAt)?current:prev,mergedDates=[...new Set([...(prev.dates||[]),...(current.dates||[])])].sort(),mergedPricingMode=newer.pricingMode||'daily',mergedDailyRate=+newer.dailyRate||+prev.dailyRate||+current.dailyRate||0,mergedWeeklyRate=+newer.weeklyRate||+prev.weeklyRate||+current.weeklyRate||0,mergedMonthlyRate=+newer.monthlyRate||+prev.monthlyRate||+current.monthlyRate||0,mergedFrontWeeks=+newer.frontWeeks||+prev.frontWeeks||+current.frontWeeks||0,mergedFrontWeeklyRate=+newer.frontWeeklyRate||+prev.frontWeeklyRate||+current.frontWeeklyRate||0,mergedBackWeeklyRate=+newer.backWeeklyRate||+prev.backWeeklyRate||+current.backWeeklyRate||0,mergedWeekCount=new Set(mergedDates.map(d=>{const dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return localDate(monday)})).size,mergedMonthWeeks=month?[...new Set(Array.from({length:new Date(+month.slice(0,4),+month.slice(5,7),0).getDate()},(_,i)=>{const d=`${month}-${String(i+1).padStart(2,'0')}`,dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return localDate(monday)}))].sort():[],mergedWeekKeys=[...new Set(mergedDates.map(d=>{const dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return localDate(monday)}))].sort(),mergedTotalFee=mergedPricingMode==='weeklySplit'?mergedWeekKeys.reduce((sum,key)=>sum+(mergedMonthWeeks.indexOf(key)<mergedFrontWeeks?mergedFrontWeeklyRate:mergedBackWeeklyRate),0):mergedPricingMode==='weekly'?mergedWeekCount*mergedWeeklyRate:mergedPricingMode==='monthly'?(mergedDates.length?mergedMonthlyRate:0):mergedDates.length*mergedDailyRate;registrationMap.set(key,{...newer,id:prev.id||current.id,branchId:newer.branchId&&newer.branchId!=='unassigned'?newer.branchId:(prev.branchId||current.branchId||'unassigned'),dates:mergedDates,pricingMode:mergedPricingMode,dailyRate:mergedDailyRate,weeklyRate:mergedWeeklyRate,monthlyRate:mergedMonthlyRate,frontWeeks:mergedFrontWeeks,frontWeeklyRate:mergedFrontWeeklyRate,backWeeklyRate:mergedBackWeeklyRate,totalFee:mergedTotalFee})});
 x.summerCampRegistrations=[...registrationMap.values()];
 x.makeups=(x.makeups||[]).map(m=>({...m,branchId:m.branchId||branchIdForRecord((x.lessons||[]).find(l=>l.id===m.lessonId)||m)}));
 x.fixedExpenses=(x.fixedExpenses||[]).map(e=>({...e,branchId:e.branchId||'company'}));
 x.oneTimeExpenses=(x.oneTimeExpenses||[]).map(e=>({...e,branchId:e.branchId||'company'}));
 return normalizeLessonIdentityData(x);
}

function loadDB(){try{const raw=localStorage.getItem(LS_KEY);const x=JSON.parse(raw||'{"students":[],"teachers":[],"lessons":[],"makeups":[],"changes":[],"teacherGroups":[],"winterTeacherGroups":[],"summerCampClasses":[],"summerCampRegistrations":[],"winterCampClasses":[],"settlementRecords":[],"fixedExpenses":[],"oneTimeExpenses":[]}');x.students||=[];x.teachers||=[];x.lessons||=[];x.makeups||=[];x.changes||=[];x.teacherGroups||=[];x.winterTeacherGroups||=[];x.summerCampClasses||=[];x.summerCampRegistrations||=[];x.winterCampClasses||=[];x.settlementRecords||=[];x.fixedExpenses||=[];x.oneTimeExpenses||=[];x.students=x.students.map(st=>({...st,homeAddress:st.homeAddress||''}));x.teachers=x.teachers.map(t=>({...t,minWeeklyHours:+t.minWeeklyHours||0,workDays:Array.isArray(t.workDays)&&t.workDays.length?[...new Set(t.workDays.map(Number))]:[1,2,3,4,5]}));x.lessons=x.lessons.map(l=>({...l,room:l.room||'',paymentStatus:l.paymentStatus||'unpaid',chargeStudent:l.chargeStudent||'yes',payTeacher:l.payTeacher||'yes',seriesId:l.seriesId||'',location:l.location||'美術東四路',address:l.address||'',campId:normalizeCampCode(l.campId||''),teacherIds:Array.isArray(l.teacherIds)&&l.teacherIds.length?[...new Set(l.teacherIds)]:[l.teacherId].filter(Boolean),lessonState:(l.lessonState||(l.isDraft?'draft':'active')),isDraft:(l.lessonState?l.lessonState==='draft':!!l.isDraft),draftOriginal:null}));return normalizeBranchData(x)}catch{return normalizeBranchData({students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[]})}}
function normalizeLessonStates(){db.lessons=(db.lessons||[]).map(l=>{const state=l.lessonState||(l.isDraft?'draft':'active');return{...l,lessonState:state,isDraft:state==='draft',draftOriginal:null}})}
function saveDB(){
 let saveError=null;
 try{
  normalizeLessonStates();db=normalizeBranchData(db);localStorage.setItem(LS_KEY,JSON.stringify(db));
  try{renderAll()}
  catch(error){
   console.error('Saved data, but a view renderer failed:',error);
   try{renderCalendar()}catch(calendarError){console.error('Calendar rerender failed after save:',calendarError)}
  }
 }
 catch(error){saveError=error;console.error('Local save failed:',error)}
 finally{
  try{updateLastBackupInfo()}catch(error){console.error('Backup status update failed:',error)}
  try{updateUndoRedoButtons()}catch(error){console.error('Undo/redo status update failed:',error)}
  /* Every mutation path ends here. The cloud module installs this hook after authentication. */
  try{window.__danbridgeQueueCloudSave?.()}catch(error){console.error('Cloud save scheduling failed:',error)}
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
function restoreVersion(id){const v=getVersions().find(x=>x.id===id);if(!v)return;if(!confirm(`確定復原到「${v.reason}」？目前資料會先自動備份。`))return;createVersion('復原前自動備份');db=normalizeBranchData(JSON.parse(JSON.stringify(v.data)));saveDB();toast('版本已復原')}
function deleteVersion(id){if(!confirm('刪除此版本紀錄？'))return;setVersions(getVersions().filter(x=>x.id!==id));renderBackupHistory()}
function timestampName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`}
function updateLastBackupInfo(){const el=$('lastBackupInfo');if(!el)return;const x=localStorage.getItem(LAST_EXPORT_KEY);el.textContent=x?`上次匯出：${new Date(x).toLocaleString('zh-TW')}`:'尚未匯出備份。'}
async function saveFileCrossBrowser({content,type,fileName,shareTitle='Danbridge 備份'}){const file=new File([content],fileName,{type});const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);try{if(isiOS&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:shareTitle,text:'請儲存到「檔案」或 iCloud Drive'});return true}const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},4000);return true}catch(err){if(err?.name==='AbortError')return false;console.error('saveFileCrossBrowser',err);if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:shareTitle});return true}catch(e){if(e?.name==='AbortError')return false}}throw err}}
async function downloadBackup(){try{const payload={...db,_meta:{app:'Danbridge Scheduler',version:'Cloud Backup V2',exportedAt:new Date().toISOString(),source:'current-synced-state',students:db.students?.length||0,teachers:db.teachers?.length||0,lessons:db.lessons?.length||0}};const ok=await saveFileCrossBrowser({content:JSON.stringify(payload,null,2),type:'application/json;charset=utf-8',fileName:`Danbridge_Backup_${timestampName()}.json`,shareTitle:'Danbridge 最新資料備份'});if(!ok)return;localStorage.setItem(LAST_EXPORT_KEY,new Date().toISOString());updateLastBackupInfo();toast(/iPad|iPhone|iPod/.test(navigator.userAgent)?'請在分享選單選「儲存到檔案」':'備份已匯出，請存到 iCloud Drive')}catch(err){console.error(err);alert('備份匯出失敗：'+(err.message||err))}}
function normalizeImported(x){if(!x||!Array.isArray(x.students)||!Array.isArray(x.teachers)||!Array.isArray(x.lessons))throw new Error('格式不符');return normalizeBranchData({students:x.students.map(st=>studentDefaults({...st,homeAddress:st.homeAddress||''})),teachers:x.teachers.map(t=>({...t,minWeeklyHours:+t.minWeeklyHours||0,workDays:Array.isArray(t.workDays)&&t.workDays.length?[...new Set(t.workDays.map(Number))]:[1,2,3,4,5]})),lessons:x.lessons.map(l=>({...l,room:l.room||'',paymentStatus:l.paymentStatus||'unpaid',seriesId:l.seriesId||'',location:l.location||'美術東四路',address:l.address||'',campId:normalizeCampCode(l.campId||''),teacherIds:Array.isArray(l.teacherIds)&&l.teacherIds.length?[...new Set(l.teacherIds)]:[l.teacherId].filter(Boolean)})),makeups:Array.isArray(x.makeups)?x.makeups:[],changes:Array.isArray(x.changes)?x.changes:[],teacherGroups:Array.isArray(x.teacherGroups)?x.teacherGroups:[],winterTeacherGroups:Array.isArray(x.winterTeacherGroups)?x.winterTeacherGroups:[],summerCampClasses:Array.isArray(x.summerCampClasses)?x.summerCampClasses:[],summerCampRegistrations:Array.isArray(x.summerCampRegistrations)?x.summerCampRegistrations:[],winterCampClasses:Array.isArray(x.winterCampClasses)?x.winterCampClasses:[],settlementRecords:Array.isArray(x.settlementRecords)?x.settlementRecords:[],fixedExpenses:Array.isArray(x.fixedExpenses)?x.fixedExpenses:[],oneTimeExpenses:Array.isArray(x.oneTimeExpenses)?x.oneTimeExpenses:[],branches:Array.isArray(x.branches)?x.branches:defaultBranches()})}
const normalizeImportedWithoutWinterCampRegistrations=normalizeImported;
normalizeImported=function(x){const data=normalizeImportedWithoutWinterCampRegistrations(x);data.winterCampRegistrations=Array.isArray(x.winterCampRegistrations)?x.winterCampRegistrations.map(r=>({...r,season:'winter'})):[];return normalizeBranchData(data)};
function importBackup(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const incoming=normalizeImported(JSON.parse(r.result));const exportedAt=JSON.parse(r.result)._meta?.exportedAt;const msg=`檔案：${f.name}\n${exportedAt?'匯出時間：'+new Date(exportedAt).toLocaleString('zh-TW')+'\n':''}內容：${versionStats(incoming)}\n\n確定以此檔案取代目前資料？`;if(!confirm(msg))return;createVersion('匯入前自動備份');db=incoming;saveDB();toast('匯入完成')}catch(err){alert('JSON 格式錯誤或不是 Danbridge 備份檔。')}finally{e.target.value=''}};r.readAsText(f)}
function resetData(){if(confirm('確定清空全部資料？系統會先建立可復原版本。')){createVersion('清空前自動備份');db=normalizeBranchData({students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],branches:defaultBranches()});saveDB();toast('資料已清空')}}
