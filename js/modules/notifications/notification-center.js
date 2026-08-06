/** Danbridge Operations V15.26 — role-aware Notification Center. */
(function(){
 const state={filter:'all',items:[]};
 const $id=id=>document.getElementById(id);
 const ctx=()=>window.DanbridgeAccess?.getContext?.()||{role:'owner',branchIds:[],teacherId:'',email:''};
 const addDays=(dateText,days)=>{const d=new Date(`${dateText}T00:00:00`);d.setDate(d.getDate()+days);return localDate(d)};
 const readKey=()=>`danbridge_notification_read_v1526_${ctx().email||ctx().role||'local'}`;
 const readIds=()=>{try{return new Set(JSON.parse(localStorage.getItem(readKey())||'[]'))}catch{return new Set()}};
 const saveRead=set=>localStorage.setItem(readKey(),JSON.stringify([...set].slice(-500)));
 function visibleLessons(){const c=ctx(),all=(db.lessons||[]).filter(l=>!l.isDraft);if(c.role==='owner')return all;if(c.role==='branch_manager')return all.filter(l=>c.branchIds.includes(window.DanbridgeAccess?.recordBranchId?.(l)||l.branchId));if(c.role==='teacher'&&c.teacherId)return all.filter(l=>lessonTeacherIds(l).includes(c.teacherId));return []}
 function visibleTeachers(){const c=ctx();if(c.role==='teacher')return (db.teachers||[]).filter(t=>t.id===c.teacherId);if(c.role==='branch_manager')return (db.teachers||[]).filter(t=>!(t.assignedBranchIds||[]).length||(t.assignedBranchIds||[]).some(id=>c.branchIds.includes(id)));return db.teachers||[]}
 function item(data){return {severity:'info',category:'general',...data}}
 function buildNotifications(){
  const c=ctx(),today=todayStr(),tomorrow=addDays(today,1),now=new Date(),currentTime=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,lessons=visibleLessons(),items=[];
  const terminalStatuses=new Set(['已上課','學生請假','老師請假','缺席','補課完成','取消','停課']);
  const needsReport=l=>!l.teacherReportStatus&&!terminalStatuses.has(l.status);
  const incomplete=lessons.filter(l=>l.date===today&&l.end<=currentTime&&needsReport(l));
  const overdue=lessons.filter(l=>l.date<today&&needsReport(l));
  [...overdue,...incomplete].slice(0,60).forEach(l=>items.push(item({id:`report:${l.id}`,category:'report',severity:'danger',icon:'報',title:`${student(l.studentId).name||l.title||'課程'}尚未完成課堂回報`,detail:`${l.date} ${l.start}–${l.end}｜${lessonTeacherNames(l)}｜${locationLabel(l)}`,sort:`1-${l.date}-${l.start}`,action:{type:(c.role==='branch_manager'&&!lessonTeacherIds(l).includes(c.teacherId))?'lessons':'report',lessonId:l.id}})));
  lessons.filter(l=>l.date===tomorrow&&!['取消','停課'].includes(l.status)).sort((a,b)=>a.start.localeCompare(b.start)).forEach(l=>items.push(item({id:`tomorrow:${l.id}`,category:'tomorrow',severity:'info',icon:'明',title:`明日 ${l.start}｜${student(l.studentId).name||l.title||'課程'}`,detail:`${lessonTeacherNames(l)}｜${locationLabel(l)}${l.room?'｜'+l.room:''}`,sort:`4-${l.start}`,action:{type:'calendar',date:l.date,lessonId:l.id}})));
  if(c.role!=='teacher'){
   lessons.filter(l=>(l.paymentStatus||'unpaid')==='unpaid'&&lessonCharge(l)>0&&l.date<=today).slice(0,80).forEach(l=>items.push(item({id:`unpaid:${l.id}`,category:'payment',severity:'warn',icon:'收',title:`${student(l.studentId).name||'學生'}有未收款`,detail:`${l.date} ${l.start}｜${money(lessonCharge(l))}｜${locationLabel(l)}`,sort:`2-${l.date}-${l.start}`,action:{type:'lessons',lessonId:l.id}})));
   (db.makeups||[]).filter(m=>m.status==='pending').filter(m=>c.role==='owner'||c.branchIds.includes(m.branchId||'unassigned')).forEach(m=>{const l=(db.lessons||[]).find(x=>x.id===m.lessonId);items.push(item({id:`makeup:${m.id}`,category:'makeup',severity:'warn',icon:'補',title:`${student(m.studentId||l?.studentId).name||'學生'}的補課尚未安排`,detail:`原課程 ${l?.date||m.originalDate||'日期未設定'}｜${l?lessonTeacherNames(l):'老師未設定'}`,sort:`3-${l?.date||''}`,action:{type:'makeups'}}))})
  }
  if(c.role==='owner'||c.role==='branch_manager'){
   const weekStart=new Date(`${today}T00:00:00`);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));const from=localDate(weekStart),to=addDays(from,6);
   visibleTeachers().filter(t=>(+t.minWeeklyHours||0)>0).forEach(t=>{const actual=lessons.filter(l=>l.date>=from&&l.date<=to&&lessonTeacherIds(l).includes(t.id)&&lessonCountsForTeacherPay(l)).reduce((s,l)=>s+hours(l.start,l.end),0),expected=+t.minWeeklyHours||0;if(actual+0.01<expected)items.push(item({id:`hours:${t.id}:${from}`,category:'hours',severity:'warn',icon:'時',title:`${t.name} 本週尚缺 ${(expected-actual).toFixed(1)} 小時`,detail:`目前 ${actual.toFixed(1)}／最低 ${expected.toFixed(1)} 小時（${from.slice(5)}–${to.slice(5)}）`,sort:`5-${t.name}`,action:{type:'settlement'}}))});
   lessons.filter(l=>l.date>=today&&hasTeacherOverlap(l)).slice(0,40).forEach(l=>items.push(item({id:`teacher-overlap:${l.id}`,category:'anomaly',severity:'danger',icon:'撞',title:`${l.date} 有老師時間重複`,detail:`${l.start}–${l.end}｜${lessonTeacherConflictNames(l).join('、')}｜${student(l.studentId).name}`,sort:`0-${l.date}-${l.start}`,action:{type:'calendar',date:l.date,lessonId:l.id}})))
  }
  const dedup=[...new Map(items.map(x=>[x.id,x])).values()];dedup.sort((a,b)=>a.sort.localeCompare(b.sort));return dedup
 }
 function categoryLabel(v){return ({report:'未完成回報',payment:'未收款',makeup:'補課',tomorrow:'明日課程',hours:'老師時數',anomaly:'校區異常',general:'一般'})[v]||'通知'}
 function filtered(){return state.filter==='all'?state.items:state.items.filter(x=>x.category===state.filter)}
 function render(){state.items=buildNotifications();const reads=readIds(),unread=state.items.filter(x=>!reads.has(x.id)).length,badge=$id('notificationCount');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.hidden=!unread}const summary=$id('notificationSummary');if(summary)summary.textContent=unread?`${unread} 則未讀，共 ${state.items.length} 則待辦`:`目前 ${state.items.length} 則通知，已全部讀取`;document.querySelectorAll('.notification-tab').forEach(b=>b.classList.toggle('active',b.dataset.filter===state.filter));const list=$id('notificationList');if(!list)return;const rows=filtered();list.innerHTML=rows.length?rows.map(n=>`<button type="button" class="notification-item ${reads.has(n.id)?'':'unread'}" onclick="DanbridgeNotifications.openItem('${esc(n.id)}')"><span class="notification-icon ${esc(n.severity)}">${esc(n.icon)}</span><span class="notification-copy"><b>${esc(n.title)}</b><span>${esc(n.detail)}</span><small>${categoryLabel(n.category)}</small></span><span class="notification-dot ${reads.has(n.id)?'read':''}"></span></button>`).join(''):`<div class="notification-empty"><strong>這個分類目前沒有通知</strong><span>新的課程、回報或營運事項出現時會顯示在這裡。</span></div>`;const footer=$id('notificationFooter');if(footer)footer.textContent=`最後更新：${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`}
 function setFilter(v){state.filter=v;render()}
 function open(){document.body.classList.add('notification-center-open');render()}
 function close(){document.body.classList.remove('notification-center-open')}
 function markAllRead(){const reads=readIds();state.items.forEach(x=>reads.add(x.id));saveRead(reads);render()}
 function openItem(id){const n=state.items.find(x=>x.id===id);if(!n)return;const reads=readIds();reads.add(id);saveRead(reads);render();close();const a=n.action||{};if(a.type==='report'){window.openLessonReport?.(a.lessonId);return}if(a.type==='calendar'){const input=$id('calendarDate');if(input&&a.date)input.value=a.date;switchTab('calendar');setTimeout(()=>a.lessonId&&window.editLesson?.(a.lessonId),40);return}if(a.type==='lessons'){switchTab('lessons');if(a.lessonId)setTimeout(()=>window.editLesson?.(a.lessonId),40);return}if(a.type==='makeups'){switchTab('makeups');return}if(a.type==='settlement'){switchTab('settlement')}}
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 window.DanbridgeNotifications={render,open,close,setFilter,markAllRead,openItem,buildNotifications};
})();
