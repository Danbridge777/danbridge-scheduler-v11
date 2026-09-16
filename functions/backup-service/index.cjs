'use strict';
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {GoogleAuth}=require('google-auth-library');
const {PROJECT,DATABASE,BUCKET}=require('./policy.cjs');
const {runBackup}=require('./runtime.cjs');
async function makeApi(){
 const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
 const request=async(url,method='GET',data,params)=> (await client.request({url,method,data,params,timeout:30000,retry:false})).data;
 const storage=`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
 const objectMetadata=name=>request(storage+'/'+encodeURIComponent(name));
 async function readJson(name){try{const meta=await objectMetadata(name),value=await request(storage+'/'+encodeURIComponent(name),'GET',undefined,{alt:'media',generation:meta.generation});return{value:typeof value==='string'?JSON.parse(value):value,generation:meta.generation}}catch(e){if(e.response?.status===404)return null;throw e}}
 async function writeJson(name,value,generation){const meta=await request(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o`,'POST',JSON.stringify(value),{uploadType:'media',name,...(generation!==undefined?{ifGenerationMatch:generation}:{})});return{value,generation:meta.generation}}
 async function pages(url,key,params={}){let items=[],pageToken;do{const data=await request(url,'GET',undefined,{...params,...(pageToken?{pageToken}:{})});items.push(...(data[key]||[]));pageToken=data.nextPageToken}while(pageToken);return items}
 return{
  readJson,writeJson,objectMetadata,
  objects:prefix=>pages(storage,'items',{prefix,maxResults:1000}),
  deleteObject:(name,generation)=>request(storage+'/'+encodeURIComponent(name),'DELETE',undefined,{ifGenerationMatch:generation}),
  startExport:({name,...body})=>{if(name!==DATABASE)throw new Error('Database mismatch');return request(`https://firestore.googleapis.com/v1/${DATABASE}:exportDocuments`,'POST',body)},
  operations:()=>pages(`https://firestore.googleapis.com/v1/${DATABASE}/operations`,'operations'),
  operation:name=>request('https://firestore.googleapis.com/v1/'+name),
  dailyStatus:async()=>{
   const [schedules,backups]=await Promise.all([pages(`https://firestore.googleapis.com/v1/${DATABASE}/backupSchedules`,'backupSchedules'),pages(`https://firestore.googleapis.com/v1/projects/${PROJECT}/locations/asia-east1/backups`,'backups')]);
   const schedule=schedules.find(s=>s.dailyRecurrence&&s.retention==='2592000s');
   const ready=backups.filter(b=>b.database===DATABASE&&b.state==='READY').sort((a,b)=>String(b.snapshotTime).localeCompare(String(a.snapshotTime)));
   const snapshotTime=ready[0]?.snapshotTime||null;
   return{state:!schedule?'missing-schedule':snapshotTime&&Date.now()-Date.parse(snapshotTime)<48*3600000?'ready':Date.now()-Date.parse(schedule.createTime)<48*3600000?'awaiting-first-backup':'stale',snapshotTime,retentionDays:30};
  }
 };
}
exports.databaseBackupGuard=onSchedule({schedule:'41 3 * * *',timeZone:'Asia/Taipei',region:'asia-east1',serviceAccount:`database-backup@${PROJECT}.iam.gserviceaccount.com`,memory:'256MiB',cpu:'gcf_gen1',timeoutSeconds:540,maxInstances:1,concurrency:1,retryCount:3,minBackoffSeconds:600,maxBackoffSeconds:1800,maxRetrySeconds:7200},async()=>{
 if(process.env.GCLOUD_PROJECT!==PROJECT)throw new Error('Backup project mismatch');
 try{const result=await runBackup({api:await makeApi()});console.info('DATABASE_BACKUP_VERIFIED',JSON.stringify(result));return result}
 catch(error){console.error('DATABASE_BACKUP_FAILED',JSON.stringify({message:String(error.message).slice(0,250)}));throw error}
});
