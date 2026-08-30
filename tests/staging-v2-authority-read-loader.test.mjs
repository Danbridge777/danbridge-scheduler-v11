import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {createStagingV2AuthorityReadLoader,STAGING_V2_AUTHORITY_READ_LOADER_SCOPE} from '../js/core/staging-v2-authority-read-loader.js';

const epoch='active-epoch-loader-12345';
const manifestPath=`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}/artifacts/manifest`;
const headPath=`stagingActiveRecordV2Heads/danbridge/epochs/${epoch}`;
const ledgersPath=`stagingActiveRecordV2SaveCommits/danbridge/epochs/${epoch}/saves`;
const baselinePath=collection=>`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}/collections/${collection}/records`;
const dailyPath=collection=>`stagingActiveRecordV2Records/danbridge/epochs/${epoch}/collections/${collection}/records`;

function fixture(){
 const calls=[],docs=new Map([[manifestPath,{invalid:'manifest'}],[headPath,{invalid:'head'}]]),collections=new Map([[ledgersPath,[]],...FULL_RECORD_COLLECTIONS.flatMap(collection=>[[baselinePath(collection),[]],[dailyPath(collection),[]]])]);
 return{calls,docs,collections,loader:createStagingV2AuthorityReadLoader({expectedProjectId:'danbridge-d8877-staging',getDocumentFromServer:async path=>{calls.push(['doc',path]);return structuredClone(docs.get(path)??null)},getCollectionFromServer:async path=>{calls.push(['collection',path]);return structuredClone(collections.get(path)??null)}})};
}

test('固定 staging path inventory，mutable authority 由 head before/after 包住後才交給完整 verifier',async()=>{const value=fixture();assert.equal(value.loader.scope,STAGING_V2_AUTHORITY_READ_LOADER_SCOPE);await assert.rejects(()=>value.loader.load({activationEpoch:epoch}),/manifest fields|baseline manifest/);assert.deepEqual(value.calls[0],['doc',manifestPath]);for(const collection of FULL_RECORD_COLLECTIONS)assert.ok(value.calls.some(call=>call[0]==='collection'&&call[1]===baselinePath(collection)));const firstHead=value.calls.findIndex(call=>call[0]==='doc'&&call[1]===headPath),ledger=value.calls.findIndex(call=>call[0]==='collection'&&call[1]===ledgersPath),lastHead=value.calls.findLastIndex(call=>call[0]==='doc'&&call[1]===headPath);assert.ok(firstHead>0&&ledger>firstHead&&lastHead>ledger);for(const collection of FULL_RECORD_COLLECTIONS)assert.ok(value.calls.some(call=>call[0]==='collection'&&call[1]===dailyPath(collection)))});

test('錯 project、額外 request 欄位、缺文件、稀疏或 custom collection 回傳均 fail closed',async()=>{const bad=()=>({expectedProjectId:'wrong',getDocumentFromServer:async()=>({}),getCollectionFromServer:async()=>[]});assert.throws(()=>createStagingV2AuthorityReadLoader(bad()),/boundary/);const missing=fixture();missing.docs.delete(manifestPath);await assert.rejects(()=>missing.loader.load({activationEpoch:epoch}),/missing/);await assert.rejects(()=>fixture().loader.load({activationEpoch:epoch,extra:true}),/fields/);const sparse=fixture(),list=[];list.length=1;sparse.collections.set(baselinePath(FULL_RECORD_COLLECTIONS[0]),list);await assert.rejects(()=>sparse.loader.load({activationEpoch:epoch}),/dense array/);const custom=fixture();custom.collections.set(baselinePath(FULL_RECORD_COLLECTIONS[0]),Object.assign(Object.create(null),{length:0}));await assert.rejects(()=>custom.loader.load({activationEpoch:epoch}),/dense array/)});

test('changes baseline 先按 recordIndex 排序，非 changes 按 document id 排序',async()=>{const value=fixture();value.collections.set(baselinePath('changes'),[{id:'seq_00000002_bbbbbbbb',data:{recordIndex:2}},{id:'seq_00000001_aaaaaaaa',data:{recordIndex:1}}]);value.collections.set(baselinePath('lessons'),[{id:'z',data:{}},{id:'a',data:{}}]);await assert.rejects(()=>value.loader.load({activationEpoch:epoch}),/manifest fields|baseline manifest/);const baselineCalls=value.calls.filter(call=>call[0]==='collection'&&call[1].includes('stagingActiveRecordV2Baselines'));assert.equal(baselineCalls.length,FULL_RECORD_COLLECTIONS.length)});
