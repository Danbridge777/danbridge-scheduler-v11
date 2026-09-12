// Read existing role-view shapes only; never publishes, seeds, or repairs data.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib';
const project='danbridge-d8877',account=require(root+'/auth.js').getGlobalDefaultAccount();
await require(root+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js'),api=require(root+'/api.js');
const client=new Client({auth:true,apiVersion:'v1',urlPrefix:api.firestoreOrigin()});
const prefix=`projects/${project}/databases/(default)/documents/`;
const decode=v=>v?.nullValue!==undefined?null:v?.stringValue??v?.booleanValue??(v?.integerValue!==undefined?Number(v.integerValue):v?.doubleValue!==undefined?v.doubleValue:v?.timestampValue??(v?.arrayValue?(v.arrayValue.values||[]).map(decode):v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null));
async function list(path){let rows=[],pageToken;do{const response=await client.get(prefix+path,{queryParams:{pageSize:100,...(pageToken?{pageToken}:{})},skipLog:{resBody:true}});rows.push(...(response.body.documents||[]));pageToken=response.body.nextPageToken;if(rows.length>1000)throw Error('Role inventory exceeds readonly safety bound')}while(pageToken);return rows.map(row=>Object.fromEntries(Object.entries(row.fields||{}).map(([k,v])=>[k,decode(v)])))}
const groups={teacher:await list('companies/danbridge/teacherViews'),scheduler:await list('companies/danbridge/schedulerViews'),branch:(await list('companyAccess')).filter(row=>row.companyId==='danbridge'&&row.active===true&&row.role==='branch_manager')};
const result={project,writes:0,roles:Object.fromEntries(Object.entries(groups).map(([kind,rows])=>[kind,rows.map(row=>{const value=kind==='branch'?row.scopedDb:row.db;return{legacyDbPresent:!!value,chunkManifestPresent:!!row.roleChunkManifest,legacyJsonBytes:value?Buffer.byteLength(JSON.stringify(value)):0,headJsonBytes:Buffer.byteLength(JSON.stringify(row)),lessonCount:value?.lessons?.length??null,sourceRecordRevision:row.sourceRecordRevision??row.scopedSourceRecordRevision??null}})]))};
console.log(JSON.stringify(result,null,2));
