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
 if(!['danbridge-live-operation-plan-v1','danbridge-active-record-plan-v1'].includes(plan?.schema)||!Array.isArray(plan.operations)||plan.operationCount!==plan.operations.length)throw new Error('待加入的逐筆操作計畫無效');
 const entries=await journal.appendMany(plan.operations),counts=await journal.counts();return{enqueued:entries.length,counts};
}

export async function runOperationWorker({journal,send,recoverInterrupted=true,maxOperations=1000,maxBatchOperations=8,maxBatchRecords=maxBatchOperations,maxBatchAudits=maxBatchOperations,onProgress=()=>{},classifyError=classifyOperationError}={}){
 if(!journal||typeof journal.claimNext!=='function'||typeof journal.confirm!=='function'||typeof journal.fail!=='function'||typeof journal.counts!=='function'||typeof journal.list!=='function'||typeof journal.recoverInterrupted!=='function')throw new Error('操作工作程序缺少日誌介面');
 if(typeof send!=='function'||(send.batch!==undefined&&typeof send.batch!=='function')||typeof onProgress!=='function'||typeof classifyError!=='function'||!Number.isSafeInteger(maxOperations)||maxOperations<1||!Number.isSafeInteger(maxBatchOperations)||maxBatchOperations<1||maxBatchOperations>120||!Number.isSafeInteger(maxBatchRecords)||maxBatchRecords<0||maxBatchRecords>90||!Number.isSafeInteger(maxBatchAudits)||maxBatchAudits<0||maxBatchAudits>30)throw new Error('操作工作程序設定無效');
 const notify=async payload=>{try{await onProgress(payload)}catch{}};
 const recovery=recoverInterrupted?await journal.recoverInterrupted():{recovered:0};let processed=0;
 while(processed<maxOperations){
  if(typeof send.batch==='function'&&typeof journal.claimNextMany==='function'&&typeof journal.confirmMany==='function'&&typeof journal.failMany==='function'&&maxOperations-processed>1){
   const entries=await journal.claimNextMany({causal:true,max:Math.min(maxBatchOperations,maxOperations-processed),maxRecords:Math.min(maxBatchRecords,maxOperations-processed),maxAudits:Math.min(maxBatchAudits,maxOperations-processed)});
   if(!entries.length)break;
   if(entries.length>1){
    try{
     const operations=entries.map(entry=>entry.operation),batchReceipt=await send.batch(operations);
     if(!batchReceipt||!['batch','duplicate-batch'].includes(batchReceipt.kind)||batchReceipt.operationCount!==operations.length||batchReceipt.targetHash!==operations.at(-1).targetHash||batchReceipt.write!==(batchReceipt.kind==='batch'))throw new Error('批次操作雲端回應格式無效');
     const receipts=operations.map(operation=>({kind:batchReceipt.kind==='duplicate-batch'?'duplicate':(operation.type==='delete'?'tombstone':operation.type),write:batchReceipt.kind==='batch',revision:operation.nextRevision}));receipts.forEach((receipt,index)=>validateReceipt(operations[index],receipt));
     await journal.confirmMany(entries.map((entry,index)=>({operationId:entry.operationId,receipt:receipts[index]})));processed+=entries.length;await notify({kind:'confirmed-batch',entries,batchReceipt,processed});continue;
    }catch(error){const policy=classifyError(error);await journal.failMany(entries.map(entry=>entry.operationId),error,policy);await notify({kind:policy.retryable?'failed':'quarantined',entries,error,processed});break}
   }
   const entry=entries[0];try{const receipt=validateReceipt(entry.operation,await send(entry.operation));await journal.confirm(entry.operationId,receipt);processed++;await notify({kind:'confirmed',entry,receipt,processed})}catch(error){const policy=classifyError(error);await journal.fail(entry.operationId,error,policy);await notify({kind:policy.retryable?'failed':'quarantined',entry,error,processed});break}continue;
  }
  const entry=await journal.claimNext({causal:true});
  if(!entry)break;
  try{const receipt=validateReceipt(entry.operation,await send(entry.operation));await journal.confirm(entry.operationId,receipt);processed++;await notify({kind:'confirmed',entry,receipt,processed})}
  catch(error){const policy=classifyError(error);await journal.fail(entry.operationId,error,policy);await notify({kind:policy.retryable?'failed':'quarantined',entry,error,processed});break}
 }
 const counts=await journal.counts(),rows=await journal.list(),head=rows.find(row=>!['confirmed','superseded'].includes(row.status))??null;
 const state=counts.quarantined?'blocked':counts.failed?'waiting':counts.sending?'sending':counts.pending?(processed>=maxOperations?'paused':'pending'):'complete';
 return{state,processed,recovered:recovery.recovered||0,counts,head};
}
