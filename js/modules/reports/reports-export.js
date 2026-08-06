/* Danbridge Scheduler V15.11
 * Reports & Export Module
 * Pure extraction from application-and-business-features.js.
 * Function bodies intentionally unchanged.
 */

function settlementMonthList(){
  const months=[];
  for(let year=2026;year<=2028;year++){
    const startMonth=year===2026?7:1;
    for(let month=startMonth;month<=12;month++){
      months.push(`${year}-${String(month).padStart(2,'0')}`);
    }
  }
  return months;
}

function renderSettlementMonthOptions(){
  const e=$('settleMonth');if(!e)return;
  const old=e.value||monthNow();
  const months=settlementMonthList();
  e.innerHTML=months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  e.value=months.includes(old)?old:'2026-07';
}

function renderFinanceMonthOptions(){const months=settlementMonthList(),ids=['financeMonth','fixedExpenseStart','fixedExpenseEnd','oneTimeExpenseMonth'];for(const id of ids){const e=$(id);if(!e)continue;const old=e.value;if(id==='fixedExpenseEnd')e.innerHTML='<option value="">持續</option>'+months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');else e.innerHTML=months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');if(old&&(old===''||months.includes(old)))e.value=old;else if(id==='financeMonth'||id==='oneTimeExpenseMonth')e.value=$('settleMonth')?.value||'2026-07';else if(id==='fixedExpenseStart')e.value='2026-07'}}

function renderFinance(){renderFinanceMonthOptions();const m=$('financeMonth')?.value||'2026-07',d=financeData(m);$('financeRevenue').textContent=money(d.revenue);$('financeFixedTotal').textContent=money(d.fixedTotal);$('financeOneTimeTotal').textContent=money(d.oneTimeTotal);$('financePayrollTotal').textContent=money(d.payroll);$('financeProfit').textContent=money(d.profit);$('financeProfit').className=d.profit>=0?'finance-profit-positive':'finance-profit-negative';$('fixedExpenseRows').innerHTML=(db.fixedExpenses||[]).map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${money(x.amount)}</td><td>${monthLabel(x.startMonth||'2026-07')}</td><td>${x.endMonth?monthLabel(x.endMonth):'持續'}</td><td><button class="btn" onclick="editFixedExpense('${x.id}')">編輯</button> <button class="btn danger" onclick="deleteFixedExpense('${x.id}')">刪除</button></td></tr>`).join('')||'<tr><td colspan="5" class="small">尚未建立固定開銷。</td></tr>';$('oneTimeExpenseRows').innerHTML=(db.oneTimeExpenses||[]).slice().sort((a,b)=>b.month.localeCompare(a.month)).map(x=>`<tr><td>${monthLabel(x.month)}</td><td><b>${esc(x.name)}</b></td><td>${money(x.amount)}</td><td><button class="btn" onclick="editOneTimeExpense('${x.id}')">編輯</button> <button class="btn danger" onclick="deleteOneTimeExpense('${x.id}')">刪除</button></td></tr>`).join('')||'<tr><td colspan="4" class="small">尚未建立一次性支出。</td></tr>';$('financePayrollRows').innerHTML=d.payrollRows.map(x=>`<div class="finance-payroll-row"><span><b>${esc(x.teacher.name)}</b><br><span class="small">${esc(teacherPayrollFormulaText(x.payroll))}</span></span><b>${money(x.amount)}</b></div>`).join('')||'<span class="small">本月沒有可計薪的老師課程。</span>';$('financeExpenseBreakdown').innerHTML=`<div class="finance-payroll-row finance-revenue-row"><span>一般家教收入</span><b>${money(d.lessonRevenue||0)}</b></div><div class="finance-payroll-row finance-revenue-row"><span>冬／夏令營報名收入</span><b>${money(d.campRevenue||0)}</b></div><div class="finance-payroll-row"><span>固定開銷</span><b>${money(d.fixedTotal)}</b></div><div class="finance-payroll-row"><span>一次性支出</span><b>${money(d.oneTimeTotal)}</b></div><div class="finance-payroll-row"><span>老師薪資</span><b>${money(d.payroll)}</b></div><div class="finance-payroll-row"><span><b>總支出</b></span><b>${money(d.totalExpenses)}</b></div>`;let text=`【${monthLabel(m)} 公司財務】\n總收入：${money(d.revenue)}\n- 一般家教：${money(d.lessonRevenue||0)}\n- 冬／夏令營報名：${money(d.campRevenue||0)}\n\n固定開銷：${money(d.fixedTotal)}\n`;d.fixed.forEach(x=>text+=`- ${x.name}：${money(x.amount)}\n`);text+=`\n一次性支出：${money(d.oneTimeTotal)}\n`;d.one.forEach(x=>text+=`- ${x.name}：${money(x.amount)}\n`);text+=`\n老師薪資：${money(d.payroll)}\n`;d.payrollRows.forEach(x=>text+=`- ${x.teacher.name}：${fmtHours(x.h)} hr，${money(x.amount)}\n`);text+=`\n總支出：${money(d.totalExpenses)}\n淨利：${money(d.profit)}`;$('financeSummaryText').value=text}

function copyFinanceSummary(){const t=$('financeSummaryText')?.value||'';navigator.clipboard?.writeText(t).then(()=>toast('財務摘要已複製')).catch(()=>{const e=$('financeSummaryText');e.select();document.execCommand('copy');toast('財務摘要已複製')})}

function renderSettlement(){const{sr,tr}=settleData();const totalRevenue=sr.reduce((sum,x)=>sum+x.amount,0),totalPayroll=tr.reduce((sum,x)=>sum+x.amount,0),totalLessons=sr.reduce((sum,x)=>sum+x.charged,0),totalAbsences=sr.reduce((sum,x)=>sum+x.abs,0),totalHours=tr.reduce((sum,x)=>sum+x.h,0);const summary=$('settlementExecutiveSummary');if(summary)summary.innerHTML=`<div class="settlement-summary-card good"><span>本月應收</span><b>${money(totalRevenue)}</b></div><div class="settlement-summary-card"><span>老師薪資</span><b>${money(totalPayroll)}</b></div><div class="settlement-summary-card"><span>課表總堂數</span><b>${totalLessons} 堂</b></div><div class="settlement-summary-card"><span>老師總工時</span><b>${fmtHours(totalHours)} hr</b></div><div class="settlement-summary-card warn"><span>學生請假</span><b>${totalAbsences} 次</b></div>`;$('studentSettleRows').innerHTML=sr.map(x=>`<tr><td><b>${esc(x.s.name)}</b></td><td>${esc(x.s.parent)}</td><td>${x.total}</td><td>${x.charged} 堂／${fmtHours(x.h)} hr</td><td>${x.abs}</td><td>${x.rate.toFixed(1)}%</td><td>${money(x.amount)}</td></tr>`).join('');$('teacherSettleRows').innerHTML=tr.map(x=>`<tr><td><b>${esc(x.t.name)}</b></td><td>${esc(workDayNames(x.t.workDays))}</td><td>${fmtHours(x.t.minWeeklyHours)} hr</td><td>${fmtHours(x.expected)} hr</td><td>${fmtHours(x.h)} hr</td><td class="${diffClass(x.diff)}"><b>${diffText(x.diff)}</b></td><td>${money(x.t.rate)}</td><td>${money(x.revenue)}</td><td>${money(x.amount)}</td></tr>`).join('')||'<tr><td colspan="9" class="small">目前沒有老師工時資料。</td></tr>';$('teacherPayCards').innerHTML=tr.map(x=>`<div class="teacher-pay-card"><div class="teacher-pay-head"><div class="teacher-pay-avatar">${esc((x.t.name||'?').trim().charAt(0).toUpperCase())}</div><div class="teacher-pay-identity"><h4 title="${esc(x.t.name)}">${esc(x.t.name)}</h4><div class="teacher-pay-role">教師工時與薪資</div></div></div><div class="teacher-work-summary">固定工作日：${esc(workDayNames(x.t.workDays))}｜每週最低：${fmtHours(x.t.minWeeklyHours)} hr｜每日折算：${x.t.workDays?.length?fmtHours((x.t.minWeeklyHours||0)/x.t.workDays.length):0} hr</div><div class="teacher-pay-grid"><div class="teacher-pay-stat">本月最低<b>${fmtHours(x.expected)} hr</b></div><div class="teacher-pay-stat">實際上課<b>${fmtHours(x.h)} hr</b></div><div class="teacher-pay-stat">多／少<b class="${diffClass(x.diff)}">${diffText(x.diff)}</b></div><div class="teacher-pay-stat teacher-revenue-kpi">公司營收<b>${money(x.revenue)}</b><small>依此老師課表內所有正式課程自動加總</small></div><div class="teacher-pay-stat">應付薪資<b>${money(x.amount)}</b><small>${esc(teacherPayrollFormulaText(x.payroll))}</small></div></div><div class="weekly-detail"><div class="weekly-row head"><span>週別</span><span>最低</span><span>實際</span><span>差額</span></div>${x.weeks.map(w=>`<div class="weekly-row"><span>${w.from.slice(5)}～${w.to.slice(5)}</span><span>${fmtHours(w.expected)}</span><span>${fmtHours(w.actual)}</span><span class="${diffClass(w.diff)}">${diffText(w.diff)}</span></div>`).join('')}</div></div>`).join('')||'<span class="small">目前尚未建立老師。</span>';let text=`【${$('settleMonth').value} 月底結算】\n\n學生應收：\n`;sr.forEach(x=>text+=`${x.s.name}：${x.charged}堂／${fmtHours(x.h)}hr，請假率${x.rate.toFixed(1)}%，應收${money(x.amount)}\n`);text+='\n老師工時與薪資：\n';tr.forEach(x=>{text+=`\n${x.t.name}\n固定工作日：${workDayNames(x.t.workDays)}\n每週最低：${fmtHours(x.t.minWeeklyHours)}hr\n本月最低：${fmtHours(x.expected)}hr\n實際：${fmtHours(x.h)}hr\n差額：${diffText(x.diff)}\n公司營收：${money(x.revenue)}\n應付：${money(x.amount)}\n`;x.weeks.forEach(w=>text+=`  ${w.from}～${w.to}：最低${fmtHours(w.expected)}hr／實際${fmtHours(w.actual)}hr／${diffText(w.diff)}\n`)});$('settlementText').value=text;renderSettlementHistory()}

function saveMonthlySettlement(){
  const m=$('settleMonth').value||monthNow();
  db.settlementRecords||=[];
  const record=monthlySettlementSnapshot(m),i=db.settlementRecords.findIndex(x=>x.month===m);
  snapshot();
  if(i>=0)db.settlementRecords[i]=record;else db.settlementRecords.push(record);
  db.settlementRecords.sort((a,b)=>b.month.localeCompare(a.month));
  saveDB();
  renderSettlementMonthOptions();
  toast(i>=0?`${monthLabel(m)} 結算紀錄已更新`:`${monthLabel(m)} 結算紀錄已儲存`);
}

function loadSettlementRecord(month){renderSettlementMonthOptions();$('settleMonth').value=month;renderSettlement();$('settlement').scrollIntoView({behavior:'smooth',block:'start'})}

function deleteSettlementRecord(month){if(!confirm(`確定刪除 ${month} 的結算紀錄？課程資料不會刪除。`))return;snapshot();db.settlementRecords=(db.settlementRecords||[]).filter(x=>x.month!==month);saveDB();toast('結算紀錄已刪除')}

function renderSettlementHistory(){
  const box=$('settlementHistoryRows');if(!box)return;
  const rows=[...(db.settlementRecords||[])].sort((a,b)=>b.month.localeCompare(a.month));
  box.innerHTML=rows.map(r=>`<tr><td><b>${esc(monthLabel(r.month))}</b></td><td>${new Date(r.savedAt).toLocaleString('zh-TW')}</td><td>${r.totalLessons} 堂</td><td>${fmtHours(r.totalHours)} hr</td><td>${money(r.totalRevenue)}</td><td>${r.leaveCount} 堂</td><td>${(+r.leaveRate||0).toFixed(1)}%</td><td>${money(r.payroll)}</td><td class="row-actions"><button class="btn" onclick="loadSettlementRecord('${r.month}')">檢視</button><button class="btn danger" onclick="deleteSettlementRecord('${r.month}')">刪除</button></td></tr>`).join('')||'<tr><td colspan="9" class="small">尚未儲存任何月份的結算紀錄。</td></tr>';
}

function copySettlementText(){$('settlementText').select();navigator.clipboard?.writeText($('settlementText').value).then(()=>alert('已複製')).catch(()=>document.execCommand('copy'))}

function excelSafe(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

function downloadSettlementExcel(){const{sr,tr}=settleData(),month=$('settleMonth').value,totalRevenue=sr.reduce((s,x)=>s+x.amount,0),totalPayroll=tr.reduce((s,x)=>s+x.amount,0);const studentRows=sr.map(x=>`<tr><td>${excelSafe(x.s.name)}</td><td>${excelSafe(x.s.parent||'')}</td><td>${x.total}</td><td>${x.charged}</td><td>${x.h}</td><td>${x.abs}</td><td>${x.rate.toFixed(1)}%</td><td>${Math.round(x.amount)}</td></tr>`).join('');const teacherRows=tr.map(x=>`<tr><td>${excelSafe(x.t.name)}</td><td>${excelSafe(workDayNames(x.t.workDays))}</td><td>${x.t.minWeeklyHours||0}</td><td>${x.expected}</td><td>${x.h}</td><td>${x.diff}</td><td>${excelSafe(x.payroll.mode==='fixed'?'固定底薪制':'純時薪制')}</td><td>${x.payroll.mode==='fixed'?(x.payroll.overtimeRate??''):(x.payroll.hourlyRate??'')}</td><td>${x.payroll.mode==='fixed'?(x.payroll.deductionRate??''):''}</td><td>${Math.round(x.revenue)}</td><td>${Math.round(x.amount)}</td></tr>`).join('');const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,"Noto Sans TC",sans-serif;color:#172033}table{border-collapse:collapse;width:100%;margin:12px 0 24px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9;font-weight:700}.money{font-weight:700;color:#8a641d}h1,h2{color:#172033}</style></head><body><h1>Danbridge ${month} 月底結算</h1><table><tr><th>本月應收</th><th>老師薪資</th><th>預估差額</th></tr><tr><td class="money">${Math.round(totalRevenue)}</td><td class="money">${Math.round(totalPayroll)}</td><td class="money">${Math.round(totalRevenue-totalPayroll)}</td></tr></table><h2>學生應收</h2><table><tr><th>學生</th><th>家長</th><th>原定堂數</th><th>收費堂數</th><th>收費時數</th><th>請假</th><th>請假率</th><th>應收</th></tr>${studentRows}</table><h2>老師工時與薪資</h2><table><tr><th>老師</th><th>固定工作日</th><th>每週最低</th><th>本月最低</th><th>實際時數</th><th>差額</th><th>薪資制度</th><th>超時／一般時薪</th><th>不足扣款時薪</th><th>公司營收 KPI</th><th>應付</th></tr>${teacherRows}</table>






</body></html>`;const blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Danbridge-${month}-月底結算.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Excel 結算報表已匯出')}

function printSettlementReport(){renderSettlement();const old=document.title;document.title=`Danbridge-${$('settleMonth').value}-月底結算`;window.print();document.title=old}

function downloadCSV(){const{sr,tr}=settleData();let csv='類型,姓名,工作日,每週最低,本月最低,實際時數,差額,堂數,公司營收KPI,金額\n';sr.forEach(x=>csv+=`學生,${x.s.name},,,,${x.h},,${x.charged},,${Math.round(x.amount)}\n`);tr.forEach(x=>csv+=`老師,${x.t.name},"${workDayNames(x.t.workDays)}",${x.t.minWeeklyHours||0},${x.expected},${x.h},${x.diff},${x.count},${Math.round(x.revenue)},${Math.round(x.amount)}\n`);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download=`settlement-${$('settleMonth').value}.csv`;a.click()}

function icsText(value){return String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function appleCalendarContent(lessons,{showDate=false}={}){let out='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Danbridge//Scheduler//ZH-TW\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Danbridge 課表\r\nX-WR-TIMEZONE:Asia/Taipei\r\n';for(const l of lessons){const d=l.date.replaceAll('-',''),s=l.start.replace(':','')+'00',e=l.end.replace(':','')+'00',[,month,day]=l.date.split('-'),name=student(l.studentId).name||'課程',title=showDate?`${Number(month)}/${Number(day)} ${name}`:name,location=l.location==='到府'?(l.address||'到府'):l.location==='線上課'?'線上課':locationLabel(l)+(l.room?' '+l.room:'');out+=`BEGIN:VEVENT\r\nUID:${icsText(l.id)}@danbridge\r\nDTSTART;TZID=Asia/Taipei:${d}T${s}\r\nDTEND;TZID=Asia/Taipei:${d}T${e}\r\nSUMMARY:${icsText(title)}\r\nLOCATION:${icsText(location)}\r\nDESCRIPTION:${icsText(`學生／班級：${name}｜老師：${lessonTeacherNames(l)}｜課程：${l.title||'—'}｜狀態：${l.status||'—'}`)}\r\nEND:VEVENT\r\n`}return out+'END:VCALENDAR\r\n'}
function downloadAppleCalendar(content,fileName){const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=fileName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
function exportICS(){const lessons=db.lessons.filter(x=>!x.isDraft);downloadAppleCalendar(appleCalendarContent(lessons),'danbridge-calendar.ics')}
function appleCalendarWeekRange(){const base=new Date(($('calendarDate')?.value||todayStr())+'T00:00:00'),monday=new Date(base),day=base.getDay();monday.setDate(base.getDate()+(day===0?1:-((day+6)%7)));const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);return{start:localDate(monday),end:localDate(sunday)}}
function exportVisibleAppleCalendar(){const range=appleCalendarWeekRange(),filters=calendarFilterState(),lessons=db.lessons.filter(l=>!l.isDraft&&l.date>=range.start&&l.date<=range.end&&lessonMatchesCalendar(l,filters)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));if(!lessons.length)return alert(`目前設定的這一週（${range.start}～${range.end}）沒有可匯入的正式課程。`);const fileName=`Danbridge-week-${range.start}-${range.end}.ics`;downloadAppleCalendar(appleCalendarContent(lessons,{showDate:true}),fileName);toast(`已準備 ${range.start}～${range.end} 共 ${lessons.length} 堂課，請在 Apple 行事曆確認加入`)}
