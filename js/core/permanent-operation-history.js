(function(global){
  function copy(value){
    return value==null?value:JSON.parse(JSON.stringify(value));
  }

  function lessonTransitions(beforeLessons=[],afterLessons=[]){
    const before=new Map((beforeLessons||[]).filter(row=>row?.id).map(row=>[String(row.id),row]));
    const after=new Map((afterLessons||[]).filter(row=>row?.id).map(row=>[String(row.id),row]));
    const ids=[...new Set([...before.keys(),...after.keys()])].sort();
    return ids.flatMap(id=>{
      const previous=before.get(id),next=after.get(id);
      if(!previous&&next)return[{kind:'create',lessonId:id,before:null,after:copy(next)}];
      if(previous&&!next)return[{kind:'delete',lessonId:id,before:copy(previous),after:null}];
      if(JSON.stringify(previous)!==JSON.stringify(next))return[{kind:'update',lessonId:id,before:copy(previous),after:copy(next)}];
      return[];
    });
  }

  function reversedChangeIds(changes=[]){
    const rows=(changes||[]).filter(row=>row&&row.id),children=new Map(),byId=new Map(rows.map(row=>[String(row.id),row]));
    for(const row of rows){
      const parent=String(row.undoOfChangeId||'');
      if(!parent||!byId.has(parent))continue;
      if(!children.has(parent))children.set(parent,[]);
      children.get(parent).push(String(row.id));
    }
    const memo=new Map();
    function reversed(id,trail=new Set()){
      if(memo.has(id))return memo.get(id);
      const row=byId.get(id);
      if(row?.undone===true){memo.set(id,true);return true}
      if(trail.has(id)){memo.set(id,true);return true}
      const nextTrail=new Set(trail);nextTrail.add(id);
      const value=(children.get(id)||[]).some(childId=>!reversed(childId,nextTrail));
      memo.set(id,value);return value;
    }
    const result=new Set();
    for(const id of byId.keys())if(reversed(id))result.add(id);
    return result;
  }

  global.DanbridgePermanentOperationHistory=Object.freeze({copy,lessonTransitions,reversedChangeIds});
})(typeof globalThis!=='undefined'?globalThis:this);
