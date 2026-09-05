import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const require=createRequire(import.meta.url);
const {nativeCanonicalSha256}=require('../functions/native-canonical-sha256.cjs');

test('staging 排課後端原生 SHA-256 與瀏覽器 canonical 實作逐位一致',()=>{
 const fixtures=[null,true,0,'丹橋',[],{},[{z:3,a:['課程',null]},{nested:{beta:2,alpha:1}}],{teachers:[{id:'張毅',enabled:true}],lessons:[{end:'19:30',start:'19:00',name:'數學'}]}];
 for(const fixture of fixtures)assert.equal(nativeCanonicalSha256(fixture),sha256Canonical(fixture));
});
