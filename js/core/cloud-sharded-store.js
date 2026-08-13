export const SHARDED_DB_COLLECTION_KEYS=Object.freeze([
 'students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups',
 'summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses',
 'settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'
]);

export const SHARDED_DB_SCHEMA='danbridge-sharded-db-v1';
export const SHARDED_DB_ACTIVATION_SCHEMA='danbridge-sharded-activation-v1';

function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function byteLength(value){return new TextEncoder().encode(JSON.stringify(value)).length}
function assertCompleteShape(db){
 if(!db||typeof db!=='object'||Array.isArray(db))throw new Error('分片來源必須是完整資料物件');
 const expected=new Set(SHARDED_DB_COLLECTION_KEYS),unknown=Object.keys(db).filter(key=>!expected.has(key));
 if(unknown.length)throw new Error(`發現尚未納入分片格式的資料欄位：${unknown.join('、')}`);
 for(const key of SHARDED_DB_COLLECTION_KEYS)if(!Array.isArray(db[key]))throw new Error(`分片來源缺少陣列集合：${key}`);
}
function packCollection(key,items,maxChunkBytes){
 const chunks=[];let current=[];
 for(const item of items){
  const candidate=[...current,item],payload={key,index:chunks.length,items:candidate};
  if(byteLength(payload)<=maxChunkBytes){current=candidate;continue}
  if(!current.length)throw new Error(`${key} 有單筆資料超過分片上限 ${maxChunkBytes} bytes`);
  chunks.push({key,index:chunks.length,items:clone(current)});current=[item];
  if(byteLength({key,index:chunks.length,items:current})>maxChunkBytes)throw new Error(`${key} 有單筆資料超過分片上限 ${maxChunkBytes} bytes`);
 }
 if(current.length)chunks.push({key,index:chunks.length,items:clone(current)});
 return chunks;
}

export function createShardedSnapshot(db,{hash,maxChunkBytes=180000,generationId=''}={}){
 if(typeof hash!=='function')throw new Error('建立分片必須提供完整資料雜湊函式');
 if(!Number.isInteger(maxChunkBytes)||maxChunkBytes<4096)throw new Error('分片大小上限無效');
 assertCompleteShape(db);
 const chunks=[],collections={};
 for(const key of SHARDED_DB_COLLECTION_KEYS){
  const packed=packCollection(key,db[key],maxChunkBytes);collections[key]={count:db[key].length,chunks:packed.length};
  chunks.push(...packed.map(chunk=>({...chunk,documentId:`${key}-${String(chunk.index).padStart(4,'0')}`})));
 }
 const sourceHash=String(hash(db));
 return{manifest:{schema:SHARDED_DB_SCHEMA,generationId:String(generationId),sourceHash,maxChunkBytes,collectionOrder:[...SHARDED_DB_COLLECTION_KEYS],collections,totalChunks:chunks.length,totalRecords:SHARDED_DB_COLLECTION_KEYS.reduce((sum,key)=>sum+db[key].length,0)},chunks};
}

export function assembleShardedSnapshot(manifest,chunks,{hash}={}){
 if(typeof hash!=='function')throw new Error('重組分片必須提供完整資料雜湊函式');
 if(manifest?.schema!==SHARDED_DB_SCHEMA)throw new Error('不支援的分片格式');
 if(JSON.stringify(manifest.collectionOrder)!==JSON.stringify(SHARDED_DB_COLLECTION_KEYS))throw new Error('分片集合清單不完整或順序不符');
 const result=Object.fromEntries(SHARDED_DB_COLLECTION_KEYS.map(key=>[key,[]])),seen=new Set();
 for(const chunk of chunks||[]){
  const key=String(chunk?.key||''),index=Number(chunk?.index),token=`${key}:${index}`;
  if(!SHARDED_DB_COLLECTION_KEYS.includes(key)||!Number.isInteger(index)||index<0||!Array.isArray(chunk.items))throw new Error('發現無效分片');
  if(seen.has(token))throw new Error(`發現重複分片：${token}`);seen.add(token);
 }
 for(const key of SHARDED_DB_COLLECTION_KEYS){
  const descriptor=manifest.collections?.[key];if(!descriptor)throw new Error(`分片 manifest 缺少 ${key}`);
  const rows=(chunks||[]).filter(chunk=>chunk.key===key).sort((a,b)=>a.index-b.index);
  if(rows.length!==descriptor.chunks||rows.some((row,index)=>row.index!==index))throw new Error(`${key} 分片遺失或序號不連續`);
  result[key]=rows.flatMap(row=>clone(row.items));
  if(result[key].length!==descriptor.count)throw new Error(`${key} 筆數驗證失敗`);
 }
 if((chunks||[]).length!==manifest.totalChunks)throw new Error('總分片數驗證失敗');
 if(SHARDED_DB_COLLECTION_KEYS.reduce((sum,key)=>sum+result[key].length,0)!==manifest.totalRecords)throw new Error('總筆數驗證失敗');
 if(String(hash(result))!==String(manifest.sourceHash))throw new Error('分片重組雜湊與原資料不一致');
 return result;
}

export function createShardedActivation(manifest,{expectedLegacyHash,activatedAt='',activatedBy=''}={}){
 if(manifest?.schema!==SHARDED_DB_SCHEMA||!manifest.generationId||!manifest.sourceHash)throw new Error('不能啟用不完整的分片世代');
 if(String(expectedLegacyHash)!==String(manifest.sourceHash))throw new Error('正式主資料版本已改變，禁止啟用舊分片');
 return{schema:SHARDED_DB_ACTIVATION_SCHEMA,activeGenerationId:manifest.generationId,sourceHash:manifest.sourceHash,totalChunks:manifest.totalChunks,totalRecords:manifest.totalRecords,activatedAt:String(activatedAt),activatedBy:String(activatedBy)};
}

export function chooseCloudReadSource({activation,legacyHash,verifiedGenerationHash}){
 if(!activation)return'legacy';
 if(activation.schema!==SHARDED_DB_ACTIVATION_SCHEMA)return'blocked';
 if(!activation.activeGenerationId||activation.sourceHash!==verifiedGenerationHash)return'blocked';
 if(legacyHash&&legacyHash!==activation.sourceHash)return'blocked';
 return'sharded';
}
