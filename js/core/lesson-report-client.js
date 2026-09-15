export function createLessonReportClient({call,getIdentity,createId=()=>crypto.randomUUID()}={}){
 let pending=null;
 return async input=>{
  const identity=JSON.stringify(getIdentity());
  const key=JSON.stringify({identity,...input});
  if(!pending||pending.key!==key)pending={key,request:{...input,operationId:createId()}};
  const request=pending.request,result=(await call(request))?.data;
  if(JSON.stringify(getIdentity())!==identity)throw Error('登入身分已變更，原回報結果未套用到新帳號');
  if(result?.ok!==true||result.lessonId!==input.lessonId||result.operationId!==request.operationId||result.report?.lessonId!==input.lessonId||!result.report.updatedAtClient||Object.entries(input.report).some(([k,v])=>result.report[k]!==v))throw Error('回報結果核對失敗，內容仍保留');
  if(pending?.key===key)pending=null;
  return result.report;
 };
}
