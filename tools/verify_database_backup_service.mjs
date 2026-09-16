import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib';
const {PROJECT,DATABASE,BUCKET}=require('../functions/backup-service/policy.cjs');
const account=require(root+'/auth.js').getGlobalDefaultAccount();await require(root+'/requireAuth.js').requireAuth({project:PROJECT,user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js');
const c=(origin,apiVersion)=>new Client({auth:true,urlPrefix:origin,apiVersion});
const functions=c('https://cloudfunctions.googleapis.com','v2'),scheduler=c('https://cloudscheduler.googleapis.com','v1'),storage=c('https://storage.googleapis.com','storage/v1'),fs=c('https://firestore.googleapis.com','v1'),run=c('https://run.googleapis.com','v2'),iam=c('https://iam.googleapis.com','v1');
const get=async(c,p,options={})=>(await c.get(p,{skipLog:{resBody:true},...options})).body;
const optional=async fn=>{try{return await fn()}catch(e){if(e.status===404)return null;throw e}};
const base=`projects/${PROJECT}/locations/asia-east1`,jobName=base+'/jobs/firebase-schedule-databaseBackupGuard-asia-east1';
const [fn,job,bucket,bp,role,schedules,backups]=await Promise.all([
 get(functions,base+'/functions/databaseBackupGuard'),get(scheduler,jobName),get(storage,'b/'+BUCKET),get(storage,`b/${BUCKET}/iam`),get(iam,`projects/${PROJECT}/roles/databaseBackupExporter`),get(fs,DATABASE+'/backupSchedules'),get(fs,`projects/${PROJECT}/locations/asia-east1/backups`)
]);
if(fn.state!=='ACTIVE'||fn.serviceConfig.serviceAccountEmail!==`database-backup@${PROJECT}.iam.gserviceaccount.com`)throw new Error('Backup function not active or identity mismatch');
if(job.state!=='ENABLED'||job.schedule!=='41 3 * * *'||job.timeZone!=='Asia/Taipei')throw new Error('Schedule mismatch');
if(!bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled||bucket.iamConfiguration?.publicAccessPrevention!=='enforced')throw new Error('Bucket privacy not enforced');
if(bp.bindings.some(b=>b.members.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))))throw new Error('Public bucket binding');
if(role.includedPermissions.some(p=>/import|restore|delete|entities|update|create/.test(p)))throw new Error('Backup role has business write authority');
const serviceName=fn.serviceConfig.service,invoke=(await run.get(serviceName+':getIamPolicy',{skipLog:{resBody:true}})).body;
if(invoke.bindings?.some(b=>b.members.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))))throw new Error('Backup function publicly invokable');
if(process.argv.includes('--run'))await scheduler.post(jobName+':run',{}, {skipLog:{resBody:true}});
const healthMeta=await optional(()=>get(storage,`b/${BUCKET}/o/`+encodeURIComponent('control/health.json')));
const health=healthMeta?await get(storage,`b/${BUCKET}/o/`+encodeURIComponent('control/health.json'),{queryParams:{alt:'media'}}):null;
const manifests=await get(storage,`b/${BUCKET}/o`,{queryParams:{prefix:'manifests/',fields:'items(name,generation,size),nextPageToken'}});
const objects=await get(storage,`b/${BUCKET}/o`,{queryParams:{prefix:'exports/',fields:'items(name,size,crc32c),nextPageToken',maxResults:1000}});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),triggered:process.argv.includes('--run'),function:{state:fn.state,revision:fn.serviceConfig.revision,source:fn.buildConfig.source,serviceAccount:fn.serviceConfig.serviceAccountEmail,publicInvoker:false},schedule:{state:job.state,cron:job.schedule,timeZone:job.timeZone,lastAttemptTime:job.lastAttemptTime,status:job.status,nextRun:job.scheduleTime},bucket:{name:bucket.name,location:bucket.location,publicAccessPrevention:bucket.iamConfiguration.publicAccessPrevention,softDeleteSeconds:bucket.softDeletePolicy?.retentionDurationSeconds},backupRolePermissions:role.includedPermissions,dailySchedules:schedules.backupSchedules,managedBackups:(backups.backups||[]).map(b=>({name:b.name,state:b.state,snapshotTime:b.snapshotTime})),health,monthlyManifests:manifests.items||[],exportObjects:{count:(objects.items||[]).length,truncated:!!objects.nextPageToken,bytes:(objects.items||[]).reduce((n,o)=>n+Number(o.size||0),0),metadata:(objects.items||[]).filter(o=>o.name.endsWith('.overall_export_metadata'))},formalDataWrites:0},null,2));
