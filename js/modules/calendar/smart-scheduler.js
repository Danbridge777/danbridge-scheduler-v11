/**
 * Smart Scheduler
 *
 * Canonical implementation for availability parsing, conflict-safe slot search,
 * room selection, and applying a suggested slot to the lesson form.
 */

function parseStudentAvailability(text){
  const dayMap={'日':0,'天':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6},out=[];
  String(text||'').split(/\n|；|;/).forEach(line=>{
    const m=line.trim().match(/(?:週|星期)?([日天一二三四五六]).*?(\d{1,2}:\d{2})\s*[-～~至]\s*(\d{1,2}:\d{2})/);
    if(!m||dayMap[m[1]]===undefined)return;
    const start=m[2].padStart(5,'0'),end=m[3].padStart(5,'0');
    if(end>start)out.push({day:dayMap[m[1]],start,end});
  });
  return out;
}

function minutesToTime(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
function dateRange(a,b){const out=[],d=new Date(a+'T00:00:00'),e=new Date(b+'T00:00:00');while(d<=e&&out.length<62){out.push(localDate(d));d.setDate(d.getDate()+1)}return out}
function availableRooms(branchId){return branchRecord(branchId)?.rooms||[]}

function slotFree(candidate){
  return !db.lessons.some(l=>
    l.date===candidate.date&&
    l.id!==candidate.id&&
    !['取消','停課'].includes(l.status)&&
    candidate.start<l.end&&candidate.end>l.start&&(
      l.studentId===candidate.studentId||
      lessonTeacherIds(l).includes(candidate.teacherId)||
      (candidate.deliveryMode==='onsite'&&l.deliveryMode!=='home'&&l.deliveryMode!=='online'&&candidate.branchId===l.branchId&&candidate.room&&l.room===candidate.room)
    )
  );
}

function openSmartScheduler(studentId=''){
  renderSelects();
  $('smartStudent').value=studentId||$('studentId')?.value||'';
  $('smartDateFrom').value=todayStr();
  $('smartDateTo').value=shiftDate(todayStr(),14);
  $('smartDuration').value='60';
  $('smartStep').value='30';
  const branch=$('smartBranch');
  if(branch){
    branch.innerHTML=(db.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).filter(b=>!['home_service','online','unassigned'].includes(b.id)).map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    branch.value='art_museum';
  }
  $('smartDeliveryMode').value='onsite';
  $('smartRoom').value='';
  $('smartTitle').value='補課';
  syncSmartStudent();
  $('smartResults').innerHTML='<span class="small">請設定條件後按「尋找可排時段」。</span>';
  $('smartSchedulerModal').classList.add('show');
}

function closeSmartScheduler(){$('smartSchedulerModal').classList.remove('show')}
function syncSmartStudent(){const s=studentDefaults(db.students.find(x=>x.id===$('smartStudent').value)||{});$('smartTeacher').value=s.preferredTeacherId||'';$('smartAvailabilityHint').textContent=s.availability?'學生可上課時段：'+s.availability.replace(/\n/g,'；'):'未設定可上課時段，將以每日 09:00–21:00 搜尋。'}

function findSmartSlots(){
  const sid=$('smartStudent').value,from=$('smartDateFrom').value,to=$('smartDateTo').value,duration=+$('smartDuration').value,step=+$('smartStep').value,branchId=$('smartBranch').value,mode=$('smartDeliveryMode').value,requested=$('smartRoom').value.trim();
  if(!sid||!from||!to||!branchId)return alert('請選擇學生、日期與校區');
  if(to<from)return alert('截止日期不能早於起始日期');
  const s=studentDefaults(db.students.find(x=>x.id===sid)||{}),availability=parseStudentAvailability(s.availability),preferred=$('smartTeacher').value,teacherIds=preferred?[preferred]:db.teachers.map(t=>t.id),slots=[];
  for(const date of dateRange(from,to)){
    const day=new Date(date+'T00:00:00').getDay(),windows=availability.length?availability.filter(a=>a.day===day):[{start:'09:00',end:'21:00'}];
    for(const window of windows){
      for(let minute=+window.start.slice(0,2)*60+ +window.start.slice(3);minute+duration<=+window.end.slice(0,2)*60+ +window.end.slice(3);minute+=step){
        let best=null;
        for(const teacherId of teacherIds){
          const record=teacher(teacherId);
          if(Array.isArray(record.workDays)&&record.workDays.length&&!record.workDays.map(Number).includes(day))continue;
          const rooms=mode==='onsite'?(requested?[requested]:(availableRooms(branchId).length?availableRooms(branchId):[''])):[''];
          for(const room of rooms){
            const candidate={date,start:minutesToTime(minute),end:minutesToTime(minute+duration),studentId:sid,teacherId,teacherIds:[teacherId],room,branchId,deliveryMode:mode,location:mode==='home'?'到府':mode==='online'?'線上課':branchRecord(branchId)?.name||''};
            if(!slotFree(candidate))continue;
            const adjacent=db.lessons.some(l=>l.date===date&&lessonTeacherIds(l).includes(teacherId)&&(l.end===candidate.start||l.start===candidate.end));
            const score=(adjacent?20:0)+db.lessons.filter(l=>l.date===date&&lessonTeacherIds(l).includes(teacherId)).length*2;
            if(!best||score>best.score)best={...candidate,adjacent,score};
            break;
          }
        }
        if(best)slots.push(best);
      }
    }
  }
  slots.sort((a,b)=>b.score-a.score||(a.date+a.start).localeCompare(b.date+b.start));
  $('smartResults').innerHTML=slots.slice(0,40).map((slot,index)=>`<div class="smart-slot ${index<3?'best':''}"><div><b>${slot.date} ${slot.start}–${slot.end}</b><span class="small">${esc(teacher(slot.teacherId).name||'未指定老師')}｜${esc(slot.location)}${slot.room?'｜'+esc(slot.room):''}</span></div><button class="btn primary" data-slot="${index}">選擇</button></div>`).join('')||'<div class="hint">找不到完全無衝堂的時段。</div>';
  $('smartResults').querySelectorAll('[data-slot]').forEach(button=>button.addEventListener('click',()=>{const slot=slots[+button.dataset.slot];useSmartSlot(slot.date,slot.start,slot.end,slot.teacherId,slot.room)}));
}

function useSmartSlot(date,start,end,teacherId,room=''){
  const studentId=$('smartStudent').value,title=$('smartTitle').value.trim(),branchId=$('smartBranch').value,mode=$('smartDeliveryMode').value;
  closeSmartScheduler();
  openLessonModal(date,start);
  $('endTime').value=end;
  $('lessonStudent').value=studentId;
  $('lessonTeacher').value=teacherId;
  $('lessonTitle').value=title;
  $('lessonBranch').value=branchId;
  $('lessonDeliveryMode').value=mode;
  handleBranchChange();
  $('lessonRoom').value=room;
  handleLessonStudentChange();
  handleLocationChange();
  syncCoTeacherOptions();
  window.realtimeConflicts?.();
}

$('smartSchedulerModal')?.addEventListener('click',event=>{if(event.target===$('smartSchedulerModal'))closeSmartScheduler()});
