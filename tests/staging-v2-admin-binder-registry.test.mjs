import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteApp,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createStagingV2AdminBinderRegistry,STAGING_V2_ADMIN_BINDER_NAMES,STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE} from '../js/core/staging-v2-admin-binder-registry.js';

test('固定 staging App/Firestore 建立完整 Admin binder registry 且不執行任何雲端 I/O',async()=>{
  const app=initializeApp({projectId:'danbridge-d8877-staging'},'staging-v2-registry-'+Date.now());
  try{
    const registry=await createStagingV2AdminBinderRegistry({app,firestore:getFirestore(app),expectedProjectId:'danbridge-d8877-staging'});
    assert.equal(registry.scope,STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE);
    assert.deepEqual(Object.keys(registry.binders),STAGING_V2_ADMIN_BINDER_NAMES);
    for(const name of STAGING_V2_ADMIN_BINDER_NAMES)assert.equal(typeof registry.binders[name].scope,'string',name);
  }finally{await deleteApp(app)}
});

test('registry 在載入 binder 前拒絕錯專案、不同 Firestore 與 accessor config',async()=>{
  const app=initializeApp({projectId:'danbridge-d8877-staging'},'staging-v2-registry-guard-'+Date.now()),wrong=initializeApp({projectId:'wrong-project-12345'},'staging-v2-registry-wrong-'+Date.now());
  try{
    await assert.rejects(()=>createStagingV2AdminBinderRegistry({app,firestore:getFirestore(wrong),expectedProjectId:'danbridge-d8877-staging'}),/identity blocked/);
    await assert.rejects(()=>createStagingV2AdminBinderRegistry({app,firestore:getFirestore(app),expectedProjectId:'wrong-project-12345'}),/identity blocked/);
    let calls=0;const hostile={app,firestore:getFirestore(app),expectedProjectId:'danbridge-d8877-staging'};
    Object.defineProperty(hostile,'firestore',{enumerable:true,get(){calls++;return getFirestore(app)}});
    await assert.rejects(()=>createStagingV2AdminBinderRegistry(hostile),/own enumerable data field/);
    assert.equal(calls,0);
  }finally{await Promise.all([deleteApp(app),deleteApp(wrong)])}
});
