import test from 'node:test';
import assert from 'node:assert/strict';
import {Firestore} from '@google-cloud/firestore';
import {createRequire} from 'node:module';
const {createTransactionHistoryVersionReader}=createRequire(import.meta.url)('../functions/transaction-history-version-reader.cjs');
test('native Firestore: masked query exposes full-document version; history cache observes field edits and membership changes', {skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:90000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const db=new Firestore({projectId:'demo-danbridge-history-version'}),q=db.collection('productionFullRecordShadows/danbridge/collections/changes/records'),reader=createTransactionHistoryVersionReader();
 const read=()=>db.runTransaction(async tx=>{const cached=await reader.read(tx,q),full=await tx.get(q);assert.deepEqual(cached.docs.map(d=>({id:d.id,data:d.data()})),full.docs.map(d=>({id:d.id,data:d.data()})));return cached.docs.map(d=>d.data())});
 try{
  await q.doc('a').set({id:'a',payload:{text:'original',nested:[1,2]}});await q.doc('b').set({id:'b',payload:{text:'keep'}});
  await read();await read();
  await q.doc('a').update({'payload.text':'edited without changing id'});assert.equal((await read())[0].payload.text,'edited without changing id');
  await q.doc('a').delete();assert.equal((await read()).length,1);
  await q.doc('a').set({id:'a',payload:{text:'recreated'}});assert.equal((await read())[0].payload.text,'recreated');
  const copy=await read();copy[0].payload.text='caller mutation';assert.equal((await read())[0].payload.text,'recreated');
  await assert.rejects(db.runTransaction(async tx=>{await reader.read(tx,q);tx.update(q.doc('a'),{'payload.text':'must not commit'});throw Error('abort transaction')}),/abort transaction/);
  assert.equal((await read())[0].payload.text,'recreated');
 }finally{await db.terminate()}
});
