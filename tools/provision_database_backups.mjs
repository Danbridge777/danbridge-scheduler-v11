// Explicitly scoped provisioning for the user-approved database backup plan.
// Default is read-only. No Firestore business-document, Rules, or app deployment writes.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib';
const {PROJECT,DATABASE,BUCKET}=require('../functions/backup-service/policy.cjs');
const apply=process.argv.includes('--apply'),account=require(root+'/auth.js').getGlobalDefaultAccount();
await require(root+'/requireAuth.js').requireAuth({project:PROJECT,user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js');
const client=(origin,version='v1')=>new Client({auth:true,apiVersion:version,urlPrefix:origin});
const crm=client('https://cloudresourcemanager.googleapis.com'),iam=client('https://iam.googleapis.com'),storage=client('https://storage.googleapis.com','storage/v1'),fs=client('https://firestore.googleapis.com'),monitor=client('https://monitoring.googleapis.com','v3');
const opts={skipLog:{resBody:true}};
const get=async(c,path,extra={})=>(await c.get(path,{...opts,...extra})).body;
const post=async(c,path,body)=>(await c.post(path,body,{...opts})).body;
const optional=async fn=>{try{return await fn()}catch(e){if(e.status===404||e.context?.response?.statusCode===404)return null;throw e}};
const project=await get(crm,'projects/'+PROJECT),number=project.projectNumber;
const email=`database-backup@${PROJECT}.iam.gserviceaccount.com`,agent=`service-${number}@gcp-sa-firestore.iam.gserviceaccount.com`,roleId='databaseBackupExporter',roleName=`projects/${PROJECT}/roles/${roleId}`;
const permissions=['datastore.backupSchedules.list','datastore.backups.list','datastore.databases.export','datastore.databases.get','datastore.operations.get','datastore.operations.list'];
let bucket=await optional(()=>get(storage,'b/'+BUCKET)),sa=await optional(()=>get(iam,`projects/${PROJECT}/serviceAccounts/${email}`)),role=await optional(()=>get(iam,roleName));
const schedules=await get(fs,DATABASE+'/backupSchedules');
if(schedules.nextPageToken)throw new Error('Unexpected schedule pagination');
let daily=schedules.backupSchedules?.find(s=>s.dailyRecurrence);
if(daily&&daily.retention!=='2592000s')throw new Error('Existing daily retention differs; no change made');
if(bucket&&(bucket.labels?.purpose!=='database-backup'||String(bucket.projectNumber)!==String(number)))throw new Error('Bucket ownership/purpose mismatch');
if(role&&JSON.stringify([...role.includedPermissions].sort())!==JSON.stringify([...permissions].sort()))throw new Error('Existing backup role differs');
if(apply){
 if(!sa)sa=await post(iam,`projects/${PROJECT}/serviceAccounts`,{accountId:'database-backup',serviceAccount:{displayName:'Database backup only — no import or business writes'}});
 if(!role)role=await post(iam,`projects/${PROJECT}/roles`,{roleId,role:{title:'Database backup export and health read',description:'Export plus backup status only. No imports, restores, deletes or document writes.',stage:'GA',includedPermissions:permissions}});
 if(!bucket)bucket=(await storage.post('b',{name:BUCKET,location:'ASIA-EAST1',storageClass:'STANDARD',labels:{purpose:'database-backup'},iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'},softDeletePolicy:{retentionDurationSeconds:'604800'}},{...opts,queryParams:{project:PROJECT}})).body;
 if(!bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled||bucket.iamConfiguration?.publicAccessPrevention!=='enforced')throw new Error('Backup bucket is not private/enforced');
 const policy=await post(crm,`projects/${PROJECT}:getIamPolicy`,{options:{requestedPolicyVersion:3}});
 const member='serviceAccount:'+email;
 if(!(policy.bindings||[]).some(b=>b.role===roleName&&!b.condition&&b.members.includes(member))){policy.bindings||=[];policy.bindings.push({role:roleName,members:[member]});await post(crm,`projects/${PROJECT}:setIamPolicy`,{policy})}
 const bp=await get(storage,`b/${BUCKET}/iam`,{queryParams:{optionsRequestedPolicyVersion:3}});
 if((bp.bindings||[]).some(b=>b.members.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))))throw new Error('Public backup IAM detected');
 for(const [r,m] of [['roles/storage.objectUser',email],['roles/storage.legacyBucketReader',email],['roles/storage.objectAdmin',agent],['roles/storage.legacyBucketReader',agent]]){
  bp.bindings||=[];let binding=bp.bindings.find(b=>b.role===r&&!b.condition);if(!binding){binding={role:r,members:[]};bp.bindings.push(binding)}if(!binding.members.includes('serviceAccount:'+m))binding.members.push('serviceAccount:'+m);
 }
 await storage.put(`b/${BUCKET}/iam`,bp,{...opts});
 if(!daily)daily=await post(fs,DATABASE+'/backupSchedules',{retention:'2592000s',dailyRecurrence:{}});
}
const channels=await get(monitor,`projects/${PROJECT}/notificationChannels`);
console.log(JSON.stringify({mode:apply?'apply':'read-only',project:PROJECT,number,bucket:bucket?{name:bucket.name,location:bucket.location,iam:bucket.iamConfiguration,softDelete:bucket.softDeletePolicy}:null,serviceAccountExists:!!sa,customRole:role?.name||null,dailySchedule:daily||null,notificationChannels:(channels.notificationChannels||[]).map(c=>({name:c.name,type:c.type,enabled:c.enabled,verificationStatus:c.verificationStatus,displayName:c.displayName})),channelsTruncated:!!channels.nextPageToken,formalDataWrites:0},null,2));
