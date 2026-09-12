// Remove only the unexpected, unused scheduler flag added by Firebase dotenv.
// Exact target and preconditions prevent applying this to scheduler/trusted APIs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const project='danbridge-d8877',name=`projects/${project}/locations/asia-east1/functions/productionTeacherLeaveOperation`;
const before=JSON.parse(await readFile('/private/tmp/danbridge-319-danbridge-d8877-leave-before.json','utf8'));
assert.equal(before.name,name);assert.equal(before.serviceConfig.environmentVariables?.DANBRIDGE_ROLE_TRANSPORT,undefined);
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://cloudfunctions.googleapis.com'});
const current=(await api.get(name,{skipLog:{resBody:true}})).body;assert.equal(current.state,'ACTIVE');
const environmentVariables={...current.serviceConfig.environmentVariables};
assert.equal(environmentVariables.DANBRIDGE_ROLE_TRANSPORT,'published-v1-compatible');delete environmentVariables.DANBRIDGE_ROLE_TRANSPORT;
const op=(await api.patch(name,{name,serviceConfig:{environmentVariables}},{queryParams:{updateMask:'serviceConfig.environmentVariables'},skipLog:{reqBody:true,resBody:true}})).body;
console.log(JSON.stringify({project,function:'productionTeacherLeaveOperation',removedKeys:['DANBRIDGE_ROLE_TRANSPORT'],otherSettingsChanged:false,operation:op.name,done:op.done===true}));
