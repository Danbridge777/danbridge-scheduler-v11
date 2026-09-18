import {createRequire} from 'node:module';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Only --apply accepted');
const apply=process.argv.includes('--apply');
const targets=[{project:'danbridge-d8877',email:'huberlucas88@gmail.com',teacherId:'mrmyv7thpxttfo'},{project:'danbridge-d8877-staging',email:'aa0966626336@gmail.com',teacherId:'ent_be028c89-d80f-4887-830e-5b8b0273293a'}];
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
for(const {project,email,teacherId} of targets){
 await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
 const {Client}=require(cli+'/apiv2.js'),api=require(cli+'/api.js'),client=new Client({auth:true,apiVersion:'v1',urlPrefix:api.firestoreOrigin()});
 const path=`projects/${project}/databases/(default)/documents/companyAccess/${email}`;
 const read=async()=>(await client.get(path,{skipLog:{resBody:true}})).body;
 const before=await read(),f=before.fields;
 if(f.companyId?.stringValue!=='danbridge'||f.active?.booleanValue!==true||f.role?.stringValue!=='branch_manager'||f.teacherId?.stringValue!==teacherId||f.readOnly?.booleanValue!==true||JSON.stringify(f.branchIds?.arrayValue?.values)!==JSON.stringify([{stringValue:'art_museum'}]))throw Error('Identity/scope changed; no write');
 let state='planned';
 if(f.canMoveSchedule?.booleanValue!==true)state='already-locked';
 else if(apply){
  await client.patch(path,{fields:{canMoveSchedule:{booleanValue:false}}},{queryParams:{'updateMask.fieldPaths':['canMoveSchedule'],'currentDocument.updateTime':before.updateTime},skipLog:{resBody:true}});
  const after=await read(),withoutMove=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='canMoveSchedule'));
  if(after.fields.canMoveSchedule?.booleanValue!==false||sha256Canonical(withoutMove(f))!==sha256Canonical(withoutMove(after.fields)))throw Error('Readback changed; inspect before proceeding');
  state='locked-and-readback-verified';
 }
 console.log(JSON.stringify({project,email,state,changedFields:state==='locked-and-readback-verified'?['canMoveSchedule']:[],businessWrites:0}));
}
