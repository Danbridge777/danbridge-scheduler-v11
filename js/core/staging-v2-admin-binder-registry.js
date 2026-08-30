export const STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE='fixed-single-app-single-firestore-staging-admin-binder-registry-v1';

const PROJECT_ID='danbridge-d8877-staging';

const SPECIFICATIONS=Object.freeze([
  ['writerCurrent','./firebase-record-sync-v1-writer-current-adapter.js','createFirebaseRecordSyncV1WriterCurrentAdminBinder'],
  ['hardPause','./firebase-record-sync-v1-v2-hard-pause-adapter.js','createFirebaseRecordSyncV1V2HardPauseAdminBinder'],
  ['postPauseScan','./firebase-record-sync-v1-post-pause-scan-adapter.js','createFirebaseRecordSyncV1PostPauseScanAdminBinder'],
  ['rawBackup','./firebase-record-sync-v1-raw-cutover-backup-adapter.js','createFirebaseRecordSyncV1RawCutoverBackupAdminBinder'],
  ['frozenSourceProof','./firebase-record-sync-v1-frozen-source-proof-adapter.js','createFirebaseRecordSyncV1FrozenSourceProofAdminBinder'],
  ['genesisSeedPlan','./firebase-record-sync-v2-genesis-seed-plan-adapter.js','createFirebaseRecordSyncV2GenesisSeedPlanAdminBinder'],
  ['genesisSeedBatch','./firebase-record-sync-v2-genesis-seed-batch-adapter.js','createFirebaseRecordSyncV2GenesisSeedBatchAdminBinder'],
  ['genesisIdentityIndex','./firebase-record-sync-v2-genesis-identity-index-adapter.js','createFirebaseRecordSyncV2GenesisIdentityIndexAdminBinder'],
  ['genesisReadback','./firebase-record-sync-v2-genesis-seed-readback-admin-adapter.js','createFirebaseRecordSyncV2GenesisSeedReadbackAdminBinder'],
  ['genesisAuthority','./firebase-record-sync-v2-genesis-authority-admin-adapter.js','createFirebaseRecordSyncV2GenesisAuthorityAdminBinder'],
  ['genesisAuthorityReceipt','./firebase-record-sync-v2-genesis-authority-audit-receipt-adapter.js','createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdminBinder'],
  ['reservationRegistration','./firebase-record-sync-v2-change-reservation-registration-adapter.js','createFirebaseRecordSyncV2ChangeReservationRegistrationBinder'],
  ['reservationBatch','./firebase-record-sync-v2-change-reservation-batch-adapter.js','createFirebaseRecordSyncV2ChangeReservationBatchAdminBinder'],
  ['reservationSeal','./firebase-record-sync-v2-change-reservation-seal-adapter.js','createFirebaseRecordSyncV2ChangeReservationSealAdminBinder'],
  ['reservationFinalization','./firebase-record-sync-v2-change-reservation-finalization-adapter.js','createFirebaseRecordSyncV2ChangeFinalizationAdminBinder'],
  ['reservationReadback','./firebase-record-sync-v2-change-reservation-readback-v2-adapter.js','createFirebaseRecordSyncV2ChangeReservationReadbackV2AdminBinder'],
  ['reservationAuthority','./firebase-record-sync-v2-change-reservation-authority-v2-adapter.js','createFirebaseRecordSyncV2ChangeReservationAuthorityV2AdminBinder'],
  ['reservationAuthorityReceipt','./firebase-record-sync-v2-change-reservation-authority-audit-receipt-adapter.js','createFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptAdminBinder'],
  ['takeoverCandidate','./firebase-record-sync-v2-takeover-candidate-v2-adapter.js','createFirebaseRecordSyncV2TakeoverCandidateV2AdminBinder'],
  ['cutoverIntent','./firebase-record-sync-v2-activation-cutover-intent-v2-adapter.js','createFirebaseRecordSyncV2ActivationCutoverIntentV2AdminBinder'],
  ['deploymentAttestation','./firebase-record-sync-v2-deployment-gate-source-attestation-adapter.js','createFirebaseRecordSyncV2DeploymentGateSourceAttestationAdminBinder'],
  ['trustedDeploymentEvidence','./firebase-record-sync-v2-trusted-deployment-evidence-v2-adapter.js','createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder'],
  ['atomicActivation','./firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js','createFirebaseRecordSyncV2AtomicActivationV2AdminBinder'],
  ['h1Save','./firebase-active-record-authority-save-v2-adapter.js','createFirebaseActiveRecordAuthoritySaveV2AdminBinder'],
  ['h1Baseline','./firebase-active-record-v2-baseline-snapshot-adapter.js','createFirebaseActiveRecordV2BaselineSnapshotAdminBinder'],
]);

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

function exact(value,fields,label){
  if(!plain(value))throw new Error(label+' must be plain object');
  const keys=Reflect.ownKeys(value);
  if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
  const output={};
  for(const key of fields){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');
    output[key]=descriptor.value;
  }
  return output;
}

function project(input){
  const options=input.app?.options;
  const projectDescriptor=options&&Object.getOwnPropertyDescriptor(options,'projectId');
  const projectId=projectDescriptor&&Object.prototype.hasOwnProperty.call(projectDescriptor,'value')?projectDescriptor.value:null;
  if(projectId!==PROJECT_ID||projectId!==input.expectedProjectId)throw new Error('staging V2 Admin registry App/Firestore/project identity blocked');
  return projectId;
}

export async function createStagingV2AdminBinderRegistry(raw){
  const input=exact(raw,['app','firestore','expectedProjectId'],'staging V2 Admin registry config');
  project(input);
  const admin=await import('firebase-admin/firestore');
  if(admin.getFirestore(input.app)!==input.firestore)throw new Error('staging V2 Admin registry App/Firestore/project identity blocked');
  const modules=await Promise.all(SPECIFICATIONS.map(([,path])=>import(path)));
  const config=Object.freeze({app:input.app,firestore:input.firestore,expectedProjectId:input.expectedProjectId}),binders={};
  for(let index=0;index<SPECIFICATIONS.length;index++){
    const [name,,exportName]=SPECIFICATIONS[index],factory=modules[index][exportName];
    if(typeof factory!=='function')throw new Error('staging V2 Admin registry factory missing '+name);
    const binder=factory(config);
    if(!binder||typeof binder!=='object'||typeof binder.scope!=='string')throw new Error('staging V2 Admin registry binder invalid '+name);
    binders[name]=binder;
  }
  return Object.freeze({scope:STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE,projectId:input.expectedProjectId,binders:Object.freeze(binders)});
}

export const STAGING_V2_ADMIN_BINDER_NAMES=Object.freeze(SPECIFICATIONS.map(([name])=>name));
