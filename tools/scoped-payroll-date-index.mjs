// Add only the collection-scoped date index required by monthly payroll reads.
// Preserve every existing index, TTL setting, Rules and business record.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const [project,mode='read']=process.argv.slice(2);
assert.ok(['danbridge-d8877-staging','danbridge-d8877'].includes(project));assert.ok(['read','apply'].includes(mode));
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib',account=require(root+'/auth.js').getGlobalDefaultAccount();
await require(root+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js'),client=new Client({auth:true,apiVersion:'v1',urlPrefix:'https://firestore.googleapis.com'});
const name=`projects/${project}/databases/(default)/collectionGroups/records/fields/record.date`;
const before=(await client.get('/'+name,{skipLog:{resBody:true}})).body;
const indexes=before.indexConfig?.indexes||[],exists=indexes.some(i=>i.queryScope==='COLLECTION'&&i.fields?.some(f=>f.fieldPath==='record.date'&&f.order==='ASCENDING'));
console.log(JSON.stringify({project,mode,businessWrites:0,before}));
if(mode==='apply'&&!exists){
 const preserved=indexes.map(({queryScope,fields,apiScope,density})=>({queryScope,fields,...(apiScope?{apiScope}:{}),...(density?{density}:{})}));
 preserved.push({queryScope:'COLLECTION',fields:[{fieldPath:'record.date',order:'ASCENDING'}]});
 const result=(await client.patch('/'+name,{name,indexConfig:{indexes:preserved}},{queryParams:{updateMask:'indexConfig'},skipLog:{resBody:true}})).body;
 console.log(JSON.stringify({phase:'submitted',result}));
}
