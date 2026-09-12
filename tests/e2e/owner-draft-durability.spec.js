const {test,expect}=require('@playwright/test');

test('IndexedDB draft survives reload above localStorage-sized payload and isolates accounts',async({page,context})=>{
 await page.goto('/tests/fixtures/native-display-cadence.html');
 const result=await page.evaluate(async()=>{
  const {createBrowserOperationJournalStorage}=await import('/js/core/browser-operation-journal-storage.js');
  const {createOwnerDraftStore}=await import('/js/core/cloud-owner-draft-store.js');
  const {FULL_RECORD_COLLECTIONS}=await import('/js/core/cloud-full-record-shadow.js');
  const scope='acceptance:owner-draft:'+crypto.randomUUID();sessionStorage.setItem('draft-test-scope',scope);
  const store=createOwnerDraftStore({scope,storage:createBrowserOperationJournalStorage({indexedDB,locks:navigator.locks,key:scope})});
  await store.load();const baselineDb=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
  baselineDb.lessons=Array.from({length:6000},(_,i)=>({id:`synthetic-${i}`,room:'A',note:'x'.repeat(1000)}));
  const localDb=structuredClone(baselineDb);for(let i=0;i<20;i++)localDb.lessons[i].room='B';
  await store.save({environment:'staging',activationEpoch:'draft-acceptance',mutationVersion:3,baselineDb,localDb});
  return{bytes:JSON.stringify(localDb).length};
 });
 expect(result.bytes).toBeGreaterThan(6_000_000);
 await page.reload();
 const recovered=await page.evaluate(async()=>{
  const {createBrowserOperationJournalStorage}=await import('/js/core/browser-operation-journal-storage.js');
  const {createOwnerDraftStore}=await import('/js/core/cloud-owner-draft-store.js');
  const scope=sessionStorage.getItem('draft-test-scope');
  const store=createOwnerDraftStore({scope,storage:createBrowserOperationJournalStorage({indexedDB,locks:navigator.locks,key:scope})});
  const saved=await store.load();
  const otherScope=scope+':catherine';const other=createOwnerDraftStore({scope:otherScope,storage:createBrowserOperationJournalStorage({indexedDB,locks:navigator.locks,key:otherScope})});
  const unrelated=await other.load();await other.clear();const stillSaved=await store.load();
  await store.clear();
  return{count:saved.localDb.lessons.length,moved:saved.localDb.lessons.filter(row=>row.room==='B').length,baselineMoved:saved.baselineDb.lessons.filter(row=>row.room==='B').length,unrelated,retained:stillSaved.localDb.lessons.length,cleared:await store.load()};
 });
 expect(recovered).toEqual({count:6000,moved:20,baselineMoved:0,unrelated:null,retained:6000,cleared:null});
});
