import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {DATABASE,BUCKET,monthAt,assertManifest,retentionPlan,assertObject}=require('../functions/backup-service/policy.cjs');
const {runBackup}=require('../functions/backup-service/runtime.cjs');
const id='11111111-1111-4111-8111-111111111111';
const manifest=month=>({schema:'danbridge-monthly-export-v1',database:DATABASE,bucket:BUCKET,month,state:'verified',prefix:`exports/${month}/${id}`,snapshotTime:`${month}-01T00:00:00Z`,operation:DATABASE+'/operations/one',metadataName:`exports/${month}/${id}/${id}.overall_export_metadata`,objectCount:2});
function fake(){
 const map=new Map(),deleted=[],calls={exports:0};let generation=0;
 const api={
  readJson:async name=>map.get(name)||null,
  writeJson:async(name,value,match)=>{if(match!==undefined&&String(map.get(name)?.generation||'0')!==String(match))throw new Error('Precondition');const row={value:structuredClone(value),generation:String(++generation)};map.set(name,row);return row},
  startExport:async body=>{calls.exports++;calls.body=body;return{name:DATABASE+'/operations/one'}},
  operations:async()=>[{name:DATABASE+'/operations/one',metadata:{outputUriPrefix:`gs://${BUCKET}/exports/2026-09/${id}`}}],
  operation:async()=>({done:true,response:{outputUriPrefix:`gs://${BUCKET}/exports/2026-09/${id}`},metadata:{progressDocuments:{completedWork:30000}}}),
  objects:async prefix=>prefix==='manifests/'?[...map.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name,generation:map.get(name).generation})):[{name:prefix+id+'.overall_export_metadata',size:'20',generation:'55'},{name:prefix+'all_namespaces/all_kinds/output-0',size:'100',generation:'56'}],
  objectMetadata:async name=>({name,size:'20',generation:'55'}),
  deleteObject:async(name,generation)=>{deleted.push({name,generation});map.delete(name)},
  dailyStatus:async()=>({state:'ready',retentionDays:30})
 };
 return{api,map,deleted,calls,options:{api,now:()=>Date.parse('2026-09-16T06:00:00Z'),uuid:()=>id}};
}
test('Taiwan calendar month, exact newest 13 and invalid prefix rejected',()=>{
 assert.equal(monthAt(Date.parse('2026-08-31T17:00:00Z')),'2026-09');
 const rows=Array.from({length:15},(_,i)=>manifest(new Date(Date.UTC(2025,i,1)).toISOString().slice(0,7)));
 const plan=retentionPlan(rows);assert.equal(plan.keep.length,13);assert.deepEqual(plan.remove.map(x=>x.month),['2025-02','2025-01']);
 assert.throws(()=>assertManifest({...rows[0],prefix:'companies/danbridge'}));
 assert.throws(()=>assertObject(rows[0].prefix,{name:'exports/other/file',generation:'4'}));
 assert.throws(()=>retentionPlan([rows[0],rows[0]]));
});
test('first export is verified and repeated daily invocation does not export again',async()=>{
 const f=fake();const h=await runBackup(f.options);assert.equal(h.monthlyState,'verified');assert.equal(h.monthlyDocuments,30000);assert.equal(h.formalDataWrites,0);
 assert.equal(f.calls.body.snapshotTime,'2026-09-16T05:58:00.000Z');
 await runBackup(f.options);assert.equal(f.calls.exports,1);assert.equal(f.deleted.length,0);
});
test('failed export never marks verified or deletes old backups',async()=>{
 const f=fake();f.api.operation=async()=>({done:true,error:{code:7}});
 await assert.rejects(runBackup(f.options),/Export failed/);assert.equal(f.map.get('manifests/2026-09.json').value.state,'running');assert.equal(f.deleted.length,0);
});
test('lost export response recovers original operation without duplicate export',async()=>{
 const f=fake();f.api.startExport=async()=>{f.calls.exports++;throw new Error('network lost')};
 await assert.rejects(runBackup(f.options));assert.equal(f.map.get('manifests/2026-09.json').value.state,'starting');
 await runBackup(f.options);assert.equal(f.calls.exports,1);assert.equal(f.map.get('manifests/2026-09.json').value.state,'verified');
});
test('missing completed metadata and active lease stop safely',async()=>{
 const f=fake();f.api.objects=async()=>[];await assert.rejects(runBackup(f.options),/metadata missing/);assert.equal(f.deleted.length,0);
 await f.api.writeJson('control/lease.json',{expiresAt:Date.parse('2026-09-17T00:00:00Z')});
 await assert.rejects(runBackup(f.options),/already leased/);
});
test('only completed older backups deleted after all kept metadata checked',async()=>{
 const f=fake();for(let i=0;i<14;i++){const m=manifest(new Date(Date.UTC(2025,7+i,1)).toISOString().slice(0,7));await f.api.writeJson(`manifests/${m.month}.json`,m)}
 const h=await runBackup(f.options);assert.equal(h.retainedMonthly,13);assert.equal(h.deletedBackups,1);
 assert.equal(f.deleted.length,3);assert.ok(f.deleted.every(x=>x.name.includes('2025-08')));
});
test('missing a kept backup blocks all retention deletion',async()=>{
 const f=fake();for(let i=0;i<14;i++){const m=manifest(new Date(Date.UTC(2025,7+i,1)).toISOString().slice(0,7));await f.api.writeJson(`manifests/${m.month}.json`,m)}
 f.api.objectMetadata=async name=>{if(name.includes('2026-01'))throw new Error('Missing kept backup');return{name}};
 await assert.rejects(runBackup(f.options),/Missing kept/);assert.equal(f.deleted.length,0);
});
test('stale daily backup is reported as a failure even when monthly export succeeded',async()=>{
 const f=fake();f.api.dailyStatus=async()=>({state:'stale'});await assert.rejects(runBackup(f.options),/overdue/);
 assert.equal(f.map.get('control/health.json').value.daily.state,'stale');assert.equal(f.map.get('manifests/2026-09.json').value.state,'verified');
});
