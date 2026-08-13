function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function byteLength(value){return new TextEncoder().encode(value).length}
function validDocumentId(value){
 const id=String(value??'');
 return id.trim()===id&&id.length>0&&!id.includes('/')&&id!=='.'&&id!=='..'&&!/^__.*__$/.test(id)&&byteLength(id)<=1500;
}
function stableValue(value){
 if(Array.isArray(value))return value.map(stableValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
 return value;
}
function fingerprint(value){return JSON.stringify(stableValue(value))}
function indexRecords(rows,collection,side){
 if(!Array.isArray(rows))throw new Error(`${collection} ${side}資料必須是陣列`);
 const indexed=new Map();
 for(const record of rows){
  if(!record||typeof record!=='object'||Array.isArray(record)||record.id===undefined||record.id===null)throw new Error(`${collection} ${side}資料缺少穩定 ID`);
  const id=String(record.id);
  if(!validDocumentId(id))throw new Error(`${collection} ${side}資料包含無效 ID`);
  if(indexed.has(id))throw new Error(`${collection} ${side}資料包含重複 ID：${id}`);
  indexed.set(id,record);
 }
 return indexed;
}

export function buildRecordCollectionDiff(beforeRows,afterRows,{collection='records'}={}){
 const before=indexRecords(beforeRows,collection,'原始'),after=indexRecords(afterRows,collection,'最新');
 const creates=[],updates=[],deletes=[];let unchanged=0;
 for(const [id,record] of after){
  if(!before.has(id)){creates.push(clone(record));continue}
  if(fingerprint(before.get(id))===fingerprint(record))unchanged++;
  else updates.push(clone(record));
 }
 for(const [id,record] of before)if(!after.has(id))deletes.push(clone(record));
 return{collection,creates,updates,deletes,unchanged,totalBefore:before.size,totalAfter:after.size};
}

export const CORE_RECORD_COLLECTIONS=Object.freeze(['lessons','students','teachers']);

export function buildCoreRecordDiffs(beforeDb,afterDb){
 const collections={};
 for(const collection of CORE_RECORD_COLLECTIONS)collections[collection]=buildRecordCollectionDiff(beforeDb?.[collection],afterDb?.[collection],{collection});
 const values=Object.values(collections),counts={creates:0,updates:0,deletes:0,unchanged:0,writes:0};
 for(const diff of values){counts.creates+=diff.creates.length;counts.updates+=diff.updates.length;counts.deletes+=diff.deletes.length;counts.unchanged+=diff.unchanged}
 counts.writes=counts.creates+counts.updates+counts.deletes;
 return{collections,counts};
}

export const RECORD_SHADOW_SAFE_WRITE_LIMIT=400;

function shadowRevision(revisions,collection,id){
 const revision=revisions?.[collection]?.[id];
 if(revision===undefined||revision===null)throw new Error(`${collection}/${id} 缺少目前 revision`);
 if(!Number.isSafeInteger(revision)||revision<1)throw new Error(`${collection}/${id} 包含無效 revision`);
 return revision+1;
}

function shadowOperation(type,collection,record,{companyId,sourceHash,revisions}){
 const id=String(record.id),existingRevision=revisions?.[collection]?.[id];
 const revision=type==='create'&&existingRevision===undefined?1:shadowRevision(revisions,collection,id);
 return{
  type,
  path:`stagingRecordShadows/${companyId}/collections/${collection}/records/${id}`,
  payload:{
   companyId,collection,recordId:id,record:clone(record),sourceHash,revision,
   deleted:type==='delete',environment:'staging'
  }
 };
}

export function buildRecordShadowWritePlan(coreDiffs,{companyId='danbridge',sourceHash,revisions={}}={}){
 if(companyId!=='danbridge')throw new Error('影子寫入計畫包含 Rules 未允許的 companyId');
 if(typeof sourceHash!=='string'||!sourceHash.trim())throw new Error('影子寫入計畫缺少有效 sourceHash');
 const collections=coreDiffs?.collections;
 if(!collections||typeof collections!=='object'||Array.isArray(collections))throw new Error('影子寫入計畫缺少核心集合差異');
 for(const collection of Object.keys(collections))if(!CORE_RECORD_COLLECTIONS.includes(collection))throw new Error(`影子寫入計畫包含非核心集合：${collection}`);
 const operations=[];
 for(const collection of CORE_RECORD_COLLECTIONS){
  const diff=collections[collection];
  if(!diff)continue;
  if(diff.collection!==collection)throw new Error(`${collection} 差異集合名稱不一致`);
  for(const record of diff.creates??[])operations.push(shadowOperation('create',collection,record,{companyId,sourceHash,revisions}));
  for(const record of diff.updates??[])operations.push(shadowOperation('update',collection,record,{companyId,sourceHash,revisions}));
  for(const record of diff.deletes??[])operations.push(shadowOperation('delete',collection,record,{companyId,sourceHash,revisions}));
 }
 if(operations.length>RECORD_SHADOW_SAFE_WRITE_LIMIT)throw new Error(`影子寫入筆數 ${operations.length} 超過單批安全上限 ${RECORD_SHADOW_SAFE_WRITE_LIMIT}`);
 return{companyId,sourceHash,operations,writes:operations.length};
}
