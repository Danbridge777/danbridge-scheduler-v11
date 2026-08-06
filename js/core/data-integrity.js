/** Danbridge Operations V15.23 — centralized data-integrity audit and repair. */
(function(){
 const validBranchIds=()=>new Set((db.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).map(x=>x.id).concat(['unassigned','company']));
 const uniqueIds=list=>{const seen=new Set(),duplicates=[];(list||[]).forEach(x=>{if(!x?.id)return;if(seen.has(x.id))duplicates.push(x.id);seen.add(x.id)});return duplicates};
 function auditDataIntegrity(){
  const branches=validBranchIds(),studentIds=new Set((db.students||[]).map(x=>x.id)),teacherIds=new Set((db.teachers||[]).map(x=>x.id));
  const issues={missingLessonBranch:0,invalidLessonBranch:0,orphanStudents:0,orphanTeachers:0,missingTeacherIds:0,missingDeliveryMode:0,expenseBranch:0,campBranch:0,duplicates:0};
  (db.lessons||[]).forEach(l=>{
   if(!l.branchId)issues.missingLessonBranch++;
   else if(!branches.has(l.branchId))issues.invalidLessonBranch++;
   if(l.studentId&&!studentIds.has(l.studentId))issues.orphanStudents++;
   const tids=Array.isArray(l.teacherIds)&&l.teacherIds.length?l.teacherIds:[l.teacherId].filter(Boolean);
   if(!tids.length)issues.missingTeacherIds++;
   issues.orphanTeachers+=tids.filter(id=>!teacherIds.has(id)).length;
   if(!l.deliveryMode)issues.missingDeliveryMode++;
  });
  [...(db.fixedExpenses||[]),...(db.oneTimeExpenses||[])].forEach(x=>{if(!x.branchId||!branches.has(x.branchId))issues.expenseBranch++});
  [...(db.summerCampClasses||[]),...(db.winterCampClasses||[])].forEach(x=>{if(!x.branchId)issues.campBranch++});
  issues.duplicates=['students','teachers','lessons','makeups','fixedExpenses','oneTimeExpenses'].reduce((n,k)=>n+uniqueIds(db[k]).length,0)+uniqueIds([...(db.summerCampRegistrations||[]),...(db.winterCampRegistrations||[])]).length;
  const total=Object.values(issues).reduce((a,b)=>a+b,0);
  return {issues,total,checkedAt:new Date().toISOString()};
 }
 function normalizeIdList(values=[]){return [...new Set(values.filter(Boolean))]}
 function repairCampRegistration(x,season){const dates=[...new Set(Array.isArray(x.dates)?x.dates:[])].filter(d=>typeof d==='string'&&(!x.month||d.startsWith(x.month+'-'))).sort(),month=x.month||(dates[0]||'').slice(0,7),record={...x,id:x.id||uid(),season,branchId:x.branchId||((db.students||[]).find(s=>s.id===x.studentId)?.branchIds||[])[0]||'unassigned',month,dates,pricingMode:x.pricingMode||'daily',dailyRate:+x.dailyRate||0,weeklyRate:+x.weeklyRate||0,monthlyRate:+x.monthlyRate||0,frontWeeks:+x.frontWeeks||0,frontWeeklyRate:+x.frontWeeklyRate||0,backWeeklyRate:+x.backWeeklyRate||0};record.totalFee=summerRegistrationTotal(record);return record}
 function repairDataIntegrity(){
  if(window.DanbridgeAccess?.getContext?.().role==='branch_manager')return alert('校區管理者為唯讀，資料整理只能由 Owner 執行。');
  snapshot?.();
  db=normalizeBranchData(db);
  const lessonByStudent=new Map(),lessonByTeacher=new Map();
  (db.lessons||[]).forEach(l=>{
   l.id=l.id||createLessonId();l.deliveryMode=deliveryModeForRecord(l);l.branchId=branchIdForRecord(l);
   l.teacherIds=normalizeIdList(Array.isArray(l.teacherIds)&&l.teacherIds.length?l.teacherIds:[l.teacherId]);l.teacherId=l.teacherIds[0]||'';
   if(l.studentId){const a=lessonByStudent.get(l.studentId)||[];a.push(l.branchId);lessonByStudent.set(l.studentId,a)}
   l.teacherIds.forEach(id=>{const a=lessonByTeacher.get(id)||[];a.push(l.branchId);lessonByTeacher.set(id,a)});
  });
  db.students=(db.students||[]).map(s=>({...s,id:s.id||uid(),branchIds:normalizeIdList([...(s.branchIds||[]),...(lessonByStudent.get(s.id)||[])]).filter(x=>x!=='unassigned')}));
  db.teachers=(db.teachers||[]).map(t=>({...t,id:t.id||uid(),assignedBranchIds:normalizeIdList([...(t.assignedBranchIds||[]),...(lessonByTeacher.get(t.id)||[])]).filter(x=>x!=='unassigned')}));
  db.makeups=(db.makeups||[]).map(m=>({...m,id:m.id||uid(),branchId:m.branchId||branchIdForRecord((db.lessons||[]).find(l=>l.id===m.lessonId)||m)}));
  db.fixedExpenses=(db.fixedExpenses||[]).map(x=>({...x,id:x.id||uid(),branchId:x.branchId||'unassigned'}));
  db.oneTimeExpenses=(db.oneTimeExpenses||[]).map(x=>({...x,id:x.id||uid(),branchId:x.branchId||'unassigned'}));
  db.summerCampClasses=(db.summerCampClasses||[]).map(x=>({...x,id:x.id||uid(),branchId:x.branchId||'unassigned'}));
  db.summerCampRegistrations=(db.summerCampRegistrations||[]).map(x=>{const dates=[...new Set(Array.isArray(x.dates)?x.dates:[])].sort(),pricingMode=x.pricingMode||'daily',dailyRate=+x.dailyRate||0,weeklyRate=+x.weeklyRate||0,monthlyRate=+x.monthlyRate||0,frontWeeks=+x.frontWeeks||0,frontWeeklyRate=+x.frontWeeklyRate||0,backWeeklyRate=+x.backWeeklyRate||0,weekKeys=[...new Set(dates.map(d=>{const dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return monday.toISOString().slice(0,10)}))].sort(),weekCount=weekKeys.length,month=x.month||(dates[0]||'').slice(0,7),monthWeeks=month?[...new Set(Array.from({length:new Date(+month.slice(0,4),+month.slice(5,7),0).getDate()},(_,i)=>{const d=`${month}-${String(i+1).padStart(2,'0')}`,dt=new Date(d+'T00:00:00'),day=dt.getDay(),monday=new Date(dt);monday.setDate(dt.getDate()-(day===0?6:day-1));return monday.toISOString().slice(0,10)}))].sort():[],totalFee=pricingMode==='weeklySplit'?weekKeys.reduce((sum,key)=>sum+(monthWeeks.indexOf(key)<frontWeeks?frontWeeklyRate:backWeeklyRate),0):pricingMode==='weekly'?weekCount*weeklyRate:pricingMode==='monthly'?(dates.length?monthlyRate:0):dates.length*dailyRate;return {...x,id:x.id||uid(),branchId:x.branchId||((db.students||[]).find(s=>s.id===x.studentId)?.branchIds||[])[0]||'unassigned',dates,pricingMode,dailyRate,weeklyRate,monthlyRate,frontWeeks,frontWeeklyRate,backWeeklyRate,totalFee}});
  db.winterCampClasses=(db.winterCampClasses||[]).map(x=>({...x,id:x.id||uid(),branchId:x.branchId||'unassigned'}));
  db.summerCampRegistrations=(db.summerCampRegistrations||[]).map(x=>repairCampRegistration(x,'summer'));
  db.winterCampRegistrations=(db.winterCampRegistrations||[]).map(x=>repairCampRegistration(x,'winter'));
  const campRegistrationIds=new Set();['summerCampRegistrations','winterCampRegistrations'].forEach(key=>{db[key]=db[key].map(r=>{let id=r.id||uid();while(campRegistrationIds.has(id))id=uid();campRegistrationIds.add(id);return{...r,id}})});
  localStorage.setItem(LS_KEY,JSON.stringify(db));renderAll();window.__danbridgeQueueCloudSave?.();toast('資料完整性整理完成');
 }
 function renderDataIntegrity(showToast=false){
  const box=document.getElementById('dataIntegritySummary'),badge=document.getElementById('dataIntegrityBadge');if(!box||!badge)return;
  const r=auditDataIntegrity(),i=r.issues;badge.textContent=r.total?'需處理 '+r.total+' 項':'資料正常';badge.className='integrity-badge '+(r.total?'warn':'ok');
  const rows=[['課程缺少／錯誤校區',i.missingLessonBranch+i.invalidLessonBranch],['學生或老師關聯失效',i.orphanStudents+i.orphanTeachers],['課程缺少老師或上課方式',i.missingTeacherIds+i.missingDeliveryMode],['支出缺少校區',i.expenseBranch],['營隊班級尚未歸屬校區',i.campBranch],['重複資料 ID',i.duplicates]];
  box.innerHTML=rows.map(([name,n])=>`<div class="integrity-item ${n?'warn':''}"><span>${name}</span><b>${n}</b></div>`).join('');
  if(showToast)toast(r.total?`檢查完成：${r.total} 項待整理`:'檢查完成：資料正常');return r;
 }
 window.auditDataIntegrity=auditDataIntegrity;window.repairDataIntegrity=repairDataIntegrity;window.renderDataIntegrity=renderDataIntegrity;
})();
