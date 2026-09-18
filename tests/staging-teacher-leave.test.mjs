import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {teacherRecordFromAuthorityEnvelope} from '../js/core/teacher-leave-policy.js';
const {stagingTeacherReader}=createRequire(import.meta.url)('../functions/staging-teacher-leave.cjs');
const epoch='fixture_epoch_339',projectId='danbridge-d8877-staging',teacherId='teacher_fixture';
function fixture(){
 const base=`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}/collections/teachers/records/${teacherId}`;
 const daily=base.replace('Baselines','Records');
 const row={environment:'staging',companyId:'danbridge',activationEpoch:epoch,collection:'teachers',recordId:teacherId,record:{id:teacherId,name:'Test teacher'},deleted:false};
 const rows=new Map([['stagingRecordSyncV1PermanentFences/danbridge',{projectId,companyId:'danbridge',state:'permanently-fenced-after-atomic-v2-structural-activation',targetV2Epoch:epoch}],[base,row]]);
 const db={projectId,doc:path=>({path})},tx={get:async({path})=>({exists:rows.has(path),data:()=>rows.get(path)})};
 return{base,daily,row,rows,read:()=>stagingTeacherReader(db)(tx,teacherId)};
}
test('staging leave reads baseline, prefers current daily and never resurrects a tombstone',async()=>{
 const f=fixture();assert.equal(teacherRecordFromAuthorityEnvelope(await f.read(),teacherId).name,'Test teacher');
 f.rows.set(f.daily,{...f.row,record:{id:teacherId,name:'Updated'}});assert.equal((await f.read()).record.name,'Updated');
 f.rows.set(f.daily,{...f.row,deleted:true});assert.throws(()=>teacherRecordFromAuthorityEnvelope(f.rows.get(f.daily),teacherId),/有效老師/);
 assert.equal((await f.read()).deleted,true);
});
test('staging leave cannot use production, bad fence or foreign envelopes',async()=>{
 assert.throws(()=>stagingTeacherReader({projectId:'danbridge-d8877'}),/環境/);
 for(const patch of [{environment:'production'},{companyId:'other'},{activationEpoch:'foreign_epoch'},{collection:'students'}]){const f=fixture();f.rows.set(f.daily,{...f.row,...patch});await assert.rejects(f.read(),/識別/)}
 const f=fixture();f.rows.get('stagingRecordSyncV1PermanentFences/danbridge').projectId='danbridge-d8877';await assert.rejects(f.read(),/環境/);
});
test('staging endpoint and browser keep environment and App Check guards',async()=>{
 const src=await readFile(new URL('../functions/index.cjs',import.meta.url),'utf8');
 const endpoint=src.slice(src.indexOf('exports.stagingTeacherLeaveOperation='),src.indexOf('exports.productionTeacherLeaveOperation='));
 for(const pattern of [/serviceAccount:SERVICE_ACCOUNT/,/enforceAppCheck:true/,/consumeAppCheckToken:true/,/request.app.alreadyConsumed/,/value!==PROJECT_ID/,/verifiedProductionLeaveActor/,/environment:'staging'/])assert.match(endpoint,pattern);
 assert.doesNotMatch(endpoint,/productionRuntime\(/);
 const client=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
 assert.match(client,/DANBRIDGE_ENVIRONMENT==='staging'&&stagingV2AppCheck\?httpsCallable\(stagingFunctions,'stagingTeacherLeaveOperation'/);
 assert.match(client,/if\(!teacherLeaveCall\|\|!\['owner','teacher'\].includes\(cloudRole\)\)return/);
});
