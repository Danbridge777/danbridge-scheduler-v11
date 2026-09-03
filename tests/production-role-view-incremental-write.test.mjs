import test from 'node:test';
import assert from 'node:assert/strict';
import {
 productionClientDataHash,
 productionLessonMetaNeedsWrite,
 productionRoleViewNeedsWrite
} from '../js/core/production-role-view-projection.js';

const db={branches:[],students:[],teachers:[],lessons:[{id:'lesson-1',teacherId:'teacher-1'}],makeups:[],changes:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[],companySettings:[],accessProfiles:[]};

test('全域來源 hash 改變但角色內容相同時不重寫整份角色視圖',()=>{
 const view={kind:'teacher',email:'teacher@example.com',teacherId:'teacher-1',db,clientHash:productionClientDataHash(db)};
 const current={email:view.email,teacherId:view.teacherId,db:structuredClone(db),clientHash:view.clientHash,sourceRecordHash:'record-v1:'+'1'.repeat(64)};
 assert.equal(productionRoleViewNeedsWrite(current,view),false);
 assert.equal(productionRoleViewNeedsWrite({...current,db:{...db,lessons:[]}},view),true);
 assert.equal(productionRoleViewNeedsWrite({...current,teacherId:'teacher-2'},view),true);
});

test('全域來源 hash 改變但課程權限內容相同時不重寫所有 lessonMeta',()=>{
 const payload={companyId:'danbridge',lessonId:'lesson-1',branchId:'branch-a',lessonDate:'2026-09-03',lessonStart:'10:00',lessonEnd:'11:00',studentId:'student-1',teacherIds:['teacher-1'],editableFrom:new Date('2026-09-02T16:00:00.000Z'),editableUntil:new Date('2026-09-03T15:59:59.999Z'),active:true};
 const current={...structuredClone(payload),editableFrom:{toMillis:()=>payload.editableFrom.getTime()},editableUntil:{toMillis:()=>payload.editableUntil.getTime()},sourceRecordHash:'record-v1:'+'1'.repeat(64)};
 assert.equal(productionLessonMetaNeedsWrite(current,payload),false);
 assert.equal(productionLessonMetaNeedsWrite({...current,teacherIds:['teacher-2']},payload),true);
});
