const fs=require('node:fs');
const path=require('node:path');
const {test,expect}=require('@playwright/test');
const cloudSource=fs.readFileSync(path.join(__dirname,'../../js/core/firebase-auth-and-cloud-sync.module.js'),'utf8');
const helper=cloudSource.slice(cloudSource.indexOf('function createPublishedRoleConsumer('),cloudSource.indexOf('async function subscribeTeacherLegacy('));

// Real browser engines execute the actual page helper and receiver modules.
// Server reads are isolated fixtures; this is NOT cloud latency or login proof.
for(const kind of ['teacher','scheduler','branch_manager'])test(`${kind}: actual page receiver handles 40 create/move/copy/delete and revoked access`,async({page})=>{
 await page.route('**/role-transport-lab',route=>route.fulfill({contentType:'text/html',body:'<button id="next">下一批 40 堂</button><output id="count">0</output><output id="revision">0</output><output id="state"></output><div id="cards"></div>'}));
 await page.goto('/role-transport-lab');
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async({helper,kind})=>{
  const {createPublishedRoleViewConsumer}=await import('/js/core/published-role-view-consumer.js');
  const {buildRoleViewChunks}=await import('/js/core/role-view-chunks.js');
  const {FULL_RECORD_COLLECTIONS}=await import('/js/core/cloud-full-record-shadow.js');
  const identity={kind,email:'isolated@example.test',teacherId:'teacher-1',branchIds:kind==='branch_manager'?['art_museum']:[]};
  let activePublishedRoleConsumer=null,cloudUid='test-user',cloudEmailKey=identity.email,cloudRoleAccessSignature='scope-1',activeRoleWriteAllowed=false;
  const publishedWorkspace=null; // Normal production listener, not the isolated acceptance batch-GET path.
  const auth={currentUser:{uid:cloudUid}},COMPANY_ID='danbridge',roleAccessSignature=value=>value.signature;
  let productionSchedulerGeneration=1,productionSchedulerViewChain=Promise.resolve(),schedulerRecoveryHold=false,head,records=new Map(),reads=0;
  const doc=(_cloud,...segments)=>segments.join('/'),cloud={};
  const snap=data=>({exists:()=>!!data,data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}});
  const getDocFromServer=async ref=>{reads++;return snap(ref==='head'?head:records.get(ref.split('/').at(-1)))};
  const cloudStatus=(message,state)=>document.getElementById('state').textContent=state+':'+message;
  const applied=[];
  const apply=(db,options)=>{applied.push({ids:db.lessons.map(l=>l.id),times:db.lessons.map(l=>l.start),revision:options.snapshot?.sourceRecordRevision});document.getElementById('count').textContent=String(db.lessons.length);document.getElementById('cards').replaceChildren(...db.lessons.map(l=>Object.assign(document.createElement('div'),{textContent:l.id+' '+l.start})));};
  const initializeProductionSchedulerQueue=async()=>({acceptSnapshot:async(db,revision)=>apply(db,{snapshot:{sourceRecordRevision:revision}})});
  // The helper is extracted verbatim from the production page, not reimplemented.
  const create=eval('('+helper.trim()+')');
  const receive=create('head',identity,apply);
  const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
  let revision=0;
  const build=()=>{
   revision++;const cycle=(revision-1)%4,lessons=cycle===3?[]:Array.from({length:cycle===2?80:40},(_,i)=>({id:'lesson-'+i,start:cycle===0?'08:00':'09:00',end:cycle===0?'09:00':'10:00',teacherId:'teacher-1'}));
   const value=buildRoleViewChunks({...empty(),lessons},{identity,sourceRevision:revision,sourceHash:'record-v1:'+String(revision%10).repeat(64),stableRecords:true});
   for(const part of value.chunks)records.set(part.id,part);
   head={roleChunkManifest:value.manifest,sourceRecordRevision:revision,sourceRecordHash:value.manifest.sourceHash,scopedSourceRecordRevision:revision,scopedSourceRecordHash:value.manifest.sourceHash,active:true,companyId:COMPANY_ID,signature:'scope-1'};
  };
  document.getElementById('next').onclick=async()=>{build();await receive(snap(head));document.getElementById('revision').textContent=String(revision)};
  window.fixture={applied,get reads(){return reads},get diagnostics(){return activePublishedRoleConsumer.diagnostics()},async revoke(){cloudRoleAccessSignature='scope-2';await receive(snap(head))},async corrupt(){head={...head,roleChunkManifest:null};await receive(snap(head))},async legacy(){return receive(snap({db:empty()}))},close(){activePublishedRoleConsumer.invalidate()}};
 },{helper,kind});
 // Before a server marker, the actual existing listener remains responsible.
 expect(await page.evaluate(()=>fixture.legacy())).toBe(false);
 expect(await page.evaluate(()=>fixture.reads)).toBe(0);
 for(let round=1;round<=12;round++){
  await page.locator('#next').click();await expect(page.locator('#revision')).toHaveText(String(round));
  await expect(page.locator('#count')).toHaveText(String([40,40,80,0][(round-1)%4]));
 }
 const state=await page.evaluate(()=>({applied:fixture.applied,diagnostics:fixture.diagnostics}));
 expect(state.applied).toHaveLength(12);expect(state.diagnostics.revision).toBe(12);
 for(let i=0;i<12;i++){expect(new Set(state.applied[i].ids).size).toBe(state.applied[i].ids.length);expect(state.applied[i].revision).toBe(i+1);expect(state.applied[i].times.every(t=>t===(i%4===0?'08:00':'09:00'))).toBe(true)}
 await page.evaluate(()=>fixture.corrupt());expect(await page.evaluate(()=>fixture.applied.length)).toBe(12);
 await page.evaluate(()=>fixture.revoke());expect(await page.evaluate(()=>fixture.applied.length)).toBe(12);
 await page.evaluate(()=>fixture.close());expect(errors).toEqual([]);
});
