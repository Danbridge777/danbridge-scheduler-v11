import {assertStagingExecutionManifestEnvelope,buildStagingLiveActivationControl,buildStagingLiveFinalControl,isStagingLiveControlBoundToManifest,sameStagingLiveExecution,stripStagingExecutionManifestAudit} from './cloud-staging-live-activation.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const valueOf=snapshot=>typeof snapshot?.exists==='function'?(snapshot.exists()?snapshot.data():null):(snapshot?.exists?snapshot.data:null);
const sameManifest=(left,right)=>{try{const cleanLeft=stripStagingExecutionManifestAudit(left),cleanRight=stripStagingExecutionManifestAudit(right);assertStagingExecutionManifestEnvelope(cleanLeft);assertStagingExecutionManifestEnvelope(cleanRight);return cleanLeft.manifestHash===cleanRight.manifestHash}catch{return false}};

export function createFirebaseStagingLiveActivationAdapter({runTransaction,serverTimestamp,actor}={}){
 if(typeof runTransaction!=='function'||typeof serverTimestamp!=='function'||!actor?.uid||!actor?.email)throw new Error('staging live 啟用 adapter 注入不完整');
 const email=String(actor.email).trim().toLowerCase(),audit=()=>({updatedAt:serverTimestamp(),updatedBy:actor.uid,updatedByEmail:email});
 return{
  async activate(manifest){
   assertStagingExecutionManifestEnvelope(manifest);const manifestPath=`stagingLiveExecutionManifests/danbridge/runs/${manifest.manifestHash}`,controlPath='stagingLiveRecordControls/danbridge',mainPath='companies/danbridge/data/main',backupPath=`stagingMigrationBackups/danbridge/runs/${manifest.backupId}`,restorePath=`stagingMigrationRestoreDrills/danbridge/runs/${manifest.restoreDrillId}`;
   return runTransaction(async transaction=>{
    const [storedManifestSnapshot,controlSnapshot,mainSnapshot,backupSnapshot,restoreSnapshot]=await Promise.all([transaction.get(manifestPath),transaction.get(controlPath),transaction.get(mainPath),transaction.get(backupPath),transaction.get(restorePath)]),storedManifest=valueOf(storedManifestSnapshot),control=valueOf(controlSnapshot),main=valueOf(mainSnapshot),backup=valueOf(backupSnapshot),restore=valueOf(restoreSnapshot),initial=buildStagingLiveActivationControl(manifest);
    if(!main||main.clientHash!==manifest.legacyVersionHash||!main.db||sha256Canonical(main.db)!==manifest.backupSha256||!backup||backup.schema!=='danbridge-immutable-migration-backup-v2'||backup.environment!=='staging'||backup.state!=='verified'||backup.backupId!==manifest.backupId||backup.sourceHash!==manifest.backupSha256||backup.verifiedHash!==manifest.backupSha256||backup.sourceVersionHash!==manifest.legacyVersionHash||!restore||restore.schema!=='danbridge-migration-restore-drill-v1'||restore.environment!=='staging'||restore.state!=='verified'||restore.drillId!==manifest.restoreDrillId||restore.sourceBackupId!==manifest.backupId||restore.sourceHash!==manifest.backupSha256||restore.restoredHash!==manifest.backupSha256||restore.mainVersionHash!==manifest.legacyVersionHash||restore.mainUnchanged!==true)throw new Error('staging live 啟用證據已改變');
    if(storedManifest&&!sameManifest(storedManifest,manifest))throw new Error('staging live manifest identity 衝突');
    if(control&&control.executionManifestHash===manifest.manifestHash){if(!storedManifest||!isStagingLiveControlBoundToManifest(control,manifest))throw new Error('staging live 控制 identity 衝突');return{kind:control.rootRevision>control.executionBaseRootRevision?'resume':'duplicate',write:false,manifestPath,controlPath,control}}
    if(control&&(control.schema!=='danbridge-live-record-control-v2'||control.state!=='active'||control.dataHash!==manifest.sourceRecordHash))throw new Error('staging live 控制尚未完成前一輪或來源已改變');
    const stamp=audit(),next=control?buildStagingLiveActivationControl(manifest,{rootRevision:control.rootRevision}):initial;if(!storedManifest)transaction.set(manifestPath,{...manifest,persistedAt:stamp.updatedAt,persistedBy:stamp.updatedBy,persistedByEmail:stamp.updatedByEmail});transaction.set(controlPath,{...next,...stamp});return{kind:control?'rearmed':'activated',write:true,manifestPath,controlPath,control:next};
   });
  },
  async finalize(manifest,readback){
   assertStagingExecutionManifestEnvelope(manifest);const manifestPath=`stagingLiveExecutionManifests/danbridge/runs/${manifest.manifestHash}`,controlPath='stagingLiveRecordControls/danbridge';
   return runTransaction(async transaction=>{const [storedManifestSnapshot,controlSnapshot]=await Promise.all([transaction.get(manifestPath),transaction.get(controlPath)]),storedManifest=valueOf(storedManifestSnapshot),control=valueOf(controlSnapshot);if(!storedManifest||!sameManifest(storedManifest,manifest))throw new Error('staging live 完成 manifest 不符');const final=buildStagingLiveFinalControl({manifest,control,readback});if(control.state==='active'){if(!sameStagingLiveExecution(control,final))throw new Error('staging live 已啟用控制不一致');return{kind:'duplicate',write:false,control}}transaction.set(controlPath,{...final,...audit()});return{kind:'finalized',write:true,control:final}});
  }
 };
}
