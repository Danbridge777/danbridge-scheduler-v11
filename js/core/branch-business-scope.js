/** V15.21 Step 3 — shared branch business scope for dashboard, settlement and finance. */
(function(){
  const scopes={dashboard:'all',settlement:'all',finance:'all'};
  const access=()=>window.DanbridgeAccess;
  const ctx=()=>access()?.getContext?.()||{role:'owner',branchIds:[]};
  const branches=()=>db.branches?.length?db.branches:access()?.DEFAULT_BRANCHES||[];
  const branchId=r=>r?.branchId||access()?.branchIdFromLocation?.(r?.location||'')||'unassigned';
  const allowedScope=value=>{const c=ctx();if(c.role==='branch_manager')return c.branchIds[0]||'unassigned';return value||'all'};
  const match=(record,scope)=>scope==='all'||branchId(record)===scope;
  const scopeLabel=scope=>scope==='all'?'全部校區':(branches().find(b=>b.id===scope)?.name||'未歸屬校區');
  const scopedLessons=(scope,month='')=>(db.lessons||[]).filter(l=>!l.isDraft&&(!month||l.date.startsWith(month))&&match(l,allowedScope(scope)));
  const recordMatchesBranch=(record,scope,lessonIds)=>{
    if(scope==='all')return true;
    const ids=[...(record?.branchIds||[]),...(record?.assignedBranchIds||[])];
    return ids.includes(scope)||lessonIds.has(record?.id);
  };
  function scopedPeople(scope,lessons){
    const studentIds=new Set(lessons.map(l=>l.studentId));
    const teacherIds=new Set(lessons.flatMap(l=>lessonTeacherIds(l)));
    return{
      students:(db.students||[]).filter(s=>recordMatchesBranch(s,scope,studentIds)),
      teachers:(db.teachers||[]).filter(t=>recordMatchesBranch(t,scope,teacherIds))
    };
  }
  function optionsHTML(includeAll=true){
    const c=ctx(),bs=branches().filter(b=>c.role==='owner'||c.branchIds.includes(b.id));
    return (includeAll&&c.role==='owner'?'<option value="all">全部校區</option>':'')+
      bs.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')+
      (c.role==='owner'?'<option value="unassigned">未歸屬</option>':'');
  }
  function syncSelectors(){
    for(const page of ['dashboard','settlement','finance']){
      const el=$(page+'BranchScope');if(!el)continue;
      const c=ctx();el.innerHTML=optionsHTML(true);scopes[page]=allowedScope(scopes[page]);
      if(![...el.options].some(o=>o.value===scopes[page]))scopes[page]=c.role==='owner'?'all':(c.branchIds[0]||'unassigned');
      el.value=scopes[page];el.disabled=c.role==='branch_manager';
    }
    for(const id of ['fixedExpenseBranch','oneTimeExpenseBranch']){
      const el=$(id);if(!el)continue;const old=el.value;el.innerHTML=optionsHTML(false);
      if([...el.options].some(o=>o.value===old))el.value=old;else el.value=defaultExpenseBranch();
      el.disabled=ctx().role==='branch_manager';
    }
  }
  function setScope(page,value){
    scopes[page]=allowedScope(value);
    if(page==='dashboard')renderDashboard();
    if(page==='settlement')renderSettlement();
    if(page==='finance')renderFinance();
  }
  function defaultExpenseBranch(){const c=ctx();return c.role==='branch_manager'?(c.branchIds[0]||'unassigned'):(scopes.finance!=='all'?scopes.finance:(branches()[0]?.id||'unassigned'))}
  function branchBreakdown(lessons,teacherId){
    const grouped=new Map();
    lessons.filter(l=>!teacherId||lessonTeacherIds(l).includes(teacherId)).forEach(l=>{
      const id=branchId(l),row=grouped.get(id)||{branchId:id,h:0,amount:0,count:0};
      row.h+=hours(l.start,l.end);row.amount+=teacherId?lessonTeacherPay(l,teacherId):timetableRevenueCharge(l);row.count++;grouped.set(id,row);
    });
    return [...grouped.values()].sort((a,b)=>scopeLabel(a.branchId).localeCompare(scopeLabel(b.branchId),'zh-Hant'));
  }
  function teacherWeekBreakdownForLessons(t,m,paid){
    const r=monthDateRange(m),daily=(+t.minWeeklyHours||0)/Math.max(1,(t.workDays||[]).length),rows=[];let cursor=new Date(r.start);cursor.setDate(cursor.getDate()-((cursor.getDay()+6)%7));
    while(cursor<=r.end){const ws=new Date(cursor),we=new Date(cursor);we.setDate(we.getDate()+6);const from=ws<r.start?r.start:ws,to=we>r.end?r.end:we,workCount=countTeacherWorkDaysInRange(t,from,to),expected=daily*workCount;const actual=paid.filter(l=>{const d=new Date(l.date+'T00:00:00');return d>=from&&d<=to}).reduce((a,l)=>a+hours(l.start,l.end),0);rows.push({from:localDate(from),to:localDate(to),expected,actual,diff:actual-expected});cursor.setDate(cursor.getDate()+7)}return rows;
  }

  window.financeData=function(m){
    m=window.__danbridgeFinanceWorkspaceMonth||m;const scope=allowedScope(scopes.finance),lessons=scopedLessons(scope,m),lessonRevenue=lessons.reduce((a,l)=>a+timetableRevenueCharge(l),0),campRevenue=summerCampRegistrationRevenue(m,scope),revenue=lessonRevenue+campRevenue;
    const expenseMatch=x=>scope==='all'||(x.branchId||'unassigned')===scope;
    const fixed=(db.fixedExpenses||[]).filter(x=>fixedExpenseApplies(x,m)&&expenseMatch(x));
    const one=(db.oneTimeExpenses||[]).filter(x=>x.month===m&&expenseMatch(x));
    const fixedTotal=fixed.reduce((a,x)=>a+(+x.amount||0),0),oneTimeTotal=one.reduce((a,x)=>a+(+x.amount||0),0);
    const tids=new Set(lessons.flatMap(l=>lessonTeacherIds(l)));
    const payrollRows=(db.teachers||[]).filter(t=>recordMatchesBranch(t,scope,tids)).map(t=>{
      const paid=lessons.filter(l=>lessonTeacherIds(l).includes(t.id)&&lessonCountsForTeacherPay(l));
      const payroll=calculateTeacherPayroll(t,m,paid),h=payroll.actualHours,amount=payroll.amount;
      return{teacher:t,h,amount,revenue:teacherCompanyRevenue(t,m,lessons),payroll,branches:branchBreakdown(paid,t.id)};
    });
    const payroll=payrollRows.reduce((a,x)=>a+x.amount,0),totalExpenses=fixedTotal+oneTimeTotal+payroll;
    return{m,scope,revenue,lessonRevenue,campRevenue,fixed,one,fixedTotal,oneTimeTotal,payrollRows,payroll,totalExpenses,profit:revenue-totalExpenses,branchRevenue:branchBreakdown(lessons)};
  };

  window.settleData=function(){
    const m=window.__danbridgeFinanceWorkspaceMonth||$('settleMonth').value||monthNow(),scope=allowedScope(scopes.settlement),ls=scopedLessons(scope,m),campRows=summerCampRegistrationRows(m,scope);
    const studentIds=new Set([...ls.map(l=>l.studentId),...campRows.map(r=>r.studentId)]),teacherIds=new Set(ls.flatMap(l=>lessonTeacherIds(l)));
    const sr=(db.students||[]).filter(s=>recordMatchesBranch(s,scope,studentIds)).map(s=>{
      const x=ls.filter(l=>l.studentId===s.id),chargedLessons=studentChargeableTutoringLessons(s.id,m,'all',ls),abs=x.filter(l=>['學生請假','老師請假','取消','停課'].includes(l.status));
      const lessonAmount=chargedLessons.reduce((a,l)=>a+lessonCharge(l),0),campAmount=studentSummerCampRevenue(s.id,m,scope);
      return{s,total:x.length,charged:chargedLessons.length,h:chargedLessons.reduce((a,l)=>a+hours(l.start,l.end),0),abs:abs.length,rate:x.length?abs.length/x.length*100:0,lessonAmount,campAmount,amount:lessonAmount+campAmount};
    });
    const tr=(db.teachers||[]).filter(t=>recordMatchesBranch(t,scope,teacherIds)).map(t=>{
      const paid=ls.filter(l=>lessonTeacherIds(l).includes(t.id)&&lessonCountsForTeacherPay(l)),payroll=calculateTeacherPayroll(t,m,paid),h=payroll.actualHours;
      const expected=payroll.expectedHours,diff=payroll.diff,weeks=teacherWeekBreakdownForLessons(t,m,paid);
      const amount=payroll.amount;
      return{t,count:paid.length,h,expected,diff,weeks,amount,revenue:teacherCompanyRevenue(t,m,ls),payroll,branches:branchBreakdown(paid,t.id),companyWide:true};
    });
    return{sr,tr,scope,m,lessons:ls};
  };

  const baseDashboard=window.renderDashboard;
  window.renderDashboard=function(){
    baseDashboard();syncSelectors();
    const scope=allowedScope(scopes.dashboard),m=monthNow(),tod=todayStr(),ls=scopedLessons(scope,m),today=ls.filter(l=>l.date===tod&&!['取消','停課'].includes(l.status));
    const people=scopedPeople(scope,ls),todayTeacherIds=new Set(today.flatMap(l=>lessonTeacherIds(l)));
    $('mStudents').textContent=people.students.length;$('mTeachers').textContent=people.teachers.length;$('mLessons').textContent=ls.length;
    $('mRevenue').textContent=money(ls.reduce((a,l)=>a+timetableRevenueCharge(l),0)+summerCampRegistrationRevenue(m,scope));
    $('mUnpaid').textContent=money(ls.filter(l=>(l.paymentStatus||'unpaid')==='unpaid').reduce((a,l)=>a+timetableRevenueCharge(l),0));
    $('mPayroll').textContent=money(financeData(m).payroll);
    if($('mTeacherHours')){$('mTeacherHours').textContent=`${ls.filter(l=>l.teacherReportStatus==='completed'||l.teacherReportStatus==='makeup_completed').reduce((s,l)=>s+hours(l.start,l.end),0).toFixed(1)} 小時`;}
    if($('mMakeups'))$('mMakeups').textContent=(db.makeups||[]).filter(x=>x.status==='pending'&&(scope==='all'||branchId((db.lessons||[]).find(l=>l.id===x.lessonId)||x)===scope)).length;
    const changes=(db.changes||[]).filter(c=>localDate(new Date(c.at))===tod).filter(c=>{const l=(db.lessons||[]).find(x=>x.id===c.lessonId);return scope==='all'||(l&&branchId(l)===scope)});
    if($('mChanges'))$('mChanges').textContent=changes.length;
    if($('todayChanges'))$('todayChanges').innerHTML=changes.length?`<table class="change-table"><thead><tr><th>時間</th><th>類型</th><th>學生／班級</th><th>原日期</th><th>原時間</th><th>新日期</th><th>新時間</th></tr></thead><tbody>${changes.slice(0,100).map(c=>`<tr><td>${new Date(c.at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</td><td><b>${esc(c.type)}</b></td><td class="student-cell">${esc(student(c.studentId).name)}</td><td class="muted-cell">${esc(c.before?.date||'—')}</td><td>${esc(c.before?.start||'—')}</td><td class="muted-cell">${esc(c.after?.date||'—')}</td><td>${esc(c.after?.start||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="small" style="padding:12px">今天尚無課表異動。</div>';
    $('todayLessons').innerHTML=today.sort((a,b)=>a.start.localeCompare(b.start)).map(l=>`<div class="lesson ${hasTeacherOverlap(l)?'teacher-overlap':''}" style="--teacher:${teacher(l.teacherId).color||'#2563eb'};--location-bg:${locationBg(l.location)}" onclick="editLesson('${l.id}')"><b>${l.start}–${l.end}｜${esc(student(l.studentId).name)}</b><span class="meta">${esc(lessonTeacherNames(l))}｜${esc(l.title)}｜${esc(locationLabel(l))}｜${esc(l.room||'未指定教室')}</span></div>`).join('')||'<span class="small">今天沒有課程。</span>';
    if($('dashboardBranchScopeNote'))$('dashboardBranchScopeNote').textContent=`目前顯示：${scopeLabel(scope)}`;
    if($('v33TodayLessons'))$('v33TodayLessons').textContent=today.length;if($('v33TodayHours'))$('v33TodayHours').textContent=`${today.reduce((a,l)=>a+hours(l.start,l.end),0).toFixed(1)} 小時`;
    if($('v33TodayRevenue'))$('v33TodayRevenue').textContent=money(today.reduce((a,l)=>a+timetableRevenueCharge(l),0));if($('v33TodayTeachers'))$('v33TodayTeachers').textContent=todayTeacherIds.size;
    const currentTime=`${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`;
    const roomLessons=today.filter(l=>l.room&&l.deliveryMode!=='online'&&l.deliveryMode!=='home'&&l.location!=='線上課'&&l.location!=='到府');
    const roomNames=[...new Set(roomLessons.map(l=>`${locationLabel(l)}｜${l.room}`))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
    const liveRooms=roomNames.filter(name=>roomLessons.some(l=>`${locationLabel(l)}｜${l.room}`===name&&l.start<=currentTime&&l.end>currentTime));
    if($('v33LiveRooms'))$('v33LiveRooms').textContent=liveRooms.length;if($('v33RoomTotal'))$('v33RoomTotal').textContent=`共 ${roomNames.length} 間排課`;
    if($('v33RoomStatus'))$('v33RoomStatus').innerHTML=roomNames.length?roomNames.slice(0,10).map(name=>{const rows=roomLessons.filter(l=>`${locationLabel(l)}｜${l.room}`===name).sort((a,b)=>a.start.localeCompare(b.start)),live=rows.find(l=>l.start<=currentTime&&l.end>currentTime),soon=rows.find(l=>l.start>currentTime),state=live?'live':soon?'soon':'',text=live?`${student(live.studentId).name||live.title||'課程'}・${live.end} 下課`:soon?`${soon.start} ${student(soon.studentId).name||soon.title||'課程'}`:'今日課程已結束';return `<div class="v33-room ${state}"><span class="v33-room-dot"></span><div style="min-width:0"><b>${esc(name.replace('｜','・'))}</b><span>${esc(text)}</span></div></div>`}).join(''):'<div class="small">今天沒有設定教室的課程。</div>';
    const days=[];for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()+i);const ds=localDate(d),count=(db.lessons||[]).filter(l=>!l.isDraft&&l.date===ds&&!['取消','停課'].includes(l.status)&&match(l,scope)).length;days.push({d,count})}
    const max=Math.max(1,...days.map(x=>x.count));if($('v33WeekBars'))$('v33WeekBars').innerHTML=days.map(x=>`<div class="v33-week-day"><div class="v33-week-bar-wrap"><div class="v33-week-bar" style="height:${Math.max(4,Math.round(x.count/max*100))}%"></div></div><b>${['日','一','二','三','四','五','六'][x.d.getDay()]}</b><span>${x.count}堂</span></div>`).join('');
    const unpaid=ls.filter(l=>(l.paymentStatus||'unpaid')==='unpaid'&&lessonCharge(l)>0),insights=[];
    const missingReports=today.filter(l=>l.status==='已上課'&&!l.teacherReportStatus);if(missingReports.length)insights.push({type:'danger',title:`${missingReports.length} 堂尚未填寫回報`,text:'請老師完成今日課程內容與家庭作業。'});
    if(unpaid.length)insights.push({type:'',title:`本月有 ${unpaid.length} 堂未繳`,text:`預估待收 ${money(unpaid.reduce((a,l)=>a+lessonCharge(l),0))}`});
    const overlaps=today.filter(hasTeacherOverlap);if(overlaps.length)insights.push({type:'danger',title:`今日有 ${overlaps.length} 堂老師時間重複`,text:'請檢查課表中的紅色課程卡。'});
    const pending=(db.makeups||[]).filter(x=>x.status==='pending'&&(scope==='all'||branchId((db.lessons||[]).find(l=>l.id===x.lessonId)||x)===scope)).length;if(pending)insights.push({type:'',title:`${pending} 筆補課待安排`,text:'可前往補課中心進行後續處理。'});
    if(!insights.length)insights.push({type:'good',title:'目前沒有急迫事項',text:`${scopeLabel(scope)}的課表與回報狀態正常。`});
    if($('v32Insights'))$('v32Insights').innerHTML=insights.slice(0,4).map(x=>`<div class="v32-insight ${x.type}"><span class="v32-insight-dot"></span><div><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div></div>`).join('');
  };

  const baseRenderFinance=window.renderFinance;
  window.renderFinance=function(){
    syncSelectors();baseRenderFinance();const scope=allowedScope(scopes.finance),m=window.__danbridgeFinanceWorkspaceMonth||$('financeMonth')?.value||'2026-07',d=financeData(m);
    $('fixedExpenseRows').innerHTML=(db.fixedExpenses||[]).filter(x=>fixedExpenseApplies(x,m)&&(scope==='all'||(x.branchId||'unassigned')===scope)).map(x=>`<tr><td><b>${esc(x.name)}</b><div class="small">${esc(scopeLabel(x.branchId||'unassigned'))}</div></td><td>${money(x.amount)}</td><td>${monthLabel(x.startMonth||'2026-07')}</td><td>${x.endMonth?monthLabel(x.endMonth):'持續'}</td><td><button class="btn" onclick="editFixedExpense('${x.id}')">編輯</button> <button class="btn danger" onclick="deleteFixedExpense('${x.id}')">刪除</button></td></tr>`).join('')||'<tr><td colspan="5" class="small">本月沒有生效中的固定開銷。</td></tr>';
    $('oneTimeExpenseRows').innerHTML=(db.oneTimeExpenses||[]).filter(x=>x.month===m&&(scope==='all'||(x.branchId||'unassigned')===scope)).slice().sort((a,b)=>b.month.localeCompare(a.month)).map(x=>`<tr><td>${monthLabel(x.month)}</td><td><b>${esc(x.name)}</b><div class="small">${esc(scopeLabel(x.branchId||'unassigned'))}</div></td><td>${money(x.amount)}</td><td><button class="btn" onclick="editOneTimeExpense('${x.id}')">編輯</button> <button class="btn danger" onclick="deleteOneTimeExpense('${x.id}')">刪除</button></td></tr>`).join('')||'<tr><td colspan="4" class="small">本月沒有一次性支出。</td></tr>';
    $('financePayrollRows').innerHTML=d.payrollRows.map(x=>`<div class="finance-payroll-row branch-payroll-row"><span><b>${esc(x.teacher.name)}</b><br><span class="small">${fmtHours(x.h)} hr｜公司營收 ${money(x.revenue)}｜薪資 ${money(x.amount)}</span>${scope==='all'&&x.branches.length>1?`<span class="branch-breakdown">${x.branches.map(b=>`<span>${esc(scopeLabel(b.branchId))}：${fmtHours(b.h)} hr／${money(b.amount)}</span>`).join('')}</span>`:''}</span><b>${money(x.amount)}</b></div>`).join('')||'<span class="small">本月沒有可計薪的老師課程。</span>';
  };

  window.renderSettlement=function(){
    syncSelectors();const{sr,tr,scope,m}=settleData(),totalRevenue=sr.reduce((s,x)=>s+x.amount,0),totalPayroll=tr.reduce((s,x)=>s+x.amount,0),{totalLessons,leaveCount:totalAbsences}=settlementSummaryTotals(sr),totalHours=tr.reduce((s,x)=>s+x.h,0);
    const summary=$('settlementExecutiveSummary');if(summary)summary.innerHTML=`<div class="settlement-summary-card good"><span>本月應收</span><b>${money(totalRevenue)}</b></div><div class="settlement-summary-card"><span>老師薪資</span><b>${money(totalPayroll)}</b></div><div class="settlement-summary-card"><span>課表總堂數</span><b>${totalLessons} 堂</b></div><div class="settlement-summary-card"><span>老師總工時</span><b>${fmtHours(totalHours)} hr</b></div><div class="settlement-summary-card warn"><span>學生請假</span><b>${totalAbsences} 次</b></div>`;
    $('studentSettleRows').innerHTML=sr.map(x=>{const familyIds=billingFamilyStudents(x.s.id).map(s=>s.id);return`<tr><td><b>${esc(x.s.name)}</b>${x.campAmount?`<br><span class="small">含冬／夏令營 ${money(x.campAmount)}</span>`:''}</td><td>${esc(x.s.parent)}</td><td>${x.total}</td><td>${x.charged} 堂／${fmtHours(x.h)} hr</td><td>${x.abs}</td><td>${x.rate.toFixed(1)}%</td><td>${money(x.amount)}</td><td><button class="btn line-billing-btn" onclick="copyStudentLineBilling('${x.s.id}','${m}','${scope}','${encodeURIComponent(familyIds.join(','))}')">複製家庭 LINE</button></td></tr>`}).join('')||'<tr><td colspan="8" class="small">此校區本月沒有學生收入資料。</td></tr>';
    $('teacherSettleRows').innerHTML=tr.map(x=>`<tr><td><b>${esc(x.t.name)}</b></td><td>${esc(workDayNames(x.t.workDays))}</td><td>${fmtHours(x.t.minWeeklyHours)} hr</td><td>${fmtHours(x.expected)} hr</td><td>${fmtHours(x.h)} hr</td><td class="${diffClass(x.diff)}"><b>${diffText(x.diff)}</b></td><td>${x.payroll.mode==='fixed'?`超時 ${x.payroll.overtimeRate===null?'未設定':money(x.payroll.overtimeRate)}<br><span class="small">不足 ${x.payroll.deductionRate===null?'未設定':money(x.payroll.deductionRate)}</span>`:money(x.payroll.hourlyRate||0)}</td><td>${money(x.revenue)}</td><td>${money(x.amount)}</td></tr>`).join('')||'<tr><td colspan="9" class="small">目前沒有老師工時資料。</td></tr>';
    $('teacherPayCards').innerHTML=tr.map(x=>`<div class="teacher-pay-card"><div class="teacher-pay-head"><div class="teacher-pay-avatar">${esc((x.t.name||'?').trim().charAt(0).toUpperCase())}</div><div class="teacher-pay-identity"><h4 title="${esc(x.t.name)}">${esc(x.t.name)}</h4><div class="teacher-pay-role">教師工時與薪資｜${esc(scopeLabel(scope))}</div></div></div><div class="teacher-work-summary">固定工作日：${esc(workDayNames(x.t.workDays))}｜每週最低：${fmtHours(x.t.minWeeklyHours)} hr｜薪資制度：${x.payroll.mode==='fixed'?'固定底薪制':'純時薪制'}</div><div class="teacher-pay-grid"><div class="teacher-pay-stat">本月最低<b>${fmtHours(x.expected)} hr</b></div><div class="teacher-pay-stat">實際上課<b>${fmtHours(x.h)} hr</b></div><div class="teacher-pay-stat">多／少<b class="${diffClass(x.diff)}">${diffText(x.diff)}</b></div><div class="teacher-pay-stat teacher-revenue-kpi">公司營收<b>${money(x.revenue)}</b><small>依此老師課表內所有正式課程自動加總</small></div><div class="teacher-pay-stat">應付薪資<b>${money(x.amount)}</b><small>${esc(teacherPayrollFormulaText(x.payroll))}</small></div></div>${x.payroll.mode==='fixed'?`<div class="branch-breakdown cards"><span><b>固定底薪</b>${x.payroll.baseSalary===null?'未設定':money(x.payroll.baseSalary)}</span><span><b>超時加給</b>＋${money(x.payroll.addition)}</span><span><b>不足扣款</b>－${money(x.payroll.deduction)}</span></div>`:''}${x.branches.length?`<div class="branch-breakdown cards">${x.branches.map(b=>`<span><b>${esc(scopeLabel(b.branchId))}</b>${fmtHours(b.h)} hr</span>`).join('')}</div>`:''}<div class="weekly-detail"><div class="weekly-row head"><span>週別</span><span>最低</span><span>實際</span><span>差額</span></div>${x.weeks.map(w=>`<div class="weekly-row"><span>${w.from.slice(5)}～${w.to.slice(5)}</span><span>${fmtHours(w.expected)}</span><span>${fmtHours(w.actual)}</span><span class="${diffClass(w.diff)}">${diffText(w.diff)}</span></div>`).join('')}</div></div>`).join('')||'<span class="small">目前尚未建立老師。</span>';
    let text=`【${$('settleMonth').value} 月底結算｜${scopeLabel(scope)}】\n\n學生應收：\n`;sr.forEach(x=>text+=`${x.s.name}：${x.charged}堂／${fmtHours(x.h)}hr，請假率${x.rate.toFixed(1)}%，應收${money(x.amount)}\n`);text+='\n老師工時與薪資：\n';tr.forEach(x=>{text+=`\n${x.t.name}\n實際：${fmtHours(x.h)}hr\n公司營收：${money(x.revenue)}\n應付：${money(x.amount)}\n`;if(x.companyWide){text+=`本月最低：${fmtHours(x.expected)}hr\n差額：${diffText(x.diff)}\n`;x.branches.forEach(b=>text+=`  ${scopeLabel(b.branchId)}：${fmtHours(b.h)}hr／${money(b.amount)}\n`)}});$('settlementText').value=text;renderSettlementHistory();
  };

  window.saveMonthlySettlement=function(){
    const month=$('settleMonth').value||monthNow(),scope=allowedScope(scopes.settlement),data=settleData();
    const {totalLessons,leaveCount,leaveRate}=settlementSummaryTotals(data.sr),totalHours=data.tr.reduce((n,x)=>n+x.h,0),totalRevenue=data.sr.reduce((n,x)=>n+x.amount,0),payroll=data.tr.reduce((n,x)=>n+x.amount,0);
    const record={id:`${month}::${scope}`,month,branchId:scope,savedAt:new Date().toISOString(),totalLessons,totalHours,totalRevenue,leaveCount,leaveRate,payroll};
    db.settlementRecords||=[];const i=db.settlementRecords.findIndex(x=>(x.id||`${x.month}::${x.branchId||'all'}`)===record.id);snapshot();
    if(i>=0)db.settlementRecords[i]=record;else db.settlementRecords.push(record);saveDB();renderSettlementHistory();toast(`${monthLabel(month)}｜${scopeLabel(scope)} 結算紀錄已${i>=0?'更新':'儲存'}`);
  };
  window.renderSettlementHistory=function(){
    const box=$('settlementHistoryRows');if(!box)return;const current=allowedScope(scopes.settlement);
    const rows=[...(db.settlementRecords||[])].filter(r=>current==='all'||(r.branchId||'all')===current).sort((a,b)=>b.month.localeCompare(a.month));
    box.innerHTML=rows.map(r=>{const rs=r.branchId||'all',key=encodeURIComponent(r.id||`${r.month}::${rs}`);return `<tr><td><b>${esc(monthLabel(r.month))}</b><div class="small">${esc(scopeLabel(rs))}</div></td><td>${new Date(r.savedAt).toLocaleString('zh-TW')}</td><td>${r.totalLessons} 堂</td><td>${fmtHours(r.totalHours)} hr</td><td>${money(r.totalRevenue)}</td><td>${r.leaveCount} 堂</td><td>${(+r.leaveRate||0).toFixed(1)}%</td><td>${money(r.payroll)}</td><td class="row-actions"><button class="btn" onclick="loadSettlementRecord('${r.month}','${rs}')">檢視</button><button class="btn danger" onclick="deleteSettlementRecord('${key}')">刪除</button></td></tr>`}).join('')||'<tr><td colspan="9" class="small">此範圍尚未儲存結算紀錄。</td></tr>';
  };
  window.loadSettlementRecord=function(month,scope='all'){renderSettlementMonthOptions();$('settleMonth').value=month;if(ctx().role==='owner'){scopes.settlement=scope;syncSelectors()}renderSettlement();$('settlement').scrollIntoView({behavior:'smooth',block:'start'})};
  window.deleteSettlementRecord=function(encodedKey){const key=decodeURIComponent(encodedKey),record=(db.settlementRecords||[]).find(r=>(r.id||`${r.month}::${r.branchId||'all'}`)===key);if(!record||!confirm(`確定刪除 ${record.month}｜${scopeLabel(record.branchId||'all')} 的結算紀錄？課程資料不會刪除。`))return;snapshot();db.settlementRecords=(db.settlementRecords||[]).filter(r=>(r.id||`${r.month}::${r.branchId||'all'}`)!==key);saveDB();renderSettlementHistory();toast('結算紀錄已刪除')};

  document.addEventListener('DOMContentLoaded',syncSelectors);
  window.DanbridgeBranchBusiness={scopes,setScope,syncSelectors,defaultExpenseBranch,scopeLabel,scopedLessons,branchBreakdown};
})();
