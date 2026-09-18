import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createLessonReportClient} from '../js/core/lesson-report-client.js';
import {createTeacherReportHydrator} from '../js/core/teacher-report-hydrator.js';
const {saveLessonReport}=createRequire(import.meta.url)('../functions/lesson-report-runtime.cjs');
const identity={uid:'teacher-uid',email:'teacher@example.test',emailVerified:true,appVerified:true};
const input={lessonId:'lesson-1',operationId:'operation-1',expectedUpdatedAt:'',report:{status:'completed',content:'lesson content',homework:'homework',feedback:'feedback',note:'note'}};
function fixture({role='teacher',access={},meta={},current,actor=identity}={}){
 const rows=new Map([['companyAccess/'+actor.email,{active:true,companyId:'danbridge',role,teacherId:'teacher-1',branchIds:['branch-1'],...access}],['companies/danbridge/lessonMeta/lesson-1',{active:true,teacherIds:['teacher-1'],branchId:'branch-1',editableFrom:{toMillis:()=>1000},editableUntil:{toMillis:()=>3000},...meta}]]);
 if(current)rows.set('companies/danbridge/lessonReports/lesson-1',current);
 let count=0,time=2000;
 const firestore={doc:path=>({path}),runTransaction:async fn=>{const writes=[];const result=await fn({get:async ref=>{assert.equal(writes.length,0);return{exists:rows.has(ref.path),data:()=>rows.get(ref.path)}},set:(ref,data)=>writes.push([ref.path,data])});for(const [path,data]of writes){rows.set(path,data);count++}return result}};
 return{rows,get count(){return count},setTime:value=>time=value,run:(request=input,id=actor)=>saveLessonReport({firestore,identity:id,input:request,serverTimestamp:()=> 'server-time',now:()=>time})};
}
test('read-only branch cannot submit even its own lesson; explicit report revocation also blocks receipt replay',async()=>{
 const f=fixture({role:'branch_manager',access:{readOnly:true,canSubmitOwnReports:true}});
 assert.equal((await f.run({lessonId:'lesson-1',readOnly:true})).ok,true);
 await assert.rejects(f.run(),{code:'permission-denied'});assert.equal(f.count,0);
 const t=fixture();await t.run();const before=t.count;t.rows.get('companyAccess/'+identity.email).canSubmitOwnReports=false;
 await assert.rejects(t.run(),{code:'permission-denied'});assert.equal(t.count,before);
 const writable=fixture({role:'branch_manager',access:{readOnly:false,canSubmitOwnReports:true}});assert.equal((await writable.run()).ok,true);
 const owner=fixture({role:'owner',access:{readOnly:true,canSubmitOwnReports:false}});assert.equal((await owner.run()).ok,true);
});
test('batch reads are bounded, no writes, and each lesson is checked against live scope',async()=>{
 const f=fixture();await f.run();const count=f.count;
 const result=await f.run({readOnly:true,lessonIds:['lesson-1']});assert.equal(result.reports[0].report.content,input.report.content);assert.equal(f.count,count);
 for(const lessonIds of [[],Array.from({length:41},(_,i)=>'id-'+i),['lesson-1','lesson-1'],['../other']])await assert.rejects(f.run({readOnly:true,lessonIds}),{code:'invalid-argument'});
 f.rows.set('companies/danbridge/lessonMeta/foreign',{active:true,teacherIds:['foreign'],branchId:'branch-1'});
 await assert.rejects(f.run({readOnly:true,lessonIds:['lesson-1','foreign']}),{code:'permission-denied'});assert.equal(f.count,count);
});
test('hydrator batches at 40, caches reads, refreshes explicitly and never applies another actor response',async()=>{
 let actor='teacher-1';const batches=[],applied=[],errors=[];
 const reply=request=>({data:{ok:true,readOnly:true,reports:request.lessonIds.map(lessonId=>({ok:true,readOnly:true,lessonId,report:null}))}});
 const h=createTeacherReportHydrator({call:async request=>{batches.push(request.lessonIds);return reply(request)},getIdentity:()=>actor,apply:rows=>applied.push(rows),onError:e=>errors.push(e)});
 const settle=()=>new Promise(resolve=>setImmediate(resolve)),ids=Array.from({length:85},(_,i)=>'id-'+i);
 h.refresh(ids);await settle();assert.deepEqual(batches.map(x=>x.length),[40,40,5]);assert.equal(applied.flat().length,85);
 h.refresh(ids);await settle();assert.equal(batches.length,3);
 h.refresh(['id-0'],{force:true});await settle();assert.equal(batches.length,4);
 let resolve;const late=createTeacherReportHydrator({call:request=>new Promise(r=>{resolve=()=>r(reply(request))}),getIdentity:()=>actor,apply:()=>assert.fail('stale response'),onError:()=>assert.fail('stale error')});late.refresh(['lesson-1']);actor='other';resolve();await settle();assert.equal(errors.length,0);
});
test('hydrator mismatched results fail without caching or application and can retry',async()=>{
 let valid=false,count=0;const errors=[],rows=[];
 const h=createTeacherReportHydrator({call:async()=>{count++;return{data:{ok:true,readOnly:true,reports:[{ok:true,readOnly:true,lessonId:valid?'lesson-1':'foreign',report:null}]}}},getIdentity:()=> 'teacher',apply:r=>rows.push(r),onError:e=>errors.push(e)});
 h.refresh(['lesson-1']);await new Promise(r=>setImmediate(r));assert.equal(errors.length,1);assert.equal(rows.length,0);
 valid=true;h.refresh(['lesson-1']);await new Promise(r=>setImmediate(r));assert.equal(count,2);assert.equal(rows.length,1);
});
test('hydrator reset fences an in-flight old account and resumes the queued current account',async()=>{
 let actor='teacher-old';const pending=[],applied=[],errors=[];
 const h=createTeacherReportHydrator({call:request=>new Promise(resolve=>pending.push({request,resolve})),getIdentity:()=>actor,apply:rows=>applied.push(rows),onError:e=>errors.push(e)});
 const finish=entry=>entry.resolve({data:{ok:true,readOnly:true,reports:entry.request.lessonIds.map(lessonId=>({ok:true,readOnly:true,lessonId,report:null}))}});
 h.refresh(['old-lesson']);h.reset();actor='teacher-current';h.refresh(['current-lesson']);
 finish(pending[0]);await new Promise(r=>setImmediate(r));assert.equal(applied.length,0);assert.equal(pending.length,2);
 finish(pending[1]);await new Promise(r=>setImmediate(r));assert.deepEqual(applied.flat().map(x=>x.lessonId),['current-lesson']);assert.equal(errors.length,0);
 h.refresh(['current-lesson']);await new Promise(r=>setImmediate(r));assert.equal(pending.length,2);
});
test('hydrator preserves a forced queued refresh even when a later ordinary click coalesces it',async()=>{
 const pending=[],applied=[];const h=createTeacherReportHydrator({call:request=>new Promise(resolve=>pending.push({request,resolve})),getIdentity:()=> 'teacher',apply:rows=>applied.push(rows)});
 const finish=entry=>entry.resolve({data:{ok:true,readOnly:true,reports:entry.request.lessonIds.map(lessonId=>({ok:true,readOnly:true,lessonId,report:null}))}});
 h.refresh(['lesson-1']);h.refresh(['lesson-1'],{force:true});h.refresh(['lesson-1']);finish(pending[0]);await new Promise(r=>setImmediate(r));
 assert.equal(pending.length,2);finish(pending[1]);await new Promise(r=>setImmediate(r));assert.equal(applied.length,2);
});
for(const role of ['owner','teacher','branch_manager'])test(role+' commits exactly one report and supports lost-response replay',async()=>{
 const f=fixture({role});const result=await f.run();assert.equal(result.ok,true);assert.equal(result.report.teacherEmail,identity.email);assert.equal(result.report.branchId,'branch-1');assert.equal(f.count,2);
 f.setTime(4000);assert.equal((await f.run()).duplicate,true);assert.equal(f.count,2);
});
test('AA scheduler has no ability to forge another teacher report',async()=>{
 const f=fixture({access:{canManageSchedule:true,teacherId:'aa'}});await assert.rejects(f.run(),{code:'permission-denied'});assert.equal(f.count,0);
});
for(const access of [{active:false},{companyId:'other'},{role:'unknown'},{teacherId:'other'},{role:'branch_manager',branchIds:['other']}])test('live access failure rejects without writes '+JSON.stringify(access),async()=>{const f=fixture({access});await assert.rejects(f.run());assert.equal(f.count,0)});
test('revocation also prevents replay',async()=>{const f=fixture();await f.run();f.rows.get('companyAccess/'+identity.email).active=false;await assert.rejects(f.run(),{code:'permission-denied'});assert.equal(f.count,2)});
for(const meta of [{active:false},{teacherIds:[]},{teacherIds:['other']},{editableFrom:{toMillis:()=>2100}},{editableUntil:{toMillis:()=>1900}}])test('cancelled, foreign or non-current lesson rejected '+JSON.stringify(meta),async()=>{const f=fixture({meta});await assert.rejects(f.run());assert.equal(f.count,0)});
test('owner may report past lessons but still needs active metadata',async()=>{const f=fixture({role:'owner'});f.setTime(4000);assert.equal((await f.run()).ok,true)});
test('concurrent changes cannot silently overwrite',async()=>{const f=fixture();const first=await f.run();await assert.rejects(f.run({...input,operationId:'operation-2'}),{code:'aborted'});const second=await f.run({...input,operationId:'operation-2',expectedUpdatedAt:first.report.updatedAtClient,report:{...input.report,content:'second'}});assert.equal(second.report.content,'second');assert.equal(f.count,4)});
test('operation ID reuse with different input fails closed',async()=>{const f=fixture();await f.run();await assert.rejects(f.run({...input,report:{...input.report,note:'other'}}),{code:'already-exists'});assert.equal(f.count,2)});
for(const id of [{...identity,appVerified:false},{...identity,emailVerified:false},{...identity,uid:''}])test('requires authenticated verified email and App Check '+JSON.stringify(id),async()=>{const f=fixture();await assert.rejects(f.run(input,id),{code:'unauthenticated'});assert.equal(f.count,0)});
for(const change of [{lessonId:'../other'},{companyId:'other'},{report:{...input.report,teacherId:'forged'}},{report:{...input.report,content:'x'.repeat(20001)}},{report:{...input.report,status:'forged'}}])test('invalid input is rejected before data writes '+Object.keys(change),async()=>{const f=fixture();await assert.rejects(f.run({...input,...change}),{code:'invalid-argument'});assert.equal(f.count,0)});
test('client retries exact ID and does not accept mismatched or another account response',async()=>{
 const calls=[];let actor={uid:'1',email:'one'},fail=true;
 const save=createLessonReportClient({getIdentity:()=>actor,createId:()=> 'client-operation',call:async request=>{calls.push(request);if(fail)throw Error('401');return{data:{ok:true,operationId:request.operationId,lessonId:request.lessonId,report:{...request.report,lessonId:request.lessonId,updatedAtClient:'2026-09-15T00:00:00.000Z'}}}}});
 const {operationId,...request}=input;
 await assert.rejects(save(request));fail=false;assert.equal((await save(request)).content,input.report.content);assert.strictEqual(calls[0],calls[1]);
 const stale=createLessonReportClient({getIdentity:()=>actor,createId:()=> 'id',call:async()=>{actor={uid:'2',email:'two'};return{data:{ok:true}}}});await assert.rejects(stale(request),/身分已變更/);
 const invalid=createLessonReportClient({getIdentity:()=>actor,call:async()=>({data:{ok:true}}),createId:()=> 'id'});await assert.rejects(invalid(request),/核對失敗/);
});
test('production and staging guarded endpoints do not reopen browser Rules or overwrite unsaved forms',async()=>{
 const entry=await readFile('functions/index.cjs','utf8'),source=await readFile('js/core/firebase-auth-and-cloud-sync.module.js','utf8');
 assert.match(entry,/enforceAppCheck:true,consumeAppCheckToken:true/);assert.match(entry,/request.app.alreadyConsumed/);assert.match(entry,/exports.stagingSaveLessonReport/);assert.match(entry,/exports.productionSaveLessonReport/);
 const handler=source.slice(source.indexOf('async function saveTeacherReport'),source.indexOf('let classFocusLessonId'));
 assert.doesNotMatch(handler,/await setDoc/);assert.match(handler,/saveTrustedLessonReport/);assert.doesNotMatch(handler,/請部署本版本/);
 const listener=source.slice(source.indexOf('function subscribeLessonReports'),source.indexOf('function subscribeLessonReports')+2200);assert.match(listener,/if\(cloudRole==='teacher'\)return/);assert.doesNotMatch(listener,/setTimeout\(\(\)=>openTeacherReportModal/);assert.match(source,/lessonReportCall\(\{lessonId,readOnly:true\}\)/);
});
test('read-only uses exact trusted scope, returns missing report without a write, and ignores editing deadline',async()=>{const f=fixture();assert.equal((await f.run({lessonId:'lesson-1',readOnly:true})).report,null);assert.equal(f.count,0);await f.run();f.setTime(5000);assert.equal((await f.run({lessonId:'lesson-1',readOnly:true})).report.content,input.report.content);assert.equal(f.count,2);await assert.rejects(f.run({lessonId:'lesson-1',readOnly:true,companyId:'other'}),{code:'invalid-argument'})});
test('branch manager may read but not edit another teacher in their branch; foreign branch denied',async()=>{const f=fixture({role:'branch_manager',access:{teacherId:'different'}});assert.equal((await f.run({lessonId:'lesson-1',readOnly:true})).ok,true);await assert.rejects(f.run(),{code:'permission-denied'});f.rows.get('companyAccess/'+identity.email).branchIds=['other'];await assert.rejects(f.run({lessonId:'lesson-1',readOnly:true}),{code:'permission-denied'});assert.equal(f.count,0)});
