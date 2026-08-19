import test from 'node:test';
import assert from 'node:assert/strict';

import {createRecordSyncActiveFailureResume} from '../js/core/record-sync-active-failure-resume.js';

const validRecordId='lsn_2da766bc-24bd-4af1-ad91-945babbb0b66';
const validLongOperationId=`${'x'.repeat(1490)}-op`;

function createMemoryStorage(){
	const store=new Map();
	return {
		getItem:key => store.get(String(key)) ?? null,
		setItem:(key,value)=>{store.set(String(key),String(value));},
		removeItem:key=>{store.delete(String(key));},
		read:()=>new Map(store)
	};
}

function makeDiagnosticListener(){
	const events=[];
	return {
		onDiagnostic:event=>events.push(event),
		get events(){return events;}
	};
}

function createStorageProbeThenStateFailStorage(){
	const store=new Map();
	return {
		getItem:key=>store.get(String(key)) ?? null,
		setItem:(key,value)=>{
			const name=String(key);
			if(name.endsWith(':probe')){
				store.set(name,String(value));
				return;
			}
			if(name===`danbridgeRecordSyncActiveFailureResume`){
				throw new Error('state write blocked');
			}
			store.set(name,String(value));
		},
		removeItem:key=>store.delete(String(key))
	};
}

function makeOperation(overrides={}){
	return {operationId:'owner-web:record-sync-active-failure',recordId:validRecordId,collection:'lessons',type:'update',baseRevision:1,nextRevision:2,...overrides};
}

function asReceipt(overrides={}){
	return {kind:'update',write:true,revision:2,...overrides};
}

test('disabled for production / non-owner / missing or invalid query param', async()=>{
	const baseOperation=makeOperation();
	for(const config of [
		{environment:'production',role:'owner',recordId:validRecordId,description:'production'},
		{environment:'staging',role:'teacher',recordId:validRecordId,description:'non-owner'},
		{environment:'staging',role:'owner',recordId:'',description:'missing recordId'},
		{environment:'staging',role:'owner',recordId:'bad/id',description:'invalid recordId'},
	]){
		const storage=createMemoryStorage();
		let calls=0;
		let received;
		const helper=createRecordSyncActiveFailureResume({
			environment:config.environment,
			role:config.role,
			recordId:config.recordId,
			storage,
			onDiagnostic:diagnostic=>{received=diagnostic;}
		});
		const result=await helper.wrapSend(baseOperation,()=>{calls+=1;return asReceipt({revision:2});});
		assert.equal(helper.enabled,false);
		assert.equal(calls,1);
		assert.equal(result.kind,'update');
		assert.equal(received.state,'disabled');
		assert.deepEqual(result,asReceipt({revision:2}));
	}
});

test('sessionStorage 持久化失敗時不啟動注入，仍為正常 send', async()=>{
	const storage={
		getItem: () => null,
		setItem: () => { throw new Error('storage unavailable'); },
		removeItem: () => {}
	};
	let calls=0;
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	const operation=makeOperation({nextRevision:3});
	const result=await helper.wrapSend(operation,()=>{calls+=1;return asReceipt({revision:3});});
	assert.equal(helper.enabled,false);
	assert.equal(calls,1);
	assert.equal(helper.getDiagnostic().state,'disabled');
	assert.equal(result.kind,'update');
	assert.equal(result.write,true);
});

test('probe 通過但 state 持久化失敗，仍先 commit 再拋 unavailable', async()=>{
	const storage=createStorageProbeThenStateFailStorage();
	let calls=0;
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	const operation=makeOperation({nextRevision:3});
	await assert.rejects(()=>helper.wrapSend(operation,()=>{calls+=1;return asReceipt({kind:'update',write:true,revision:3});}),error=>error.code==='unavailable');
	assert.equal(calls,1);
	assert.equal(helper.getDiagnostic().state,'intercepted');

	const retryResult=await helper.wrapSend(operation,()=>{calls+=1;return asReceipt({kind:'duplicate',write:false,revision:3});});
	assert.equal(calls,2);
	assert.equal(retryResult.kind,'duplicate');
	assert.equal(retryResult.write,false);
});

test('nonmatching recordId 不會啟動注入，仍為正常 send', async()=>{
	const storage=createMemoryStorage();
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	let called=0;
	const operation={...makeOperation(),recordId:'lsn_12345678-1111-2222-3333-444444444444'};
	const result=await helper.wrapSend(operation,()=>{called+=1;return asReceipt({kind:'update',write:true,revision:9});});
	assert.equal(called,1);
	assert.equal(result.kind,'update');
	assert.equal(result.revision,9);
});

test('首次命中目標 record 時先正常寫入再回傳 synthetic unavailable，並寫入診斷', async()=>{
	const storage=createMemoryStorage();
	const listener=makeDiagnosticListener();
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage,onDiagnostic:listener.onDiagnostic});
	const operation=makeOperation({nextRevision:3});
	let sendCalled=0;
	await assert.rejects(()=>helper.wrapSend(operation,()=>{sendCalled+=1;return asReceipt({kind:'update',write:true,revision:3});}),error=>error.code==='unavailable');
	assert.equal(sendCalled,1);
	assert.equal(helper.getDiagnostic().state,'intercepted');
	assert.equal(helper.getDiagnostic().operationId,operation.operationId);
	assert.equal(helper.getDiagnostic().recordId,operation.recordId);
	assert.equal(helper.getDiagnostic().write,true);
	assert.equal(helper.getDiagnostic().revision,3);
	assert.equal(helper.getDiagnostic().kind,'update');
	assert.equal(helper.getDiagnostic().exactlyOnce,false);
});

test('首次回應 kind 非法會 fail-closed', async()=>{
	const storage=createMemoryStorage();
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	const operation=makeOperation({nextRevision:4});
	await assert.rejects(()=>helper.wrapSend(operation,()=>asReceipt({kind:'delete',write:true,revision:4})),error=>error.code==='failed-precondition');
});

test('首次回應 revision 與 operation.nextRevision 不一致會 fail-closed', async()=>{
	const storage=createMemoryStorage();
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	const operation=makeOperation({nextRevision:4});
	await assert.rejects(()=>helper.wrapSend(operation,()=>asReceipt({kind:'update',write:true,revision:5})),error=>error.code==='failed-precondition');
});

test('同一 operationId 重試時 duplicate/write=false/同 revision 即為 resumed 並 exactlyOnce=true', async()=>{
	const storage=createMemoryStorage();
	const operation=makeOperation({operationId:'owner-web:1',nextRevision:5});
	const first=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>first.wrapSend(operation,()=>({kind:'update',write:true,revision:5})),error=>error.code==='unavailable');

	const listener=makeDiagnosticListener();
	const retry=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage,onDiagnostic:listener.onDiagnostic});
	const result=await retry.wrapSend(operation,()=>({kind:'duplicate',write:false,revision:5}));
	assert.equal(result.kind,'duplicate');
	assert.equal(result.write,false);
	assert.equal(result.revision,5);
	assert.equal(listener.events.at(-1).state,'resumed');
	assert.equal(listener.events.at(-1).exactlyOnce,true);
	assert.equal(listener.events.at(-1).operationId,operation.operationId);
	assert.equal(listener.events.at(-1).firstOperationId,operation.operationId);
	assert.equal(listener.events.at(-1).retryOperationId,operation.operationId);
});

test('operationId 長度可超過 128 字元仍有效', async()=>{
	const storage=createMemoryStorage();
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>helper.wrapSend({...makeOperation({operationId:validLongOperationId}) ,nextRevision:9},()=>asReceipt({kind:'update',write:true,revision:9})),error=>error.code==='unavailable');
});

test('頁面重載下以 duplicate 首次到達即 resumed 且不再注入', async()=>{
	const storage=createMemoryStorage();
	const operation=makeOperation({nextRevision:3});
	const crash=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>crash.wrapSend(operation,()=>({kind:'create',write:true,revision:3})),error=>error.code==='unavailable');

	const reloadListener=makeDiagnosticListener();
	const reloadHelper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage,onDiagnostic:reloadListener.onDiagnostic});
	const result=await reloadHelper.wrapSend(operation,()=>({kind:'duplicate',write:false,revision:3}));
	assert.equal(result.kind,'duplicate');
	assert.equal(reloadListener.events.at(-1).state,'resumed');
	assert.equal(reloadListener.events.at(-1).exactlyOnce,true);
});

test('重試 operationId 不一致 / revision 不一致，必須 fail-closed', async()=>{
	const storage=createMemoryStorage();
	const operation=makeOperation({operationId:'owner-web:1',nextRevision:5});
	const first=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>first.wrapSend(operation,()=>({kind:'create',write:true,revision:5})),error=>error.code==='unavailable');

	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>helper.wrapSend({...operation,operationId:'other-owner:2'},()=>{throw new Error('should not send');}),error=>error.code==='failed-precondition');
	await assert.rejects(()=>helper.wrapSend({...operation,nextRevision:6},()=>({kind:'duplicate',write:false,revision:6})),{code:'failed-precondition'});
});

test('operation.nextRevision 字串不得通過，需 fail-closed', async()=>{
	const storage=createMemoryStorage();
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>helper.wrapSend({...makeOperation({nextRevision:'4'}),},()=>asReceipt({kind:'update',write:true,revision:4})),error=>error.code==='failed-precondition');
});

test('duplicate receipt revision 字串不得通過，需 fail-closed', async()=>{
	const storage=createMemoryStorage();
	const operation=makeOperation({nextRevision:5});
	const first=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>first.wrapSend(operation,()=>asReceipt({kind:'update',write:true,revision:5})),error=>error.code==='unavailable');

	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>helper.wrapSend({...operation},()=>asReceipt({kind:'duplicate',write:false,revision:'5'})),error=>error.code==='failed-precondition');
});

test('故障注入只針對一次性作業，後續正常寫入可直接通過', async()=>{
	const storage=createMemoryStorage();
	const operation=makeOperation({operationId:'owner-web:1',nextRevision:2});
	const first=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	await assert.rejects(()=>first.wrapSend(operation,()=>({kind:'update',write:true,revision:2})),error=>error.code==='unavailable');
	const firstRetry=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	const replay=await firstRetry.wrapSend(operation,()=>({kind:'duplicate',write:false,revision:2}));
	assert.equal(replay.kind,'duplicate');

	let sent=0;
	const later=await firstRetry.wrapSend({...operation,operationId:'owner-web:2',nextRevision:3},()=>{sent+=1;return asReceipt({kind:'update',write:true,revision:3});});
	assert.equal(sent,1);
	assert.equal(later.kind,'update');
});

test('wrapOnStatus 會將 status counts 合併到診斷', ()=>{
	const storage=createMemoryStorage();
	const helper=createRecordSyncActiveFailureResume({environment:'staging',role:'owner',recordId:validRecordId,storage});
	const status={state:'pending',counts:{pending:3,sending:1,failed:2,quarantined:1,confirmed:0}};
	const result=helper.wrapOnStatus(status);
	assert.deepEqual(result,status);
	assert.equal(helper.getDiagnostic().pending,3);
	assert.equal(helper.getDiagnostic().sending,1);
	assert.equal(helper.getDiagnostic().failed,2);
	assert.equal(helper.getDiagnostic().quarantined,1);
	assert.equal(helper.getDiagnostic().confirmed,0);
});
