import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js';

export const ROLE_VIEW_CANDIDATE_SCHEMA='danbridge-role-view-candidate-v1';

const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value);
const canonicalText=value=>JSON.stringify(canonical(value));
const validToken=value=>{const text=String(value??'');return text&&text.trim()===text&&!text.includes('/')&&text!=='.'&&text!=='..'&&!/^__.*__$/.test(text)&&new TextEncoder().encode(text).length<=1500};
const validHash=value=>typeof value==='string'&&value.trim().length>=8;
const allowedKinds=new Set(['scheduler','teacher','branch_manager']);
const namespaceFor=environment=>environment==='production'?'productionRoleViewCandidates':'stagingRoleViewCandidates';

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
 for(const view of plan.views){const db={};for(const collection of FULL_RECORD_COLLECTIONS){const rows=byView.get(view.viewId)[collection];rows.sort((a,b)=>a.recordIndex-b.recordIndex);rows.forEach((row,index)=>{if(row.recordIndex!==index)throw new Error(`角色逐筆候選順序不連續：${view.viewId}/${collection}`)});db[collection]=rows.map(row=>clone(row.record))}if(hashDb(db)!==view.viewHash)throw new Error(`角色逐筆候選 viewHash 不符：${view.viewId}`)}
 return{verified:true,runId:plan.runId,sourceHash:plan.sourceHash,viewCount:plan.viewCount,documentCount:plan.documentCount,writes:0,readTakeover:false};
}
