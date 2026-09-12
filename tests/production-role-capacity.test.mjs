import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {readProductionRoleCapacity}=createRequire(import.meta.url)('../functions/production-role-capacity.cjs');
function fixture(rows,heads){
 const paths=[],filters=[];let limit;
 const query={where(...args){filters.push(args);return query},limit(n){limit=n;return query},async get(){return{docs:rows.map(([id,data])=>({id,ref:{path:'companyAccess/'+id},data:()=>data}))}}};
 const db={collection(path){assert.equal(path,'companyAccess');return query},doc:path=>({path}),async getAll(...refs){paths.push(...refs.map(x=>x.path));return refs.map(ref=>({data:()=>heads[ref.path]}))}};
 return{run:()=>readProductionRoleCapacity(db),paths,filters,get limit(){return limit}};
}
test('only active exact role paths; no archive inventory or personal data returned',async()=>{
 const t={roleChunkManifest:{digest:'test'},db:{lessons:[{name:'PRIVATE',parent:'PRIVATE'}]}},b={active:true,role:'branch_manager',roleChunkManifest:{digest:'b'},scopedDb:{lessons:[]}};
 const f=fixture([['aa@example.test',{role:'teacher',canManageSchedule:true}],['teacher@example.test',{role:'teacher'}],['branch@example.test',b],['owner@example.test',{role:'owner'}]],{'companies/danbridge/schedulerViews/aa@example.test':t,'companies/danbridge/teacherViews/teacher@example.test':t,'companyAccess/branch@example.test':b});
 const result=await f.run();assert.equal(result.roleCount,3);assert.equal(result.maximumBytes,Math.max(Buffer.byteLength(JSON.stringify(t)),Buffer.byteLength(JSON.stringify(b)))+2048);assert.equal(result.budgetBytes,800000);assert.equal(result.truncated,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|example.test/);assert.deepEqual(f.filters,[['companyId','==','danbridge'],['active','==',true]]);assert.equal(f.limit,101);assert.equal(f.paths.length,3);
});
test('empty, missing or already chunk-only heads are not counted as compatible payloads',async()=>{
 assert.equal((await fixture([],{}).run()).roleCount,0);
 const f=fixture([['one',{role:'teacher'}],['two',{role:'teacher'}]],{'companies/danbridge/teacherViews/two':{roleChunkManifest:{digest:'test'}}});assert.equal((await f.run()).maximumBytes,0);
});
test('bounded sample marks incompleteness instead of reporting a complete capacity audit',async()=>{const rows=Array.from({length:101},(_,i)=>['t'+i,{role:'teacher'}]),f=fixture(rows,{});assert.equal((await f.run()).truncated,true);assert.equal(f.paths.length,100)});
