/**
 * V15.17 Dashboard Module
 *
 * Dashboard-only rendering and enhancement logic.
 * Data calculations and visible behavior are intentionally unchanged.
 */

function renderDashboard(){const m=monthNow(),ls=db.lessons.filter(l=>!l.isDraft&&l.date.startsWith(m));$('mStudents').textContent=db.students.length;$('mTeachers').textContent=db.teachers.length;$('mLessons').textContent=ls.length;if($('mTeacherHours')){const completedTeacherLessons=ls.filter(l=>l.teacherReportStatus==='completed'||l.teacherReportStatus==='makeup_completed');$('mTeacherHours').textContent=`${completedTeacherLessons.reduce((sum,l)=>sum+hours(l.start,l.end),0).toFixed(1)} 小時`;const note=$('mTeacherHours').closest('.metric')?.querySelector('small');if(note)note.textContent=`${completedTeacherLessons.length} 堂已完成`;};$('mRevenue').textContent=money(ls.reduce((a,l)=>a+timetableRevenueCharge(l),0)+summerCampRegistrationRevenue(m));$('mUnpaid').textContent=money(ls.filter(l=>(l.paymentStatus||'unpaid')==='unpaid').reduce((a,l)=>a+lessonCharge(l),0));$('mPayroll').textContent=money(ls.reduce((a,l)=>a+lessonPay(l),0));$('mMakeups').textContent=(db.makeups||[]).filter(x=>x.status==='pending').length;const tod=todayStr(),changes=(db.changes||[]).filter(c=>localDate(new Date(c.at))===tod);$('mChanges').textContent=changes.length;$('todayChanges').innerHTML=changes.length?`<table class="change-table"><thead><tr><th>時間</th><th>類型</th><th>學生／班級</th><th>原日期</th><th>原時間</th><th>新日期</th><th>新時間</th></tr></thead><tbody>${changes.slice(0,100).map(c=>`<tr><td>${new Date(c.at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</td><td><b>${esc(c.type)}</b></td><td class="student-cell">${esc(student(c.studentId).name)}</td><td class="muted-cell">${esc(c.before?.date||'—')}</td><td>${esc(c.before?.start||'—')}</td><td class="muted-cell">${esc(c.after?.date||'—')}</td><td>${esc(c.after?.start||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="small" style="padding:12px">今天尚無課表異動。</div>'; $('todayLessons').innerHTML=db.lessons.filter(l=>!l.isDraft&&l.date===tod).sort((a,b)=>a.start.localeCompare(b.start)).map(l=>`<div class="lesson ${hasTeacherOverlap(l)?'teacher-overlap':''}" style="--teacher:${teacher(l.teacherId).color||'#2563eb'};--location-bg:${locationBg(l.location)}" onclick="editLesson('${l.id}')"><b>${l.start}–${l.end}｜${esc(student(l.studentId).name)}</b><span class="meta">${esc(lessonTeacherNames(l))}｜${esc(l.title)}｜📍${esc(locationLabel(l))}${l.location==='到府'&&l.address?' '+esc(l.address):''}｜${esc(l.room||'未指定教室')}｜${l.paymentStatus==='paid'?'已繳':'未繳'}</span></div>`).join('')||'<span class="small">今天沒有課程。</span>'}

function enhanceDashboardV32(){
 const now=new Date(),hour=now.getHours();
 const greeting=hour<12?'早安':hour<18?'午安':'晚安';
 const name=(document.body.dataset.cloudDisplayName||document.querySelector('.header-auth-actions span')?.textContent.split('｜').slice(1).join('｜')||'使用者').trim();
 const g=$('v32Greeting');if(g)g.textContent=`${greeting}，${name}`;
 const d=$('v32DateText');if(d)d.textContent=now.toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
 const month=monthNow(),monthLs=db.lessons.filter(l=>l.date.startsWith(month));
 const completed=monthLs.filter(l=>l.status==='已上課'||l.teacherReportStatus==='completed'||l.teacherReportStatus==='makeup_completed').length;
 if($('v32MonthCompleted'))$('v32MonthCompleted').textContent=`${completed} 堂已完成`;
 const unpaid=monthLs.filter(l=>(l.paymentStatus||'unpaid')==='unpaid'&&lessonCharge(l)>0);
 if($('v32UnpaidCount'))$('v32UnpaidCount').textContent=`${unpaid.length} 堂待處理`;
 const today=db.lessons.filter(l=>l.date===todayStr()).sort((a,b)=>a.start.localeCompare(b.start));
 if($('v32TodaySummary'))$('v32TodaySummary').textContent=today.length?`${today.length} 堂・${today.reduce((a,l)=>a+hours(l.start,l.end),0).toFixed(1)} 小時`:'今天沒有安排課程';
 const insights=[];
 const missingReports=today.filter(l=>l.status==='已上課'&&!l.teacherReportStatus);
 if(missingReports.length)insights.push({type:'danger',title:`${missingReports.length} 堂尚未填寫回報`,text:'請老師完成今日課程內容與家庭作業。'});
 if(unpaid.length)insights.push({type:'',title:`本月有 ${unpaid.length} 堂未繳`,text:`預估待收 ${money(unpaid.reduce((a,l)=>a+lessonCharge(l),0))}`} );
 const overlaps=today.filter(hasTeacherOverlap);
 if(overlaps.length)insights.push({type:'danger',title:`今日有 ${overlaps.length} 堂老師時間重複`,text:'請檢查課表中的紅色課程卡。'});
 const pending=(db.makeups||[]).filter(m=>m.status==='pending').length;
 if(pending)insights.push({type:'',title:`${pending} 筆補課待安排`,text:'可前往補課中心進行後續處理。'});
 if(!insights.length)insights.push({type:'good',title:'目前沒有急迫事項',text:'今日課表與回報狀態看起來正常。'});
 if($('v32Insights'))$('v32Insights').innerHTML=insights.slice(0,4).map(x=>`<div class="v32-insight ${x.type}"><span class="v32-insight-dot"></span><div><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div></div>`).join('');
}

function enhanceDashboardV33(){
 const now=new Date(),today=todayStr(),todayLs=db.lessons.filter(l=>l.date===today&&!['取消','停課'].includes(l.status)).sort((a,b)=>a.start.localeCompare(b.start));
 const activeTeacherIds=new Set(todayLs.flatMap(lessonTeacherIds));
 if($('v33TodayLessons'))$('v33TodayLessons').textContent=todayLs.length;
 if($('v33TodayHours'))$('v33TodayHours').textContent=`${todayLs.reduce((sum,l)=>sum+hours(l.start,l.end),0).toFixed(1)} 小時`;
 if($('v33TodayRevenue'))$('v33TodayRevenue').textContent=money(todayLs.reduce((sum,l)=>sum+timetableRevenueCharge(l),0));
 if($('v33TodayTeachers'))$('v33TodayTeachers').textContent=activeTeacherIds.size;
 const currentTime=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 const roomLessons=todayLs.filter(l=>l.room&&l.location!=='線上課'&&l.location!=='到府');
 const roomNames=[...new Set(roomLessons.map(l=>`${locationLabel(l)}｜${l.room}`))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 const liveRooms=roomNames.filter(name=>roomLessons.some(l=>`${locationLabel(l)}｜${l.room}`===name&&l.start<=currentTime&&l.end>currentTime));
 if($('v33LiveRooms'))$('v33LiveRooms').textContent=liveRooms.length;
 if($('v33RoomTotal'))$('v33RoomTotal').textContent=`共 ${roomNames.length} 間排課`;
 if($('v33RoomStatus'))$('v33RoomStatus').innerHTML=roomNames.length?roomNames.slice(0,10).map(name=>{
   const lessons=roomLessons.filter(l=>`${locationLabel(l)}｜${l.room}`===name).sort((a,b)=>a.start.localeCompare(b.start));
   const live=lessons.find(l=>l.start<=currentTime&&l.end>currentTime);
   const soon=lessons.find(l=>l.start>currentTime);
   const state=live?'live':soon?'soon':'';
   const text=live?`${student(live.studentId).name||live.title||'課程'}・${live.end} 下課`:soon?`${soon.start} ${student(soon.studentId).name||soon.title||'課程'}`:'今日課程已結束';
   return `<div class="v33-room ${state}"><span class="v33-room-dot"></span><div style="min-width:0"><b>${esc(name.replace('｜','・'))}</b><span>${esc(text)}</span></div></div>`;
 }).join(''):'<div class="small">今天沒有設定教室的課程。</div>';
 const days=[];for(let i=0;i<7;i++){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i),ds=localDate(d),count=db.lessons.filter(l=>l.date===ds&&!['取消','停課'].includes(l.status)).length;days.push({d,ds,count})}
 const max=Math.max(1,...days.map(x=>x.count));
 if($('v33WeekBars'))$('v33WeekBars').innerHTML=days.map(x=>`<div class="v33-week-day"><div class="v33-week-bar-wrap"><div class="v33-week-bar" style="height:${Math.max(4,Math.round(x.count/max*100))}%"></div></div><b>${['日','一','二','三','四','五','六'][x.d.getDay()]}</b><span>${x.count}堂</span></div>`).join('');
 const teacherMode=document.body.classList.contains('teacher-cloud-role');
 if(teacherMode&&$('v33TeacherNext')){
   const myName=(document.querySelector('.header-auth-actions span')?.textContent.split('｜')[1]||'').trim();
   const myTeacher=db.teachers.find(t=>myName&&((t.name||'').includes(myName)||myName.includes(t.name||'')));
   const mine=todayLs.filter(l=>!myTeacher||lessonTeacherIds(l).includes(myTeacher.id));
   const next=mine.find(l=>l.end>currentTime)||mine[0];
   $('v33TeacherNext').innerHTML=next?`<div class="v33-teacher-next"><div><h3>${next.start<=currentTime&&next.end>currentTime?'正在上課':'下一堂課'}｜${esc(student(next.studentId).name||next.title||'課程')}</h3><p>${esc(next.start)}–${esc(next.end)}・${esc(next.title||'一般課程')}・${esc(locationLabel(next))}${next.room?'・'+esc(next.room):''}</p></div><button class="btn" onclick="editLesson('${next.id}')">${next.start<=currentTime&&next.end>currentTime?'開啟課程':'查看／回報'}</button></div>`:'<div class="v33-teacher-next"><div><h3>今天沒有課程</h3><p>目前沒有需要回報的今日課程。</p></div></div>';
 }
}

const __renderDashboardBase = renderDashboard;
renderDashboard = function renderDashboardWithEnhancements(){
  __renderDashboardBase();
  enhanceDashboardV32();
  enhanceDashboardV33();
};
