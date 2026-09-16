// Only creates backup-specific monitoring resources; leaves existing policies untouched.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877';
const account=require(root+'/auth.js').getGlobalDefaultAccount();
await require(root+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js');
const monitoring=new Client({auth:true,apiVersion:'v3',urlPrefix:'https://monitoring.googleapis.com'}),logging=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://logging.googleapis.com'});
const get=async(c,p)=>(await c.get(p,{skipLog:{resBody:true}})).body;
const post=async(c,p,b)=>(await c.post(p,b,{skipLog:{resBody:true}})).body;
const base=`projects/${project}`,email='a0965487920@gmail.com';
if(account.user.email!==email)throw new Error('Alert destination must match authorized project owner');
const channels=await get(monitoring,base+'/notificationChannels');if(channels.nextPageToken)throw new Error('Unexpected channels pagination');
let channel=channels.notificationChannels?.find(c=>c.displayName==='Danbridge backup owner'&&c.type==='email'&&c.labels?.email_address===email&&c.enabled);
if(!channel)channel=await post(monitoring,base+'/notificationChannels',{type:'email',displayName:'Danbridge backup owner',labels:{email_address:email},enabled:true,description:'Alerts only for the user-approved database backup plan.'});
const metricId='danbridge_database_backup_verified',metricPath=base+'/metrics/'+metricId;
let metric;try{metric=await get(logging,metricPath)}catch(e){if(e.status!==404)throw e;metric=await post(logging,base+'/metrics',{name:metricId,description:'One count per completed backup guard execution; no document contents.',filter:'resource.type="cloud_run_revision" resource.labels.service_name="databasebackupguard" textPayload:"DATABASE_BACKUP_VERIFIED"',metricDescriptor:{metricKind:'DELTA',valueType:'INT64',unit:'1'}})}
const existing=await get(monitoring,base+'/alertPolicies');if(existing.nextPageToken)throw new Error('Unexpected alert pagination');
const policies=[
 {displayName:'Danbridge database backup failure',conditions:[{displayName:'Backup guard or scheduler failure',conditionMatchedLog:{filter:'(resource.type="cloud_run_revision" AND resource.labels.service_name="databasebackupguard" AND severity>=ERROR) OR (resource.type="cloud_scheduler_job" AND resource.labels.job_id="firebase-schedule-databaseBackupGuard-asia-east1" AND severity>=ERROR)'}}],alertStrategy:{notificationRateLimit:{period:'86400s'},autoClose:'604800s'}},
 {displayName:'Danbridge database backup missing heartbeat',conditions:[{displayName:'No verified run in 25 hours, sustained for one hour',conditionPrometheusQueryLanguage:{query:`sum(sum_over_time({"logging.googleapis.com/user/${metricId}", monitored_resource="cloud_run_revision", service_name="databasebackupguard"}[25h])) < 1 or absent_over_time({"logging.googleapis.com/user/${metricId}", monitored_resource="cloud_run_revision", service_name="databasebackupguard"}[25h])`,duration:'3600s',evaluationInterval:'300s'}}],alertStrategy:{autoClose:'604800s'}}
];
const names=[];
for(const p of policies){const old=existing.alertPolicies?.find(x=>x.displayName===p.displayName);if(old){names.push(old.name);continue}const result=await post(monitoring,base+'/alertPolicies',{...p,combiner:'OR',enabled:true,severity:'ERROR',notificationChannels:[channel.name],documentation:{mimeType:'text/markdown',content:'Database backup requires attention. Inspect databaseBackupGuard logs and the private backup bucket control/health.json. Do not import into or overwrite production. App scheduling and billing services are independent.'}});names.push(result.name)}
console.log(JSON.stringify({channel:channel.name,channelEnabled:channel.enabled,verificationStatus:channel.verificationStatus||'not-required-or-unspecified',metric:metric.name,policies:names},null,2));
