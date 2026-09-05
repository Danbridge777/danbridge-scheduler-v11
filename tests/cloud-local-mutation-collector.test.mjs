import test from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalMutationProofIntegrity,collectLocalMutationProof,LOCAL_MUTATION_BULK_REASONS,LOCAL_MUTATION_PROOF_HASH_SCOPE,LOCAL_MUTATION_PROOF_SCHEMA} from '../js/core/cloud-local-mutation-collector.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const CAPACITY_COUNT=Number(process.env.DANBRIDGE_V2_CAPACITY_COUNT??15_000);
if(![15_000,22_000,30_000].includes(CAPACITY_COUNT))throw new Error('DANBRIDGE_V2_CAPACITY_COUNT must be 15000, 22000, or 30000');

const collections=['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
const clone=value=>structuredClone(value);
const empty=()=>Object.fromEntries(collections.map(key=>[key,[]]));
const key=(collection,recordId)=>({collection,recordId});
const audit=auditId=>({collection:'changes',kind:'audit-append',auditId});
function input({before=empty(),pre=before,after=pre,declared=[],housekeeping=[],bulkReason=''}={}){return{beforeDb:before,preHousekeepingDb:pre,afterDb:after,declaredChangedKeys:declared,reportedHousekeepingKeys:housekeeping,bulkReason}}
function auditRow(options={}){const lessonId=options.lessonId||'lesson-1',has=key=>Object.prototype.hasOwnProperty.call(options,key),before=has('before')?options.before:{id:lessonId,value:0},after=has('after')?options.after:{id:lessonId,value:1};return{id:options.id||'audit-1',at:options.at||'2026-08-17T01:02:03.000Z',type:options.type||'修改課程',lessonId,studentId:has('studentId')?options.studentId:(after?.studentId||before?.studentId||''),actorName:options.actorName??'Daniel',actorEmail:options.actorEmail??'daniel@example.com',before,after,...(options.undoOfChangeId?{undoOfChangeId:options.undoOfChangeId}:{}),...(options.historyAction?{historyAction:options.historyAction}:{})}}

test('單堂修改與 dedicated audit append 形成 daily M2，audit 依 chronological 次序輸出',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',room:'A'}];before.changes=[{id:'audit-old',type:'create'}];
 const pre=clone(before);pre.lessons[0].room='B';pre.changes.unshift(auditRow({id:'audit-new',before:{id:'lesson-1',room:'A'},after:{id:'lesson-1',room:'B'}}));
 const proof=collectLocalMutationProof(input({before,pre,after:pre,declared:[key('lessons','lesson-1'),audit('audit-new')]}));
 assert.equal(proof.state,'ready');assert.equal(proof.route,'daily');assert.equal(proof.M,2);assert.deepEqual(proof.recordKeys,[key('lessons','lesson-1')]);assert.deepEqual(proof.auditAppends.map(row=>row.auditId),['audit-new']);assert.match(proof.beforeHash,/^record-v1:[a-f0-9]{64}$/);assert.notEqual(proof.beforeHash,proof.afterHash);
});

test('lesson、makeup、audit 與 housekeeping settlement key 全部收齊',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',status:'未上課'}];before.makeups=[{id:'makeup-1',status:'pending'}];before.settlementRecords=[{id:'2026-08::all',adjustments:[]}];
 const pre=clone(before);pre.lessons[0].status='學生請假';pre.makeups[0].status='scheduled';pre.changes.unshift(auditRow({before:{id:'lesson-1',status:'未上課'},after:{id:'lesson-1',status:'學生請假'}}));
 const after=clone(pre);after.settlementRecords[0].adjustments.push({id:'adj-1'});
 const proof=collectLocalMutationProof(input({before,pre,after,declared:[key('lessons','lesson-1'),key('makeups','makeup-1'),audit('audit-1')],housekeeping:[key('settlementRecords','2026-08::all')]}));
 assert.equal(proof.M,4);assert.equal(proof.route,'daily');assert.deepEqual(proof.recordKeys,[key('lessons','lesson-1'),key('makeups','makeup-1'),key('settlementRecords','2026-08::all')]);
});

test('漏報、多報與 housekeeping 漏報都 fail closed',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',value:0}];before.makeups=[{id:'makeup-1',value:0}];before.settlementRecords=[{id:'month-1',value:0}];
 const pre=clone(before);pre.lessons[0].value=1;pre.makeups[0].value=1;const after=clone(pre);after.settlementRecords[0].value=1;
 assert.throws(()=>collectLocalMutationProof(input({before,pre,after,declared:[key('lessons','lesson-1')],housekeeping:[key('settlementRecords','month-1')]})),/declaredChangedKeys.*missing.*makeups\/makeup-1/);
 assert.throws(()=>collectLocalMutationProof(input({before,pre:before,after:before,declared:[key('lessons','lesson-1')]})),/declaredChangedKeys.*extra.*lessons\/lesson-1/);
 assert.throws(()=>collectLocalMutationProof(input({before,pre,after,declared:[key('lessons','lesson-1'),key('makeups','makeup-1')]})),/reportedHousekeepingKeys.*missing.*settlementRecords\/month-1/);
});

test('changes 只允許 newest-first prefix append，修改、刪除、重排與錯誤 audit intent 全拒絕',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',value:0}];before.changes=[{id:'audit-2',value:2},{id:'audit-1',value:1}];
 const appended=clone(before);appended.lessons[0].value=1;appended.changes.unshift(auditRow({id:'audit-3'}));
 assert.equal(collectLocalMutationProof(input({before,pre:appended,after:appended,declared:[key('lessons','lesson-1'),audit('audit-3')]})).M,2);
 assert.throws(()=>collectLocalMutationProof(input({before,pre:appended,after:appended,declared:[key('lessons','lesson-1')]})),/audit append intent 不完整/);
 const collision=clone(before);collision.lessons[0].value=1;collision.changes.unshift(auditRow({id:'audit-2'}));assert.throws(()=>collectLocalMutationProof(input({before,pre:collision,after:collision,declared:[key('lessons','lesson-1'),audit('audit-2')]})),/auditId 重複/);
 for(const changed of [
  [{id:'audit-2',value:99},{id:'audit-1',value:1}],
  [{id:'audit-2',value:2}],
  [{id:'audit-1',value:1},{id:'audit-2',value:2}]
 ]){const pre=clone(before);pre.changes=changed;assert.throws(()=>collectLocalMutationProof(input({before,pre,after:pre})),/changes 只允許/)}
 const housekeeping=clone(before);housekeeping.changes.unshift({id:'audit-housekeeping',value:1});assert.throws(()=>collectLocalMutationProof(input({before,pre:before,after:housekeeping})),/housekeeping 禁止修改 changes/);
 const legacy=empty();legacy.lessons=[{id:'lesson-1',value:0}];legacy.changes=[{type:'duplicate legacy'},{type:'duplicate legacy'}];const legacyAppend=clone(legacy);legacyAppend.lessons[0].value=1;legacyAppend.changes.unshift(auditRow({id:'audit-new'}));assert.equal(collectLocalMutationProof(input({before:legacy,pre:legacyAppend,after:legacyAppend,declared:[key('lessons','lesson-1'),audit('audit-new')]})).M,2);
 const legacyDistinct=empty();legacyDistinct.changes=[{type:'newer'},{type:'older'}];
 for(const changed of [[{type:'changed'},{type:'older'}],[{type:'newer'}],[{type:'older'},{type:'newer'}]]){const pre=clone(legacyDistinct);pre.changes=changed;assert.throws(()=>collectLocalMutationProof(input({before:legacyDistinct,pre,after:pre})),/changes 只允許/)}
});

test('M90 走 daily；M91 與任何 requested bulk intent 都只能 blocked/bulk-required',()=>{
 const fixture=count=>{const before=empty(),pre=empty(),declared=[];for(let index=0;index<count;index++){const id=`student-${index}`;before.students.push({id,value:0});pre.students.push({id,value:1});declared.push(key('students',id))}return{before,pre,declared}};
 const atLimit=fixture(90),overLimit=fixture(91);
 assert.equal(collectLocalMutationProof(input({...atLimit,after:atLimit.pre})).route,'daily');
 const blocked=collectLocalMutationProof(input({...overLimit,after:overLimit.pre}));assert.equal(blocked.state,'blocked');assert.equal(blocked.route,'bulk-required');assert.equal(blocked.M,91);
 const bulk=collectLocalMutationProof(input({...overLimit,after:overLimit.pre,bulkReason:'batch-edit'}));assert.equal(bulk.state,'blocked');assert.equal(bulk.route,'bulk-required');assert.equal(bulk.M,91);assert.equal(bulk.requestedBulkReason,'batch-edit');assert.deepEqual(bulk.detectedBulkReasons,['daily-limit-exceeded']);
 const two=fixture(2),requestedSmall=collectLocalMutationProof(input({...two,after:two.pre,bulkReason:'batch-edit'}));assert.equal(requestedSmall.state,'blocked');assert.equal(requestedSmall.route,'bulk-required');assert.equal(requestedSmall.requestedBulkReason,'batch-edit');
 assert.throws(()=>collectLocalMutationProof(input({...overLimit,after:overLimit.pre,bulkReason:'anything'})),/bulkReason 無效/);assert.ok(LOCAL_MUTATION_BULK_REASONS.includes('normalization-migration'));
 assert.throws(()=>collectLocalMutationProof({...input(),maxChanges:99}),/欄位無效/);
});

test('normalization 新增、刪 ID 或 merge 一律只產生 blocked bulk-required 證據',()=>{
 const before=empty();before.students=[{id:'student-1',name:'A'},{id:'student-2',name:'A'}];const pre=clone(before),after=clone(pre);after.students=[{id:'student-1',name:'A'}];
 const blocked=collectLocalMutationProof(input({before,pre,after,housekeeping:[key('students','student-2')]}));assert.equal(blocked.route,'bulk-required');assert.equal(blocked.M,1);
 const bulk=collectLocalMutationProof(input({before,pre,after,housekeeping:[key('students','student-2')],bulkReason:'normalization-migration'}));assert.equal(bulk.state,'blocked');assert.equal(bulk.route,'bulk-required');assert.equal(bulk.recordKeys.length,1);assert.deepEqual(bulk.detectedBulkReasons,['normalization-migration']);assert.equal(bulk.detectedFacts.normalizationMigration,true);
 const renamed=clone(pre);renamed.students=[{id:'student-new',name:'A'},{id:'student-2',name:'A'}];assert.equal(collectLocalMutationProof(input({before,pre,after:renamed,housekeeping:[key('students','student-1'),key('students','student-new')]})).route,'bulk-required');
});

test('strict 16 collections、lossless JSON、duplicate ID 與 invalid key 全部 fail closed',()=>{
 const missing=empty();delete missing.branches;assert.throws(()=>collectLocalMutationProof(input({before:missing,pre:missing,after:missing})),/欄位無效/);
 const unknown=empty();unknown.other=[];assert.throws(()=>collectLocalMutationProof(input({before:unknown,pre:unknown,after:unknown})),/欄位無效/);
 const duplicate=empty();duplicate.lessons=[{id:'same'},{id:'same'}];assert.throws(()=>collectLocalMutationProof(input({before:duplicate,pre:duplicate,after:duplicate})),/duplicate id/);
 const invalid=empty();invalid.lessons=[{id:'bad/id'}];assert.throws(()=>collectLocalMutationProof(input({before:invalid,pre:invalid,after:invalid})),/record id 無效/);
 const nonfinite=empty();nonfinite.lessons=[{id:'lesson-1',value:NaN}];assert.throws(()=>collectLocalMutationProof(input({before:nonfinite,pre:nonfinite,after:nonfinite})),/finite number/);
 const sparse=empty();sparse.lessons=Array(1);assert.throws(()=>collectLocalMutationProof(input({before:sparse,pre:sparse,after:sparse})),/sparse array hole/);
 const accessorIntent=input();Object.defineProperty(accessorIntent.declaredChangedKeys,'hidden',{get(){return'not-json'}});assert.throws(()=>collectLocalMutationProof(accessorIntent),/JSON 不會保存的欄位/);
 assert.throws(()=>collectLocalMutationProof(input({declared:[{collection:'lessons',recordId:'lesson-1',extra:true}]})),/欄位無效/);
});

test(`1k、5k、10k、${CAPACITY_COUNT} 的相同單筆變更都維持同一 M 與 recordKeys`,()=>{
 for(const total of [1000,5000,10000,CAPACITY_COUNT]){
  const before=empty();before.lessons=Array.from({length:total},(_,index)=>({id:`lesson-${index}`,value:index}));const pre=clone(before),beforeLesson=clone(pre.lessons[432]);pre.lessons[432].value='changed';pre.changes.unshift(auditRow({id:'audit-scale',lessonId:'lesson-432',before:beforeLesson,after:clone(pre.lessons[432])}));
  const proof=collectLocalMutationProof(input({before,pre,after:pre,declared:[key('lessons','lesson-432'),audit('audit-scale')]}));
  assert.equal(proof.route,'daily');assert.equal(proof.M,2);assert.deepEqual(proof.recordKeys,[key('lessons','lesson-432')]);
 }
});

test('collector 不 mutate input，proof 深度凍結且與來源完全脫鉤',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',nested:{value:0}}];const pre=clone(before);pre.lessons[0].nested.value=1;pre.changes.unshift(auditRow({before:clone(before.lessons[0]),after:clone(pre.lessons[0])}));const source=input({before,pre,after:pre,declared:[key('lessons','lesson-1'),audit('audit-1')]}),snapshot=clone(source),proof=collectLocalMutationProof(source);
 assert.deepEqual(source,snapshot);assert.ok(Object.isFrozen(proof));assert.ok(Object.isFrozen(proof.recordKeys));assert.ok(Object.isFrozen(proof.recordKeys[0]));assert.throws(()=>{proof.recordKeys[0].recordId='changed'},TypeError);assert.equal(source.declaredChangedKeys[0].recordId,'lesson-1');
});

test('record key 使用 locale-independent raw 排序，Unicode 反序輸入產生完全相同 proof',()=>{
 const composed='é',decomposed='e\u0301',build=reversed=>{const before=empty(),pre=empty(),ids=reversed?[composed,decomposed]:[decomposed,composed];before.lessons=ids.map(id=>({id,value:0}));pre.lessons=ids.map(id=>({id,value:1}));pre.changes=[auditRow({id:'audit-composed',lessonId:composed,before:{id:composed,value:0},after:{id:composed,value:1}}),auditRow({id:'audit-decomposed',lessonId:decomposed,before:{id:decomposed,value:0},after:{id:decomposed,value:1}})];return input({before,pre,after:pre,declared:[...ids.map(id=>key('lessons',id)),audit('audit-composed'),audit('audit-decomposed')]})};
 assert.deepEqual(collectLocalMutationProof(build(false)),collectLocalMutationProof(build(true)));
});

test('M0 即使帶 valid bulkReason 仍是 ready noop，不建立空 bulk intent',()=>{
 const proof=collectLocalMutationProof(input({bulkReason:'batch-edit'}));assert.equal(proof.M,0);assert.equal(proof.state,'ready');assert.equal(proof.route,'noop');assert.equal(proof.requestedBulkReason,'batch-edit');
});

test('create、update、delete lesson 都要求完整 current logChange audit schema',()=>{
 const cases=[
  {kind:'create',beforeLesson:null,afterLesson:{id:'lesson-1',value:1}},
  {kind:'update',beforeLesson:{id:'lesson-1',value:0},afterLesson:{id:'lesson-1',value:1}},
  {kind:'delete',beforeLesson:{id:'lesson-1',value:0},afterLesson:null}
 ];
 for(const fixture of cases){
  const before=empty(),pre=empty();if(fixture.beforeLesson)before.lessons=[clone(fixture.beforeLesson)];if(fixture.afterLesson)pre.lessons=[clone(fixture.afterLesson)];pre.changes=[auditRow({id:`audit-${fixture.kind}`,type:`${fixture.kind} lesson`,before:fixture.beforeLesson,after:fixture.afterLesson})];
  const proof=collectLocalMutationProof(input({before,pre,after:pre,declared:[key('lessons','lesson-1'),audit(`audit-${fixture.kind}`)]}));assert.equal(proof.M,2);assert.equal(proof.route,'daily');
 }
});

test('lesson mutation 無 audit、audit 指錯 lesson、minimal row、actor/time/identity 無效都 fail closed',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',teacherReportStatus:'pending'},{id:'lesson-2',value:0}];const changed=clone(before);changed.lessons[0].teacherReportStatus='completed';
 assert.throws(()=>collectLocalMutationProof(input({before,pre:changed,after:changed,declared:[key('lessons','lesson-1')]})),/缺少.*audit/);
 const wrong=clone(changed);wrong.changes=[auditRow({id:'audit-wrong',lessonId:'lesson-2'})];assert.throws(()=>collectLocalMutationProof(input({before,pre:wrong,after:wrong,declared:[key('lessons','lesson-1'),audit('audit-wrong')]})),/未實際變更的 lesson/);
 const invalidRows=[
  {id:'audit-minimal'},
  auditRow({id:'audit-email',actorEmail:'Daniel@Example.com'}),
  auditRow({id:'audit-time',at:'2026-08-17T01:02:03Z'}),
  auditRow({id:'audit-actor',actorName:' '}),
  auditRow({id:'audit-identity',before:{id:'lesson-other'},after:{id:'lesson-1'}})
 ];
 for(const row of invalidRows){const pre=clone(changed);pre.changes=[row];assert.throws(()=>collectLocalMutationProof(input({before,pre,after:pre,declared:[key('lessons','lesson-1'),audit(row.id)]})),/欄位無效|schema 無效|before.*lessonId/)}
});

test('business lesson 多筆 audit 必須形成 chronological 完整 chain，fake extra、斷鏈、反序、錯首尾全拒絕',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',title:'A'}];const pre=clone(before);pre.lessons[0].title='B';
 const middle={id:'lesson-1',title:'M'},step1=auditRow({id:'audit-step-1',before:clone(before.lessons[0]),after:middle}),step2=auditRow({id:'audit-step-2',before:middle,after:clone(pre.lessons[0])}),valid=clone(pre);valid.changes=[step2,step1];assert.equal(collectLocalMutationProof(input({before,pre:valid,after:valid,declared:[key('lessons','lesson-1'),audit('audit-step-1'),audit('audit-step-2')]})).M,3);
 const exact=auditRow({id:'audit-exact',before:clone(before.lessons[0]),after:clone(pre.lessons[0])}),extra=auditRow({id:'audit-extra',before:{id:'lesson-1',title:'intermediate-A'},after:{id:'lesson-1',title:'intermediate-B'}}),fakeExtra=clone(pre);fakeExtra.changes=[extra,exact];assert.throws(()=>collectLocalMutationProof(input({before,pre:fakeExtra,after:fakeExtra,declared:[key('lessons','lesson-1'),audit('audit-extra'),audit('audit-exact')]})),/audit chain.*斷裂/);
 const broken=clone(pre);broken.changes=[auditRow({id:'audit-broken-2',before:{id:'lesson-1',title:'X'},after:clone(pre.lessons[0])}),step1];assert.throws(()=>collectLocalMutationProof(input({before,pre:broken,after:broken,declared:[key('lessons','lesson-1'),audit('audit-step-1'),audit('audit-broken-2')]})),/audit chain.*斷裂/);
 const reversed=clone(pre);reversed.changes=[step1,step2];assert.throws(()=>collectLocalMutationProof(input({before,pre:reversed,after:reversed,declared:[key('lessons','lesson-1'),audit('audit-step-1'),audit('audit-step-2')]})),/audit chain 起點/);
 const wrongStart=clone(pre);wrongStart.changes=[auditRow({id:'audit-wrong-start',before:{id:'lesson-1',title:'FAKE-BEFORE'},after:clone(pre.lessons[0])})];assert.throws(()=>collectLocalMutationProof(input({before,pre:wrongStart,after:wrongStart,declared:[key('lessons','lesson-1'),audit('audit-wrong-start')]})),/audit chain 起點/);
 const wrongEnd=clone(pre);wrongEnd.changes=[auditRow({id:'audit-wrong-end',before:clone(before.lessons[0]),after:{id:'lesson-1',title:'FAKE-AFTER'}})];assert.throws(()=>collectLocalMutationProof(input({before,pre:wrongEnd,after:wrongEnd,declared:[key('lessons','lesson-1'),audit('audit-wrong-end')]})),/audit chain 終點/);
 const createBefore=empty(),createAfter=empty();createAfter.lessons=[{id:'lesson-1',title:'new'}];createAfter.changes=[auditRow({id:'audit-create-reversed',before:{id:'lesson-1',title:'new'},after:null})];assert.throws(()=>collectLocalMutationProof(input({before:createBefore,pre:createAfter,after:createAfter,declared:[key('lessons','lesson-1'),audit('audit-create-reversed')]})),/audit chain 起點/);
 const deleteBefore=empty();deleteBefore.lessons=[{id:'lesson-1',title:'old'}];const deleteAfter=empty();deleteAfter.changes=[auditRow({id:'audit-delete-reversed',before:null,after:{id:'lesson-1',title:'old'}})];assert.throws(()=>collectLocalMutationProof(input({before:deleteBefore,pre:deleteAfter,after:deleteAfter,declared:[key('lessons','lesson-1'),audit('audit-delete-reversed')]})),/audit chain 起點/);
});

test('audit studentId 精確遵守 after-first logChange 規則，支援改學生與空學生並拒絕錯 studentId',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',studentId:'student-old'}];const pre=clone(before);pre.lessons[0].studentId='student-new';pre.changes=[auditRow({id:'audit-student',studentId:'student-new',before:clone(before.lessons[0]),after:clone(pre.lessons[0])})];assert.equal(collectLocalMutationProof(input({before,pre,after:pre,declared:[key('lessons','lesson-1'),audit('audit-student')]})).route,'daily');
 const emptyStudentBefore=empty();emptyStudentBefore.lessons=[{id:'lesson-1',title:'A'}];const emptyStudentAfter=clone(emptyStudentBefore);emptyStudentAfter.lessons[0].title='B';emptyStudentAfter.changes=[auditRow({id:'audit-empty-student',studentId:'',before:clone(emptyStudentBefore.lessons[0]),after:clone(emptyStudentAfter.lessons[0])})];assert.equal(collectLocalMutationProof(input({before:emptyStudentBefore,pre:emptyStudentAfter,after:emptyStudentAfter,declared:[key('lessons','lesson-1'),audit('audit-empty-student')]})).route,'daily');
 const wrong=clone(pre);wrong.changes=[auditRow({id:'audit-wrong-student',studentId:'student-old',before:clone(before.lessons[0]),after:clone(pre.lessons[0])})];assert.throws(()=>collectLocalMutationProof(input({before,pre:wrong,after:wrong,declared:[key('lessons','lesson-1'),audit('audit-wrong-student')]})),/studentId/);
});

test('phase cancellation 與 housekeeping-only lesson audit 都 fail closed',()=>{
 const before=empty();before.lessons=[{id:'lesson-1',title:'A'}];const pre=clone(before);pre.lessons[0].title='B';pre.changes=[auditRow({id:'audit-cancel',before:clone(before.lessons[0]),after:clone(pre.lessons[0])})];const after=clone(pre);after.lessons[0].title='A';assert.throws(()=>collectLocalMutationProof(input({before,pre,after,declared:[key('lessons','lesson-1'),audit('audit-cancel')],housekeeping:[key('lessons','lesson-1')]})),/actual changed keys/);
 const housekeepingBefore=empty();housekeepingBefore.lessons=[{id:'lesson-1',title:'A'}];const housekeepingPre=clone(housekeepingBefore);housekeepingPre.changes=[auditRow({id:'audit-housekeeping-only',before:clone(housekeepingBefore.lessons[0]),after:{id:'lesson-1',title:'B'}})];const housekeepingAfter=clone(housekeepingPre);housekeepingAfter.lessons[0].title='B';assert.throws(()=>collectLocalMutationProof(input({before:housekeepingBefore,pre:housekeepingPre,after:housekeepingAfter,declared:[audit('audit-housekeeping-only')],housekeeping:[key('lessons','lesson-1')]})),/businessDiff lesson/);
});

test('proof schema/hash deterministic；tamper 會被 integrity verifier 拒絕，重算只代表完整性而非授權',()=>{
 const before=empty();before.students=[{id:'student-1',value:0}];const pre=clone(before);pre.students[0].value=1;const source=input({before,pre,after:pre,declared:[key('students','student-1')]}),first=collectLocalMutationProof(source),second=collectLocalMutationProof(clone(source));
 assert.equal(first.schema,LOCAL_MUTATION_PROOF_SCHEMA);assert.equal(first.hashScope,LOCAL_MUTATION_PROOF_HASH_SCOPE);assert.equal(first.proofHash,second.proofHash);assert.deepEqual(assertLocalMutationProofIntegrity(first),first);
 const tampered=clone(first);tampered.M=99;assert.throws(()=>assertLocalMutationProofIntegrity(tampered),/canonical hash 不符/);
 const recomputed=clone(first);recomputed.state='blocked';delete recomputed.proofHash;recomputed.proofHash=sha256Canonical(recomputed);assert.equal(assertLocalMutationProofIntegrity(recomputed).state,'blocked');assert.match(recomputed.hashScope,/not-authorization/);
 const reorder=value=>Array.isArray(value)?value.map(reorder):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value),reordered=reorder(first);assert.equal(assertLocalMutationProofIntegrity(reordered).proofHash,first.proofHash);
});
