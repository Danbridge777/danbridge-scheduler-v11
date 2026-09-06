import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js?v=20.26.248';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value);

export function normalizeRecordDb(db,{cloneRecords=true}={}){
 const expected=new Set(FULL_RECORD_COLLECTIONS),unknown=Object.keys(db??{}).filter(key=>!expected.has(key));
 if(unknown.length)throw new Error(`逐筆雜湊包含未知集合：${unknown.join('、')}`);
 const materialized=materializeFullRecordDb(db,{cloneRecords}),normalized={};
 for(const collection of FULL_RECORD_COLLECTIONS){
  const rows=materialized[collection];
  // Safe callers receive the single detached clone made during materialization;
  // trusted server callers may deliberately retain the verified authority
  // references. Either path avoids a redundant second full-database clone.
  normalized[collection]=(collection==='changes'?rows:[...rows].sort((a,b)=>a.recordId.localeCompare(b.recordId))).map(row=>row.record);
 }
 return normalized;
}

export function recordDataDigest(db){
 return sha256Canonical(canonical(normalizeRecordDb(db)));
}

export function recordDataHash(db){
 return`record-v1:${recordDataDigest(db)}`;
}
