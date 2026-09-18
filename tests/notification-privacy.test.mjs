import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {sanitizeScheduleOnlyNotification:sanitize}=createRequire(import.meta.url)('../functions/notification-privacy.cjs');
const before={date:'2026-09-18',start:'09:00',end:'10:00',studentId:'s',teacherIds:['t'],branchId:'art_museum',title:'團課',note:'SECRET',address:'SECRET',rate:999,extra:'SECRET'};
const value={companyId:'danbridge',recipientEmail:'aa@example.test',recipientRole:'branch_manager',branchIds:['art_museum'],read:true,createdAt:123,acknowledgedAt:456,acknowledgedBy:'u',title:'SECRET',message:'SECRET',secret:'SECRET',details:[{type:'modified',lessonId:'l',studentName:'同學',before,after:{...before,start:'10:00',end:'11:00'},summary:'SECRET',extra:'SECRET'}]};
test('historical privacy conversion removes all unapproved nested fields while retaining schedule and read identity',()=>{
 const result=sanitize(value);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|999/);
 assert.equal(result.read,true);assert.equal(result.acknowledgedAt,456);assert.equal(result.createdAt,123);assert.equal(result.recipientEmail,value.recipientEmail);
 assert.equal(result.details[0].afterTime,'2026-09-18 10:00–11:00');assert.deepEqual(result.details[0].after.teacherIds,['t']);
 assert.deepEqual(sanitize(result),result);assert.equal(value.secret,'SECRET');
});
test('unknown, HR and foreign role payloads fail closed rather than guess',()=>{
 for(const change of [{recipientRole:'owner'},{companyId:'other'},{notificationType:'teacher-leave'},{details:[]},{details:[{...value.details[0],before:undefined}]},{details:[{...value.details[0],type:'unknown'}]}])assert.throws(()=>sanitize({...value,...change}));
});
