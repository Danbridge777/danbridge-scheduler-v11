'use strict';
const {FieldPath}=require('@google-cloud/firestore');
const HISTORY='productionFullRecordShadows/danbridge/collections/changes/records';

// One reader belongs to one runtime/Firestore scope. Every warm read still
// queries the COMPLETE ID membership and native updateTime inside the current
// transaction. Only an identical document version may reuse its payload.
// This is not an authority/hash/access cache: callers must validate those fresh.
function createTransactionHistoryVersionReader({maxBytes=16*1024*1024,maxRecords=10000}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0||!Number.isSafeInteger(maxRecords)||maxRecords<0)throw Error('Invalid history cache budget');
 let cached=new Map(),ready=false;
 const versionEqual=(a,b)=>!!a?.updateTime&&!!b?.updateTime&&a.updateTime.isEqual(b.updateTime);
 const remember=docs=>{
  let bytes=0;const next=new Map();
  for(const row of docs){
   if(!row.exists||!row.updateTime||next.has(row.id))throw Error('Invalid history snapshot identity');
   bytes+=Buffer.byteLength(JSON.stringify(row.data()));
   if(bytes>maxBytes||docs.length>maxRecords){cached.clear();ready=false;return}
   next.set(row.id,row);
  }
  cached=next;ready=true;
 };
 return Object.freeze({async read(transaction,query){
  if(query.path!==HISTORY)throw Error('History reader received a foreign collection');
  if(!ready){const snapshot=await transaction.get(query);remember(snapshot.docs);return snapshot}
  const membership=await transaction.get(query.select(FieldPath.documentId()));
  const seen=new Set(),missing=[];
  for(const row of membership.docs){
   if(!row.exists||!row.updateTime||seen.has(row.id))throw Error('Invalid history membership');
   seen.add(row.id);if(!versionEqual(cached.get(row.id),row))missing.push(row);
  }
  // Freeze this run's references; overlapping reads cannot substitute a newer
  // cached body after we checked its timestamp.
  const selected=new Map(membership.docs.filter(row=>versionEqual(cached.get(row.id),row)).map(row=>[row.id,cached.get(row.id)]));
  for(let offset=0;offset<missing.length;offset+=400){
   const expected=missing.slice(offset,offset+400),rows=await transaction.getAll(...expected.map(row=>row.ref));
   if(rows.length!==expected.length)throw Error('Incomplete history version read');
   rows.forEach((row,index)=>{if(row.id!==expected[index].id||!row.exists||!versionEqual(row,expected[index]))throw Error('History version changed inside transaction');selected.set(row.id,row)});
  }
  const docs=membership.docs.map(row=>selected.get(row.id));
  remember(docs);return{docs,size:docs.length,empty:docs.length===0};
 }});
}
module.exports={createTransactionHistoryVersionReader};
