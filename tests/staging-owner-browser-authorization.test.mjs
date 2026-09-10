import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const reader=source.slice(source.indexOf('async function verifyActiveStagingV2Owner('),source.indexOf('// 舊版 Header 使用 onclick=' )).replace('export function ','function ');
const prewrite=source.slice(source.indexOf('async function confirmStagingV2DurablePrewriteBackup('),source.indexOf('async function startOwnerStagingV2Runtime('));
function harness(options={}){
 const app={options:{projectId:'danbridge-d8877-staging'}},calls=[];
 const context={app,auth:{app},cloud:{app},firebaseConfig:{projectId:'danbridge-d8877-staging'},DANBRIDGE_ENVIRONMENT:'staging',COMPANY_ID:'danbridge',OWNER_EMAIL:'primary@example.test',cloudRole:'owner',document:{body:{dataset:{}}},activeOwnerControllerEpoch:'epoch-123',activeOwnerV2HeadState:'hn',activeOwnerV2Fence:{targetV2Epoch:'epoch-123',fenceHash:'hash'}};
 context.auth.currentUser={uid:'owner-123456',email:options.primary?context.OWNER_EMAIL:'backup@example.test',getIdTokenResult:async()=>{calls.push('token');options.token?.(context)}};
 context.cloudUid=context.auth.currentUser.uid;context.cloudEmailKey=context.auth.currentUser.email;
 context.doc=(_, ...path)=>path.join('/');
 let accessReads=0;
 context.getDocFromServer=async path=>{
  calls.push(path);accessReads++;
  await options.accessRead?.(context,accessReads);
  return {exists:()=>options.exists!==false,data:()=>options.access??{active:true,role:'owner',companyId:'danbridge'}};
 };
 context.createStagingV2AuthorityReadLoader=()=>({scope:'test',load:async()=>{calls.push('inventory');await options.inventory?.(context);return {documentsByCollection:{lessons:[]}}}});
 vm.createContext(context);vm.runInContext(reader+'\n'+prewrite,context);
 return {context,calls,read:async()=>context.createExplicitStagingV2AuthorityReadLoader().load({activationEpoch:'epoch-123'}),prewrite:()=>context.confirmStagingV2DurablePrewriteBackup()};
}
test('primary and server-confirmed backup Owner may read the actual staging authority wrapper',async()=>{
 for(const primary of [true,false]){const h=harness({primary});await h.read();assert.equal(h.calls.filter(x=>x==='inventory').length,1);assert.equal(h.calls.filter(x=>x.startsWith('companyAccess/')).length,primary?0:3)}
});
test('missing, inactive, teacher, wrong-company and locally non-owner are denied before inventory',async()=>{
 for(const options of [{exists:false},{access:{active:false,role:'owner',companyId:'danbridge'}},{access:{active:true,role:'teacher',companyId:'danbridge'}},{access:{active:true,role:'owner',companyId:'other'}},{role:'teacher'}]){
  const h=harness(options);if(options.role)h.context.cloudRole=options.role;
  await assert.rejects(h.read());assert.ok(!h.calls.includes('inventory'));
 }
});
test('permission read failure never falls back to locally cached Owner permission',async()=>{
 const h=harness({accessRead:()=>{throw new Error('permission-denied')}});await assert.rejects(h.read(),/permission-denied/);assert.ok(!h.calls.includes('inventory'));
});
test('identity changes during access, token or inventory reject the read result',async()=>{
 const change=c=>{c.auth.currentUser={...c.auth.currentUser,uid:'different-1234'}};
 for(const options of [{accessRead:change},{token:change},{inventory:change}]){const h=harness(options);await assert.rejects(h.read());}
});
test('backup Owner revocation during inventory rejects returned data',async()=>{
 const access={active:true,role:'owner',companyId:'danbridge'};
 const h=harness({access,inventory:()=>{access.active=false}});await assert.rejects(h.read(),/active company Owner/);
});
test('production or mismatched Firebase app cannot use staging Owner authorization',async()=>{
 for(const change of [c=>c.DANBRIDGE_ENVIRONMENT='production',c=>c.firebaseConfig.projectId='danbridge-d8877',c=>c.auth.app={},c=>c.cloud.app={}]){
  const h=harness();change(h.context);await assert.rejects(h.read(),/exact staging/);assert.equal(h.calls.length,0);
 }
});
test('server-enforced prewrite status supports backup Owner only with fresh valid access',async()=>{
 const h=harness();await h.prewrite();assert.equal(JSON.parse(h.context.document.body.dataset.activeRecordPrewriteBackup).state,'server-enforced');
 const denied=harness({access:{active:false,role:'owner',companyId:'danbridge'}});await assert.rejects(denied.prewrite());assert.equal(denied.context.document.body.dataset.activeRecordPrewriteBackup,undefined);
});
test('prewrite does not publish confirmation if account, epoch, fence, head or role changes during access read',async()=>{
 for(const change of [c=>c.cloudUid='other',c=>c.activeOwnerControllerEpoch='other-epoch',c=>c.activeOwnerV2Fence={...c.activeOwnerV2Fence},c=>c.activeOwnerV2HeadState='h0',c=>c.cloudRole='teacher',c=>c.auth.currentUser=null]){
  const h=harness({accessRead:change});await assert.rejects(h.prewrite());assert.equal(h.context.document.body.dataset.activeRecordPrewriteBackup,undefined);
 }
});
