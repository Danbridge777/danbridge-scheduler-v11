(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DanbridgeLessonIndex=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  let source=null,sourceLength=-1,dirty=true,byDate=new Map(),byMonth=new Map(),byStudent=new Map(),byTeacher=new Map(),byId=new Map(),sortedDates=[];

  const lessonDate=row=>String(row?.date||'');
  const lessonMonth=row=>lessonDate(row).slice(0,7);
  const studentIds=row=>[row?.studentId,...(Array.isArray(row?.groupStudentIds)?row.groupStudentIds:[])].filter(Boolean).map(String);
  const teacherIds=row=>[row?.teacherId,...(Array.isArray(row?.teacherIds)?row.teacherIds:[])].filter(Boolean).map(String);
  const remove=(map,key,row)=>{
    const rows=map.get(key);if(!rows)return;
    const id=String(row?.id||'');
    const index=rows.findIndex(item=>item===row||(id&&String(item?.id||'')===id));
    if(index>=0)rows.splice(index,1);
    if(!rows.length)map.delete(key);
  };
  const add=(map,key,row)=>{if(!key)return;const rows=map.get(key);if(rows)rows.push(row);else map.set(key,[row])};
  const rebuild=rows=>{
    source=rows;sourceLength=rows.length;byDate=new Map();byMonth=new Map();byStudent=new Map();byTeacher=new Map();byId=new Map();
    for(const row of rows){
      const date=lessonDate(row),month=lessonMonth(row),id=String(row?.id||'');
      const students=studentIds(row),teachers=teacherIds(row);
      if(date)add(byDate,date,row);if(month)add(byMonth,month,row);
      for(const studentId of new Set(students))add(byStudent,studentId,row);
      for(const teacherId of new Set(teachers))add(byTeacher,teacherId,row);
      if(id)byId.set(id,{row,date,month,studentIds:students,teacherIds:teachers});
    }
    sortedDates=[...byDate.keys()].sort();dirty=false;
  };
  const ensure=rows=>{
    const safe=Array.isArray(rows)?rows:[];
    if(dirty||safe!==source||safe.length!==sourceLength)rebuild(safe);
    return safe;
  };
  const lowerBound=(rows,value)=>{let low=0,high=rows.length;while(low<high){const mid=(low+high)>>1;if(rows[mid]<value)low=mid+1;else high=mid}return low};

  function applyPatches(patches,rows){
    ensure(rows);
    if(!Array.isArray(patches)||!patches.length)return;
    let datesChanged=false;
    for(const patch of patches){
      const id=String(patch?.id||patch?.after?.id||patch?.before?.id||'');
      const previous=id?byId.get(id):null;
      if(previous){remove(byDate,previous.date,previous.row);remove(byMonth,previous.month,previous.row);for(const studentId of new Set(previous.studentIds||[]))remove(byStudent,studentId,previous.row);for(const teacherId of new Set(previous.teacherIds||[]))remove(byTeacher,teacherId,previous.row);byId.delete(id);datesChanged=true}
      const next=patch?.after||null;
      if(next){const date=lessonDate(next),month=lessonMonth(next),students=studentIds(next),teachers=teacherIds(next);add(byDate,date,next);add(byMonth,month,next);for(const studentId of new Set(students))add(byStudent,studentId,next);for(const teacherId of new Set(teachers))add(byTeacher,teacherId,next);if(id)byId.set(id,{row:next,date,month,studentIds:students,teacherIds:teachers});datesChanged=true}
    }
    source=rows;sourceLength=Array.isArray(rows)?rows.length:0;
    if(datesChanged)sortedDates=[...byDate.keys()].sort();
  }

  return Object.freeze({
    invalidate(){dirty=true},
    rebuild(rows){rebuild(Array.isArray(rows)?rows:[]);return this.stats(rows)},
    applyPatches,
    byDate(rows,date){ensure(rows);return (byDate.get(String(date||''))||[]).slice()},
    byMonth(rows,month){ensure(rows);return (byMonth.get(String(month||''))||[]).slice()},
    byStudent(rows,studentId){ensure(rows);return (byStudent.get(String(studentId||''))||[]).slice()},
    byTeacher(rows,teacherId){ensure(rows);return (byTeacher.get(String(teacherId||''))||[]).slice()},
    between(rows,from,to){ensure(rows);const start=String(from||''),end=String(to||''),result=[];for(let i=lowerBound(sortedDates,start);i<sortedDates.length&&sortedDates[i]<=end;i++)result.push(...(byDate.get(sortedDates[i])||[]));return result},
    stats(rows){ensure(rows);return{lessonCount:sourceLength,dateCount:byDate.size,monthCount:byMonth.size,studentCount:byStudent.size,teacherCount:byTeacher.size}}
  });
});
