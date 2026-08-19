import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';

const APPEND_ONLY_COLLECTIONS=new Set(['changes']);
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const fingerprint=value=>value===undefined?'__undefined__':JSON.stringify(stable(value));

function mergeRecord(base,local,remote,path,conflicts){
 if(fingerprint(local)===fingerprint(base))return clone(remote);
 if(fingerprint(remote)===fingerprint(base)||fingerprint(local)===fingerprint(remote))return clone(local);
 if(!local||!remote||typeof local!=='object'||typeof remote!=='object'||Array.isArray(local)||Array.isArray(remote)){
  conflicts.push({path,local:clone(local),remote:clone(remote)});return clone(local);
 }
 const result={},keys=new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)]);
 for(const key of keys){
  const before=base?.[key],mine=local?.[key],theirs=remote?.[key],mineChanged=fingerprint(mine)!==fingerprint(before),theirsChanged=fingerprint(theirs)!==fingerprint(before);
  if(!mineChanged)result[key]=clone(theirs);
  else if(!theirsChanged||fingerprint(mine)===fingerprint(theirs))result[key]=clone(mine);
  else if(mine&&theirs&&typeof mine==='object'&&typeof theirs==='object'&&!Array.isArray(mine)&&!Array.isArray(theirs))result[key]=mergeRecord(before,mine,theirs,`${path}.${key}`,conflicts);
  else{conflicts.push({path:`${path}.${key}`,local:clone(mine),remote:clone(theirs)});result[key]=clone(mine)}
 }
 return result;
}

function mapRows(rows,collection){
 if(!Array.isArray(rows))throw new Error(`${collection} 必須是陣列`);
 const result=new Map();
 for(const row of rows){const id=String(row?.id??'');if(!id||result.has(id))throw new Error(`${collection} 包含缺少或重複 ID：${id||'—'}`);result.set(id,row)}
 return result;
}

function mergeCollection(baseRows,localRows,remoteRows,collection,conflicts){
 const base=mapRows(baseRows||[],collection),local=mapRows(localRows||[],collection),remote=mapRows(remoteRows||[],collection),result=[];
 for(const id of new Set([...remote.keys(),...local.keys(),...base.keys()])){
  const before=base.get(id),mine=local.get(id),theirs=remote.get(id),mineChanged=fingerprint(mine)!==fingerprint(before),theirsChanged=fingerprint(theirs)!==fingerprint(before);
  if(!mineChanged){if(theirs!==undefined)result.push(clone(theirs));continue}
  if(!theirsChanged||fingerprint(mine)===fingerprint(theirs)){if(mine!==undefined)result.push(clone(mine));continue}
  if(mine===undefined){conflicts.push({path:`${collection}.${id}:delete`,local:null,remote:clone(theirs)});result.push(clone(theirs));continue}
  if(theirs===undefined){conflicts.push({path:`${collection}.${id}:remote-delete`,local:clone(mine),remote:null});result.push(clone(mine));continue}
  result.push(mergeRecord(before,mine,theirs,`${collection}.${id}`,conflicts));
 }
 return result;
}

function mergeAppendOnly(baseRows=[],localRows=[],remoteRows=[]){
 const baseCounts=new Map(),result=[],resultCounts=new Map(),localCounts=new Map();
 for(const row of baseRows){const key=fingerprint(row);baseCounts.set(key,(baseCounts.get(key)||0)+1)}
 for(const row of remoteRows){const key=fingerprint(row);result.push(clone(row));resultCounts.set(key,(resultCounts.get(key)||0)+1)}
 for(const row of localRows){
  const key=fingerprint(row),seen=(localCounts.get(key)||0)+1;localCounts.set(key,seen);
  const target=Math.max(resultCounts.get(key)||0,seen,baseCounts.get(key)||0);
  if((resultCounts.get(key)||0)<target){result.push(clone(row));resultCounts.set(key,(resultCounts.get(key)||0)+1)}
 }
 return result;
}

export function mergeConcurrentRecordDb(baseDb={},localDb={},remoteDb={}){
 const merged=clone(remoteDb||{}),conflicts=[];
 for(const collection of FULL_RECORD_COLLECTIONS){
  merged[collection]=APPEND_ONLY_COLLECTIONS.has(collection)
   ?mergeAppendOnly(baseDb?.[collection]||[],localDb?.[collection]||[],remoteDb?.[collection]||[])
   :mergeCollection(baseDb?.[collection]||[],localDb?.[collection]||[],remoteDb?.[collection]||[],collection,conflicts);
 }
 for(const key of new Set([...Object.keys(baseDb||{}),...Object.keys(localDb||{}),...Object.keys(remoteDb||{})])){
  if(FULL_RECORD_COLLECTIONS.includes(key))continue;
  merged[key]=mergeRecord(baseDb?.[key],localDb?.[key],remoteDb?.[key],key,conflicts);
 }
 const unique=[];for(const conflict of conflicts)if(!unique.some(row=>row.path===conflict.path))unique.push(conflict);
 return{db:merged,conflicts:unique};
}

export function splitRecordConflicts(conflicts,maxChars=160000){
 if(!Array.isArray(conflicts)||!Number.isSafeInteger(maxChars)||maxChars<1000)throw new Error('衝突備份設定無效');
 const serialized=JSON.stringify(conflicts),parts=[];for(let offset=0;offset<serialized.length;offset+=maxChars)parts.push(serialized.slice(offset,offset+maxChars));return parts.length?parts:['[]'];
}
