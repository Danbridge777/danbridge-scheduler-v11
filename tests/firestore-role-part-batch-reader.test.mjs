import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreRolePartBatchReader} from '../js/core/firestore-role-part-batch-reader.js';
const scope='a'.repeat(64),ids=['b'.repeat(64),'c'.repeat(64)],user={uid:'test'};
const documentName=id=>`projects/danbridge-d8877-staging/databases/(default)/documents/productionRoleChunkViews/${scope}/parts/${id}`;
const rows=()=>ids.map(id=>({found:{name:documentName(id),fields:{id:{stringValue:id},scope:{stringValue:scope},bucket:{integerValue:'2'},payload:{stringValue:'[]'}}}}));
function harness(overrides={}){
 const calls=[];const reader=createFirestoreRolePartBatchReader({projectId:'danbridge-d8877-staging',getCurrentUser:()=>user,getIdToken:async()=> 'fake-id-token',getAppCheckToken:async()=> 'fake-app-token',fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(rows().reverse()))},...overrides});
 return {reader,calls};
}
test('uses only exact document names, Firebase Auth/App Check and restores response order',async()=>{
 const h=harness(),result=await h.reader(ids,scope);assert.deepEqual(result.map(row=>row.id),ids);assert.equal(result[0].bucket,2);
 assert.deepEqual(JSON.parse(h.calls[0].options.body),{documents:ids.map(documentName)});
 assert.match(h.calls[0].url,/^https:\/\/firestore.googleapis.com\/v1\/projects\/danbridge-d8877-staging\/databases\/\(default\)\/documents:batchGet$/);
 assert.equal(h.calls[0].options.headers.Authorization,'Bearer fake-id-token');assert.equal(h.calls[0].options.headers['X-Firebase-AppCheck'],'fake-app-token');assert.equal(h.calls[0].options.redirect,'error');
});
test('production cannot use an acceptance namespace; paths cannot escape role chunks',async()=>{
 assert.throws(()=>harness({projectId:'foreign'}));assert.throws(()=>harness({projectId:'danbridge-d8877',namespace:'acceptancePublishedTransport/workspace-280-80190109-2684-4a92-a726-abf3cae53b5a'}));assert.throws(()=>harness({namespace:'../other'}));
 const h=harness();for(const input of [[],[ids[0],ids[0]],['../other'],Array(17).fill(ids[0])])await assert.rejects(h.reader(input,scope));await assert.rejects(h.reader(ids,'../x'));assert.equal(h.calls.length,0);
});
for(const kind of ['missing','foreign','duplicate','count','field','unsafe-integer','identity','error'])test(`reject ${kind} response without returning partial data`,async()=>{
 const value=rows();if(kind==='missing')value[0]={missing:documentName(ids[0])};if(kind==='foreign')value[0].found.name+='bad';if(kind==='duplicate')value[1]=value[0];if(kind==='count')value.pop();if(kind==='field')value[0].found.fields.payload={mapValue:{}};if(kind==='unsafe-integer')value[0].found.fields.bucket={integerValue:'99999999999999999999'};if(kind==='identity')value[0].found.fields.id={stringValue:ids[1]};if(kind==='error')value[0]={error:{message:'do not expose'}};
 await assert.rejects(harness({fetch:async()=>new Response(JSON.stringify(value))}).reader(ids,scope));
});
test('account changes before or during request reject; backend denial is not retried with privilege',async()=>{
 let current=user;const h=harness({getCurrentUser:()=>current,getIdToken:async()=>{current={uid:'other'};return'token'}});await assert.rejects(h.reader(ids,scope),/authentication changed/);assert.equal(h.calls.length,0);
 current=user;await assert.rejects(harness({getCurrentUser:()=>current,fetch:async()=>{current=null;return new Response(JSON.stringify(rows()))}}).reader(ids,scope),/account changed/);
 await assert.rejects(harness({fetch:async()=>new Response('secret debug payload',{status:403})}).reader(ids,scope),/^Error: Role batch read failed \(HTTP 403\)$/);
});
test('network body and request duration are bounded',async()=>{
 await assert.rejects(harness({fetch:async()=>new Response('x'.repeat(8*1024*1024+1))}).reader(ids,scope),/exceeds bound/);
 await assert.rejects(harness({timeoutMs:5,fetch:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))}).reader(ids,scope),/aborted/);
});
