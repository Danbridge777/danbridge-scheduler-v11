// Read-only production inspection. No record contents or credentials are
// written to disk/output; query the two pricing collections at one read time.
import {createRequire} from 'node:module';
import {validatePricingHistory} from '../js/core/pricing-history-policy.js';
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(root+'/auth.js').getGlobalDefaultAccount();
await require(root+'/requireAuth.js').requireAuth({project:'danbridge-d8877',user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js');
const cloud=new Client({auth:true,apiVersion:'v1',urlPrefix:require(root+'/api.js').firestoreOrigin()});
const decode=v=>v?.stringValue??v?.timestampValue??v?.booleanValue??(v?.integerValue!==undefined?Number(v.integerValue):v?.doubleValue!==undefined?Number(v.doubleValue):v?.arrayValue?(v.arrayValue.values||[]).map(decode):v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null);
let readTime;const result={project:'danbridge-d8877',dataWrites:0,collections:{}};
for(const collection of ['students','teachers']){
 const response=await cloud.post(`projects/danbridge-d8877/databases/(default)/documents/productionFullRecordShadows/danbridge/collections/${collection}:runQuery`,{structuredQuery:{from:[{collectionId:'records'}]},...(readTime?{readTime}:{})},{skipLog:{reqBody:true,resBody:true}});
 readTime??=response.body.find(row=>row.readTime)?.readTime;if(!readTime)throw Error('Missing server read time');
 const records=response.body.filter(row=>row.document).map(row=>Object.fromEntries(Object.entries(row.document.fields||{}).map(([key,value])=>[key,decode(value)])));
 const summary={active:0,deleted:0,withHistory:0,invalidHistory:0};
 for(const wrapper of records){if(wrapper.deleted){summary.deleted++;continue}summary.active++;try{if(validatePricingHistory(wrapper.record,collection))summary.withHistory++}catch{summary.invalidHistory++}}
 result.collections[collection]=summary;
}
result.readTime=readTime;console.log(JSON.stringify(result,null,2));
if(Object.values(result.collections).some(row=>row.invalidHistory))process.exitCode=1;
