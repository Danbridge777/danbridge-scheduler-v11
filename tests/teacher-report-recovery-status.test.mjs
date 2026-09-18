import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTeacherReportHydrator} from '../js/core/teacher-report-hydrator.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const reply=request=>({data:{ok:true,readOnly:true,reports:request.lessonIds.map(lessonId=>({ok:true,readOnly:true,lessonId,report:null}))}});
test('failed hydration clears its error only after a verified retry, not cached no-op',async()=>{
 let fail=true,success=0,errors=0;
 const h=createTeacherReportHydrator({call:async r=>{if(fail)throw Error('network');return reply(r)},getIdentity:()=> 't',apply(){},onError(){errors++},onSuccess(){success++}});
 h.refresh(['a']);await settle();assert.equal(errors,1);assert.equal(success,0);
 fail=false;h.refresh(['a']);await settle();assert.equal(success,1);
 h.refresh(['a']);await settle();assert.equal(success,1);
});
test('partial failure and stale identity do not emit recovery success',async()=>{
 let calls=0,success=0,actor='t',finish;
 const h=createTeacherReportHydrator({call:async r=>{if(++calls===2)throw Error('second batch');return reply(r)},getIdentity:()=>actor,apply(){},onError(){},onSuccess(){success++}});
 h.refresh(Array.from({length:41},(_,i)=>String(i)));await settle();assert.equal(success,0);
 const late=createTeacherReportHydrator({call:r=>new Promise(resolve=>{finish=()=>resolve(reply(r))}),getIdentity:()=>actor,apply(){assert.fail('stale apply')},onSuccess(){success++}});
 late.refresh(['a']);actor='other';finish();await settle();assert.equal(success,0);
});
test('page recovery does not hide an unrelated write failure',()=>{
 const source=readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
 assert.match(source,/status\?\.dataset\.kind==='error'&&status\.textContent\.startsWith\('課程回報核對未完成，'\)/);
});
