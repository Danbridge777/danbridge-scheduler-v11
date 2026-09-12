// Exact production health metadata only; no business rows, credentials or writes.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=require(cli+'/api.js');
const cloud=new Client({auth:true,apiVersion:'v1',urlPrefix:api.firestoreOrigin()});
const base=`projects/${project}/databases/(default)`,company=base+'/documents/companies/danbridge';
const decode=v=>v?.nullValue!==undefined?null:v?.stringValue??v?.timestampValue??v?.booleanValue??(v?.integerValue!==undefined?Number(v.integerValue):v?.arrayValue?(v.arrayValue.values||[]).map(decode):v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null);
const fields=row=>Object.fromEntries(Object.entries(row?.fields||{}).map(([k,v])=>[k,decode(v)]));
const startedAt=new Date().toISOString();
const health=fields((await cloud.get(company+'/systemHealth/ownerAlert',{skipLog:{resBody:true}})).body);
const database=(await cloud.get(base,{skipLog:{resBody:true}})).body;
const recent=(await cloud.post(company+':runQuery',{structuredQuery:{from:[{collectionId:'errorEvents'}],where:{fieldFilter:{field:{fieldPath:'occurredAt'},op:'GREATER_THAN_OR_EQUAL',value:{timestampValue:new Date(Date.now()-86400000).toISOString()}}},select:{fields:['area','code','release','occurredAt'].map(fieldPath=>({fieldPath}))},limit:501}},{skipLog:{resBody:true}})).body;
const errors=recent.filter(r=>r.document).map(r=>fields(r.document)),grouped={};
for(const row of errors){const key=JSON.stringify([row.area||'',row.code||'',row.release||'']);grouped[key]=(grouped[key]||0)+1}
const scheduler=new Client({auth:true,apiVersion:'v1',urlPrefix:'https://cloudscheduler.googleapis.com'});
const jobs=(await scheduler.get(`projects/${project}/locations/asia-east1/jobs`,{skipLog:{resBody:true}})).body.jobs||[];
console.log(JSON.stringify({project,startedAt,finishedAt:new Date().toISOString(),writes:0,health,protection:{pitr:database.pointInTimeRecoveryEnablement,deletion:database.deleteProtectionState,location:database.locationId},recentErrors:{count:errors.length,truncated:errors.length===501,groups:grouped},maintenanceJobs:jobs.filter(j=>/productionDailyMaintenance/.test(j.name)).map(j=>({name:j.name,state:j.state,schedule:j.schedule,timeZone:j.timeZone,scheduleTime:j.scheduleTime,lastAttemptTime:j.lastAttemptTime,status:j.status}))},null,2));
