import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/core/data-persistence.js',import.meta.url),'utf8');
const keys=['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampClasses','winterCampRegistrations','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
function runtime(){const app={window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},studentDefaults:s=>s,normalizeCampCode:s=>s,isCanonicalLessonId:()=>true,localDate:d=>d.toISOString().slice(0,10),console};vm.createContext(app);vm.runInContext(source,app);return app}
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const data=Object.fromEntries(keys.map(k=>[k,[{id:k+'-1',auditField:{preserve:true}}]]));
 data.students=[{id:'s1',name:'測試學生',parent:'測試家長',rate:600}];
 data.teachers=[{id:'t1',rate:300}];
 data.lessons=[{id:'lesson-1',studentId:'s1',teacherId:'t1',date:'2026-08-03',start:'10:00',end:'11:00',billingBranchId:'own',branchId:'attend'}];
 data.collectionRecords=[{id:'receipt-1',month:'2026-08',status:'partial',amount:200,studentIds:['s1'],billingItemsVersion:1,billingItems:[{key:'lesson-1',studentId:'s1',amount:200}],notifiedAt:'2026-09-01T00:00:00Z',history:[{text:'已核對'}]}];
 data.summerCampRegistrations=[{id:'summer-1',studentId:'s1',month:'2026-08',dates:['2026-08-03'],totalFee:1700,pricingMode:'daily',dailyRate:600}];
 data.winterCampRegistrations=[{id:'winter-1',season:'winter',studentId:'s1',month:'2026-01',dates:['2026-01-03'],totalFee:700}];
 return data;
}
test('verified backup imports all 16 collections byte-for-byte, including itemized collections',()=>{
 const app=runtime(),data=fixture();data._meta={checksum:app.backupChecksum(data),counts:app.backupCollectionCounts(data)};
 assert.equal(app.verifyBackupEnvelope(data),true);
 const imported=app.normalizeImported(data);
 for(const key of keys)assert.deepEqual(plain(imported[key]),data[key],key);
 assert.equal(imported._meta,undefined);
 imported.collectionRecords[0].billingItems[0].amount=999;
 assert.equal(data.collectionRecords[0].billingItems[0].amount,200,'restore plan must not alias backup');
});
test('restore must not deduplicate camp registrations or recalculate historical fees',()=>{
 const app=runtime(),data=fixture();data.summerCampRegistrations.push({...data.summerCampRegistrations[0],id:'summer-2',totalFee:1900});
 const imported=app.normalizeImported(data);
 assert.deepEqual(plain(imported.summerCampRegistrations),data.summerCampRegistrations);
});
test('ordinary save/load normalization also preserves registration IDs, duplicate agreements and recorded amounts',()=>{
 const app=runtime(),data=fixture();data.summerCampRegistrations.push({...data.summerCampRegistrations[0],id:'summer-2',totalFee:1900});
 const expected=plain(data.summerCampRegistrations),receipts=plain(data.collectionRecords);
 for(let i=0;i<3;i++)app.normalizeBranchData(data);
 assert.deepEqual(plain(data.summerCampRegistrations),expected);
 assert.deepEqual(plain(data.collectionRecords),receipts);
});
test('missing optional legacy collections are explicit empty arrays without changing existing records',()=>{
 const app=runtime(),input={students:[{id:'legacy-student',name:'舊學生',rate:0}],teachers:[],lessons:[]},result=app.normalizeImported(input);
 for(const key of keys)assert.ok(Array.isArray(result[key]),key);
 assert.deepEqual(plain(result.students),input.students);
});
test('malformed collections and damaged checksums reject the import before any mutation',()=>{
 const app=runtime(),data=fixture();assert.throws(()=>app.normalizeImported({...data,collectionRecords:{amount:200}}),/collectionRecords/);
 const bad={...data,_meta:{checksum:'broken'}};assert.throws(()=>app.normalizeImported(bad),/校驗/);
 assert.throws(()=>app.normalizeImported({...data,students:null}),/格式/);
});
test('restore preserves current permanent history while importing missing backup entries, without changing other collections',()=>{
 const app=runtime(),current=fixture(),incoming=fixture();
 const shared={id:'shared',detail:{a:1,b:2}},recent={id:'recent',text:'備份後新增'},old={id:'old',text:'僅在備份'};
 current.changes=[recent,shared];incoming.changes=[{detail:{b:2,a:1},id:'shared'},old];
 const before=plain(current),backupBefore=plain(incoming),result=plain(app.prepareBackupRestore(current,incoming));
 assert.deepEqual(result.db.changes,[old,recent,shared]);assert.deepEqual(result.history,{existing:2,imported:1,total:3});
 for(const key of keys.filter(key=>key!=='changes'))assert.deepEqual(result.db[key],incoming[key],key);
 assert.deepEqual(current,before);assert.deepEqual(incoming,backupBefore);
 result.db.changes[1].text='mutated';assert.equal(current.changes[0].text,'備份後新增');
});
test('history restoration preserves multiplicity for legacy rows without IDs, and repeated restoration is idempotent',()=>{
 const app=runtime(),current=fixture(),incoming=fixture(),row={text:'legacy'};
 current.changes=[row];incoming.changes=[row,row];
 const first=plain(app.prepareBackupRestore(current,incoming));assert.equal(first.db.changes.length,2);
 const second=plain(app.prepareBackupRestore(first.db,incoming));assert.deepEqual(second.db,first.db);assert.equal(second.history.imported,0);
});
test('history restore rejects same-ID conflicting content without touching source or backup',()=>{
 const app=runtime(),current=fixture(),incoming=fixture();current.changes=[{id:'same',text:'現有'}];incoming.changes=[{id:'same',text:'不同'}];
 const before=plain({current,incoming});assert.throws(()=>app.prepareBackupRestore(current,incoming),/同 ID.*衝突/);assert.deepEqual({current,incoming},before);
 incoming.changes=[{id:'new',text:'a'},{id:'new',text:'b'}];assert.throws(()=>app.prepareBackupRestore(current,incoming),/同 ID.*衝突/);
});
