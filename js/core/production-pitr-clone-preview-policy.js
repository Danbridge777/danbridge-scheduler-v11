export const PRODUCTION_PITR_CLONE_PREVIEW_REQUEST_SCHEMA='danbridge-production-pitr-clone-preview-request-v1';
export const PRODUCTION_PITR_CLONE_PREVIEW_RESPONSE_SCHEMA='danbridge-production-pitr-clone-preview-response-v1';

const minute=60000;
const token=value=>typeof value==='string'&&/^[a-z0-9-]{8,80}$/.test(value);
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

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

export function buildProductionPitrDiff({databaseId,snapshotTime,currentByCollection,previewByCollection}={}){
 if(!token(databaseId)||!timestamp(snapshotTime)||!currentByCollection||!previewByCollection)throw new Error('PITR 差異輸入無效');
 const collections=[...new Set([...Object.keys(currentByCollection),...Object.keys(previewByCollection)])].sort(),details=[];let added=0,changed=0,removed=0,unchanged=0;
 for(const collection of collections){const current=currentByCollection[collection]||{},preview=previewByCollection[collection]||{},ids=[...new Set([...Object.keys(current),...Object.keys(preview)])].sort();let collectionAdded=0,collectionChanged=0,collectionRemoved=0,collectionUnchanged=0;
  for(const id of ids){if(!(id in current)){collectionAdded++;continue}if(!(id in preview)){collectionRemoved++;continue}if(current[id]===preview[id])collectionUnchanged++;else collectionChanged++}
  added+=collectionAdded;changed+=collectionChanged;removed+=collectionRemoved;unchanged+=collectionUnchanged;details.push(Object.freeze({collection,added:collectionAdded,changed:collectionChanged,removed:collectionRemoved,unchanged:collectionUnchanged,currentCount:Object.keys(current).length,previewCount:Object.keys(preview).length}));
 }
 return Object.freeze({schema:'danbridge-production-pitr-diff-v1',environment:'production',companyId:'danbridge',state:'ready-read-only',databaseId,snapshotTime,formalDataWrites:0,timeMachineDependency:false,summary:Object.freeze({added,changed,removed,unchanged,totalDifferences:added+changed+removed}),collections:Object.freeze(details)});
}
