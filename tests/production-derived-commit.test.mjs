import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {commitProductionDerivedWrites}=createRequire(import.meta.url)('../functions/production-derived-commit.cjs');
const sourceHash='record-v1:'+'a'.repeat(64);
const safetyPath='companies/danbridge/productionRecordRuntime/safety';
const accessPath='companyAccess/teacher@example.com';
const member={email:'teacher@example.com',companyId:'danbridge',role:'teacher',active:true,teacherId:'teacher-1'};
function fixture(){
 const rows=new Map([[safetyPath,{state:'active',readAllowed:true,writeAllowed:true,recordDataHash:sourceHash}],[accessPath,member]]),committed=[];let active=0,maxActive=0;
 const snapshot=path=>({ref:{path},exists:rows.has(path),data:()=>structuredClone(rows.get(path))});
 const firestore={doc:path=>({path}),async runTransaction(callback){active++;maxActive=Math.max(maxActive,active);const pending=[];try{await callback({getAll:async(...refs)=>refs.map(ref=>snapshot(ref.path)),set:(ref,value)=>pending.push({type:'set',path:ref.path,value}),delete:ref=>pending.push({type:'delete',path:ref.path})});committed.push(...pending)}finally{active--}}};
 return{rows,committed,firestore,snapshot,maxActive:()=>maxActive};
}
const writes=n=>Array.from({length:n},(_,i)=>({type:'set',ref:{path:`derived/${i}`},value:{id:i}}));
test('每批衍生更新在同一交易確認目前權威 head 與角色身分，並限制並行數',async()=>{
 const f=fixture();assert.equal(await commitProductionDerivedWrites(f.firestore,writes(1300),{sourceHash,accessSnapshots:[f.snapshot(accessPath)]}),1300);assert.equal(f.committed.length,1300);assert.ok(f.maxActive()<=3);
});
test('延遲舊發布、中央暫停與撤銷角色都在任何寫入前拒絕',async()=>{
 for(const change of ['head','pause','role','removed']){
  const f=fixture(),access=f.snapshot(accessPath),savedAccess={...access,data:()=>structuredClone(member)};
  if(change==='head')f.rows.get(safetyPath).recordDataHash='record-v1:'+'b'.repeat(64);
  if(change==='pause')f.rows.get(safetyPath).writeAllowed=false;
  if(change==='role')f.rows.set(accessPath,{...member,teacherId:'teacher-2'});
  if(change==='removed')f.rows.delete(accessPath);
  await assert.rejects(commitProductionDerivedWrites(f.firestore,writes(1),{sourceHash,accessSnapshots:[savedAccess]}),/未寫入舊視圖/);assert.equal(f.committed.length,0);
 }
});
test('缺少來源版本不可啟動衍生資料交易',async()=>{const f=fixture();await assert.rejects(commitProductionDerivedWrites(f.firestore,writes(1)),/有效權威版本/);assert.equal(f.committed.length,0)});
