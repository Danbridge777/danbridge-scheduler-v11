import {splitRecordConflicts} from './cloud-record-three-way-merge.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const valueOf=snapshot=>typeof snapshot?.exists==='function'?(snapshot.exists()?snapshot.data():null):(snapshot?.exists?snapshot.data:null);
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const core=value=>{const copy=clone(value);delete copy.createdAt;delete copy.createdBy;delete copy.createdByEmail;return copy};

export function createFirebaseRecordSyncConflictBackupAdapter({runTransaction,serverTimestamp,actor,environment='staging',role,maxChars=160000}={}){
 if(typeof runTransaction!=='function'||typeof serverTimestamp!=='function'||!Number.isSafeInteger(maxChars)||maxChars<1000||maxChars>180000)throw new Error('逐筆衝突備份 adapter 注入介面不完整');
 const guard=()=>{const email=String(actor?.email||'').trim().toLowerCase();if(environment!=='staging'||role!=='owner'||!token(actor?.uid)||!email)throw new Error('逐筆衝突備份只允許 staging Owner');return email};
 return{enabled:environment==='staging'&&role==='owner',async persist(conflicts,{activationEpoch,deviceId,baseHash,targetHash}={}){
  const email=guard();if(!Array.isArray(conflicts)||!conflicts.length||!token(activationEpoch)||!token(deviceId)||!recordHash(baseHash)||!recordHash(targetHash))throw new Error('逐筆衝突備份 identity 無效');
  const conflictHash=sha256Canonical(conflicts),backupId=`conflict-${conflictHash.slice(0,24)}`,parts=splitRecordConflicts(conflicts,maxChars);if(parts.length>400)throw new Error('逐筆衝突備份分片超過安全上限');
  const controlPath=`stagingRecordSyncControls/danbridge`,safetyPath='stagingRecordSyncSafetyControls/danbridge',documents=parts.map((payload,partIndex)=>{const partId=`${backupId}-${partIndex}`;return{path:`stagingRecordSyncConflictBackups/danbridge/epochs/${activationEpoch}/parts/${partId}`,payload:{schema:'danbridge-record-sync-conflict-backup-v1',environment:'staging',companyId:'danbridge',activationEpoch,backupId,partId,conflictHash,baseHash,targetHash,deviceId,partIndex,partCount:parts.length,encoding:'json-fragment',payload}}});
  const result=await runTransaction(async transaction=>{const [controlSnapshot,safetySnapshot]=await Promise.all([transaction.get(controlPath),transaction.get(safetyPath)]),control=valueOf(controlSnapshot),safety=valueOf(safetySnapshot);if(!control||control.schema!=='danbridge-record-sync-control-v1'||control.environment!=='staging'||control.companyId!=='danbridge'||control.state!=='active'||control.activationEpoch!==activationEpoch||control.writeTakeover!==true)throw new Error('逐筆衝突備份時同步控制未啟用');if(!safety||safety.schema!=='danbridge-record-sync-safety-control-v1'||safety.environment!=='staging'||safety.companyId!=='danbridge'||safety.activationEpoch!==activationEpoch||safety.state!=='active'||safety.writeAllowed!==true)throw new Error('逐筆衝突備份時同步已安全暫停');const snapshots=[];for(const document of documents)snapshots.push(await transaction.get(document.path));let writes=0,duplicates=0;documents.forEach((document,index)=>{const current=valueOf(snapshots[index]);if(current){if(!same(core(current),document.payload))throw new Error(`逐筆衝突備份 immutable 衝突：${document.path}`);duplicates++;return}transaction.set(document.path,{...document.payload,createdAt:serverTimestamp(),createdBy:actor.uid,createdByEmail:email});writes++});return{writes,duplicates}});
  return{schema:'danbridge-record-sync-conflict-backup-result-v1',environment:'staging',companyId:'danbridge',activationEpoch,backupId,conflictHash,baseHash,targetHash,partCount:parts.length,conflictCount:conflicts.length,writes:result.writes,duplicates:result.duplicates,paths:documents.map(row=>row.path)};
 }};
}
