const entry=(file,exportName)=>Object.freeze({file,exportName,kind:'firebase-admin-native',emulatorProjectId:'danbridge-rules-test',productionBlocked:true});

export const FIREBASE_ADMIN_STAGING_BINDER_INVENTORY=Object.freeze([
 entry('js/core/firebase-active-record-authority-save-v2-adapter.js','createFirebaseActiveRecordAuthoritySaveV2AdminBinder'),
 entry('js/core/firebase-record-sync-v2-activation-cutover-intent-v2-adapter.js','createFirebaseRecordSyncV2ActivationCutoverIntentV2AdminBinder'),
 entry('js/core/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js','createFirebaseRecordSyncV2AtomicActivationV2AdminBinder'),
 entry('js/core/firebase-record-sync-v2-change-reservation-authority-audit-receipt-adapter.js','createFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptAdminBinder'),
 entry('js/core/firebase-record-sync-v2-change-reservation-registration-adapter.js','createFirebaseRecordSyncV2ChangeReservationRegistrationBinder'),
 entry('js/core/firebase-record-sync-v2-deployment-gate-source-attestation-adapter.js','createFirebaseRecordSyncV2DeploymentGateSourceAttestationAdminBinder'),
 entry('js/core/firebase-record-sync-v2-genesis-authority-admin-adapter.js','createFirebaseRecordSyncV2GenesisAuthorityAdminBinder'),
 entry('js/core/firebase-record-sync-v2-genesis-authority-audit-receipt-adapter.js','createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdminBinder'),
 entry('js/core/firebase-record-sync-v2-genesis-identity-index-adapter.js','createFirebaseRecordSyncV2GenesisIdentityIndexAdminBinder'),
 entry('js/core/firebase-record-sync-v2-genesis-seed-readback-admin-adapter.js','createFirebaseRecordSyncV2GenesisSeedReadbackAdminBinder'),
 entry('js/core/firebase-record-sync-v2-takeover-candidate-v2-adapter.js','createFirebaseRecordSyncV2TakeoverCandidateV2AdminBinder'),
 entry('js/core/firebase-record-sync-v2-trusted-deployment-evidence-v2-adapter.js','createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder')
]);
