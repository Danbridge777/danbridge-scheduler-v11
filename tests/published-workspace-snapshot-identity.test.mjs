import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createPublishedWorkspaceScope}=require('../functions/published-workspace-scope.cjs');
const prefix='acceptancePublishedTransport/workspace-280-80190109-2684-4a92-a726-abf3cae53b5a';

test('scope preserves native snapshot identity, never ID-only payloads or foreign references',async()=>{
 const ref={path:prefix+'/things/one'};
 const old={id:'one',exists:true,ref,updateTime:{seconds:1},data:()=>({value:1})};
 let current=old;
 const query={path:prefix+'/things',get:async()=>({docs:[current]})};
 const native={collection:()=>query,getAll:async()=>[current],runTransaction:async cb=>cb({get:async()=>({docs:[current]}),getAll:async()=>[current]})};
 const scoped=createPublishedWorkspaceScope(native,prefix);
 const result=await scoped.collection('things').get();
 const first=result.docs[0];
 assert.equal(result.docs[0],first);
 result.forEach(row=>assert.equal(row,first));
 assert.equal(first.ref.path,'things/one');
 assert.throws(()=>first.ref.firestore,/Unscoped/);
 assert.equal((await scoped.getAll(first.ref))[0],first);
 await scoped.runTransaction(async tx=>{
  assert.equal((await tx.get(scoped.collection('things'))).docs[0],first);
  assert.equal((await tx.getAll(first.ref))[0],first);
 });
 current={...old,updateTime:{seconds:2},data:()=>({value:2})};
 const fresh=(await scoped.collection('things').get()).docs[0];
 assert.notEqual(fresh,first);
 assert.deepEqual(first.data(),{value:1});
 assert.deepEqual(fresh.data(),{value:2});
 const other=createPublishedWorkspaceScope(native,prefix);
 assert.notEqual((await other.collection('things').get()).docs[0],fresh);
 await assert.rejects(other.getAll(fresh.ref),/Foreign/);
});
