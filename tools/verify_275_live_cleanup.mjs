// Read-only receipts for the four lessons created through Catherine's staging UI.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877-staging';
const account=require(root+'/auth.js').getGlobalDefaultAccount();
await require(root+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js'),cloud=new Client({auth:true,apiVersion:'v1',urlPrefix:require(root+'/api.js').firestoreOrigin()});
const decode=v=>v?.stringValue??v?.timestampValue??v?.booleanValue??(v?.integerValue!==undefined?Number(v.integerValue):v?.doubleValue!==undefined?Number(v.doubleValue):v?.arrayValue?(v.arrayValue.values||[]).map(decode):v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null);
const unpack=d=>Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]));
const prefix=`projects/${project}/databases/(default)/documents`,ids=['lsn_510de775-947c-4f9b-a05a-103d0f8745df','lsn_c7753e6e-29cc-45b6-9d8d-1c898ce234a2','lsn_bc852e36-80cf-4c0f-873b-c0c17d2f7f4d','lsn_ad3a5085-45f3-4df0-bcd7-945ac1261941'];
const records=[];
for(const id of ids){const r=await cloud.get(`${prefix}/stagingActiveRecordV2Records/danbridge/epochs/v2:6ef2009d94faa7acb3b4560cec39dd00/collections/lessons/records/${id}`,{skipLog:{resBody:true}});const d=unpack(r.body);records.push({id,deleted:d.deleted,revision:d.revision,persistedByEmail:d.persistedByEmail,updateTime:r.body.updateTime});if(!d.deleted)process.exitCode=1;}
const response=await cloud.post(`${prefix}/companies/danbridge:runQuery`,{structuredQuery:{from:[{collectionId:'scheduleNotifications'}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:60}},{skipLog:{reqBody:true,resBody:true}});
const notifications=response.body.filter(r=>r.document).map(r=>unpack(r.document)).filter(n=>JSON.stringify(n.details||{}).includes('AUDIT275_CATHERINE')||ids.some(id=>JSON.stringify(n.details||{}).includes(id)));
const recipients={};for(const n of notifications){const k=n.recipientEmail||'unknown';recipients[k]??={count:0,types:{}};recipients[k].count++;const t=n.type||'unknown';recipients[k].types[t]=(recipients[k].types[t]||0)+1;}
console.log(JSON.stringify({project,dataWrites:0,records,notifications:notifications.length,recipients},null,2));
