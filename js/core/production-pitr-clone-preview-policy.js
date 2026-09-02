export const PRODUCTION_PITR_CLONE_PREVIEW_REQUEST_SCHEMA='danbridge-production-pitr-clone-preview-request-v1';
export const PRODUCTION_PITR_CLONE_PREVIEW_RESPONSE_SCHEMA='danbridge-production-pitr-clone-preview-response-v1';

const minute=60000;
const token=value=>typeof value==='string'&&/^[a-z0-9-]{8,80}$/.test(value);
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const uid=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const operationName=(value,databaseId)=>typeof value==='string'&&token(databaseId)&&new RegExp(`^projects/danbridge-d8877/databases/${databaseId}/operations/[A-Za-z0-9._~%-]{8,300}$`).test(value);

export function normalizeProductionPitrSnapshotTime({snapshotTime,earliestVersionTime,now=Date.now()}={}){
 if(!timestamp(snapshotTime)||!timestamp(earliestVersionTime)||!Number.isFinite(now))throw new Error('PITR 時間格式無效');
 const selected=Math.floor(Date.parse(snapshotTime)/minute)*minute,earliest=Math.ceil(Date.parse(earliestVersionTime)/minute)*minute,latest=Math.floor((now-2*minute)/minute)*minute;
 if(selected<earliest||selected>latest)throw new Error('PITR 時間超出可還原範圍');
 return new Date(selected).toISOString();
}

export function buildProductionPitrPreviewDatabaseId(snapshotTime,requestId){
 if(!timestamp(snapshotTime)||!token(requestId))throw new Error('PITR 暫存資料庫 identity 無效');
 const date=new Date(snapshotTime),stamp=[date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0'),String(date.getUTCHours()).padStart(2,'0'),String(date.getUTCMinutes()).padStart(2,'0')].join(''),suffix=requestId.replace(/-/g,'').slice(-10);
 return `pitr-preview-${stamp}-${suffix}`;
}

export function assertProductionPitrPreviewRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.schema!==PRODUCTION_PITR_CLONE_PREVIEW_REQUEST_SCHEMA||!['start','status'].includes(input.action)||!token(input.requestId))throw new Error('PITR 預覽請求無效');
 const allowed=input.action==='start'?['schema','action','requestId','snapshotTime']:['schema','action','requestId','databaseId'];
 if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error('PITR 預覽請求包含未允許欄位');
 if(input.action==='start'&&!timestamp(input.snapshotTime))throw new Error('PITR 預覽缺少時間');
 if(input.action==='status'&&!token(input.databaseId))throw new Error('PITR 預覽缺少暫存資料庫');
 return Object.freeze({...input});
}

export function assertProductionPitrDiff(diff,{databaseId,snapshotTime,expectedCollections}={}){
 if(!diff||typeof diff!=='object'||Array.isArray(diff)||diff.schema!=='danbridge-production-pitr-diff-v1'||diff.environment!=='production'||diff.companyId!=='danbridge'||diff.state!=='ready-read-only'||diff.databaseId!==databaseId||!token(diff.databaseId)||diff.snapshotTime!==snapshotTime||!timestamp(diff.snapshotTime)||diff.formalDataWrites!==0||diff.timeMachineDependency!==false||!diff.summary||!Array.isArray(diff.collections))throw new Error('PITR 差異 identity 無效');
 const names=diff.collections.map(row=>row?.collection),expected=Array.isArray(expectedCollections)?[...expectedCollections].sort():null;
 if(new Set(names).size!==names.length||(expected&&(names.length!==expected.length||JSON.stringify([...names].sort())!==JSON.stringify(expected))))throw new Error('PITR 差異集合範圍無效');
 let added=0,changed=0,removed=0,unchanged=0;
 for(const row of diff.collections){if(!row||typeof row.collection!=='string'||!row.collection||![row.added,row.changed,row.removed,row.unchanged,row.currentCount,row.previewCount].every(integer)||row.currentCount!==row.changed+row.removed+row.unchanged||row.previewCount!==row.added+row.changed+row.unchanged)throw new Error('PITR 差異集合計數無效');added+=row.added;changed+=row.changed;removed+=row.removed;unchanged+=row.unchanged}
 const summary=diff.summary;if(![summary.added,summary.changed,summary.removed,summary.unchanged,summary.totalDifferences].every(integer)||summary.added!==added||summary.changed!==changed||summary.removed!==removed||summary.unchanged!==unchanged||summary.totalDifferences!==added+changed+removed)throw new Error('PITR 差異摘要無效');
 return diff;
}

export function assertProductionPitrPreviewReceipt(receipt,{databaseId,createdByUid,expectedCollections}={}){
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.schema!=='danbridge-production-pitr-clone-preview-v1'||receipt.environment!=='production'||receipt.companyId!=='danbridge'||!['cloning','ready-read-only','failed'].includes(receipt.state)||receipt.databaseId!==databaseId||!token(receipt.databaseId)||!uid(createdByUid)||receipt.createdByUid!==createdByUid||!timestamp(receipt.snapshotTime)||!operationName(receipt.operationName,receipt.databaseId)||receipt.formalDataWrites!==0||receipt.timeMachineDependency!==false)throw new Error('PITR 暫存還原 receipt identity 無效');
 if(receipt.state==='ready-read-only')assertProductionPitrDiff(receipt.diff,{databaseId:receipt.databaseId,snapshotTime:receipt.snapshotTime,expectedCollections});
 else if(receipt.diff!=null)throw new Error('PITR 未完成 receipt 不得含差異結果');
 return receipt;
}

export function buildProductionPitrDiff({databaseId,snapshotTime,currentByCollection,previewByCollection}={}){
 if(!token(databaseId)||!timestamp(snapshotTime)||!currentByCollection||!previewByCollection)throw new Error('PITR 差異輸入無效');
 const collections=[...new Set([...Object.keys(currentByCollection),...Object.keys(previewByCollection)])].sort(),details=[];let added=0,changed=0,removed=0,unchanged=0;
 for(const collection of collections){const current=currentByCollection[collection]||{},preview=previewByCollection[collection]||{},ids=[...new Set([...Object.keys(current),...Object.keys(preview)])].sort();let collectionAdded=0,collectionChanged=0,collectionRemoved=0,collectionUnchanged=0;
  for(const id of ids){if(!(id in current)){collectionAdded++;continue}if(!(id in preview)){collectionRemoved++;continue}if(current[id]===preview[id])collectionUnchanged++;else collectionChanged++}
  added+=collectionAdded;changed+=collectionChanged;removed+=collectionRemoved;unchanged+=collectionUnchanged;details.push(Object.freeze({collection,added:collectionAdded,changed:collectionChanged,removed:collectionRemoved,unchanged:collectionUnchanged,currentCount:Object.keys(current).length,previewCount:Object.keys(preview).length}));
 }
 return Object.freeze(assertProductionPitrDiff({schema:'danbridge-production-pitr-diff-v1',environment:'production',companyId:'danbridge',state:'ready-read-only',databaseId,snapshotTime,formalDataWrites:0,timeMachineDependency:false,summary:Object.freeze({added,changed,removed,unchanged,totalDifferences:added+changed+removed}),collections:Object.freeze(details)},{databaseId,snapshotTime}));
}
