function batchBranches(){
  return (db.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[])
    .filter(b=>b&&b.id&&!['home_service','online','unassigned'].includes(b.id));
}
function renderBatchBranchRoomOptions(){
  const branchEl=$('batchBranch'),roomEl=$('batchRoom');
  if(!branchEl||!roomEl)return;
  const branchValue=branchEl.value||'';
  const roomValue=roomEl.value||'';
  const branches=batchBranches();
  branchEl.innerHTML='<option value="">不變</option>'+branches.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
  branchEl.value=branches.some(b=>b.id===branchValue)?branchValue:'';
  const selectedBranch=branches.find(b=>b.id===branchEl.value);
  const rooms=selectedBranch?.rooms||[...new Set(branches.flatMap(b=>b.rooms||[]))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
  roomEl.innerHTML='<option value="">不變</option><option value="__CLEAR__">清除教室</option>'+rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');
  roomEl.value=rooms.includes(roomValue)||roomValue==='__CLEAR__'?roomValue:'';
}
function handleBatchBranchChange(){
  const room=$('batchRoom');
  if(room)room.value='';
  renderBatchBranchRoomOptions();
}
function openBatchModal(){
  if(!selectedLessonIds.size)return alert('請先選取課程。');
  renderSelects();
  if($('batchBranch'))$('batchBranch').value='';
  if($('batchRoom'))$('batchRoom').value='';
  renderBatchBranchRoomOptions();
  batchPreviewCache=null;
  $('batchPreview').textContent='尚未預覽。';
  $('batchModal').classList.add('show');
}
function closeBatchModal(){$('batchModal').classList.remove('show')}
function buildBatchCandidates(){
  const dd=+$('batchDateShift').value,
    tm=+$('batchTimeShift').value,
    tid=$('batchTeacher').value,
    branchId=$('batchBranch')?.value||'',
    roomChoice=$('batchRoom')?.value||'',
    status=$('batchStatus').value,
    pay=$('batchPayment').value,
    branch=branchId?batchBranches().find(b=>b.id===branchId):null;
  return db.lessons.filter(l=>selectedLessonIds.has(l.id)).map(l=>{
    const start=shiftTime(l.start,tm),end=shiftTime(l.end,tm);
    const currentTeacherIds=lessonTeacherIds(l),nextTeacherIds=tid?[tid,...currentTeacherIds.filter(id=>id!==l.teacherId&&id!==tid)]:currentTeacherIds;
    const n={...l,date:shiftDate(l.date,dd),start,end,teacherId:tid||l.teacherId,teacherIds:nextTeacherIds,status:status||l.status,paymentStatus:pay||l.paymentStatus};
    if(branch){
      n.branchId=branch.id;
      n.location=branch.name;
      n.deliveryMode='onsite';
      n.address='';
      n.meetingUrl='';
      if(roomChoice==='')n.room='';
    }
    if(roomChoice==='__CLEAR__')n.room='';
    else if(roomChoice)n.room=roomChoice;
    let error='',warning='';
    if(!start||!end)error='時間超出當日範圍';
    else{
      const c=hasConflict(n,l.id);
      if(c)error=`${c}撞課`;
      const tw=teacherConflictDetail(n,l.id);
      if(tw)warning=`老師時間重複：${tw.name}`;
    }
    return{old:l,next:n,error,warning};
  });
}
function previewBatch(){
  const rows=buildBatchCandidates();batchPreviewCache=rows;
  const ok=rows.filter(x=>!x.error).length,bad=rows.length-ok;
  $('batchPreview').innerHTML=`<p><span class="ok-text">可套用 ${ok} 堂</span>｜<span class="danger-text">衝突／無效 ${bad} 堂</span></p>`+rows.map(x=>`<div>${esc(student(x.old.studentId).name)}：${x.old.date} ${x.old.start} → ${x.next.date} ${x.next.start}｜${esc(locationLabel(x.next))}｜${esc(x.next.room||'未指定教室')} ${x.error?`<span class="danger-text">（${x.error}）</span>`:x.warning?`<span class="danger-text">（${x.warning}，允許套用）</span>`:''}</div>`).join('');
}
function applyBatch(){
  const rows=batchPreviewCache||buildBatchCandidates();
  if(rows.some(x=>x.error)&&!confirm('部分課程有衝突，系統將略過衝突課程，只套用其餘課程。繼續？'))return;
  snapshot();let done=0;
  for(const x of rows){
    if(x.error)continue;
    const before={...x.old};
    Object.assign(x.old,x.next);
    logChange('批次調整',x.old,before);
    window.syncMakeupForLessonStatus?.(x.old,before.status);
    done++;
  }
  clearCalendarSelectionState();cancelPasteClickMode(false);closeBatchModal();saveDB();toast(`已批次更新 ${done} 堂課`);
}
