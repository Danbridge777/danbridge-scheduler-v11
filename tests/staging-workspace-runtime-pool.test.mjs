import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createWorkspaceRuntimePool}=createRequire(import.meta.url)('../functions/staging-workspace-runtime-pool.cjs');
const prefix='acceptancePublishedTransport/workspace-280-80190109-2684-4a92-a726-abf3cae53b5a';
const scope={prefix,kind:'owner',preserveLegacyViews:true};
test('pool shares construction only within the same native client, namespace, role and compatibility mode',async()=>{
 const pool=createWorkspaceRuntimePool({maxEntries:8}),native={};let builds=0;
 const create=async()=>({build:++builds,execute:identity=>identity});
 const [a,b]=await Promise.all([pool.get(native,scope,create),pool.get(native,scope,create)]);
 assert.equal(a,b);assert.equal(builds,1);
 assert.equal(a.execute('Daniel'),'Daniel');assert.equal(a.execute('Catherine'),'Catherine');
 for(const [client,patch] of [[{},{}],[native,{kind:'scheduler'}],[native,{preserveLegacyViews:false}],[native,{prefix:prefix.replace('80190109','80190110')}]])assert.notEqual(await pool.get(client,{...scope,...patch},create),a);
 assert.equal(builds,5);
 assert.throws(()=>pool.get(native,{...scope,prefix:'companies/danbridge'},create));
 assert.throws(()=>pool.get(native,{...scope,kind:'seed'},create));
});
test('idle and LRU eviction only discard reusable runtime state; failures are retryable',async()=>{
 let now=0,builds=0;const pool=createWorkspaceRuntimePool({maxEntries:1,maxIdleMs:10,clock:()=>now}),native={},create=()=>({build:++builds});
 const first=await pool.get(native,scope,create);now=9;
 assert.equal(await pool.get(native,scope,create),first);now=19;
 assert.notEqual(await pool.get(native,scope,create),first);
 await pool.get(native,{...scope,kind:'scheduler'},create);
 const afterEviction=await pool.get(native,scope,create);assert.equal(afterEviction.build,4);
 now=30;await assert.rejects(pool.get(native,scope,()=>{throw Error('initialization failed')}),/initialization failed/);
 assert.equal((await pool.get(native,scope,create)).build,5);
});
