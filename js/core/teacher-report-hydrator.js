// A bounded, identity-safe read-through cache; never writes cloud data.
export function createTeacherReportHydrator({call,getIdentity,apply,onError,onSuccess}){
 let generation=0,inflight=false,queued=null,actor='',known=new Set();
 async function pump(){
  if(inflight||!queued)return;
  const job=queued;queued=null;inflight=true;
  const id=JSON.stringify(getIdentity());
  if(actor!==id){actor=id;known=new Set()}
  const sequence=generation,ids=job.ids.filter(value=>job.force||!known.has(value));
  try{
   for(let i=0;i<ids.length;i+=40){
    const batch=ids.slice(i,i+40),result=(await call({lessonIds:batch,readOnly:true}))?.data;
    if(sequence!==generation||JSON.stringify(getIdentity())!==id)return;
    if(result?.ok!==true||result.readOnly!==true||!Array.isArray(result.reports)||result.reports.length!==batch.length||result.reports.some((row,index)=>row?.ok!==true||row.readOnly!==true||row.lessonId!==batch[index]||(row.report&&row.report.lessonId!==row.lessonId)))throw Error('課程回報批次讀取核對失敗');
    apply(result.reports);batch.forEach(value=>known.add(value));
   }
   if(ids.length&&sequence===generation&&JSON.stringify(getIdentity())===id)onSuccess?.();
  }catch(error){if(sequence===generation&&JSON.stringify(getIdentity())===id)onError?.(error)}
  finally{inflight=false;if(queued)void pump()}
 }
 return{
  refresh(ids,{force=false}={}){queued={ids:[...new Set(ids)],force:force||queued?.force===true};void pump()},
  reset(){generation++;queued=null;known=new Set();actor=''}
 };
}
