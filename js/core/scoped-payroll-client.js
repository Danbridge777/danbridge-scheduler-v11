/* Read-only financial results. Never recompute a full salary from a restricted
 * role projection, persist private results in localStorage, or reuse an old
 * account's request after an identity/permission change. */
(function(){
 let identity='',generation=0,source=null;const entries=new Map();
 const context=()=>window.DanbridgeAccess?.getContext?.()||{};
 const required=()=>context().role==='branch_manager'&&context().canViewBranchFinance===true;
 function sync(){
  const c=context(),key=JSON.stringify([c.email,c.role,c.canViewBranchFinance,c.branchIds]);
  if(identity!==key||source!==db){identity=key;source=db;generation++;entries.clear()}
 }
 function repaint(){for(const name of ['renderDashboard','renderFinance','renderSettlement'])try{window[name]?.()}catch(error){console.error('Scoped payroll render blocked',error)}}
 function ensure(month,scope){
  if(!required())return true;sync();const key=month+':'+scope,existing=entries.get(key);
  if(existing)return existing.state==='ready';
  const entry={state:'loading'},epoch=generation;entries.set(key,entry);
  Promise.resolve().then(()=>{
   if(typeof window.__danbridgeReadScopedPayroll!=='function')throw Error('受保護薪資核對尚未就緒');
   return window.__danbridgeReadScopedPayroll({month,scope});
  }).then(value=>{
   sync();if(generation!==epoch)return;
   if(value?.schema!=='danbridge-scoped-payroll-v1'||value.month!==month||value.scope!==scope||!Array.isArray(value.rows))throw Error('薪資回覆範圍不符');
   const seen=new Set();
   for(const row of value.rows){if(!row.teacherId||seen.has(row.teacherId)||row.payroll?.authoritativeScope!==scope||!Number.isFinite(row.payroll.amount)||!Array.isArray(row.lessonIds))throw Error('薪資回覆格式不符');seen.add(row.teacherId)}
   entry.state='ready';entry.value=value;repaint();
  }).catch(error=>{sync();if(generation!==epoch)return;entry.state='error';entry.error=String(error?.message||error);repaint()});
  return false;
 }
 function get(t,month,scope){
  if(!ensure(month,scope))throw Error('校區薪資尚未經完整來源核對');
  const entry=entries.get(month+':'+scope),row=entry.value.rows.find(r=>r.teacherId===t.id);
  const payroll=row?{...row.payroll,teacher:t}:{authoritativeScope:scope,teacher:t,month,mode:'hourly',configured:true,amount:0,actualHours:0,paidHours:0,expectedHours:0,diff:0,leaveReviewReasons:[]};
  const ids=new Set(row?.lessonIds||[]),rows=db.lessons.filter(l=>ids.has(l.id));payroll.rows=rows;
  return {payroll,rows,count:row?.count||0,weeks:row?.weeks||[],branches:row?[{branchId:scope,count:row.count,h:payroll.actualHours,amount:payroll.amount}]:[]};
 }
 function invalidate(){generation++;entries.clear();if(required())repaint()}
 function message(month,scope){sync();const entry=entries.get(month+':'+scope);return entry?.state==='error'?'薪資尚未核對成功，請重新核對；未顯示不完整金額。':'正在核對本校區薪資…'}
 function renderPending(target,month,scope){
  if(!target)return;target.replaceChildren();const label=document.createElement('span');label.textContent=message(month,scope);target.append(label);
  if(entries.get(month+':'+scope)?.state==='error'){const button=document.createElement('button');button.type='button';button.className='btn scoped-payroll-retry';button.textContent='重新核對';button.addEventListener('click',invalidate);target.append(button)}
 }
 window.DanbridgeScopedPayroll=Object.freeze({required,ensure,get,invalidate,message,renderPending});
 window.addEventListener('danbridge:finance-source-changed',invalidate);
 window.addEventListener('focus',invalidate);
})();
