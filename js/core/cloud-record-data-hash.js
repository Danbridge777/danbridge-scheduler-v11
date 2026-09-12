import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js?v=20.26.317';
import {sha256Canonical,sha256Text,canonicalJSONString} from './cloud-immutable-migration-backup.js';
import {changeRecordCanonicalFingerprint} from './cloud-change-record-identity.js';


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
 // Integrity hashes never contain the generated history document IDs. Keep
 // strict lossless history validation, but reuse its canonical bytes instead
 // of generating unused FNV IDs, cloning and canonicalizing history again.
 // No body, hash, or validation result survives this call.
 const changes=db?.changes;
 if(!Array.isArray(changes))return sha256Canonical(normalizeRecordDb(db));
 // Preserve the historical normalizer's behavior for sparse outer arrays.
 for(let i=0;i<changes.length;i++)if(!(i in changes))return sha256Canonical(normalizeRecordDb(db));
 const normalized=normalizeRecordDb({...db,changes:[]});
 const history='['+[...changes].reverse().map(changeRecordCanonicalFingerprint).join(',')+']';
 return sha256Text('{'+Object.keys(normalized).sort().map(key=>JSON.stringify(key)+':'+(key==='changes'?history:canonicalJSONString(normalized[key]))).join(',')+'}');
}

export function recordDataHash(db){
 return`record-v1:${recordDataDigest(db)}`;
}
