import {createShardedSnapshot,assembleShardedSnapshot,SHARDED_DB_COLLECTION_KEYS} from './cloud-sharded-store.js?v=20.26.72';

export const IMMUTABLE_MIGRATION_BACKUP_SCHEMA='danbridge-immutable-migration-backup-v2';
export const IMMUTABLE_MIGRATION_BACKUP_CHUNK_SCHEMA='danbridge-immutable-migration-backup-chunk-v2';

function nonEmpty(value,label){const text=String(value??'').trim();if(!text)throw new Error(`${label} 不可空白`);return text}
function safeCount(value,label){if(!Number.isSafeInteger(value)||value<0)throw new Error(`${label} 無效`);return value}
function clone(value){return JSON.parse(JSON.stringify(value))}
function same(left,right){return JSON.stringify(left)===JSON.stringify(right)}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value}
export function sha256Canonical(value){
 const bytes=new TextEncoder().encode(JSON.stringify(stable(value))),length=bytes.length,bitLength=length*8,paddedLength=((length+9+63)>>6)<<6,buffer=new Uint8Array(paddedLength);buffer.set(bytes);buffer[length]=0x80;
 const view=new DataView(buffer.buffer);view.setUint32(paddedLength-4,bitLength>>>0);view.setUint32(paddedLength-8,Math.floor(bitLength/0x100000000));
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],w=new Uint32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
 let h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 for(let offset=0;offset<paddedLength;offset+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2],s0=rotr(x,7)^rotr(x,18)^(x>>>3),s1=rotr(y,17)^rotr(y,19)^(y>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}let[a,b,c,d,e,f,g,hh]=h;for(let i=0;i<64;i++){const s1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(hh+s1+ch+k[i]+w[i])>>>0,s0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}h=[(h[0]+a)>>>0,(h[1]+b)>>>0,(h[2]+c)>>>0,(h[3]+d)>>>0,(h[4]+e)>>>0,(h[5]+f)>>>0,(h[6]+g)>>>0,(h[7]+hh)>>>0]}
 return h.map(value=>value.toString(16).padStart(8,'0')).join('');
}

export function prepareImmutableMigrationBackup(db,{hash=sha256Canonical,backupId,sourceVersionHash,maxChunkBytes=180000}={}){
 const id=nonEmpty(backupId,'backupId');
 const sharded=createShardedSnapshot(db,{hash,maxChunkBytes,generationId:id});
 const plan={
  schema:IMMUTABLE_MIGRATION_BACKUP_SCHEMA,
  environment:'staging',
  state:'uploading',
  backupId:id,
  sourceHash:sharded.manifest.sourceHash,
  sourceVersionHash:nonEmpty(sourceVersionHash??sharded.manifest.sourceHash,'sourceVersionHash'),
  collectionOrder:[...SHARDED_DB_COLLECTION_KEYS],
  collections:clone(sharded.manifest.collections),
  chunkCount:sharded.manifest.totalChunks,
  recordCount:sharded.manifest.totalRecords,
  maxChunkBytes
 };
 const chunks=sharded.chunks.map(chunk=>({
  schema:IMMUTABLE_MIGRATION_BACKUP_CHUNK_SCHEMA,
  environment:'staging',
  backupId:id,
  chunkId:chunk.documentId,
  collection:chunk.key,
  index:chunk.index,
  items:clone(chunk.items),
  sourceHash:plan.sourceHash
  ,sourceVersionHash:plan.sourceVersionHash
 }));
 return{plan,chunks};
}

export function verifyImmutableMigrationBackupReadback(plan,readbackChunks,{hash=sha256Canonical}={}){
 if(plan?.schema!==IMMUTABLE_MIGRATION_BACKUP_SCHEMA||plan?.environment!=='staging'||plan?.state!=='uploading')throw new Error('備份計畫狀態無效');
 const backupId=nonEmpty(plan.backupId,'backupId'),sourceHash=nonEmpty(plan.sourceHash,'sourceHash');
 const chunkCount=safeCount(plan.chunkCount,'分片數'),recordCount=safeCount(plan.recordCount,'資料筆數');
 const seen=new Set(),chunks=(readbackChunks||[]).map(row=>{
  if(row?.schema!==IMMUTABLE_MIGRATION_BACKUP_CHUNK_SCHEMA||row?.environment!=='staging')throw new Error('備份分片格式無效');
  if(row.backupId!==backupId||row.sourceHash!==sourceHash||row.sourceVersionHash!==plan.sourceVersionHash)throw new Error('備份分片 identity 或來源 hash 不符');
  const chunkId=nonEmpty(row.chunkId,'chunkId');if(seen.has(chunkId))throw new Error(`備份分片重複：${chunkId}`);seen.add(chunkId);
  if(chunkId!==`${row.collection}-${String(row.index).padStart(4,'0')}`)throw new Error('備份分片 ID 與序號不符');
  return{key:row.collection,index:row.index,items:clone(row.items)};
 });
 if(chunks.length!==chunkCount)throw new Error('備份分片數不符');
 const shardedManifest={schema:'danbridge-sharded-db-v1',generationId:backupId,sourceHash,maxChunkBytes:plan.maxChunkBytes,collectionOrder:plan.collectionOrder,collections:plan.collections,totalChunks:chunkCount,totalRecords:recordCount};
 const db=assembleShardedSnapshot(shardedManifest,chunks,{hash});
 return{db,verifiedHash:String(hash(db)),chunkCount,recordCount};
}

export function sealImmutableMigrationBackup(plan,readback,{verifiedBy,verifiedByEmail}={}){
 if(!readback||readback.verifiedHash!==plan?.sourceHash)throw new Error('雲端讀回 hash 不符，禁止建立 verified manifest');
 if(readback.chunkCount!==plan.chunkCount||readback.recordCount!==plan.recordCount)throw new Error('雲端讀回數量不符，禁止建立 verified manifest');
 return{...clone(plan),state:'verified',verifiedHash:readback.verifiedHash,verifiedBy:nonEmpty(verifiedBy,'verifiedBy'),verifiedByEmail:nonEmpty(verifiedByEmail,'verifiedByEmail')};
}

export function verifyImmutableMigrationBackupManifest(manifest,{currentSourceHash}={}){
 if(manifest?.schema!==IMMUTABLE_MIGRATION_BACKUP_SCHEMA||manifest?.environment!=='staging'||manifest?.state!=='verified')throw new Error('備份 manifest 尚未 verified');
 if(nonEmpty(manifest.verifiedHash,'verifiedHash')!==nonEmpty(manifest.sourceHash,'sourceHash'))throw new Error('備份 manifest hash 不符');
 if(!/^[a-f0-9]{64}$/.test(manifest.sourceHash))throw new Error('備份 manifest 不是 SHA-256');
 if(nonEmpty(currentSourceHash,'目前來源 hash')!==manifest.sourceHash)throw new Error('主資料版本已改變，必須重新建立遷移前備份');
 if(!same(manifest.collectionOrder,SHARDED_DB_COLLECTION_KEYS))throw new Error('備份集合順序不完整');
 safeCount(manifest.chunkCount,'分片數');safeCount(manifest.recordCount,'資料筆數');
 return true;
}
