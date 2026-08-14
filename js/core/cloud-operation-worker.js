const retryableCodes=new Set(['aborted','cancelled','deadline-exceeded','internal','network-request-failed','resource-exhausted','unavailable','unknown']);
const quotaPattern=/quota|resource.?exhausted|maximum.*writes|too many requests/i;

export function classifyOperationError(error){
 const code=String(error?.code||'').replace(/^firestore\//,'').toLowerCase(),message=String(error?.message||error||'');
 if(code==='permission-denied'||code==='unauthenticated'||code==='invalid-argument'||code==='failed-precondition'||/revision|hash|identity|格式|權限|未啟用/.test(message))return{retryable:false,retryAfterMs:null};
 if(code==='resource-exhausted'||quotaPattern.test(message))return{retryable:true,retryAfterMs:900000};
 return{retryable:retryableCodes.has(code)||/offline|network|timeout|temporar/i.test(message),retryAfterMs:undefined};
}

function validateReceipt(operation,receipt){
 if(!receipt||!['create','update','tombstone','revive','duplicate'].includes(receipt.kind)||typeof receipt.write!=='boolean'||receipt.revision!==operation.nextRevision)throw new Error('逐筆操作雲端回應格式無效');
 if(receipt.kind==='duplicate'&&receipt.write!==false)throw new Error('逐筆操作重送回應格式無效');
 if(receipt.kind!=='duplicate'&&receipt.write!==true)throw new Error('逐筆操作寫入回應格式無效');
 return receipt;
}

export async function enqueueOperationPlan(journal,plan){
 if(!journal||typeof journal.appendMany!=='function')throw new Error('操作日誌不支援原子批次加入');
 if(plan?.schema!=='danbridge-live-operation-plan-v1'||!Array.isArray(plan.operations)||plan.operationCount!==plan.operations.length)throw new Error('待加入的逐筆操作計畫無效');
 const entries=await journal.appendMany(plan.operations),counts=await journal.counts();return{enqueued:entries.length,counts};
}

export async function runOperationWorker({journal,send,recoverInterrupted=true,maxOperations=1000,onProgress=()=>{},classifyError=classifyOperationError}={}){
 if(!journal||typeof journal.claimNext!=='function'||typeof journal.confirm!=='function'||typeof journal.fail!=='function'||typeof journal.counts!=='function'||typeof journal.list!=='function'||typeof journal.recoverInterrupted!=='function')throw new Error('操作工作程序缺少日誌介面');
 if(typeof send!=='function'||typeof onProgress!=='function'||typeof classifyError!=='function'||!Number.isSafeInteger(maxOperations)||maxOperations<1)throw new Error('操作工作程序設定無效');
 const notify=async payload=>{try{await onProgress(payload)}catch{}};
 const recovery=recoverInterrupted?await journal.recoverInterrupted():{recovered:0};let processed=0;
 while(processed<maxOperations){
  const entry=await journal.claimNext({causal:true});
  if(!entry)break;
  try{const receipt=validateReceipt(entry.operation,await send(entry.operation));await journal.confirm(entry.operationId,receipt);processed++;await notify({kind:'confirmed',entry,receipt,processed})}
  catch(error){const policy=classifyError(error);await journal.fail(entry.operationId,error,policy);await notify({kind:policy.retryable?'failed':'quarantined',entry,error,processed});break}
 }
 const counts=await journal.counts(),rows=await journal.list(),head=rows.find(row=>row.status!=='confirmed')??null;
 const state=counts.quarantined?'blocked':counts.failed?'waiting':counts.sending?'sending':counts.pending?(processed>=maxOperations?'paused':'pending'):'complete';
 return{state,processed,recovered:recovery.recovered||0,counts,head};
}
