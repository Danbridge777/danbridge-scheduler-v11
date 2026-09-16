// Read-only metadata audit. No backup creation, restore, export or deletion.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=require(cli+'/api.js');
const cloud=new Client({auth:true,apiVersion:'v1',urlPrefix:api.firestoreOrigin()});
const base=`projects/${project}/databases/(default)`;
const decode=v=>v?.nullValue!==undefined?null:v?.stringValue??v?.timestampValue??v?.booleanValue??(v?.integerValue!==undefined?Number(v.integerValue):null);
const fields=row=>Object.fromEntries(Object.entries(row?.fields||{}).map(([k,v])=>[k,decode(v)]));
const results={project,checkedAt:new Date().toISOString(),writes:0};
async function capture(key,fn){try{results[key]=await fn()}catch(e){results[key]={unavailable:true,status:e.status??e.context?.response?.statusCode??null}}}
await capture('database',async()=>{const d=(await cloud.get(base,{skipLog:{resBody:true}})).body;return{pitr:d.pointInTimeRecoveryEnablement,deletion:d.deleteProtectionState,earliestVersionTime:d.earliestVersionTime}});
await capture('backupSchedules',async()=>{const d=(await cloud.get(base+'/backupSchedules',{skipLog:{resBody:true}})).body;return{rows:(d.backupSchedules||[]).map(s=>({name:s.name,retention:s.retention,daily:s.dailyRecurrence,weekly:s.weeklyRecurrence})),truncated:!!d.nextPageToken}});
for(const [key,parent,collectionId] of [['dailySharded','dailyShardedBackups/danbridge','days'],['legacyDaily','companies/danbridge','dailyBackups']])await capture(key,async()=>{
 const rows=(await cloud.post(base+'/documents/'+parent+':runQuery',{structuredQuery:{from:[{collectionId}],select:{fields:['schema','day','state','sourceHash','verifiedHash','createdAt','verifiedAt'].map(fieldPath=>({fieldPath}))},limit:401}},{skipLog:{resBody:true}})).body.filter(r=>r.document).map(r=>({id:r.document.name.split('/').at(-1),...fields(r.document)}));
 return{count:rows.length,truncated:rows.length===401,sealed:rows.filter(r=>r.state==='verified'&&typeof r.sourceHash==='string'&&r.sourceHash===r.verifiedHash).length,oldest:rows.map(r=>r.id).sort()[0]||null,newest:rows.map(r=>r.id).sort().at(-1)||null};
});
console.log(JSON.stringify(results,null,2));
