import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {assembleRoleViewChunks} from '../js/core/role-view-chunks.js';
const {planPublishedRoleChunks,stagePublishedRoleParts}=createRequire(import.meta.url)('../functions/published-role-chunk-plan.cjs');
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
const source={...empty(),students:[{id:'s1',name:'學生',rate:800,parentContact:'PRIVATE'}],teachers:[{id:'t1',name:'老師',rate:400}],lessons:Array.from({length:40},(_,i)=>({id:'l'+i,studentId:'s1',teacherId:'t1',date:'2026-10-01',start:'08:00',end:'09:00',branchId:i%2?'hexi':'art_museum',paymentStatus:'paid'}))};
const accessRows=[{email:'teacher@example.test',teacherId:'t1',role:'teacher',active:true,companyId:'danbridge'},{email:'aa0966626336@gmail.com',teacherId:'aa',role:'teacher',canManageSchedule:true,active:true,companyId:'danbridge'},{email:'branch@example.test',teacherId:'branch',role:'branch_manager',branchIds:['art_museum'],active:true,companyId:'danbridge'}];
const options={source,accessRows,sourceRevision:80,sourceHash:recordDataHash(source),release:'20.26.277',now:Date.parse('2026-09-11T00:00:00Z')},deleted=Object.freeze({testOnlyDeleteField:true}),deps={deleteField:()=>deleted};
test('compatibility heads and chunk readers receive identical current permission-filtered data',async()=>{
 const plan=await planPublishedRoleChunks({...options,preserveLegacyViews:true},async()=>({db:{lessons:[{id:'obsolete'}]},role:'teacher',active:true}),deps);
 for(const view of plan.views){
  const head=plan.headWrites.find(w=>w.path===view.headPath),db=assembleRoleViewChunks(view.manifest,plan.parts.filter(p=>p.value.scope===view.manifest.scope).map(p=>p.value),{identity:view.manifest.identity});
  const canonicalRows=value=>Object.fromEntries(Object.entries(value).map(([key,rows])=>[key,key==='changes'?rows:[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)))]));
  assert.deepEqual(canonicalRows(head.value[view.kind==='branch_manager'?'scopedDb':'db']),canonicalRows(db));
  assert.equal(head.value.role,undefined);assert.equal(head.value.active,undefined);
  if(view.kind!=='branch_manager'){assert.equal(db.students[0].rate,undefined);assert.equal(db.students[0].parentContact,undefined);assert.ok(db.lessons.every(l=>l.paymentStatus===undefined))}
 }
 const heads=new Map(plan.headWrites.map(w=>[w.path,w.value]));
 assert.equal((await planPublishedRoleChunks({...options,preserveLegacyViews:true},async p=>heads.get(p),deps)).writes.length,0);
 const changed={...source,lessons:source.lessons.map(row=>({...row,start:'10:00',end:'11:00'}))};
 const next=await planPublishedRoleChunks({...options,source:changed,sourceHash:recordDataHash(changed),sourceRevision:81,preserveLegacyViews:true},async p=>heads.get(p),deps);
 for(const view of next.views){const head=next.headWrites.find(w=>w.path===view.headPath);assert.ok(head.value[view.kind==='branch_manager'?'scopedDb':'db'].lessons.every(row=>row.start==='10:00'))}
});
test('compatibility repairs absent old field without changing authoritative generation',async()=>{
 const first=await planPublishedRoleChunks(options,async()=>null,deps),heads=new Map(first.headWrites.map(w=>[w.path,w.value]));
 const next=await planPublishedRoleChunks({...options,preserveLegacyViews:true},async p=>heads.get(p),deps);
 assert.equal(next.parts.length,0);assert.equal(next.headWrites.length,6);assert.ok(next.views.every(v=>v.manifest.sourceRevision===80));
});
test('oversized compatibility never silently deletes old data or changes permission scope',async()=>{
 const huge={...source,students:[{...source.students[0],name:'x'.repeat(810000)}]};
 await assert.rejects(planPublishedRoleChunks({...options,source:huge,sourceHash:recordDataHash(huge),preserveLegacyViews:true},async()=>null,deps),/compatibility exceeds safe document size/);
 await assert.rejects(planPublishedRoleChunks({...options,preserveLegacyViews:'yes'},async()=>null,deps),/compatibility mode/);
});
test('all role heads and immutable indexes share the exact authority generation',async()=>{
 const plan=await planPublishedRoleChunks(options,async()=>null,deps);assert.equal(plan.formalRecordWrites,0);assert.equal(plan.headWrites.length,6);assert.equal(plan.needsPreparation,false);
 for(const view of plan.views){const head=plan.headWrites.find(w=>w.path===view.headPath),parts=plan.parts.filter(p=>p.value.scope===view.manifest.scope).map(p=>p.value),db=assembleRoleViewChunks(view.manifest,parts,{identity:view.manifest.identity});assert.equal(head.merge,true);assert.equal(head.value.roleChunkManifest.digest,view.manifest.digest);assert.equal(view.manifest.sourceRevision,80);assert.equal(view.manifest.sourceHash,options.sourceHash);assert.equal(head.value[view.kind==='branch_manager'?'scopedDb':'db'],deleted);assert.equal(head.value.role,undefined);assert.equal(head.value.active,undefined);
  if(view.kind==='branch_manager'){assert.equal(db.lessons.length,20);assert.ok(db.lessons.every(l=>l.branchId==='art_museum'))}else{assert.equal(db.lessons.length,40);assert.equal(db.students[0].rate,undefined);assert.equal(db.students[0].parentContact,undefined);assert.equal(db.teachers[0].rate,undefined);assert.ok(db.lessons.every(l=>l.paymentStatus===undefined))}
 }
});
test('duplicate plan is empty; unchanged rows advance only paired heads',async()=>{const first=await planPublishedRoleChunks(options,async()=>null,deps),store=new Map(first.headWrites.map(w=>[w.path,w.value]));assert.equal((await planPublishedRoleChunks(options,async p=>store.get(p),deps)).writes.length,0);const next=await planPublishedRoleChunks({...options,sourceRevision:81},async p=>store.get(p),deps);assert.equal(next.parts.length,0);assert.equal(next.headWrites.length,6)});
test('unpublished preparation touches only content-addressed parts; final heads fit atomically',async()=>{
 const plan=await planPublishedRoleChunks({...options,reservedWrites:400},async()=>null,deps);assert.equal(plan.needsPreparation,true);
 const writes=[],store={doc:p=>p,batch:()=>({set:(p,v)=>writes.push({path:p,value:v}),commit:async()=>{}})},prepared=await stagePublishedRoleParts(store,plan);assert.ok(writes.length>0);assert.ok(writes.every(w=>w.path.includes('/parts/')));
 const final=await planPublishedRoleChunks({...options,reservedWrites:400,prepared},async()=>null,deps);assert.equal(final.parts.length,0);assert.equal(final.needsPreparation,false);assert.equal(final.writes.length,6);
 await assert.rejects(planPublishedRoleChunks({...options,sourceRevision:81,prepared},async()=>null,deps),e=>e.code===10);
 await assert.rejects(planPublishedRoleChunks({...options,accessRows:accessRows.map(a=>a.role==='branch_manager'?{...a,branchIds:['hexi']}:a),prepared},async()=>null,deps),e=>e.code===10);
});
test('invalid preparation part is rejected before any batch begins',async()=>{const plan=await planPublishedRoleChunks({...options,reservedWrites:400},async()=>null,deps);plan.parts.at(-1).value.payload='corrupt';let batches=0;await assert.rejects(stagePublishedRoleParts({batch(){batches++;throw Error('must not write')}},plan),/immutable/);assert.equal(batches,0)});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function largePreparation(){
 const db={...source,students:[...source.students,...Array.from({length:400},(_,i)=>({id:'capacity-'+i,name:'隔離學生'+i}))]};
 const plan=await planPublishedRoleChunks({...options,source:db,sourceHash:recordDataHash(db),reservedWrites:400},async()=>null,deps);
 assert.equal(plan.needsPreparation,true);assert.ok(plan.parts.length>125);return plan;
}
function controlledPreparationStore(){
 const pending=[],writes=[];let active=0,peak=0;
 const store={doc:path=>path,batch:()=>{
  const rows=[];
  return{set:(path,value)=>rows.push({path,value}),commit:()=>{
   assert.ok(rows.length<=25);writes.push(...rows);active++;peak=Math.max(peak,active);
   return new Promise((resolve,reject)=>pending.push({resolve:()=>{active--;resolve()},reject:error=>{active--;reject(error)}}));
  }};
 }};
 return{store,pending,writes,get active(){return active},get peak(){return peak}};
}
test('preparation uses at most four independent commits and returns only after all parts succeed',async()=>{
 const plan=await largePreparation(),control=controlledPreparationStore();let complete=false;
 const work=stagePublishedRoleParts(control.store,plan).then(value=>{complete=true;return value});
 assert.equal(control.active,4);assert.equal(complete,false);
 while(!complete){const batch=control.pending.splice(0);assert.ok(batch.length>0);batch.reverse().forEach(row=>row.resolve());await turn()}
 const prepared=await work;assert.equal(control.active,0);assert.equal(control.peak,4);
 assert.equal(control.writes.length,plan.parts.length);assert.deepEqual(prepared.paths,new Set(plan.parts.map(row=>row.path)));
 assert.ok(control.writes.every(row=>row.path.includes('/parts/')));
});
test('failed preparation stops new commits, drains in-flight work and never returns partial success',async()=>{
 const plan=await largePreparation(),control=controlledPreparationStore(),failure=Object.assign(Error('injected disconnect'),{code:14});let settled=false;
 const result=stagePublishedRoleParts(control.store,plan).then(value=>{settled=true;return{value}},error=>{settled=true;return{error}});
 const first=control.pending.splice(0);assert.equal(first.length,4);first[1].reject(failure);await turn();
 assert.equal(settled,false);assert.equal(control.active,3);assert.equal(control.pending.length,0);
 first[0].resolve();first[2].reject(Error('second failure'));await turn();assert.equal(settled,false);
 first[3].resolve();assert.equal((await result).error,failure);assert.equal(control.active,0);assert.equal(control.pending.length,0);
 assert.equal(control.writes.length,100,'only the initial four batches started');
 const retryWrites=[];
 const retry=await stagePublishedRoleParts({doc:path=>path,batch:()=>({set:(path,value)=>retryWrites.push({path,value}),commit:async()=>{}})},plan);
 assert.equal(retryWrites.length,plan.parts.length);assert.equal(retry.paths.size,new Set(plan.parts.map(row=>row.path)).size);
});
test('wrong authority, older generation, same-version conflict and head overflow cannot publish',async()=>{await assert.rejects(planPublishedRoleChunks({...options,sourceHash:'record-v1:'+'0'.repeat(64)},async()=>null,deps),/authority/);const first=await planPublishedRoleChunks(options,async()=>null,deps),store=new Map(first.headWrites.map(w=>[w.path,w.value]));await assert.rejects(planPublishedRoleChunks({...options,sourceRevision:79},async p=>store.get(p),deps),/older/);const changed={...source,lessons:source.lessons.slice(1)};await assert.rejects(planPublishedRoleChunks({...options,source:changed,sourceHash:recordDataHash(changed)},async p=>store.get(p),deps),/Conflicting/);await assert.rejects(planPublishedRoleChunks({...options,reservedWrites:449},async()=>null,deps),/budget/)});
test('authorized branch change and midnight report visibility advance publication, never source revision',async()=>{
 const first=await planPublishedRoleChunks(options,async()=>null,deps),store=new Map(first.headWrites.map(w=>[w.path,w.value]));
 const changed=await planPublishedRoleChunks({...options,accessRows:accessRows.map(a=>a.role==='branch_manager'?{...a,branchIds:['hexi']}:a)},async p=>store.get(p),deps);
 const branch=changed.views.find(v=>v.kind==='branch_manager');assert.equal(branch.manifest.sourceRevision,80);assert.equal(branch.manifest.publicationRevision,1);assert.notEqual(branch.manifest.scope,first.views.find(v=>v.kind==='branch_manager').manifest.scope);
 const reported={...source,lessons:[{...source.lessons[0],date:'2026-09-12',teacherReport:'下課紀錄',teacherReportUpdatedAt:'2026-09-11T00:00:00Z'}]},opts={...options,source:reported,sourceHash:recordDataHash(reported)};
 const before=await planPublishedRoleChunks(opts,async()=>null,deps),heads=new Map(before.headWrites.map(w=>[w.path,w.value]));
 const after=await planPublishedRoleChunks({...opts,now:Date.parse('2026-09-13T00:00:00Z')},async p=>heads.get(p),deps);
 assert.equal(after.views.find(v=>v.kind==='teacher').manifest.publicationRevision,1);
 for(const view of after.views)assert.equal(view.manifest.sourceRevision,80);
});
