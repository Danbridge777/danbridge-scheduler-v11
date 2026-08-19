import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {FULL_RECORD_COLLECTIONS,FULL_RECORD_SHADOW_SCHEMA,materializeFullRecordDb,rebuildFullRecordShadowDb} from './cloud-full-record-shadow.js';
import {recordDataDigest,recordDataHash} from './cloud-record-data-hash.js';
import {assertRecordSyncCandidateControl} from './cloud-record-sync-candidate-control.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const timestamp=value=>typeof value==='string'&&value.trim()===value&&Number.isFinite(Date.parse(value));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const identity=value=>typeof value==='string'&&/^[A-Za-z0-9_.:%@+-]{1,256}$/.test(value);
const sameKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');

export function verifyRoleViewCandidateSourceBinding({sourceDb,legacyVersionHash,candidateControl,fullReadback}={}){
 const legacy=String(legacyVersionHash||''),candidate=assertRecordSyncCandidateControl(candidateControl),sourceHash=recordDataDigest(sourceDb),recordHash=recordDataHash(sourceDb);
 if(!legacy||candidate.state!=='sealed'||candidate.legacyVersionHash!==legacy||candidate.recordDataHash!==recordHash)throw new Error('角色候選來源未綁定目前 sealed 全資料候選');
 if(!fullReadback?.candidateVerified||fullReadback.sourceHash!==legacy||recordDataHash(fullReadback.db)!==recordHash||fullReadback.documentCount!==candidate.documentCount||fullReadback.activeCount!==candidate.activeCount||fullReadback.tombstoneCount!==candidate.tombstoneCount)throw new Error('角色候選來源與全 16 集合候選讀回不一致');
 return{sourceDb:clone(sourceDb),legacyVersionHash:legacy,sourceHash,recordDataHash:recordHash,documentCount:candidate.documentCount,activeCount:candidate.activeCount,tombstoneCount:candidate.tombstoneCount,candidateEpoch:candidate.candidateEpoch,candidateSealHash:candidate.sealHash};
}

export function buildRoleViewCandidateSourceAudit({sourceDb,legacyVersionHash,legacyHashMatchesSource,candidateControl,documentsByCollection}={}){
 const legacy=String(legacyVersionHash||''),sourceRecordHash=recordDataHash(sourceDb),expected=materializeFullRecordDb(sourceDb),collections={};let candidate=null,candidateError='';
 try{candidate=assertRecordSyncCandidateControl(candidateControl)}catch(error){candidateError=String(error?.message||error)}
 const totals={source:0,documents:0,active:0,tombstones:0,missing:0,extra:0,changed:0,formatErrors:0,historicalSourceVersions:0};
 for(const collection of FULL_RECORD_COLLECTIONS){
  const rows=Array.isArray(documentsByCollection?.[collection])?documentsByCollection[collection]:[],sourceRows=new Map(expected[collection].map(row=>[row.recordId,row.record])),activeRows=rows.filter(row=>row?.data?.deleted===false),active=new Map(activeRows.map(row=>[String(row?.id||''),row?.data?.record])),missing=[...sourceRows.keys()].filter(id=>!active.has(id)).length,extra=[...active.keys()].filter(id=>!sourceRows.has(id)).length,changed=[...sourceRows.keys()].filter(id=>active.has(id)&&sha256Canonical(sourceRows.get(id))!==sha256Canonical(active.get(id))).length,tombstones=rows.filter(row=>row?.data?.deleted===true).length,formatErrors=rows.filter(row=>{const data=row?.data,id=String(row?.id||'');return!data||data.schema!==FULL_RECORD_SHADOW_SCHEMA||data.companyId!=='danbridge'||data.collection!==collection||data.recordId!==id||data.environment!=='staging'||!Number.isSafeInteger(data.revision)||data.revision<1||typeof data.deleted!=='boolean'||(data.deleted===false&&!String(data.sourceHash||''))}).length,historicalSourceVersions=activeRows.filter(row=>String(row?.data?.sourceHash||'')!==legacy).length;
  collections[collection]={source:sourceRows.size,documents:rows.length,active:active.size,tombstones,missing,extra,changed,formatErrors,historicalSourceVersions};
  for(const key of Object.keys(totals))totals[key]+=collections[collection][key]||0;
 }
 let rebuiltRecordHash='',rebuildError='';try{rebuiltRecordHash=recordDataHash(rebuildFullRecordShadowDb(documentsByCollection,{environment:'staging'}).db)}catch(error){rebuildError=String(error?.message||error)}
 const shadowMatchesMain=!totals.missing&&!totals.extra&&!totals.changed&&!totals.formatErrors&&!rebuildError&&rebuiltRecordHash===sourceRecordHash,candidateMatchesMain=!!candidate&&candidate.state==='sealed'&&candidate.legacyVersionHash===legacy&&candidate.recordDataHash===sourceRecordHash&&candidate.documentCount===totals.documents&&candidate.activeCount===totals.active&&candidate.tombstoneCount===totals.tombstones,ready=legacyHashMatchesSource===true&&shadowMatchesMain&&candidateMatchesMain;
 return{schema:'danbridge-role-view-source-audit-v1',environment:'staging',state:ready?'ready':'blocked',legacyVersionHash:legacy,legacyHashMatchesSource:legacyHashMatchesSource===true,sourceRecordHash,rebuiltRecordHash,rebuildError,candidateValid:!!candidate,candidateError,candidate:candidate?{state:candidate.state,candidateEpoch:candidate.candidateEpoch,legacyVersionHash:candidate.legacyVersionHash,recordDataHash:candidate.recordDataHash,documentCount:candidate.documentCount,activeCount:candidate.activeCount,tombstoneCount:candidate.tombstoneCount,revision:candidate.revision,sealHash:candidate.sealHash}:null,shadowMatchesMain,candidateMatchesMain,collectionCount:FULL_RECORD_COLLECTIONS.length,collections,totals,writes:0,readTakeover:false,writeTakeover:false};
}

function assertViewSummary(view,runId,sourceHash){
 if(!view||!identity(view.viewId)||!email(view.email)||!['scheduler','teacher','branch_manager'].includes(view.kind)||!digest(view.viewHash)||!integer(view.documentCount)||!sameKeys(view.counts,FULL_RECORD_COLLECTIONS)||FULL_RECORD_COLLECTIONS.some(key=>!integer(view.counts[key]))||Object.values(view.counts).reduce((sum,count)=>sum+count,0)!==view.documentCount)throw new Error('角色候選 manifest view 無效');
 if(view.runId!==undefined&&view.runId!==runId)throw new Error('角色候選 manifest run 不符');
 if(view.sourceHash!==undefined&&view.sourceHash!==sourceHash)throw new Error('角色候選 manifest 來源不符');
 return view;
}

export function buildRoleViewCandidateManifest({environment='staging',runId,sourceHash,views,createdAt}={}){
 const normalized=(views||[]).map(view=>({viewId:String(view.viewId||''),email:String(view.email||'').trim().toLowerCase(),kind:String(view.kind||''),viewHash:String(view.viewHash||''),documentCount:Number(view.documentCount),counts:clone(view.counts||{})})).sort((a,b)=>a.viewId.localeCompare(b.viewId));
 if(environment!=='staging'||!identity(runId)||!digest(sourceHash)||!normalized.length||!timestamp(createdAt)||new Set(normalized.map(view=>view.viewId)).size!==normalized.length||new Set(normalized.map(view=>view.email)).size!==normalized.length)throw new Error('角色候選 manifest 輸入無效');
 normalized.forEach(view=>assertViewSummary(view,runId,sourceHash));
 const body={schema:'danbridge-role-view-candidate-manifest-v1',environment,companyId:'danbridge',state:'verified',runId,sourceHash,viewCount:normalized.length,documentCount:normalized.reduce((sum,view)=>sum+view.documentCount,0),views:normalized,createdAt};
 return{...body,manifestHash:sha256Canonical(body)};
}

export function assertRoleViewCandidateManifest(manifest){
 if(!manifest||manifest.schema!=='danbridge-role-view-candidate-manifest-v1'||manifest.environment!=='staging'||manifest.companyId!=='danbridge'||manifest.state!=='verified'||!identity(manifest.runId)||!digest(manifest.sourceHash)||!integer(manifest.viewCount)||manifest.viewCount<1||!integer(manifest.documentCount)||!Array.isArray(manifest.views)||manifest.views.length!==manifest.viewCount||new Set(manifest.views.map(view=>view?.viewId)).size!==manifest.viewCount||new Set(manifest.views.map(view=>view?.email)).size!==manifest.viewCount||!timestamp(manifest.createdAt)||!digest(manifest.manifestHash))throw new Error('角色候選 manifest 格式無效');
 manifest.views.forEach(view=>assertViewSummary(view,manifest.runId,manifest.sourceHash));
 if(manifest.views.some((view,index)=>index>0&&manifest.views[index-1].viewId.localeCompare(view.viewId)>=0)||manifest.views.reduce((sum,view)=>sum+view.documentCount,0)!==manifest.documentCount)throw new Error('角色候選 manifest 排序或計數無效');
 const body=clone(manifest);delete body.manifestHash;if(sha256Canonical(body)!==manifest.manifestHash)throw new Error('角色候選 manifest hash 不符');return manifest;
}

export function buildRoleViewVerificationReceipt({environment='staging',runId,sourceHash,manifestHash,email:actorEmail,kind,viewId='',viewHash,verifiedViewCount,documentCount,realtimeObserved,directCoreDenied,crossRoleDenied,testedAt}={}){
 const normalizedEmail=String(actorEmail||'').trim().toLowerCase(),owner=kind==='owner';
 if(environment!=='staging'||!identity(runId)||!digest(sourceHash)||!digest(manifestHash)||!email(normalizedEmail)||!['owner','scheduler','teacher','branch_manager'].includes(kind)||!digest(viewHash)||!integer(verifiedViewCount)||verifiedViewCount<1||!integer(documentCount)||realtimeObserved!==true||!timestamp(testedAt))throw new Error('角色候選本人憑證輸入無效');
 if(owner){if(viewId!==''||directCoreDenied!==false||crossRoleDenied!==false)throw new Error('Owner 角色候選憑證範圍無效')}else if(!identity(viewId)||verifiedViewCount!==1||directCoreDenied!==true||crossRoleDenied!==true)throw new Error('角色候選本人拒絕證據不完整');
 const body={schema:'danbridge-role-view-verification-receipt-v1',environment,companyId:'danbridge',state:'verified',runId,sourceHash,manifestHash,email:normalizedEmail,kind,viewId,viewHash,verifiedViewCount,collectionCount:FULL_RECORD_COLLECTIONS.length,documentCount,realtimeObserved:true,directCoreDenied,crossRoleDenied,readTakeover:false,writeTakeover:false,testedAt};
 return{...body,receiptHash:sha256Canonical(body)};
}

export function assertRoleViewVerificationReceipt(receipt){
 if(!receipt||receipt.schema!=='danbridge-role-view-verification-receipt-v1'||receipt.environment!=='staging'||receipt.companyId!=='danbridge'||receipt.state!=='verified'||!identity(receipt.runId)||!digest(receipt.sourceHash)||!digest(receipt.manifestHash)||!email(receipt.email)||!['owner','scheduler','teacher','branch_manager'].includes(receipt.kind)||!digest(receipt.viewHash)||!integer(receipt.verifiedViewCount)||receipt.verifiedViewCount<1||receipt.collectionCount!==FULL_RECORD_COLLECTIONS.length||!integer(receipt.documentCount)||receipt.realtimeObserved!==true||receipt.readTakeover!==false||receipt.writeTakeover!==false||!timestamp(receipt.testedAt)||!digest(receipt.receiptHash))throw new Error('角色候選本人憑證格式無效');
 if(receipt.kind==='owner'){if(receipt.viewId!==''||receipt.directCoreDenied!==false||receipt.crossRoleDenied!==false)throw new Error('Owner 角色候選憑證格式無效')}else if(!identity(receipt.viewId)||receipt.verifiedViewCount!==1||receipt.directCoreDenied!==true||receipt.crossRoleDenied!==true)throw new Error('角色候選本人拒絕憑證無效');
 const body=clone(receipt);delete body.receiptHash;if(sha256Canonical(body)!==receipt.receiptHash)throw new Error('角色候選本人憑證 hash 不符');return receipt;
}

export function verifyRoleViewReceiptSet({manifest,receipts,primaryOwnerEmail,backupOwnerEmail,schedulerEmail}={}){
 assertRoleViewCandidateManifest(manifest);const normalized=(receipts||[]).map(receipt=>assertRoleViewVerificationReceipt(receipt)).sort((a,b)=>a.email.localeCompare(b.email));
 const primary=String(primaryOwnerEmail||'').trim().toLowerCase(),backup=String(backupOwnerEmail||'').trim().toLowerCase(),scheduler=String(schedulerEmail||'').trim().toLowerCase(),requiredEmails=[primary,backup,...manifest.views.map(view=>view.email)].sort();
 if(!email(primary)||!email(backup)||!email(scheduler)||new Set([primary,backup,scheduler]).size!==3||normalized.length!==requiredEmails.length||new Set(normalized.map(receipt=>receipt.email)).size!==normalized.length||normalized.map(receipt=>receipt.email).join('|')!==requiredEmails.join('|'))throw new Error('角色候選本人憑證尚未收齊');
 for(const receipt of normalized){if(receipt.runId!==manifest.runId||receipt.sourceHash!==manifest.sourceHash||receipt.manifestHash!==manifest.manifestHash)throw new Error('角色候選本人憑證版本不一致');const view=manifest.views.find(row=>row.email===receipt.email);if(receipt.email===primary||receipt.email===backup){if(receipt.kind!=='owner'||receipt.verifiedViewCount!==manifest.viewCount||receipt.viewHash!==manifest.manifestHash||receipt.documentCount!==manifest.documentCount)throw new Error('Owner 角色候選本人憑證不完整')}else if(!view||receipt.kind!==view.kind||receipt.viewId!==view.viewId||receipt.viewHash!==view.viewHash||receipt.documentCount!==view.documentCount)throw new Error('角色候選本人憑證與 view 不符')}
 const schedulerReceipt=normalized.find(receipt=>receipt.email===scheduler);if(!schedulerReceipt||schedulerReceipt.kind!=='scheduler')throw new Error('aa 角色候選本人憑證缺失');
 const teacherAccounts=manifest.views.filter(view=>view.kind==='teacher').map(view=>view.email).sort();if(!teacherAccounts.length)throw new Error('一般老師角色候選本人憑證缺失');
 const receiptHashes=normalized.map(receipt=>receipt.receiptHash).sort();return{manifest,receipts:normalized,receiptCount:normalized.length,receiptSetHash:sha256Canonical(receiptHashes),teacherAccounts,roleViewCount:manifest.viewCount,primaryOwnerEmail:primary,backupOwnerEmail:backup,schedulerEmail:scheduler,testedAt:normalized.map(receipt=>receipt.testedAt).sort().at(-1)};
}
