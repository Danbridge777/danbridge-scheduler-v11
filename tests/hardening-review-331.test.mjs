import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {cloudBackupListingState,prepareDailyShardedBackup,sealDailyShardedBackup,verifyDailyShardedBackupReadback} from '../js/core/cloud-daily-sharded-backup.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {installAppCheckExchangeObserver} from '../js/core/app-check-exchange-observer.js';

const options={day:'2026-09-16',environment:'production'};
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
function plan(){const db=empty();db.lessons=[{id:'lesson-1'}];return prepareDailyShardedBackup(db,options)}
test('backup status never promotes uploading, malformed or wrong-environment manifests to success',()=>{
 const p=plan(),sealed=sealDailyShardedBackup(p.manifest,verifyDailyShardedBackupReadback(p.manifest,p.chunks),{verifiedBy:'test',verifiedByEmail:'test@example.invalid'});
 assert.equal(cloudBackupListingState(null,options),'missing');
 assert.equal(cloudBackupListingState(p.manifest,options),'uploading');
 assert.equal(cloudBackupListingState(sealed,options),'sealed');
 for(const patch of [{verifiedHash:'wrong'},{chunkCount:0},{recordCount:-1},{counts:{}},{environment:'staging'},{companyId:'other'},{day:'2026-09-15'},{sourceHash:undefined,verifiedHash:undefined}])assert.equal(cloudBackupListingState({...sealed,...patch},options),'invalid');
 assert.equal(cloudBackupListingState({snapshot:{},hash:'ok'},{...options,legacyHash:()=> 'ok'}),'legacy-verified');
 assert.equal(cloudBackupListingState({snapshot:{},hash:'ok'},{...options,legacyHash:()=>{throw Error('damaged')}}),'invalid');
});
test('backup listing runtime clears stale success, reports incomplete fetches, and has no restore button for invalid data',async()=>{
 const source=fs.readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function listCloudSafetyBackups(){'),source.indexOf('async function readCloudSafetyBackup('));
 for(const scenario of ['uploading','invalid','partial','missing','sealed']){
  const p=plan(),sealed=sealDailyShardedBackup(p.manifest,verifyDailyShardedBackupReadback(p.manifest,p.chunks),{verifiedBy:'test',verifiedByEmail:'test@example.invalid'});
  const row=scenario==='uploading'?p.manifest:scenario==='invalid'?{...sealed,verifiedHash:'wrong'}:sealed;
  const list={innerHTML:'',querySelectorAll:()=>[]},statuses=[];
  const app={cloudBackupListingState,cloudRole:'owner',cloud:{},COMPANY_ID:'danbridge',DANBRIDGE_ENVIRONMENT:'production',CLOUD_BACKUP_RETENTION_DAYS:30,dailyBackupConfirmedDay:options.day,
   document:{getElementById:()=>list},collection:(_cloud,...parts)=>parts.join('/'),getDocs:async path=>{if(path.includes('dailyBackups')){if(scenario==='partial')throw Error('unavailable');return{docs:[]}}return{docs:scenario==='missing'?[]:[{id:options.day,data:()=>row}]}},
   backupDayKey:()=>options.day,dataHash:()=>'',escapeHTML:String,formatNotificationTimestamp:()=>'',resilienceStatus:(...args)=>statuses.push(args),console:{warn(){},error(){}}};
  vm.createContext(app);vm.runInContext(fn,app);await app.listCloudSafetyBackups();
  assert.equal(statuses.at(-1)[1],scenario==='sealed'?'ok':scenario==='invalid'||scenario==='partial'?'error':'pending');
  assert.equal(app.dailyBackupConfirmedDay,scenario==='sealed'?options.day:'');
  if(['uploading','invalid','missing'].includes(scenario))assert.doesNotMatch(list.innerHTML,/cloud-backup-restore/);
 }
});
test('group-roster and revenue-branch audit detects missing links without changing any record',()=>{
 const db={branches:[{id:'art'}],students:[{id:'group'},{id:'s1'}],teachers:[{id:'t1'}],lessons:[{id:'l1',branchId:'art',billingBranchId:'gone',studentId:'group',teacherId:'t1',deliveryMode:'onsite',groupStudentIds:['s1','missing','missing']} ]};
 const before=JSON.stringify(db),window={};
 vm.runInNewContext(fs.readFileSync(new URL('../js/core/data-integrity.js',import.meta.url),'utf8'),{db,window});
 const result=window.auditDataIntegrity();assert.equal(result.issues.orphanGroupStudents,1);assert.equal(result.issues.duplicateGroupStudents,1);assert.equal(result.issues.invalidBillingBranch,1);assert.equal(result.total,3);assert.equal(JSON.stringify(db),before);
 db.lessons[0].groupStudentIds=['s1'];db.lessons[0].billingBranchId='';assert.equal(window.auditDataIntegrity().total,0,'unassigned ownership is not invented');
});
test('App Check evidence survives normal reload, is sanitized again, and installation is idempotent',async()=>{
 const endpoint='https://firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken';
 let saved=null,calls=0;
 const storage={getItem:()=>saved,setItem:(_k,value)=>{saved=value}};
 const target=()=>({sessionStorage:storage,fetch:async()=>{calls++;return Response.json({error:{status:'PERMISSION_DENIED',message:'App attestation failed.'}},{status:403})}});
 const first=target(),one=installAppCheckExchangeObserver({target:first,projectId:'p',appId:'a'});
 assert.strictEqual(installAppCheckExchangeObserver({target:first,projectId:'p',appId:'a'}),one);
 await first.fetch(endpoint);await one.settled();assert.equal(calls,1);
 const stored=JSON.parse(saved);stored[0].privateToken='DO_NOT_KEEP';stored[0].reasons=['DO_NOT_KEEP'];saved=JSON.stringify(stored);
 const second=target(),two=installAppCheckExchangeObserver({target:second,projectId:'p',appId:'a'});
 await second.fetch(endpoint);await two.settled();assert.equal(calls,2);assert.equal(JSON.parse(saved).length,2);assert.doesNotMatch(saved,/DO_NOT_KEEP|privateToken/);
 assert.equal(installAppCheckExchangeObserver({target:second,projectId:'other',appId:'a'}),null);
});
test('one-year 30,000-lesson synthetic backup restores every collection and rejects missing or changed chunks',()=>{
 const db=empty();db.students=[{id:'s1',parent:'家長',billingFamilyId:'f1',rate:600}];db.teachers=[{id:'t1',rate:300}];
 db.lessons=Array.from({length:30000},(_,i)=>({id:`annual-${i}`,date:new Date(Date.UTC(2025,8,17+i%365)).toISOString().slice(0,10),studentId:'s1',teacherId:'t1',start:'10:00',end:'11:30',branchId:'attend',billingBranchId:'own'}));
 db.collectionRecords=[{id:'r1',month:'2026-08',amount:900,studentIds:['s1']}];db.settlementRecords=[{id:'2026-08::all',locked:true,totalRevenue:900}];
 const p=prepareDailyShardedBackup(db,{...options,maxChunkBytes:50000});
 const result=verifyDailyShardedBackupReadback(p.manifest,JSON.parse(JSON.stringify(p.chunks)));
 assert.deepEqual(result.db,db);assert.equal(result.db.lessons.length,30000);assert.ok(p.chunks.length>1);
 assert.ok(p.chunks.every(c=>Buffer.byteLength(JSON.stringify(c))<51000),'chunk payloads remain below the selected budget plus metadata');
 assert.throws(()=>verifyDailyShardedBackupReadback(p.manifest,p.chunks.slice(1)));
 const tampered=structuredClone(p.chunks);tampered.find(c=>c.collection==='lessons').items[0].billingBranchId='wrong';assert.throws(()=>verifyDailyShardedBackupReadback(p.manifest,tampered));
});
