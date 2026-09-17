import {createRequire} from 'node:module';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const project='danbridge-d8877',email='huberlucas88@gmail.com',apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Only --apply is accepted; target cannot be overridden');
const account=require(cli+'/auth.js').getGlobalDefaultAccount();await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=require(cli+'/api.js'),client=new Client({auth:true,apiVersion:'v1',urlPrefix:api.firestoreOrigin()}),path=`projects/${project}/databases/(default)/documents/companyAccess/${email}`;
const read=async()=>(await client.get(path,{skipLog:{resBody:true}})).body;
const before=await read(),fields=before.fields;
if(fields.companyId?.stringValue!=='danbridge'||fields.active?.booleanValue!==true||fields.role?.stringValue!=='branch_manager'||fields.teacherId?.stringValue!=='mrmyv7thpxttfo'||fields.readOnly?.booleanValue!==true||JSON.stringify(fields.branchIds?.arrayValue?.values)!==JSON.stringify([{stringValue:'art_museum'}]))throw Error('Lucas identity/scope changed; no permission was written');
let state='dry-run';
if(fields.canMoveSchedule?.booleanValue===true)state='already-enabled';
else if(apply){
 await client.patch(path,{fields:{canMoveSchedule:{booleanValue:true}}},{queryParams:{'updateMask.fieldPaths':['canMoveSchedule'],'currentDocument.updateTime':before.updateTime},skipLog:{resBody:true}});
 const after=await read();if(after.fields.canMoveSchedule?.booleanValue!==true)throw Error('Capability readback failed');
 const unchanged=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='canMoveSchedule').sort(([a],[b])=>a.localeCompare(b)));
 if(sha256Canonical(unchanged(fields))!==sha256Canonical(unchanged(after.fields)))throw Error('Concurrent document change detected; verify role before claiming success');
 state='enabled-and-readback-verified';
}
console.log(JSON.stringify({project,email,state,role:'branch_manager',branchIds:['art_museum'],readOnly:true,changedFields:state==='enabled-and-readback-verified'?['canMoveSchedule']:[],businessDataWrites:0}));
