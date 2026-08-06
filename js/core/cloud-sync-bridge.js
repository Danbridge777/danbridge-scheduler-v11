window.__danbridgeGetDB=()=>db;
window.__danbridgeDataScore=(value)=>{
  const x=value&&typeof value==='object'?value:{};
  return (Array.isArray(x.lessons)?x.lessons.length*1000:0)+(Array.isArray(x.students)?x.students.length*100:0)+(Array.isArray(x.teachers)?x.teachers.length*100:0)+(Array.isArray(x.makeups)?x.makeups.length:0);
};
window.__danbridgeRecoverBestLocalDB=()=>{
  const valid=x=>x&&typeof x==='object'&&Array.isArray(x.students)&&Array.isArray(x.teachers)&&Array.isArray(x.lessons)&&window.__danbridgeDataScore(x)>0;
  const parse=raw=>{try{const x=typeof raw==='string'?JSON.parse(raw):raw;return valid(x)?x:null}catch{return null}};
  // 正式本機資料永遠優先；不可用資料筆數與任意 localStorage JSON 猜測最新版。
  const current=parse(localStorage.getItem('danbridge_scheduler_v1'));
  if(current)return{db:current,label:'目前本機資料'};
  try{
    const versions=JSON.parse(localStorage.getItem('danbridge_scheduler_versions_v4')||'[]');
    if(Array.isArray(versions)){
      const ordered=[...versions].sort((a,b)=>String(b?.createdAt||'').localeCompare(String(a?.createdAt||'')));
      for(const v of ordered){const data=parse(v?.data);if(data)return{db:data,label:'版本紀錄 '+(v?.reason||'安全版本')}}
    }
  }catch{}
  const draft=parse(localStorage.getItem('danbridge_scheduler_draft_v8'));
  return draft?{db:draft,label:'草稿資料'}:null;
};
window.__danbridgeSetDB=(value)=>{db=typeof normalizeBranchData==='function'?normalizeBranchData(value):value};
window.__danbridgeIsDraft=()=>false;
window.teacherReportLabel=v=>({completed:'已完成',student_leave:'學生請假',teacher_leave:'老師請假',no_show:'缺席',makeup_completed:'補課完成'}[v]||'尚未回報');
