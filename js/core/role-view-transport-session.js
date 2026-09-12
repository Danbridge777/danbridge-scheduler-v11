import {normalizeRoleRecordViewIdentity} from './cloud-role-record-view.js';
import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {assembleRoleViewChunks,prepareRoleViewChunks,canonicalRoleChunkDigest,freezeRoleViewChunk} from './role-view-chunks.js';

const HASH=/^[a-f0-9]{64}$/;
const SCHEMAS=new Set(['danbridge-role-chunks-experiment-v1','danbridge-role-chunks-experiment-v2','danbridge-role-chunks-experiment-v3']);
const size=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const compareGeneration=(a,b)=>!b?1:a.sourceRevision-b.sourceRevision||(a.publicationRevision??0)-(b.publicationRevision??0);
const assertGeneration=(next,previous)=>{
 if(!previous)return;
 if(compareGeneration(next,previous)<0)throw Error('Role head moved backwards');
 if(next.sourceRevision===previous.sourceRevision&&next.sourceHash!==previous.sourceHash)throw Error('Conflicting role authority');
 if(compareGeneration(next,previous)===0&&next.digest!==previous.digest)throw Error('Conflicting role generation');
};
// One authenticated role session. Never persist this cache across accounts.
// The legacy head is still the subscription and permission boundary. A new
// writer may add roleChunkManifest; until then the existing reader is unchanged.
export function createRoleViewTransportSession({identity,readCurrentHead,readPart,readParts=null,isActive,apply,onState=()=>{},maxCacheBytes=16*1024*1024,maxSnapshotBytes=64*1024*1024,maxConcurrentReads=12}){
 const expected=normalizeRoleRecordViewIdentity(identity),scope=sha256Canonical(expected);
 if([readCurrentHead,readPart,isActive,apply,onState].some(fn=>typeof fn!=='function')||!Number.isSafeInteger(maxCacheBytes)||maxCacheBytes<0||maxCacheBytes>64*1024*1024||!Number.isSafeInteger(maxSnapshotBytes)||maxSnapshotBytes<1||maxSnapshotBytes>64*1024*1024)throw Error('Invalid role transport dependencies');
 if(!Number.isSafeInteger(maxConcurrentReads)||maxConcurrentReads<1||maxConcurrentReads>16)throw Error('Invalid role transport concurrency');
 if(readParts!==null&&typeof readParts!=='function')throw Error('Invalid role batch reader');
 let closed=false,generation=0,revision=-1,appliedDigest='',announced=-1,chunkMode=false,cacheBytes=0;
 let announcedManifest=null,appliedManifest=null;
 const cache=new Map();
 const active=token=>!closed&&token===generation&&isActive();
 const validate=head=>{
  const manifest=head?.roleChunkManifest,{digest,...body}=manifest||{};
  if(!SCHEMAS.has(body.schema)||!HASH.test(digest||'')||size(manifest)>256*1024||sha256Canonical(body)!==digest||body.scope!==scope||sha256Canonical(normalizeRoleRecordViewIdentity(body.identity))!==scope)throw Error('Role manifest identity or integrity mismatch');
  if(!Number.isSafeInteger(body.sourceRevision)||body.sourceRevision<0||!/^record-v1:[a-f0-9]{64}$/.test(body.sourceHash||'')||head.sourceRecordRevision!==body.sourceRevision||head.sourceRecordHash!==body.sourceHash)throw Error('Role source fence mismatch');
  if(!Number.isSafeInteger(body.publicationRevision??0)||(body.publicationRevision??0)<0)throw Error('Invalid role publication revision');
  if(!Array.isArray(body.chunkIds)||body.chunkIds.length>4096||body.chunkIds.some(id=>typeof id!=='string'||!HASH.test(id))||new Set(body.chunkIds).size!==body.chunkIds.length||!Array.isArray(body.groups)||body.groups.length>4096)throw Error('Invalid role chunk index');
  if(!body.counts||Object.keys(body.counts).sort().join()!==[...FULL_RECORD_COLLECTIONS].sort().join()||Object.values(body.counts).some(n=>!Number.isSafeInteger(n)||n<0||n>300000))throw Error('Invalid role collection counts');
  const ids=[];for(const group of body.groups){if(!FULL_RECORD_COLLECTIONS.includes(group?.collection)||!Array.isArray(group.parts)||group.parts.length>4096)throw Error('Invalid role group');ids.push(...group.parts)}
  if(JSON.stringify(ids)!==JSON.stringify(body.chunkIds))throw Error('Role group index mismatch');
  return manifest;
 };
 const remember=chunks=>{for(const chunk of chunks){if(cache.has(chunk.id))continue;const bytes=size(chunk)+(chunk.decodedBytes||0);if(bytes>maxCacheBytes)continue;while(cacheBytes+bytes>maxCacheBytes){const id=cache.keys().next().value;cacheBytes-=cache.get(id).bytes;cache.delete(id)}cache.set(chunk.id,{chunk:freezeRoleViewChunk(chunk),bytes});cacheBytes+=bytes}};
 return Object.freeze({
  invalidate(){closed=true;generation++;cache.clear();cacheBytes=0},
  diagnostics(){return{closed,chunkMode,revision,announced,cacheBytes,cacheCount:cache.size}},
  async receive(head){
   if(closed||!isActive())throw Error('Role access revoked');
   let token=generation;
   if(!Object.hasOwn(head||{},'roleChunkManifest')){
    if(chunkMode){generation++;onState({state:'blocked',error:'Role transport downgrade requires a new verified session'});throw Error('Role transport downgrade requires a new verified session')}
    return{state:'legacy'};
   }
   chunkMode=true;let manifest;
   try{
    manifest=validate(head);
    if(compareGeneration(manifest,announcedManifest)<0)return{state:'superseded'};
    token=++generation;
    assertGeneration(manifest,announcedManifest);
    announcedManifest=manifest;announced=manifest.sourceRevision;onState({state:'loading',revision:announced});
    for(let attempt=0;attempt<3;attempt++){
     const current=await readCurrentHead();if(!active(token))return{state:'superseded'};
     manifest=validate(current);
     assertGeneration(manifest,announcedManifest);assertGeneration(manifest,appliedManifest);
     announcedManifest=manifest;announced=manifest.sourceRevision;
     if(manifest.sourceRevision===revision&&manifest.digest===appliedDigest){
      const latest=validate(await readCurrentHead());if(!active(token))return{state:'superseded'};
      assertGeneration(latest,appliedManifest);
      if(latest.digest!==appliedDigest)continue;
      onState({state:'ready',revision});return{state:'unchanged',revision};
     }
     const chunks=new Array(manifest.chunkIds.length);let next=0,readError,totalBytes=0;
     const accept=(index,chunk)=>{const id=manifest.chunkIds[index];if(chunk?.id!==id||chunk.scope!==scope||size(chunk)>200*1024||canonicalRoleChunkDigest(chunk)!==id)throw Error('Role chunk integrity mismatch');const decodedBytes=chunk.schema==='danbridge-role-chunks-experiment-v3'?chunk.decodedBytes:typeof chunk.payload==='string'?new TextEncoder().encode(chunk.payload).length:NaN;if(!Number.isSafeInteger(decodedBytes)||decodedBytes<1||decodedBytes>160*1024)throw Error('Invalid decoded role chunk size');totalBytes+=decodedBytes;if(totalBytes>maxSnapshotBytes)throw Error('Role snapshot exceeds memory budget');chunks[index]=chunk};
     const batchSize=readParts?16:1,workers=readParts?Math.min(4,maxConcurrentReads):maxConcurrentReads;
     try{await Promise.all(Array.from({length:Math.min(workers,Math.ceil(chunks.length/batchSize))},async()=>{
      try{while(next<chunks.length&&active(token)&&!readError){
       const first=next;next+=batchSize;const indices=[],ids=[];
       for(let index=first;index<Math.min(first+batchSize,chunks.length);index++){const id=manifest.chunkIds[index],cached=cache.get(id)?.chunk;if(cached)accept(index,cached);else{indices.push(index);ids.push(id)}}
       if(!ids.length)continue;
       const result=readParts?await readParts(ids,scope):[await readPart(ids[0],scope)];
       if(!active(token))return;if(!Array.isArray(result)||result.length!==ids.length)throw Error('Role batch result count mismatch');
       indices.forEach((index,position)=>accept(index,result[position]));
      }}catch(error){readError=readError||error}
     }));if(!active(token))return{state:'superseded'};if(readError)throw readError;await prepareRoleViewChunks(chunks)}catch(error){readError=error}
     if(!active(token))return{state:'superseded'};
     const latest=validate(await readCurrentHead());if(!active(token))return{state:'superseded'};
     assertGeneration(latest,manifest);
     if(latest.digest!==manifest.digest)continue;
     if(readError)throw readError;
     const db=assembleRoleViewChunks(manifest,chunks,{identity:expected,minSourceRevision:Math.max(0,revision)});
     if(!active(token))return{state:'superseded'};
     await apply(db,{sourceRecordRevision:manifest.sourceRevision,sourceRecordHash:manifest.sourceHash});
     if(!active(token))return{state:'superseded'};
     remember(chunks);appliedManifest=manifest;revision=manifest.sourceRevision;appliedDigest=manifest.digest;onState({state:'ready',revision});return{state:'applied',revision};
    }
    throw Error('Role head changed repeatedly; keep last complete view and retry');
   }catch(error){if(active(token)){generation++;onState({state:'blocked',error:String(error.message||error)})}throw error}
  }
 });
}
