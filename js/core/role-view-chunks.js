// Immutable role transport. Activated only by an authenticated server manifest.
// Apply an assembled snapshot only after ALL chunks and the current access
// identity have been verified. Firestore authorization remains mandatory.
import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {normalizeRoleRecordViewIdentity} from './cloud-role-record-view.js';

const SCHEMA='danbridge-role-chunks-experiment-v1';
const STABLE_SCHEMA='danbridge-role-chunks-experiment-v2';
const ENCODED_SCHEMA='danbridge-role-chunks-experiment-v3';
const LIMIT=160*1024,MANIFEST_LIMIT=256*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const bytes=value=>encoder.encode(value).length;
const digest=value=>sha256Canonical(value);
const identityHash=value=>digest(normalizeRoleRecordViewIdentity(value));
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const immutableChunkDigests=new WeakMap();
const decodedChunks=new WeakMap();
export function freezeRoleViewChunk(chunk){
 if(canonicalRoleChunkDigest(chunk)!==chunk.id)throw new Error('Invalid immutable chunk');
 const frozen=Object.freeze({...chunk}),decoded=decodedChunks.get(chunk);
 if(decoded?.id===frozen.id)decodedChunks.set(frozen,decoded);
 return frozen;
}
export async function prepareRoleViewChunks(chunks){
 let next=0;
 await Promise.all(Array.from({length:Math.min(6,chunks.length)},async()=>{while(next<chunks.length){
  const chunk=chunks[next++];if(chunk?.schema!==ENCODED_SCHEMA)continue;
  if(canonicalRoleChunkDigest(chunk)!==chunk.id||!['json','gzip-base64'].includes(chunk.encoding)||!Number.isSafeInteger(chunk.decodedBytes)||chunk.decodedBytes<1||chunk.decodedBytes>LIMIT||typeof chunk.payload!=='string'||bytes(chunk.payload)>LIMIT)throw new Error('Invalid encoded role chunk');
  if(decodedChunks.get(chunk)?.id===chunk.id)continue;
  const id=chunk.id,size=chunk.decodedBytes,payload=chunk.payload;let text;
  if(chunk.encoding==='json')text=payload;
  else{
   if(typeof DecompressionStream!=='function'||payload.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload))throw new Error('Unsupported or malformed role encoding');
   const binary=atob(payload),input=Uint8Array.from(binary,c=>c.charCodeAt(0));
   const reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let total=0;
   try{while(true){const result=await reader.read();if(result.done)break;total+=result.value.byteLength;if(total>size||total>LIMIT){await reader.cancel();throw new Error('Decoded role chunk exceeds bound')}parts.push(result.value)}}finally{reader.releaseLock()}
   if(total!==size)throw new Error('Decoded role chunk size mismatch');
   const output=new Uint8Array(total);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.byteLength}text=decoder.decode(output);
  }
  if(bytes(text)!==size)throw new Error('Decoded role chunk size mismatch');
  if(chunk.id!==id||canonicalRoleChunkDigest(chunk)!==id)throw new Error('Encoded role chunk changed during decoding');
  decodedChunks.set(chunk,{id,text});
 }}));
}
function payloadOf(chunk){
 if(chunk.schema!==ENCODED_SCHEMA)return chunk.payload;
 const decoded=decodedChunks.get(chunk);if(!decoded||decoded.id!==chunk.id)throw new Error('Encoded role chunk must be verified and decoded first');return decoded.text;
}
// Memoize only actually immutable flat data objects, never getters or shallow
// frozen objects containing mutable children. The first digest is always real.
export function canonicalRoleChunkDigest(chunk){
 if(!chunk||typeof chunk!=='object')throw new Error('Invalid chunk');
 const immutable=Object.getPrototypeOf(chunk)===Object.prototype&&Object.isFrozen(chunk)&&Object.values(Object.getOwnPropertyDescriptors(chunk)).every(d=>Object.hasOwn(d,'value')&&(d.value===null||['string','number','boolean','undefined'].includes(typeof d.value)));
 if(immutable&&immutableChunkDigests.has(chunk))return immutableChunkDigests.get(chunk);
 const {id,...body}=chunk,result=digest(body);if(immutable)immutableChunkDigests.set(chunk,result);return result;
}
function jsonData(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){for(const item of value)jsonData(item);return}
 if(value&&Object.getPrototypeOf(value)===Object.prototype){for(const item of Object.values(value))jsonData(item);return}
 throw new Error('Non-JSON role data must be normalized before transport');
}
function splitText(text,limit){
 // Input is JSON.stringify output, hence well-formed Unicode. Each UTF-16
 // code unit needs at most three UTF-8 bytes (a surrogate pair needs four
 // bytes for two units). This conservative bound proves a whole payload fits
 // without allocating and decoding another byte array. Larger text keeps the
 // exact existing UTF-8 boundary logic below.
 if(text.length<=Math.floor(limit/3))return[text];
 const encoded=encoder.encode(text),parts=[];let start=0;
 while(start<encoded.length){let end=Math.min(start+limit,encoded.length);
  // Never split a UTF-8 continuation byte. Fatal decoding catches corruption.
  if(end<encoded.length)while((encoded[end]&0xc0)===0x80)end--;
  parts.push(decoder.decode(encoded.subarray(start,end)));start=end;
 }return parts;
}
function bucketOf(key,count=16){let hash=2166136261;for(let n=0;n<key.length;n++){hash^=key.charCodeAt(n);hash=Math.imul(hash,16777619)}return(hash>>>0)%count}
export function buildRoleViewChunks(db,{identity,sourceRevision,sourceHash,publicationRevision=0,chunkBytes=LIMIT,hashCanonical=sha256Canonical,stableRecords=false,encodePayload=null}={}){
 if(typeof hashCanonical!=='function')throw new Error('Invalid canonical hasher');
 if(typeof stableRecords!=='boolean')throw new Error('Invalid stable record layout');
 if(encodePayload!==null&&(typeof encodePayload!=='function'||!stableRecords))throw new Error('Invalid role payload encoder');
 const bucketCount=stableRecords?256:16,schema=encodePayload?ENCODED_SCHEMA:stableRecords?STABLE_SCHEMA:SCHEMA;
 if(!Number.isSafeInteger(sourceRevision)||sourceRevision<0||!/^record-v1:[a-f0-9]{64}$/.test(sourceHash||''))throw new Error('Invalid source fence');
 if(!Number.isSafeInteger(publicationRevision)||publicationRevision<0)throw new Error('Invalid publication revision');
 if(!Number.isSafeInteger(chunkBytes)||chunkBytes<256||chunkBytes>LIMIT)throw new Error('Invalid chunk budget');
 if(Object.keys(db).some(key=>!FULL_RECORD_COLLECTIONS.includes(key)))throw new Error('Unknown collection');
 jsonData(db);
 const scope=identityHash(identity),chunks=[],groups=[];
 for(const collection of FULL_RECORD_COLLECTIONS){
  if(!Array.isArray(db[collection]))throw new Error('Incomplete role snapshot');
  const buckets=Array.from({length:bucketCount},()=>[]),ids=new Set();
  const sourceRows=stableRecords&&collection!=='changes'?[...db[collection]].sort((a,b)=>String(a?.id||'').localeCompare(String(b?.id||''))):db[collection];
  sourceRows.forEach((row,index)=>{
   if(!row||Array.isArray(row)||typeof row!=='object')throw new Error('Invalid role row');
   const stableIndex=stableRecords&&collection==='changes'?sourceRows.length-1-index:index;
   const key=collection==='changes'?String(stableIndex):String(row.id||'');
   if(!key||ids.has(key))throw new Error('Missing or duplicate record ID');ids.add(key);
   buckets[bucketOf(key,bucketCount)].push(stableRecords&&collection!=='changes'?{row}:{index:stableIndex,row});
  });
  buckets.forEach((rows,bucket)=>{
   if(!rows.length)return;
   const parts=splitText(JSON.stringify(rows),chunkBytes),references=[];
   parts.forEach((payload,part)=>{
    const encoded=encodePayload?encodePayload(payload):null;
    if(encodePayload&&(!encoded||!['json','gzip-base64'].includes(encoded.encoding)||encoded.decodedBytes!==bytes(payload)||typeof encoded.payload!=='string'||bytes(encoded.payload)>LIMIT))throw new Error('Invalid encoded role payload');
    const chunk={schema,scope,collection,bucket,part,...(encoded?{encoding:encoded.encoding,decodedBytes:encoded.decodedBytes,payload:encoded.payload}:{payload})};
    const id=hashCanonical(chunk);chunks.push({id,...chunk});references.push(id);
   });
   groups.push({collection,bucket,count:rows.length,parts:references});
  });
 }
 const manifest={schema,...(stableRecords?{ordering:'record-id',bucketCount}:{}),scope,identity:normalizeRoleRecordViewIdentity(identity),sourceRevision,sourceHash,publicationRevision,counts:Object.fromEntries(FULL_RECORD_COLLECTIONS.map(c=>[c,db[c].length])),groups,chunkIds:chunks.map(chunk=>chunk.id)};
 if(bytes(JSON.stringify(manifest))>MANIFEST_LIMIT)throw new Error('Manifest capacity exceeded; no partial publication');
 return {manifest:{...manifest,digest:hashCanonical(manifest)},chunks};
}
export function assembleRoleViewChunks(manifest,chunks,{identity,minSourceRevision=0,expectedSourceHash}={}){
 const {digest:expectedDigest,...core}=manifest||{};
 const stableRecords=[STABLE_SCHEMA,ENCODED_SCHEMA].includes(core.schema),bucketCount=stableRecords?256:16;
 if(![SCHEMA,STABLE_SCHEMA,ENCODED_SCHEMA].includes(core.schema)||(stableRecords&&(core.ordering!=='record-id'||core.bucketCount!==256))||!validHash(expectedDigest)||digest(core)!==expectedDigest||core.scope!==identityHash(identity)||identityHash(core.identity)!==core.scope)throw new Error('Manifest scope or integrity mismatch');
 if(!Number.isSafeInteger(core.sourceRevision)||core.sourceRevision<minSourceRevision||!/^record-v1:[a-f0-9]{64}$/.test(core.sourceHash||'')||(expectedSourceHash&&core.sourceHash!==expectedSourceHash))throw new Error('Stale or different source revision');
 if(!Number.isSafeInteger(core.publicationRevision??0)||(core.publicationRevision??0)<0)throw new Error('Invalid publication revision');
 if(!Array.isArray(core.groups)||!core.counts||Object.keys(core.counts).sort().join()!==[...FULL_RECORD_COLLECTIONS].sort().join()||bytes(JSON.stringify(core))>MANIFEST_LIMIT)throw new Error('Invalid manifest');
 const byId=new Map();for(const chunk of chunks){if(byId.has(chunk.id))throw new Error('Duplicate chunk');byId.set(chunk.id,chunk)}
 const db=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(c=>[c,[]])),seenGroups=new Set(),used=new Set();
 for(const group of core.groups){
  const {collection,bucket,count,parts}=group,key=collection+':'+bucket;
  if(!FULL_RECORD_COLLECTIONS.includes(collection)||!Number.isInteger(bucket)||bucket<0||bucket>=bucketCount||seenGroups.has(key)||!Number.isSafeInteger(count)||count<1||!Array.isArray(parts)||!parts.length)throw new Error('Invalid group');seenGroups.add(key);
  let text='';parts.forEach((id,part)=>{
   const chunk=byId.get(id);if(!validHash(id)||!chunk||used.has(id))throw new Error('Missing or repeated chunk');
   const {id:storedId,...body}=chunk;
   if(storedId!==id||canonicalRoleChunkDigest(chunk)!==id||body.schema!==core.schema||body.scope!==core.scope||body.collection!==collection||body.bucket!==bucket||body.part!==part||typeof body.payload!=='string'||bytes(body.payload)>LIMIT)throw new Error('Chunk scope or integrity mismatch');
   used.add(id);text+=payloadOf(chunk);
  });
  const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length!==count)throw new Error('Row count mismatch');
  for(const entry of rows){
   if(stableRecords&&collection!=='changes'){
    if(!entry||Object.hasOwn(entry,'index')||bucketOf(String(entry.row?.id||''),bucketCount)!==bucket)throw new Error('Row bucket mismatch');db[collection].push(entry.row);
   }else{
    const index=stableRecords?core.counts[collection]-1-entry?.index:entry?.index;
    if(!entry||!Number.isSafeInteger(entry.index)||!Number.isSafeInteger(index)||index<0||index>=core.counts[collection]||Object.hasOwn(db[collection],index))throw new Error('Row order mismatch');if(bucketOf(collection==='changes'?String(entry.index):String(entry.row?.id||''),bucketCount)!==bucket)throw new Error('Row bucket mismatch');db[collection][index]=entry.row;
   }
  }
 }
 if(used.size!==byId.size||JSON.stringify([...used])!==JSON.stringify(core.chunkIds))throw new Error('Unexpected chunk');
 for(const collection of FULL_RECORD_COLLECTIONS){const count=core.counts[collection];if(!Number.isSafeInteger(count)||count<0||db[collection].length!==count||Object.keys(db[collection]).length!==count)throw new Error('Incomplete collection')}
 // Validate materialized rows without serializing/hashing the entire snapshot
 // again: each immutable part was already verified above.
 jsonData(db);
 if(stableRecords)for(const collection of FULL_RECORD_COLLECTIONS)if(collection!=='changes')db[collection].sort((a,b)=>String(a?.id||'').localeCompare(String(b?.id||'')));
 for(const collection of FULL_RECORD_COLLECTIONS){const ids=new Set();for(const row of db[collection]){if(!row||Array.isArray(row)||typeof row!=='object')throw new Error('Invalid role row');if(collection==='changes')continue;const id=String(row.id||'');if(!id||ids.has(id))throw new Error('Missing or duplicate record ID');ids.add(id)}}
 return db;
}
