import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

export function productionPitrRehearsalSnapshotTime(now=Date.now(),lagMinutes=10){
 if(!Number.isFinite(now)||!Number.isSafeInteger(lagMinutes)||lagMinutes<5||lagMinutes>60)throw new Error('PITR rehearsal time 無效');
 return new Date(Math.floor((now-lagMinutes*60000)/60000)*60000).toISOString();
}

export function buildProductionPitrRehearsalReceipt({runId,startedAt,finishedAt,snapshotTime,earliestVersionTime,historicalControl,historicalSafety,currentControl,currentSafety}={}){
 if(typeof runId!=='string'||!runId||!Number.isFinite(startedAt)||!Number.isFinite(finishedAt)||finishedAt<startedAt||!timestamp(snapshotTime)||!timestamp(earliestVersionTime)||Date.parse(snapshotTime)<Date.parse(earliestVersionTime))throw new Error('PITR rehearsal identity 無效');
 for(const [label,value]of Object.entries({historicalControl,historicalSafety,currentControl,currentSafety}))if(!value||typeof value!=='object')throw new Error(`PITR rehearsal 缺少 ${label}`);
 if(historicalControl.schema!=='danbridge-production-record-runtime-control-v1'||currentControl.schema!==historicalControl.schema||historicalSafety.schema!=='danbridge-production-record-runtime-safety-v2'||currentSafety.schema!==historicalSafety.schema||historicalControl.activationEpoch!==currentControl.activationEpoch||historicalSafety.activationEpoch!==historicalControl.activationEpoch||currentSafety.activationEpoch!==currentControl.activationEpoch)throw new Error('PITR rehearsal control/safety 不一致');
 return Object.freeze({schema:'danbridge-production-pitr-rehearsal-v1',environment:'production',companyId:'danbridge',state:'verified-read-only',runId,snapshotTime,earliestVersionTime,startedAt:new Date(startedAt).toISOString(),finishedAt:new Date(finishedAt).toISOString(),historicalControlHash:sha256Canonical(historicalControl),historicalSafetyHash:sha256Canonical(historicalSafety),currentControlHash:sha256Canonical(currentControl),currentSafetyHash:sha256Canonical(currentSafety),activationEpoch:currentControl.activationEpoch,formalDataWrites:0,timeMachineDependency:false});
}
