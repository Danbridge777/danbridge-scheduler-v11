(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  let selectedTeacher='';

  function activateFinancePane(name){
    const pane=['overview','kpi','collections','expenses'].includes(name)?name:'overview';
    $$('.v181-finance-nav button').forEach(b=>b.classList.toggle('active',b.dataset.pane===pane));
    $$('.v181-finance-pane').forEach(p=>p.classList.toggle('active',p.dataset.pane===pane));
    if(pane==='overview'||pane==='expenses') window.renderFinance?.();
    if(pane==='kpi'){ window.renderTeacherKpi?.(); window.renderSettlement?.(); }
    if(pane==='collections') window.renderSettlement?.();
  }
  window.activateFinancePane=activateFinancePane;

  function card(title,subtext){
    const el=document.createElement('div'); el.className='card v181-module-card';
    if(title) el.innerHTML=`<div class="v181-card-title"><div><h2>${title}</h2>${subtext?`<p>${subtext}</p>`:''}</div></div>`;
    return el;
  }
  function move(el,to){if(el&&to)to.append(el)}
  function setNativeMonthValue(id,value){const el=$(id);if(!el)return;if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===value)){const option=document.createElement('option');option.value=value;option.textContent=value;el.append(option)}el.value=value}
  function financeWorkspaceMonth(){return window.__danbridgeFinanceWorkspaceMonth||$('#v187FinanceMonthOverview')?.value||$('financeMonth')?.value||$('settleMonth')?.value||$('teacherKpiMonth')?.value||monthNow()}
  function setFinanceWorkspaceMonth(value,render=true){
    if(!/^\d{4}-\d{2}$/.test(value||''))return;window.__danbridgeFinanceWorkspaceMonth=value;$$('.v187-finance-month').forEach(input=>input.value=value);
    ['financeMonth','settleMonth','teacherKpiMonth','oneTimeExpenseMonth'].forEach(id=>setNativeMonthValue(id,value));
    if(render){renderFinance();renderSettlement();window.renderTeacherKpi?.()}
  }
  function addFinanceMonthControl(module,pane){
    const bar=document.createElement('div');bar.className='v187-finance-month-bar';bar.innerHTML=`<label><span>資料月份</span><input class="v187-finance-month" id="v187FinanceMonth${pane[0].toUpperCase()+pane.slice(1)}" type="month"></label><small>切換後自動更新財務、老師 KPI、學生收款與支出資料</small>`;
    $('.v181-card-title',module)?.after(bar);const input=bar.querySelector('input'),commit=()=>setFinanceWorkspaceMonth(input.value,true);input.addEventListener('input',()=>{if(/^\d{4}-\d{2}$/.test(input.value))commit()});input.addEventListener('change',commit);input.addEventListener('blur',commit);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();input.blur()}});
  }
  function bindNativeFinanceControls(overview){
    const month=$('#financeMonth');
    if(month&&!month.dataset.workspaceBound){month.dataset.workspaceBound='1';month.addEventListener('change',()=>setFinanceWorkspaceMonth(month.value,true))}
    const refresh=$$('button',overview).find(button=>button.textContent.trim()==='重新計算');
    if(refresh&&!refresh.dataset.workspaceBound){refresh.dataset.workspaceBound='1';refresh.addEventListener('click',()=>{setFinanceWorkspaceMonth(month?.value||financeWorkspaceMonth(),true);window.toast?.('財務資料已重新計算')})}
  }
  function monthEndAudit(){
    const month=financeWorkspaceMonth(),scope=$('#financeBranchScope')?.value||'all',branchOf=l=>l.branchId||window.DanbridgeAccess?.branchIdFromLocation?.(l.location||'')||'unassigned';
    const lessons=(db.lessons||[]).filter(l=>!l.isDraft&&l.date?.startsWith(month)&&(scope==='all'||branchOf(l)===scope)),tutoring=lessons.filter(l=>!effectiveCampId(l)),camps=lessons.filter(l=>effectiveCampId(l));
    const registrations=summerCampRegistrationRows(month,scope),issues=[];
    const add=(severity,title,detail)=>issues.push({severity,title,detail});
    tutoring.forEach(l=>{const s=student(l.studentId),name=s?.name||`學生 ID ${l.studentId||'空白'}`;if(!s?.id)add('error','課程找不到學生',`${l.date} ${l.start||'--:--'}｜${name}`);if(!l.start||!l.end||hours(l.start,l.end)<=0)add('error','課程時間不完整',`${l.date}｜${name}｜${l.start||'--:--'}–${l.end||'--:--'}`);if(s?.id&&(+s.rate||0)<=0)add('error','學生單價未設定',`${name}｜${l.date}｜目前單價 ${money(+s.rate||0)}`)});
    const duplicateMap=new Map();tutoring.forEach(l=>{const key=[l.studentId,l.date,l.start,l.end].join('|'),rows=duplicateMap.get(key)||[];rows.push(l);duplicateMap.set(key,rows)});duplicateMap.forEach(rows=>{if(rows.length>1){const l=rows[0];add('error','學生同時段重複課程',`${student(l.studentId)?.name||l.studentId}｜${l.date} ${l.start}–${l.end}｜共 ${rows.length} 筆`)}});
    const billedStudentIds=new Set(tutoring.map(l=>l.studentId));billedStudentIds.forEach(id=>{const s=student(id);if(s?.id&&!billingParentName(s.parent))add('warning','缺少家長姓名',`${s.name||id}｜家庭 LINE 無法正確合併`)});
    const usedTeacherIds=new Set(lessons.flatMap(l=>lessonTeacherIds(l)));usedTeacherIds.forEach(id=>{const t=teacher(id);if(!t?.id)return add('error','課程找不到老師',`老師 ID ${id}`);if(teacherPayrollMode(t)==='fixed'){if(teacherBaseSalary(t)===null)add('error','固定底薪未設定',t.name);if(teacherOvertimeRate(t)===null)add('error','超時時薪未設定',t.name);if(teacherDeductionRate(t)===null)add('error','不足工時扣款未設定',t.name)}else if((+t.rate||0)<=0)add('error','老師時薪未設定',t.name)});
    const campStudentIds=new Set(camps.map(l=>l.studentId));campStudentIds.forEach(id=>{if(!registrations.some(r=>(r.campStudentId||inferSummerRegistrationCamp(r))===id))add('warning','營隊課表尚無報名收費',`${student(id)?.name||id}｜${month}`)});
    registrations.forEach(r=>{const s=student(r.studentId),total=summerRegistrationTotal(r);if(!s?.id)add('error','營隊報名找不到學生',`報名 ID ${r.id}`);if(!(r.dates||[]).length)add('error','營隊報名沒有日期',s?.name||r.id);if(total<=0)add('error','營隊費用為 0',s?.name||r.id)});
    const tutoringTotal=tutoring.reduce((sum,l)=>sum+lessonCharge(l),0),studentTotal=[...billedStudentIds].reduce((sum,id)=>sum+studentMonthlyBillingData(id,month,scope).tutoringAmount,0),campTotal=registrations.reduce((sum,r)=>sum+summerRegistrationTotal(r),0);
    if(Math.abs(tutoringTotal-studentTotal)>.01)add('error','家教收入與學生應收不一致',`財務 ${money(tutoringTotal)}｜學生應收 ${money(studentTotal)}`);
    const panel=$('#v181MonthEndAudit');if(!panel)return;const errors=issues.filter(x=>x.severity==='error').length,warnings=issues.filter(x=>x.severity==='warning').length;
    panel.hidden=false;panel.innerHTML=`<div class="v181-audit-head"><div><b>${monthLabel(month)} 月底檢查</b><span>${scope==='all'?'全部校區':window.DanbridgeBranchBusiness?.scopeLabel?.(scope)||scope}</span></div><div><strong class="${errors?'bad':'good'}">${errors?`${errors} 項需修正`:'主要計算通過'}</strong>${warnings?`<em>${warnings} 項提醒</em>`:''}</div></div><div class="v181-audit-summary"><span>家教 ${tutoring.length} 堂／${money(tutoringTotal)}</span><span>營隊報名 ${registrations.length} 筆／${money(campTotal)}</span><span>老師 ${usedTeacherIds.size} 位</span><span>學生 ${billedStudentIds.size} 位</span></div>${issues.length?`<div class="v181-audit-list">${issues.map(x=>`<div class="${x.severity}"><b>${x.severity==='error'?'需修正':'提醒'}｜${esc(x.title)}</b><span>${esc(x.detail)}</span></div>`).join('')}</div>`:'<div class="v181-audit-pass">沒有發現計算、資料關聯或設定異常，可以進行月底對帳。</div>'}`;
    panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function addMonthEndAudit(overview){
    const toolbar=$(':scope > .toolbar',overview);if(!toolbar||$('#v181MonthEndAudit'))return;const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='月底一次檢查';button.addEventListener('click',monthEndAudit);toolbar.append(button);const panel=document.createElement('div');panel.id='v181MonthEndAudit';panel.className='v181-month-end-audit';panel.hidden=true;toolbar.after(panel);
  }
  window.monthEndAudit=monthEndAudit;
  function closeLineBillingPreview(){const modal=$('#v181LineBillingPreview');if(modal)modal.classList.remove('show')}
  function copyPreviewText(){
    const modal=$('#v181LineBillingPreview'),text=$('#v181LineBillingPreviewText')?.value||'',done=()=>{document.dispatchEvent(new CustomEvent('danbridge:line-billing-copied',{detail:{studentId:modal?.dataset.studentId||'',month:modal?.dataset.month||'',scope:modal?.dataset.scope||'all'}}));window.toast?.('LINE 對帳內容已複製');closeLineBillingPreview()};
    if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).then(done).catch(()=>copyStudentLineBillingFallback(text,done));
    copyStudentLineBillingFallback(text,done);
  }
  function openLineBillingPreview(studentId,m,scope='all',encodedFamilyIds='',campSeason=''){
    const resolvedSeason=campSeason==='winter'?'winter':campSeason==='summer'?'summer':activeCampBillingSeason(),familyIds=encodedFamilyIds?decodeURIComponent(encodedFamilyIds).split(',').filter(Boolean):null,text=studentLineBillingText(studentId,m,scope,familyIds,resolvedSeason);let modal=$('#v181LineBillingPreview');
    if(!modal){modal=document.createElement('div');modal.id='v181LineBillingPreview';modal.className='modal-backdrop v181-line-preview';modal.innerHTML='<div class="modal"><div class="modal-head"><div><h2>LINE 費用明細預覽</h2><p>可直接修改文字；修改內容只影響這次複製，不會更動系統資料。</p></div><button type="button" aria-label="關閉">×</button></div><textarea id="v181LineBillingPreviewText"></textarea><div class="v181-line-preview-actions"><button type="button" class="btn">取消</button><button type="button" class="btn primary">確認複製</button></div></div>';document.body.append(modal);const buttons=$$('button',modal);buttons[0].addEventListener('click',closeLineBillingPreview);buttons[1].addEventListener('click',closeLineBillingPreview);buttons[2].addEventListener('click',copyPreviewText);modal.addEventListener('click',e=>{if(e.target===modal)closeLineBillingPreview()})}
    modal.dataset.studentId=studentId;modal.dataset.month=m;modal.dataset.scope=scope;modal.dataset.campSeason=resolvedSeason;$('#v181LineBillingPreviewText',modal).value=text;modal.classList.add('show');setTimeout(()=>$('#v181LineBillingPreviewText',modal)?.focus(),0);
  }
  function installLineBillingPreview(){if(window.copyStudentLineBilling?.__previewInstalled)return;const preview=(studentId,m,scope='all',encodedFamilyIds='',campSeason='')=>openLineBillingPreview(studentId,m,scope,encodedFamilyIds,campSeason);preview.__previewInstalled=true;window.copyStudentLineBilling=preview}
  window.openLineBillingPreview=openLineBillingPreview;window.closeLineBillingPreview=closeLineBillingPreview;window.copyPreviewText=copyPreviewText;
  window.setFinanceWorkspaceMonth=setFinanceWorkspaceMonth;

  function buildStudentCollections(settlementCard,collections){
    const toolbar=$(':scope > .toolbar',settlementCard);
    const executive=$('#settlementExecutiveSummary',settlementCard);
    const studentTable=$('#studentSettleRows',settlementCard)?.closest('.table-wrap');
    const history=$('.settlement-history',settlementCard);
    const text=$('#settlementText',settlementCard);
    const module=card('學生收款','先看本月應收、已收、未收與平均請假率；完整學生名單預設收合。');
    const studentHead=studentTable?.querySelector('thead tr');if(studentHead&&!studentHead.querySelector('[data-line-billing]')){const th=document.createElement('th');th.dataset.lineBilling='1';th.textContent='LINE 對帳';studentHead.append(th)}
    module.classList.add('v181-collections-module');
    move(toolbar,module);
    if(toolbar){
      const monthLabel=$('label',toolbar);if(monthLabel&&monthLabel.textContent.includes('結算月份'))monthLabel.textContent='收款月份';
      const branchLabel=$$('#settlementBranchScope',toolbar)[0]?.closest('div')?.querySelector('label');if(branchLabel)branchLabel.textContent='收款校區';
      $$('button',toolbar).forEach(button=>{if(button.textContent.trim()==='重新計算')button.textContent='重新整理';else button.remove()});
    }
    const summary=document.createElement('div'); summary.id='v181CollectionSummary'; summary.className='v181-summary-grid'; module.append(summary);
    if(executive){executive.hidden=true;module.append(executive)}
    const search=document.createElement('div');search.className='v181-search-grid';search.innerHTML='<label class="v181-search"><span>搜尋學生</span><input id="v181StudentSearch" type="search" placeholder="輸入學生姓名"></label><label class="v181-search"><span>搜尋家長</span><input id="v181ParentSearch" type="search" placeholder="輸入家長姓名"></label>';module.append(search);
    const details=document.createElement('details'); details.className='v181-student-details'; details.innerHTML='<summary><span>查看全部學生</span><small>點擊展開完整應收名單</small></summary>';
    move(studentTable,details); module.append(details);
    if(text)text.hidden=true;
    if(history)history.hidden=true;
    collections.append(module);
    $('#v181StudentSearch',module)?.addEventListener('input',filterStudentRows);
    $('#v181ParentSearch',module)?.addEventListener('input',filterStudentRows);
  }

  function buildTeacherModule(kpiCard,settlementCard,kpiPane,financeRoot){
    const module=card('老師薪資 / KPI','左側搜尋並選擇老師，右側查看營收、薪資、工時、堂數、加班與扣款。');
    module.classList.add('v181-teacher-module');
    if(kpiCard){kpiCard.style.display='';kpiCard.classList.add('v181-kpi-source');move(kpiCard,module)}
    const payroll=$('#financePayrollRows',financeRoot)?.closest('.card');
    if(payroll){payroll.classList.add('v181-payroll-source');move(payroll,module)}
    const payCards=$('#teacherPayCards',settlementCard);
    const payTable=$('#teacherSettleRows',settlementCard)?.closest('.table-wrap');
    if(payCards||payTable){
      const detail=document.createElement('details'); detail.className='v181-payroll-details'; detail.innerHTML='<summary>查看完整薪資與每週明細</summary>';
      move(payCards,detail);move(payTable,detail);module.append(detail);
    }
    kpiPane.append(module);
  }

  function buildFinanceCenter(){
    const finance=$('#finance'),settlement=$('#settlement'),kpiCard=$('.teacher-kpi-card');
    if(!finance||finance.dataset.v181Ready)return;
    finance.dataset.v181Ready='1';
    const financeCard=$(':scope > .card',finance), financeLayout=$('.finance-layout',financeCard);
    const expenseCards=financeLayout?Array.from(financeLayout.children):[];
    const shell=document.createElement('div');shell.className='v181-finance-shell';
    shell.innerHTML='<header class="v181-finance-hero"><div><div class="v181-eyebrow">FINANCE CENTER · V18.1</div><h1>財務中心</h1><p>營收、薪資、收款與支出集中在同一個工作區。</p></div></header><nav class="v181-finance-nav" aria-label="財務中心模組"><button class="active" data-pane="overview"><b>財務總覽</b><span>收入與淨利</span></button><button data-pane="kpi"><b>老師薪資 / KPI</b><span>績效與明細</span></button><button data-pane="collections"><b>學生收款</b><span>應收與請假</span></button><button data-pane="expenses"><b>支出管理</b><span>固定與單次</span></button></nav>';
    const panes={};['overview','kpi','collections','expenses'].forEach((name,i)=>{const p=document.createElement('div');p.className='v181-finance-pane'+(i?'':' active');p.dataset.pane=name;panes[name]=p;shell.append(p)});
    finance.append(shell);

    const overview=card('財務總覽','依月份與校區即時呈現收入、支出、薪資與淨利。');
    move($(':scope > .toolbar',financeCard),overview);move($('.finance-summary',financeCard),overview);
    if(expenseCards[3])move(expenseCards[3],overview);panes.overview.append(overview);
    const expenses=card('支出管理','固定支出與一次性支出分區管理，明細預設完整顯示。');
    if(expenseCards[0])move(expenseCards[0],expenses);if(expenseCards[1])move(expenseCards[1],expenses);panes.expenses.append(expenses);
    buildTeacherModule(kpiCard,settlement,panes.kpi,finance);
    buildStudentCollections(settlement,panes.collections);
    addFinanceMonthControl(overview,'overview');addFinanceMonthControl($('.v181-teacher-module',panes.kpi),'kpi');addFinanceMonthControl($('.v181-collections-module',panes.collections),'collections');addFinanceMonthControl(expenses,'expenses');
    bindNativeFinanceControls(overview);
    addMonthEndAudit(overview);
    [$('financeMonth')?.closest('div'),$('settleMonth')?.closest('div'),$('teacherKpiMonth')?.closest('div')].forEach(el=>{if(el)el.classList.add('v187-native-month-hidden')});
    setFinanceWorkspaceMonth(financeWorkspaceMonth(),false);
    financeCard.remove(); settlement.hidden=true;
    $$('.v181-finance-nav button',shell).forEach(b=>b.addEventListener('click',()=>activateFinancePane(b.dataset.pane)));
  }

  function parseMoney(text){return Number(String(text||'').replace(/[^0-9.-]/g,''))||0}
  function renderCollectionSummary(){
    const target=$('#v181CollectionSummary');if(!target)return;
    const rows=$$('#studentSettleRows tr').filter(r=>r.cells.length>=7);
    const due=rows.reduce((n,r)=>n+parseMoney(r.cells[6]?.textContent),0);
    const lessonRows=rows.filter(r=>(parseFloat(r.cells[2]?.textContent)||0)>0),leave=lessonRows.reduce((n,r)=>n+(parseFloat(r.cells[5]?.textContent)||0),0)/(lessonRows.length||1);
    const month=$('#settleMonth')?.value||'';const scope=$('#settlementBranchScope')?.value||'all';
    const branchOf=l=>l.branchId||window.DanbridgeAccess?.branchIdFromLocation?.(l.location||'')||'unassigned';
    const lessons=(typeof db!=='undefined'?(db.lessons||[]):[]).filter(l=>!l.isDraft&&l.date?.startsWith(month)&&(scope==='all'||branchOf(l)===scope));
    const paid=lessons.filter(l=>l.paymentStatus==='paid').reduce((n,l)=>n+(typeof timetableRevenueCharge==='function'?timetableRevenueCharge(l):0),0);
    const collected=Math.min(due,paid),unpaid=Math.max(0,due-collected);
    target.innerHTML=`<div><span>本月應收</span><b>${money(due)}</b></div><div class="good"><span>已收</span><b>${money(collected)}</b></div><div class="warn"><span>未收</span><b>${money(unpaid)}</b></div><div><span>平均請假率</span><b>${leave.toFixed(1)}%</b></div>`;
    const count=$('.v181-student-details>summary small');if(count)count.textContent=`共 ${rows.length} 位學生，點擊展開完整應收名單`;
    filterStudentRows();
  }
  function filterStudentRows(){
    const studentQuery=($('#v181StudentSearch')?.value||'').trim().toLowerCase(),parentQuery=($('#v181ParentSearch')?.value||'').trim().toLowerCase();
    $$('#studentSettleRows tr').forEach(r=>{const studentText=(r.cells[0]?.textContent||'').toLowerCase(),parentText=(r.cells[1]?.textContent||'').toLowerCase();r.hidden=!!studentQuery&&!studentText.includes(studentQuery)||!!parentQuery&&!parentText.includes(parentQuery)});
  }

  function rebuildTeacherWorkspace(){
    const source=$('#teacherKpiGrid'),module=$('.v181-teacher-module');if(!source||!module)return;
    let workspace=$('.v181-teacher-workspace',module);
    if(!workspace){workspace=document.createElement('div');workspace.className='v181-teacher-workspace';source.before(workspace)}
    const cards=Array.from(source.querySelectorAll('.teacher-kpi-item'));
    if(!cards.length){workspace.innerHTML='<div class="v181-teacher-empty">目前月份與校區沒有老師 KPI 資料。</div>';return}
    const names=cards.map(c=>c.querySelector('h3')?.textContent.trim()||'老師');
    if(!selectedTeacher||!names.includes(selectedTeacher))selectedTeacher=names[0];
    const selected=cards[names.indexOf(selectedTeacher)]||cards[0];
    workspace.innerHTML='<aside><label class="v181-search"><span>搜尋老師</span><input id="v181TeacherSearch" type="search" placeholder="輸入老師姓名"></label><div class="v181-teacher-list"></div></aside><section class="v181-teacher-detail"></section>';
    const list=$('.v181-teacher-list',workspace),detail=$('.v181-teacher-detail',workspace);
    names.forEach(name=>{const b=document.createElement('button');b.type='button';b.className=name===selectedTeacher?'active':'';b.dataset.name=name;b.innerHTML=`<span>${name.slice(0,1)}</span><b>${name}</b>`;list.append(b)});
    detail.append(selected.cloneNode(true));
    list.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;selectedTeacher=b.dataset.name;rebuildTeacherWorkspace()});
    $('#v181TeacherSearch',workspace).addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();$$('button',list).forEach(b=>b.hidden=!!q&&!b.dataset.name.toLowerCase().includes(q))});
  }

  function patchRenderers(){
    const kpi=window.renderTeacherKpi;if(typeof kpi==='function'&&!kpi.__v181){window.renderTeacherKpi=function(){kpi();rebuildTeacherWorkspace()};window.renderTeacherKpi.__v181=true}
    const settlement=window.renderSettlement;if(typeof settlement==='function'&&!settlement.__v181){window.renderSettlement=function(){settlement();renderCollectionSummary();rebuildTeacherWorkspace()};window.renderSettlement.__v181=true}
  }
  function relabelNavigation(){
    const labels={dashboard:'營運總覽',students:'學生 CRM',teachers:'老師管理',calendar:'課程管理',lessons:'課程紀錄',camps:'冬／夏令營',finance:'財務中心',data:'系統資料'};
    Object.entries(labels).forEach(([tab,label])=>{const b=$(`nav button[data-tab="${tab}"]`);if(b)b.textContent=label});
  }
  function patchSwitchTab(){
    const original=window.switchTab;if(typeof original!=='function'||original.__v181)return;
    function wrapped(tab){if(tab==='settlement'){original('finance');setTimeout(()=>activateFinancePane('collections'),0);return}original(tab);if(tab==='finance')setTimeout(()=>activateFinancePane('overview'),0)}
    wrapped.__v181=true;window.switchTab=wrapped;
  }
  function buildQuickActions(){
    if($('#v18Fab'))return;const menu=document.createElement('div');menu.id='v18FabMenu';menu.className='v18-fab-menu';menu.innerHTML='<button data-action="lesson">＋ 新增課程</button><button data-action="student">＋ 新增學生</button><button data-action="teacher">＋ 新增老師</button><button data-action="expense">＋ 新增支出</button>';
    const fab=document.createElement('button');fab.id='v18Fab';fab.className='v18-fab';fab.type='button';fab.setAttribute('aria-label','快速新增');fab.textContent='＋';document.body.append(menu,fab);
    fab.addEventListener('click',()=>menu.classList.toggle('open'));menu.addEventListener('click',e=>{const a=e.target.dataset.action;if(!a)return;menu.classList.remove('open');if(a==='lesson')return window.openLessonModal?.();if(a==='student'){window.switchTab('students');setTimeout(()=>$('#studentName')?.focus(),50)}if(a==='teacher'){window.switchTab('teachers');setTimeout(()=>$('#teacherName')?.focus(),50)}if(a==='expense'){window.switchTab('finance');setTimeout(()=>{activateFinancePane('expenses');$('#oneTimeExpenseName')?.focus()},80)}});
  }
  function configureSummerBillingOnly(){const card=$('#camps .camp-registration-card');if(!card)return;const heading=$(':scope > h2',card);if(heading)heading.textContent='冬／夏令營學生收費';const note=$(':scope > .camp-step-note',card);if(note)note.textContent='先選擇夏令營或冬令營，再設定學生、月份、參加日期與計價方式；兩季資料分開保存。';$('#summerRegistrationCamp',card)?.closest('div')?.classList.add('v181-hidden-camp-field');$('[data-copy-camp-dates]',card)?.remove();const actions=$('.camp-actions',card);if(actions&&!$('#summerBillingLineCopy',card)){const button=document.createElement('button');button.id='summerBillingLineCopy';button.type='button';button.className='btn summer-line-copy';button.textContent='複製完整 LINE 收費';button.onclick=()=>{const studentId=$('#summerRegistrationStudent')?.value,month=$('#summerRegistrationMonth')?.value,season=$('#summerRegistrationSeason')?.value||'summer';if(!studentId)return alert('請先選擇學生');if(!month)return alert('請先選擇月份');window.copyStudentLineBilling?.(studentId,month,'all','',season)};actions.append(button)}}
  function init(){relabelNavigation();installLineBillingPreview();configureSummerBillingOnly();buildFinanceCenter();patchRenderers();buildQuickActions();patchSwitchTab();window.renderFinance?.();window.renderSettlement?.();window.renderTeacherKpi?.()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
  window.addEventListener('load',()=>setTimeout(()=>{patchRenderers();patchSwitchTab()},200));
})();
