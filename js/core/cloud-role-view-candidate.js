import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js';

export const ROLE_VIEW_CANDIDATE_SCHEMA='danbridge-role-view-candidate-v1';

const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value);
const canonicalText=value=>JSON.stringify(canonical(value));
const shortHash=value=>{let hash=2166136261;for(const byte of new TextEncoder().encode(canonicalText(value))){hash^=byte;hash=Math.imul(hash,16777619)}return(hash>>>0).toString(16).padStart(8,'0')};
const validToken=value=>{const text=String(value??'');return text&&text.trim()===text&&!text.includes('/')&&text!=='.'&&text!=='..'&&!/^__.*__$/.test(text)&&new TextEncoder().encode(text).length<=1500};
const validHash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const allowedKinds=new Set(['scheduler','teacher','branch_manager']);
const namespaceFor=environment=>environment==='production'?'productionRoleViewCandidates':'stagingRoleViewCandidates';
const persistedCandidateFields=new Set(['schema','environment','companyId','runId','sourceHash','viewId','email','kind','viewHash','collection','recordId','record','recordIndex','createdAt','createdBy','createdByEmail']);

export function buildRoleViewCandidatePlan({runId,sourceHash,views,environment='staging',batchSize=400}={}){
 if(!['staging','production'].includes(environment)||!validToken(runId)||!validHash(sourceHash))throw new Error('角色逐筆候選 identity 無效');
 if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>400||!Array.isArray(views)||!views.length)throw new Error('角色逐筆候選輸入無效');
 const seenViews=new Set(),documents=[],manifestViews=[];
 for(const view of views){
  const viewId=String(view?.viewId??''),email=String(view?.email??'').trim().toLowerCase(),kind=String(view?.kind??''),viewHash=String(view?.viewHash??'');
  if(!validToken(viewId)||seenViews.has(viewId)||!email||!allowedKinds.has(kind)||!validHash(viewHash))throw new Error(`角色逐筆候選 view 無效：${viewId}`);seenViews.add(viewId);
  const materialized=materializeFullRecordDb(view.db),counts={};let documentCount=0;
  for(const collection of FULL_RECORD_COLLECTIONS){counts[collection]=materialized[collection].length;documentCount+=counts[collection];materialized[collection].forEach((item,recordIndex)=>documents.push({path:`${namespaceFor(environment)}/danbridge/runs/${runId}/views/${viewId}/collections/${collection}/records/${item.recordId}`,payload:{schema:ROLE_VIEW_CANDIDATE_SCHEMA,environment,companyId:'danbridge',runId,sourceHash,viewId,email,kind,viewHash,collection,recordId:item.recordId,record:clone(item.record),recordIndex}}))}
  manifestViews.push({viewId,email,kind,viewHash,documentCount,counts});
 }
 const batches=[];for(let offset=0;offset<documents.length;offset+=batchSize)batches.push({index:batches.length,documents:documents.slice(offset,offset+batchSize)});
 return{schema:'danbridge-role-view-candidate-plan-v1',environment,companyId:'danbridge',runId,sourceHash,viewCount:manifestViews.length,documentCount:documents.length,views:manifestViews,documents,batches};
}

export function verifyRoleViewCandidateDocuments(plan,readback,{hashDb}={}){
 if(plan?.schema!=='danbridge-role-view-candidate-plan-v1'||typeof hashDb!=='function'||!Array.isArray(readback))throw new Error('角色逐筆候選驗證輸入無效');
 const expected=new Map(plan.documents.map(row=>[row.path,canonicalText(row.payload)]));
 if(readback.length!==expected.size)throw new Error(`角色逐筆候選筆數不符：預期 ${expected.size}，實際 ${readback.length}`);
 const byView=new Map(plan.views.map(view=>[view.viewId,Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]))])),seen=new Set();
 for(const row of readback){const path=String(row?.path??''),payload=row?.payload;if(seen.has(path)||!expected.has(path)||canonicalText(payload)!==expected.get(path))throw new Error(`角色逐筆候選文件不符：${path}`);seen.add(path);byView.get(payload.viewId)?.[payload.collection].push(payload)}
 for(const view of plan.views){const db={};for(const collection of FULL_RECORD_COLLECTIONS){const rows=byView.get(view.viewId)[collection];rows.sort((a,b)=>a.recordIndex-b.recordIndex);rows.forEach((row,index)=>{if(row.recordIndex!==index)throw new Error(`角色逐筆候選順序不連續：${view.viewId}/${collection}`)});const records=rows.map(row=>clone(row.record));db[collection]=collection==='changes'?records.reverse():records}if(hashDb(db)!==view.viewHash)throw new Error(`角色逐筆候選 viewHash 不符：${view.viewId}`)}
 return{verified:true,runId:plan.runId,sourceHash:plan.sourceHash,viewCount:plan.viewCount,documentCount:plan.documentCount,writes:0,readTakeover:false};
}

export function verifyOwnRoleViewCandidateReadback({documentsByCollection,runId,sourceHash,viewId,email,kind,viewHash,environment='staging'}={}, {hashDb}={}){
 const normalizedEmail=String(email??'').trim().toLowerCase();
 if(environment!=='staging'||!validToken(runId)||!validHash(sourceHash)||!validToken(viewId)||!normalizedEmail||!allowedKinds.has(kind)||!validHash(viewHash)||typeof hashDb!=='function')throw new Error('角色候選本人讀回 identity 無效');
 const db={};let documentCount=0;
 for(const collection of FULL_RECORD_COLLECTIONS){
  const input=documentsByCollection?.[collection];if(!Array.isArray(input))throw new Error(`角色候選本人讀回缺少集合：${collection}`);
  const seenIds=new Set(),seenIndexes=new Set(),rows=[];
  for(const row of input){
   const id=String(row?.id??''),data=row?.data,keys=data&&typeof data==='object'&&!Array.isArray(data)?Object.keys(data):[];
   if(!validToken(id)||seenIds.has(id)||!data||keys.some(key=>!persistedCandidateFields.has(key))||keys.length!==persistedCandidateFields.size)throw new Error(`角色候選本人讀回文件格式無效：${collection}/${id}`);
   const identified=collection==='changes'?id===`seq_${String(data.recordIndex).padStart(8,'0')}_${shortHash(data.record)}`:String(data.record?.id??'')===id;
   if(data.schema!==ROLE_VIEW_CANDIDATE_SCHEMA||data.environment!==environment||data.companyId!=='danbridge'||data.runId!==runId||data.sourceHash!==sourceHash||data.viewId!==viewId||data.email!==normalizedEmail||data.kind!==kind||data.viewHash!==viewHash||data.collection!==collection||data.recordId!==id||!data.record||typeof data.record!=='object'||Array.isArray(data.record)||!Number.isSafeInteger(data.recordIndex)||data.recordIndex<0||seenIndexes.has(data.recordIndex)||!identified||!data.createdAt||typeof data.createdBy!=='string'||!data.createdBy||typeof data.createdByEmail!=='string'||!data.createdByEmail)throw new Error(`角色候選本人讀回內容不符：${collection}/${id}`);
   seenIds.add(id);seenIndexes.add(data.recordIndex);rows.push(data);
  }
  rows.sort((a,b)=>a.recordIndex-b.recordIndex);rows.forEach((row,index)=>{if(row.recordIndex!==index)throw new Error(`角色候選本人讀回順序不連續：${collection}`)});
  const records=rows.map(row=>clone(row.record));db[collection]=collection==='changes'?records.reverse():records;documentCount+=rows.length;
 }
 if(hashDb(db)!==viewHash)throw new Error('角色候選本人讀回 viewHash 不符');
 return{verified:true,environment,runId,sourceHash,viewId,email:normalizedEmail,kind,viewHash,collectionCount:FULL_RECORD_COLLECTIONS.length,documentCount,db};
}
