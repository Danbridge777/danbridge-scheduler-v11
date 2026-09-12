import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';

const SCHEMA='danbridge-owner-draft-v1';
const clone=value=>structuredClone(value);
// Stored separately from the operation journal: this preserves intent even
// when planning or pre-write backup fails before an operation can be enqueued.
export function createOwnerDraftStore({storage,scope}={}){
 if(!storage?.load||!storage?.save||!storage?.exclusive||typeof scope!=='string'||!scope.trim())throw Error('Owner draft storage scope missing');
 let loaded=false,expectedRevision=0,tail=Promise.resolve();
 const validate=row=>{
  if(row==null)return null;
  if(row.schema!==SCHEMA||row.scope!==scope||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Owner draft storage identity mismatch');
  if(row.draft!==null){const d=row.draft;if(!d||!['production','staging'].includes(d.environment)||typeof d.activationEpoch!=='string'||!d.activationEpoch||!Number.isSafeInteger(d.mutationVersion)||d.mutationVersion<0||FULL_RECORD_COLLECTIONS.some(key=>!Array.isArray(d.baselineDb?.[key])||!Array.isArray(d.localDb?.[key])))throw Error('Owner draft payload invalid')}
  return row;
 };
 const exclusive=work=>{const next=tail.then(()=>storage.exclusive(work));tail=next.catch(()=>{});return next};
 const read=async()=>validate(await storage.load());
 const write=draft=>exclusive(async()=>{
  const old=await read(),revision=old?.revision||0;
  if(!loaded){loaded=true;expectedRevision=revision}
  if(revision!==expectedRevision)throw Error('Owner draft changed in another window; preserved without overwrite');
  const next={schema:SCHEMA,scope,revision:revision+1,draft};validate(next);
  await storage.save(next);expectedRevision=next.revision;return clone(draft);
 });
 return{
  load:()=>exclusive(async()=>{const row=await read();if(loaded&&(row?.revision||0)!==expectedRevision)throw Error('Owner draft changed in another window; preserved without overwrite');loaded=true;expectedRevision=row?.revision||0;return clone(row?.draft??null)}),
  save:draft=>write(clone(draft)),
  // Keep a revision tombstone so stale windows cannot recreate an old draft.
  clear:()=>write(null)
 };
}
