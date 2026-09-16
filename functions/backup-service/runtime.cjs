'use strict';
const {randomUUID}=require('node:crypto');
const {PROJECT,DATABASE,BUCKET,monthAt,assertManifest,retentionPlan,assertObject}=require('./policy.cjs');
// All writes are scoped to the dedicated backup bucket. There is no import,
// restore, database delete, Rules update or business-document write endpoint.
async function runBackup({api,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),uuid=randomUUID}){
 const started=now(),month=monthAt(started),manifestName=`manifests/${month}.json`;
 const previousLease=await api.readJson('control/lease.json');
 if(previousLease&&previousLease.value.expiresAt>started)throw new Error('Backup job already leased');
 const lease=await api.writeJson('control/lease.json',{id:uuid(),expiresAt:started+600000},previousLease?.generation||'0');
 try{
  let stored=await api.readJson(manifestName),manifest=stored?.value;
  if(!manifest){
   manifest={schema:'danbridge-monthly-export-v1',database:DATABASE,bucket:BUCKET,month,state:'starting',prefix:`exports/${month}/${uuid()}`,snapshotTime:new Date(Math.floor((started-120000)/60000)*60000).toISOString(),createdAt:new Date(started).toISOString()};
   stored=await api.writeJson(manifestName,manifest,'0');
   // Persist the intent before submitting. A lost response is recovered by
   // operation lookup next time, never by blindly issuing another export.
   const operation=await api.startExport({name:DATABASE,outputUriPrefix:`gs://${BUCKET}/${manifest.prefix}`,snapshotTime:manifest.snapshotTime});
   manifest={...manifest,state:'running',operation:operation.name};assertManifest(manifest);
   stored=await api.writeJson(manifestName,manifest,stored.generation);
  }
  assertManifest(manifest);
  if(manifest.state==='starting'){
   const operations=await api.operations();
   const candidates=operations.filter(o=>o.metadata?.outputUriPrefix===`gs://${BUCKET}/${manifest.prefix}`);
   if(candidates.length!==1)throw new Error('Export submission uncertain; retained backups unchanged');
   manifest={...manifest,state:'running',operation:candidates[0].name};assertManifest(manifest);
   stored=await api.writeJson(manifestName,manifest,stored.generation);
  }
  if(manifest.state==='running'){
   let op=await api.operation(manifest.operation);
   while(!op.done&&now()-started<420000){await sleep(5000);op=await api.operation(manifest.operation)}
   if(op.error)throw new Error(`Export failed code ${op.error.code}; retained backups unchanged`);
   if(!op.done)throw new Error('Export still running; operation retained for retry');
   if(op.response?.outputUriPrefix!==`gs://${BUCKET}/${manifest.prefix}`)throw new Error('Export response prefix mismatch');
   const objects=await api.objects(manifest.prefix+'/');objects.forEach(o=>assertObject(manifest.prefix,o));
   const metadata=objects.filter(o=>o.name.endsWith('.overall_export_metadata')&&Number(o.size)>0);
   if(metadata.length!==1)throw new Error('Completed export metadata missing');
   manifest={...manifest,state:'verified',verifiedAt:new Date(now()).toISOString(),metadataName:metadata[0].name,objectCount:objects.length,bytes:objects.reduce((n,o)=>n+Number(o.size||0),0),documentCount:Number(op.metadata?.progressDocuments?.completedWork||0)};
   stored=await api.writeJson(manifestName,manifest,stored.generation);
  }
  // Never trust only an old success flag, including on an ordinary daily run.
  await api.objectMetadata(manifest.metadataName);
  const manifestObjects=await api.objects('manifests/'),entries=[];
  for(const object of manifestObjects){
   if(!/^manifests\/20\d\d-(0[1-9]|1[0-2])\.json$/.test(object.name))throw new Error('Unexpected object in manifest namespace');
   const row=await api.readJson(object.name);if(!row)throw new Error('Manifest disappeared');
   assertManifest(row.value);if(object.name!==`manifests/${row.value.month}.json`)throw new Error('Manifest name mismatch');
   entries.push({...row,name:object.name});
  }
  const plan=retentionPlan(entries.map(x=>x.value));
  for(const kept of plan.keep)await api.objectMetadata(kept.metadataName);
  let deletedBackups=0;
  for(const old of plan.remove){
   const objects=await api.objects(old.prefix+'/');
   objects.forEach(o=>assertObject(old.prefix,o));
   for(const object of objects)await api.deleteObject(object.name,object.generation);
   const entry=entries.find(x=>x.value.month===old.month);
   await api.deleteObject(entry.name,entry.generation);deletedBackups++;
  }
  const daily=await api.dailyStatus();
  const health={schema:'danbridge-backup-health-v1',checkedAt:new Date(now()).toISOString(),month,monthlyState:'verified',monthlySnapshotTime:manifest.snapshotTime,monthlyObjects:manifest.objectCount,monthlyBytes:manifest.bytes,monthlyDocuments:manifest.documentCount,retainedMonthly:plan.keep.length,deletedBackups,daily,formalDataWrites:0};
  await api.writeJson('control/health.json',health);
  if(daily.state==='stale'||daily.state==='missing-schedule')throw new Error('Daily managed backup overdue or schedule missing');
  return health;
 }finally{await api.writeJson('control/lease.json',{expiresAt:0},lease.generation)}
}
module.exports={runBackup};
