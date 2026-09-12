import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const start=source.indexOf('function backendHealthFreshness('),end=source.indexOf('function formatHealthBytes',start),a={};vm.createContext(a);vm.runInContext(source.slice(start,end),a);
const now=Date.parse('2026-09-10T00:00:00Z'),snapshot=ms=>({schema:'danbridge-production-owner-health-v1',checkedAt:{toMillis:()=>ms}});
test('missing or invalid health time is not a healthy real-time assertion',()=>{
 for(const data of [null,{},snapshot(NaN),snapshot(0),{...snapshot(now),schema:'other'}])assert.equal(a.backendHealthFreshness(data,now).state,'missing');
 assert.equal(a.backendHealthFreshness(snapshot(now+360000),now).state,'invalid');
});
test('daily health result preserves timestamp and explicitly expires after 36 hours',()=>{
 assert.equal(a.backendHealthFreshness(snapshot(now-36*3600000),now).state,'current');
 const stale=a.backendHealthFreshness(snapshot(now-36*3600000-1),now);assert.equal(stale.state,'stale');assert.equal(stale.checkedAt,new Date(now-36*3600000-1).toISOString());
 assert.match(source,/上次檢查：/);assert.match(source,/不能代表目前狀態/);
});
test('frequent health refresh expires after its bounded 45-minute freshness window',()=>{
 const health={...snapshot(now-45*60000),maxAgeMs:45*60000};assert.equal(a.backendHealthFreshness(health,now).state,'current');
 assert.equal(a.backendHealthFreshness(health,now+1).state,'stale');
 for(const maxAgeMs of [0,-1,Infinity,'2700000',37*3600000])assert.equal(a.backendHealthFreshness({...snapshot(now),maxAgeMs},now).state,'invalid');
 assert.match(source,/Owner 未讀通知/);
});
