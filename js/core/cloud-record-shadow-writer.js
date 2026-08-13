const CORE_COLLECTIONS=['lessons','students','teachers'];

function stableValue(value){
 if(Array.isArray(value))return value.map(stableValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
 return value;
}
function fingerprint(value){return JSON.stringify(stableValue(value))}
function normalizedCoreDb(db){
 return Object.fromEntries(CORE_COLLECTIONS.map(collection=>{
  const rows=db?.[collection];
  if(!Array.isArray(rows))throw new Error(`${collection} 驗證資料必須是陣列`);
  return[collection,[...rows].sort((a,b)=>String(a?.id??'').localeCompare(String(b?.id??''))).map(stableValue)];
 }));
}

export function verifyRecordShadowTarget(state,targetDb){
 const actual=normalizedCoreDb(state?.db),expected=normalizedCoreDb(targetDb);
 if(fingerprint(actual)!==fingerprint(expected))throw new Error('影子逐筆資料讀回與目標不一致');
 for(const collection of CORE_COLLECTIONS){
  const revisions=state?.revisions?.[collection];
  if(!revisions||typeof revisions!=='object'||Array.isArray(revisions))throw new Error(`${collection} 影子 revision 狀態不完整`);
  for(const [id,revision] of Object.entries(revisions))if(!Number.isSafeInteger(revision)||revision<1)throw new Error(`${collection}/${id} 影子 revision 無效`);
  for(const record of actual[collection])if(!Number.isSafeInteger(revisions[String(record.id)])||revisions[String(record.id)]<1)throw new Error(`${collection}/${record.id} 缺少影子 revision`);
 }
 const activeCount=CORE_COLLECTIONS.reduce((sum,collection)=>sum+actual[collection].length,0);
 if(state?.activeCount!==undefined&&state.activeCount!==activeCount)throw new Error('影子逐筆資料有效筆數不一致');
 return{verified:true,activeCount,tombstoneCount:Number(state?.tombstoneCount)||0};
}

export async function executeRecordShadowBatches(plan,{writeBatch,readState,targetDb}={}){
 if(!plan||!Array.isArray(plan.batches)||!Number.isSafeInteger(plan.writes)||plan.writes<0)throw new Error('影子逐筆寫入計畫無效');
 if(typeof writeBatch!=='function'||typeof readState!=='function')throw new Error('影子逐筆寫入介面不完整');
 let completedBatches=0,completedWrites=0;
 for(const batch of plan.batches){
  try{await writeBatch(batch.operations,batch)}
  catch(cause){
   const error=new Error(`影子逐筆寫入第 ${completedBatches+1} 批失敗：${cause?.message||cause}`,{cause});
   error.completedBatches=completedBatches;error.completedWrites=completedWrites;error.totalBatches=plan.batches.length;throw error;
  }
  completedBatches++;completedWrites+=batch.writes;
 }
 const verification=verifyRecordShadowTarget(await readState(),targetDb);
 return{writes:completedWrites,batches:completedBatches,...verification};
}
