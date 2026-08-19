export const RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS=Object.freeze([
 'trusted-deployment-receipt','dual-mode-rules-emulator','v1-permanent-fence',
 'resume-race','atomic-cutover','runtime-no-fallback'
]);
export const RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES=Object.freeze({
 'trusted-deployment-receipt':'admin-ci-deployment-channel-v1',
 'dual-mode-rules-emulator':'dual-auth-firestore-emulator-matrix-v1',
 'v1-permanent-fence':'v1-permanent-fence-rules-matrix-v1',
 'resume-race':'v1-resume-race-rules-matrix-v1',
 'atomic-cutover':'atomic-cutover-bundle-matrix-v1',
 'runtime-no-fallback':'runtime-no-fallback-static-integration-matrix-v1'
});
