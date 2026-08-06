/** V15.24 — branch-aware Teacher KPI foundation. */
(function(){
  const access=()=>window.DanbridgeAccess;
  const ctx=()=>access()?.getContext?.()||{role:'owner',branchIds:[],teacherId:''};
  const branchId=r=>r?.branchId||access()?.branchIdFromLocation?.(r?.location||'')||'unassigned';
  const branchName=id=>(db.branches||[]).find(b=>b.id===id)?.name||(id==='all'?'全部校區':'未歸屬');
  const lessonTeachers=l=>typeof lessonTeacherIds==='function'?lessonTeacherIds(l):[l.teacherId,...(l.coTeacherIds||[])].filter(Boolean);
  const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
  function setupFilters(){
    const month=$('teacherKpiMonth'),branch=$('teacherKpiBranch');if(!month||!branch)return;
    if(!month.value)month.value=monthNow();
    const c=ctx(),allowed=(db.branches||[]).filter(b=>c.role==='owner'||c.branchIds.includes(b.id));
    const old=branch.value;
    branch.innerHTML=(c.role==='owner'?'<option value="all">全部校區</option>':'')+allowed.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')+(c.role==='owner'?'<option value="unassigned">未歸屬</option>':'');
    if(c.role==='branch_manager'){branch.value=c.branchIds[0]||'unassigned';branch.disabled=true}else if(c.role==='teacher'){branch.value='all';branch.disabled=true}else{branch.disabled=false;branch.value=[...branch.options].some(o=>o.value===old)?old:'all'}
  }
  function teacherRows(){
    setupFilters();const c=ctx(),month=window.__danbridgeFinanceWorkspaceMonth||$('teacherKpiMonth')?.value||monthNow(),scope=$('teacherKpiBranch')?.value||'all';
    let lessons=(db.lessons||[]).filter(l=>!l.isDraft&&l.date?.startsWith(month)&&(scope==='all'||branchId(l)===scope));
    let teachers=(db.teachers||[]).filter(t=>scope==='all'||[...(t.branchIds||[]),...(t.assignedBranchIds||[])].includes(scope)||lessons.some(l=>lessonTeachers(l).includes(t.id)));
    if(c.role==='teacher'){teachers=teachers.filter(t=>t.id===c.teacherId);lessons=lessons.filter(l=>lessonTeachers(l).includes(c.teacherId))}
    return teachers.map(t=>{
      const ls=lessons.filter(l=>lessonTeachers(l).includes(t.id));
      const active=ls.filter(lessonCountsAsTaught);
      const leave=ls.filter(l=>['學生請假','老師請假','取消','停課'].includes(l.status));
      const makeup=ls.filter(l=>l.teacherReportStatus==='makeup_completed'||l.status==='補課完成'||l.isMakeup);
      const reportable=active.filter(l=>l.date<=todayStr());
      const reported=reportable.filter(l=>['completed','makeup_completed'].includes(l.teacherReportStatus));
      return{t,students:new Set(active.map(l=>l.studentId)).size,count:active.length,hours:active.reduce((a,l)=>a+hours(l.start,l.end),0),revenue:teacherCompanyRevenue(t,month,active),leaveRate:pct(leave.length,ls.length),makeupRate:pct(makeup.length,active.length),reportRate:pct(reported.length,reportable.length),branches:new Set(active.map(branchId)).size};
    }).sort((a,b)=>b.hours-a.hours||a.t.name.localeCompare(b.t.name,'zh-Hant'));
  }
  window.renderTeacherKpi=function(){
    const grid=$('teacherKpiGrid'),summary=$('teacherKpiSummary');if(!grid||!summary)return;
    const rows=teacherRows(),totalHours=rows.reduce((a,x)=>a+x.hours,0),students=new Set();
    const c=ctx(),month=window.__danbridgeFinanceWorkspaceMonth||$('teacherKpiMonth')?.value||monthNow(),scope=$('teacherKpiBranch')?.value||'all';
    const scopedLessons=(db.lessons||[]).filter(l=>!l.isDraft&&l.date?.startsWith(month)&&(scope==='all'||branchId(l)===scope)&&(c.role!=='teacher'||lessonTeachers(l).includes(c.teacherId)));scopedLessons.forEach(l=>students.add(l.studentId));
    const totalRevenue=scopedLessons.reduce((sum,l)=>sum+timetableRevenueCharge(l),0)+(c.role==='teacher'?0:summerCampRegistrationRevenue(month,scope));
    summary.innerHTML=`<div><span>老師數</span><b>${rows.length}</b></div><div><span>授課學生</span><b>${students.size}</b></div><div><span>總時數</span><b>${fmtHours(totalHours)} hr</b></div><div><span>公司營收</span><b>${money(totalRevenue)}</b></div>`;
    grid.innerHTML=rows.map(x=>`<article class="teacher-kpi-item"><div class="teacher-kpi-title"><div><h3>${esc(x.t.name)}</h3><span class="small">${esc(x.t.type||'老師')}｜${scope==='all'?`${x.branches} 個校區`:esc(branchName(scope))}</span></div><span class="report-badge ${x.reportRate>=90?'completed':''}">${x.reportRate.toFixed(1)}% 回報</span></div><div class="teacher-kpi-metrics"><div class="teacher-kpi-metric"><span>學生數</span><b>${x.students}</b></div><div class="teacher-kpi-metric"><span>本月堂數</span><b>${x.count}</b></div><div class="teacher-kpi-metric"><span>授課時數</span><b>${fmtHours(x.hours)} hr</b></div><div class="teacher-kpi-metric"><span>公司營收</span><b>${money(x.revenue)}</b></div></div><div class="teacher-kpi-progress"><div class="teacher-kpi-progress-row"><span>課堂回報</span><div class="teacher-kpi-bar"><i style="width:${Math.min(100,x.reportRate)}%"></i></div><b>${x.reportRate.toFixed(1)}%</b></div><div class="teacher-kpi-progress-row"><span>請假率</span><div class="teacher-kpi-bar"><i style="width:${Math.min(100,x.leaveRate)}%"></i></div><b>${x.leaveRate.toFixed(1)}%</b></div><div class="teacher-kpi-progress-row"><span>補課率</span><div class="teacher-kpi-bar"><i style="width:${Math.min(100,x.makeupRate)}%"></i></div><b>${x.makeupRate.toFixed(1)}%</b></div></div></article>`).join('')||'<div class="teacher-kpi-empty">目前月份與校區沒有老師 KPI 資料。</div>';
  };
  const base=window.renderTeachers;
  window.renderTeachers=function(){base?.();window.renderTeacherKpi?.()};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>window.renderTeacherKpi?.(),0));
})();
