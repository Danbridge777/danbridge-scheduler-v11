const SCHEMA='danbridge-operation-journal-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const validState=new Set(['pending','sending','confirmed','failed','quarantined']);
const text=value=>typeof value==='string'&&value.trim().length>0;
function validateEntry(entry){if(!entry||entry.schema!==SCHEMA||!text(entry.operationId)||!validState.has(entry.status)||!entry.operation||entry.operation.operationId!==entry.operationId||!Number.isSafeInteger(entry.attempts)||entry.attempts<0)throw new Error('操作日誌格式無效');return entry}
export function retryDelay(attempts){return Math.min(30000,1000*2**Math.min(Math.max(0,attempts-1),5))}
export function createOperationJournal({storage,now=()=>Date.now()}={}){
 if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('操作日誌儲存介面不完整');
 let lock=Promise.resolve();
 const localExclusive=work=>{const result=lock.then(work,work);lock=result.then(()=>{},()=>{});return result};
 const exclusive=work=>localExclusive(()=>typeof storage.exclusive==='function'?storage.exclusive(work):work());
 const read=async()=>{const value=await storage.load();if(value==null)return[];if(!Array.isArray(value))throw new Error('操作日誌不是陣列');return value.map(row=>validateEntry(clone(row)))};
 const write=async rows=>{await storage.save(clone(rows));return clone(rows)};
 return{
  async list(){return exclusive(read)},
  async append(operation){return exclusive(async()=>{if(!text(operation?.operationId))throw new Error('操作缺少 operationId');const rows=await read(),existing=rows.find(row=>row.operationId===operation.operationId);if(existing){if(JSON.stringify(existing.operation)!==JSON.stringify(operation))throw new Error('相同 operationId 內容衝突');return clone(existing)}const at=now(),entry={schema:SCHEMA,operationId:operation.operationId,operation:clone(operation),status:'pending',attempts:0,createdAt:at,updatedAt:at,nextRetryAt:at,confirmedAt:null,lastError:''};rows.push(entry);await write(rows);return clone(entry)})},
  async recoverInterrupted(){return exclusive(async()=>{const rows=await read(),at=now();let recovered=0;for(const row of rows)if(row.status==='sending'){row.status='pending';row.updatedAt=at;row.nextRetryAt=at;row.lastError='上次傳送在確認前中斷';recovered++}if(recovered)await write(rows);return{recovered,rows:clone(rows)}})},
  async claimNext(){return exclusive(async()=>{const rows=await read(),at=now(),entry=rows.find(row=>['pending','failed'].includes(row.status)&&row.nextRetryAt<=at);if(!entry)return null;entry.status='sending';entry.attempts++;entry.updatedAt=at;await write(rows);return clone(entry)})},
  async confirm(operationId,receipt={}){return exclusive(async()=>{const rows=await read(),entry=rows.find(row=>row.operationId===operationId);if(!entry)throw new Error('找不到待確認操作');if(entry.status==='confirmed')return clone(entry);if(entry.status!=='sending')throw new Error('只有傳送中的操作可確認');const at=now();entry.status='confirmed';entry.updatedAt=at;entry.confirmedAt=at;entry.receipt=clone(receipt);entry.lastError='';await write(rows);return clone(entry)})},
  async fail(operationId,error,{retryable=true}={}){return exclusive(async()=>{const rows=await read(),entry=rows.find(row=>row.operationId===operationId);if(!entry||entry.status!=='sending')throw new Error('找不到傳送中的操作');const at=now();entry.status=retryable?'failed':'quarantined';entry.updatedAt=at;entry.lastError=String(error?.message||error||'未知錯誤').slice(0,500);entry.nextRetryAt=retryable?at+retryDelay(entry.attempts):null;await write(rows);return clone(entry)})},
  async counts(){return exclusive(async()=>{const rows=await read(),counts={pending:0,sending:0,confirmed:0,failed:0,quarantined:0};for(const row of rows)counts[row.status]++;return{...counts,total:rows.length}})}
 };
}
