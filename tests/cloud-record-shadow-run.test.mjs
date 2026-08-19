import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildRecordShadowRunManifest,verifyRecordShadowRun,buildRecordShadowActivation,canonicalRecordShadowCore,canonicalLegacyRecordShadowCore,extractFullRecordShadowSyncResult,buildFullRecordShadowRunIdentity} from '../js/core/cloud-record-shadow-run.js';

const base={runId:'run-1',sourceHash:'hash-1',coreHash:'core-1',documentCount:6,activeCount:3,tombstoneCount:3};

function fullRecordDb(overrides={}){
	const base=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]));
	return Object.assign(base,overrides);
}

function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object'){
  if(typeof value.toMillis==='function')return {__timestampMillis:value.toMillis()};
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
 }
 return value;
}
function hashValue(value){try{const text=JSON.stringify(stable(value||{}));let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+':'+text.length}catch{return String(Date.now())}}

test('完整讀回才建立 verified run manifest',()=>{
 const manifest=buildRecordShadowRunManifest(base);
 assert.deepEqual(manifest,{schema:'danbridge-record-shadow-run-v2',environment:'staging',state:'writing',...base});
 assert.deepEqual(verifyRecordShadowRun(manifest,{...base}),{...manifest,state:'verified',verifiedHash:'hash-1'});
});

test('中斷 run、缺筆、多筆與計數不一致都不能 verified',()=>{
 const manifest=buildRecordShadowRunManifest(base);
 assert.throws(()=>buildRecordShadowActivation(manifest,{currentSourceHash:'hash-1'}),/尚未 verified/);
 for(const documentCount of [5,7])assert.throws(()=>verifyRecordShadowRun(manifest,{...base,documentCount}),/文件數/);
 assert.throws(()=>verifyRecordShadowRun(manifest,{...base,activeCount:2,tombstoneCount:4}),/有效或墓碑數/);
});

test('hash 不符與 run identity 不符都不能 verified',()=>{
 const manifest=buildRecordShadowRunManifest(base);
 assert.throws(()=>verifyRecordShadowRun(manifest,{...base,sourceHash:'other'}),/hash/);
 assert.throws(()=>verifyRecordShadowRun(manifest,{...base,runId:'other'}),/run identity/);
 assert.throws(()=>verifyRecordShadowRun(manifest,{...base,coreHash:'other'}),/coreHash/);
});

test('來源版本改變時禁止原子啟用 verified run',()=>{
 const verified=verifyRecordShadowRun(buildRecordShadowRunManifest(base),base);
 assert.throws(()=>buildRecordShadowActivation(verified,{currentSourceHash:'hash-2'}),/來源版本已改變/);
 assert.deepEqual(buildRecordShadowActivation(verified,{currentSourceHash:'hash-1'}),{schema:'danbridge-record-shadow-activation-v2',environment:'staging',activeRunId:'run-1',sourceHash:'hash-1',verifiedHash:'hash-1',coreHash:'core-1',documentCount:6,activeCount:3,tombstoneCount:3});
});

test('canonical full helper 嚴格 fail-closed：必須存在 16 集合且不得有未知集合',()=>{
 const base=fullRecordDb({makeups:[{id:'makeup-1'}],branches:[{id:'branch-1'}]});
 assert.deepEqual(Object.keys(canonicalRecordShadowCore(base)).sort(),[...FULL_RECORD_COLLECTIONS].sort());

 const missingCollections=fullRecordDb({makeups:[{id:'makeup-1'}]});
 delete missingCollections.branches;
 assert.throws(()=>canonicalRecordShadowCore(missingCollections),/缺少 branches/);

 const unknownCollections=fullRecordDb();
 unknownCollections.unexpected=[];
 assert.throws(()=>canonicalRecordShadowCore(unknownCollections),/發現未知集合 unexpected/);
});

test('canonical full helper 具 deepEqual/id-order/field-order 不變性，且 changes 仍維持 immutable seq',()=>{
 const sourceA=fullRecordDb();
 sourceA.lessons=[{z:2,a:1,id:'b'},{id:'a'}];
 sourceA.students=[{id:'s2',b:2},{id:'s1',a:1}];
 sourceA.makeups=[{id:'m1',z:2,a:1}];
 sourceA.changes=[{note:'newer',payload:{b:2,a:1}},{note:'older',payload:{a:1,b:2}}];

	const sourceB=fullRecordDb();
	sourceB.lessons=[{id:'a'},{z:2,a:1,id:'b'}];
	sourceB.students=[{id:'s1',a:1},{id:'s2',b:2}];
	sourceB.makeups=[{a:1,id:'m1',z:2}];
	sourceB.changes=[{payload:{b:2,a:1},note:'newer'},{payload:{a:1,b:2},note:'older'}];

 const canonicalA=canonicalRecordShadowCore(sourceA);
 const canonicalB=canonicalRecordShadowCore(sourceB);
 assert.deepEqual(canonicalA,canonicalB);

 assert.equal(canonicalA.lessons[0].record.id,'a');
 assert.equal(canonicalA.lessons[1].record.id,'b');
 assert.equal(canonicalA.changes[0].recordIndex,0);
 assert.equal(canonicalA.changes[1].recordIndex,1);
 assert.equal(canonicalA.changes[0].record.note,'older');
 assert.equal(canonicalA.changes[1].record.note,'newer');
 assert.equal(canonicalA.changes[0].recordId.startsWith('seq_00000000_'),true);
 assert.equal(canonicalA.changes[1].recordId.startsWith('seq_00000001_'),true);
});

test('第 4 到 16 集合缺筆與資料錯配會被 run count fail-closed',()=>{
 const base=fullRecordDb({
	lessons:[{id:'lesson-1'}],
	makeups:[{id:'makeup-1'}],
	students:[{id:'s1'}],
	teachers:[{id:'t1'}],
	branches:[]
	});
	const baseCore=canonicalRecordShadowCore(base);
	const baseHash=hashValue(baseCore);
	const manifest=buildRecordShadowRunManifest({
		runId:'run-full',
		sourceHash:'hash',
		coreHash:baseHash,
		documentCount:4,
		activeCount:4,
		tombstoneCount:0
	});
	assert.throws(()=>verifyRecordShadowRun(manifest,{runId:'run-full',sourceHash:'hash',coreHash:baseHash,documentCount:3,activeCount:3,tombstoneCount:0}),/文件數不符/);
	assert.throws(()=>verifyRecordShadowRun(manifest,{runId:'run-full',sourceHash:'hash',coreHash:baseHash,documentCount:5,activeCount:5,tombstoneCount:0}),/文件數不符/);
});

test('同步結果接線必須使用 result.db + result.counts，不再依賴 state.db',()=>{
	const documents=fullRecordDb();
	documents.lessons=[{id:'s1',data:{deleted:false}}];
	documents.makeups=[{id:'m1',data:{deleted:true}}];
	const db=fullRecordDb({
		lessons:[{id:'s1'}],
		makeups:[{id:'m1'}]
	});
	const syncResult=extractFullRecordShadowSyncResult({
		db,
		documents,
		documentCount:2,
		activeCount:1,
		tombstoneCount:1
	});
	assert.equal(syncResult.documentCount,2);
	assert.equal(syncResult.activeCount,1);
	assert.equal(syncResult.tombstoneCount,1);
	const rebuild=canonicalRecordShadowCore(syncResult.db);
	assert.equal(rebuild.lessons[0].record.id,'s1');
	assert.equal(rebuild.makeups.length,1);
	assert.throws(()=>extractFullRecordShadowSyncResult({state:{db:{}}}),/db 欄位/);
	assert.throws(()=>extractFullRecordShadowSyncResult({db:{},documentCount:'x',activeCount:0,tombstoneCount:1}),/文件數無效/);
});

test('sourceHash 與 coreHash 嚴格分開由 raw target 及 canonical target 計算',()=>{
	const target=fullRecordDb();
	target.lessons=[{id:'b'},{id:'a'}];
	target.changes=[{note:'newer'},{note:'older'}];
	target.branches=[{id:'branch-1'}];
	const current=fullRecordDb({lessons:[{id:'a'}]});
	const counts=buildFullRecordShadowRunIdentity(target,current,{
		hashTargetDb:value=>`raw:${value.lessons.map((row)=>row.id).join('|')}`,
		hashCanonicalDb:value=>`core:${value.lessons.map((row)=>row.record.id).join('|')}`
	});
	assert.equal(counts.sourceHash,'raw:b|a');
	assert.equal(counts.coreHash,'core:a|b');
	assert.equal(counts.documentCount,5);
	assert.equal(counts.activeCount,5);
	assert.equal(counts.tombstoneCount,0);
});

test('變更列無 id 時，documentCount 對照 current + canonical 不會誤用 row.id',()=>{
	const target=fullRecordDb();
	target.lessons=[{id:'lesson-a'}];
	target.changes=[{note:'first'},{note:'second'}];
	const current=fullRecordDb({
		lessons:[{id:'lesson-a'},{id:'lesson-b'}],
		changes:[{id:'legacy-change-1'},{id:'legacy-change-2'}]
	});
	const canonical=canonicalRecordShadowCore(target);
	assert.equal(canonical.changes[0].recordId.startsWith('seq_00000000_'),true);
	assert.equal(canonical.changes[1].recordId.startsWith('seq_00000001_'),true);
	const counts=buildFullRecordShadowRunIdentity(target,current,{hashTargetDb:()=>'',hashCanonicalDb:()=>''});
	assert.equal(counts.documentCount,6);
	assert.equal(counts.activeCount,3);
	assert.equal(counts.tombstoneCount,3);
});

test('legacy helper 只含三核心集合且維持既有 ID/順序/欄位語意',()=>{
 const first=canonicalLegacyRecordShadowCore({lessons:[{id:'b',z:2,a:1},{id:'a'}],students:[],teachers:[]}),second=canonicalLegacyRecordShadowCore({teachers:[],students:[],lessons:[{id:'a'},{a:1,z:2,id:'b'}]});
 assert.deepEqual(first,second);
 assert.deepEqual(Object.keys(first),['lessons','students','teachers']);
 assert.throws(()=>canonicalLegacyRecordShadowCore({lessons:[],students:[]}),/teachers/);
 assert.throws(()=>canonicalLegacyRecordShadowCore({lessons:[{id:'same'},{id:'same'}],students:[],teachers:[]}),/重複/);
 assert.throws(()=>canonicalLegacyRecordShadowCore({lessons:[{id:' bad'}],students:[],teachers:[]}),/ID/);
});
