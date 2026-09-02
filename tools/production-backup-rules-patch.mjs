import {createHash} from 'node:crypto';

export const EXPECTED_PRODUCTION_RULES_SHA256='95d1dae0db2b1836885ed29622bbd9e5839800559c9d1c8abce103677c78755f';
export const PRODUCTION_BACKUP_RULES_MARKER='DANBRIDGE_PRODUCTION_BACKUP_RULES_V1';
export const PRODUCTION_PROFILE_RULES_MARKER='DANBRIDGE_PRODUCTION_PROFILE_RULES_V1';
const INSERTION_MARKER='    match /companies/{companyId}/{document=**} {';
const MINIFIED_INSERTION_MARKER='match/companies/{companyId}/{document=**}{';
const READ_ONLY_BACKUP_RULES="match/dailyShardedBackups/{companyId}/days/{day}{allow read:if isOwner()&&companyId=='danbridge';}match/dailyShardedBackups/{companyId}/days/{day}/chunks/{chunkId}{allow read:if isOwner()&&companyId=='danbridge';}";
const sha256=value=>createHash('sha256').update(value).digest('hex');
const READ_ONLY_USER_RULE="match/users/{uid}{allow read:if signedIn()&&(request.auth.uid==uid||isOwner());}";

const PROFILE_RULES=`// ${PRODUCTION_PROFILE_RULES_MARKER}: self-owned login metadata only; authorization fields stay immutable.
match /users/{uid} {
  allow read: if signedIn() && (request.auth.uid == uid || isOwner());
  allow create: if signedIn()
    && request.auth.uid == uid
    && request.resource.data.keys().hasOnly([
      'email','displayName','photoURL','role','companyId','active','lastLoginAt','updatedAt',
      'teacherId','teacherName','managerName','branchIds','branchNames','readOnly',
      'canSubmitOwnReports','canManageSchedule'
    ])
    && request.resource.data.email.lower() == emailKey()
    && request.resource.data.companyId == 'danbridge'
    && request.resource.data.active == true
    && ((isPrimaryOwner() && request.resource.data.role == 'owner')
      || (accessExists()
        && access().active == true
        && access().companyId == 'danbridge'
        && request.resource.data.role == access().role
        && request.resource.data.role in ['owner','teacher','branch_manager']
        && (request.resource.data.role == 'owner'
          || (request.resource.data.teacherId is string
            && request.resource.data.teacherId == access().teacherId))
        && (!('teacherName' in request.resource.data)
          || request.resource.data.teacherName == access().teacherName)
        && (!('managerName' in request.resource.data)
          || request.resource.data.managerName == access().managerName)
        && (!('branchIds' in request.resource.data)
          || request.resource.data.branchIds == access().branchIds)
        && (!('branchNames' in request.resource.data)
          || request.resource.data.branchNames == access().branchNames)
        && (!('readOnly' in request.resource.data)
          || request.resource.data.readOnly == access().readOnly)
        && (!('canSubmitOwnReports' in request.resource.data)
          || request.resource.data.canSubmitOwnReports == access().canSubmitOwnReports)
        && (!('canManageSchedule' in request.resource.data)
          || request.resource.data.canManageSchedule == access().canManageSchedule)));
  allow update: if signedIn()
    && request.auth.uid == uid
    && request.resource.data.email == resource.data.email
    && request.resource.data.email.lower() == emailKey()
    && request.resource.data.role == resource.data.role
    && request.resource.data.companyId == resource.data.companyId
    && request.resource.data.active == resource.data.active
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'displayName','photoURL','lastLoginAt','updatedAt'
    ]);
}`;

const BACKUP_RULES=`    // ${PRODUCTION_BACKUP_RULES_MARKER}: production-only immutable daily backups.
    match /dailyShardedBackups/{companyId}/days/{day} {
      allow read: if isOwner() && companyId == 'danbridge';
      allow create: if isOwner()
        && companyId == 'danbridge'
        && request.resource.data.keys().hasOnly([
          'schema','environment','companyId','day','state','sourceHash','collectionOrder',
          'collections','chunkCount','recordCount','maxChunkBytes','counts','verifiedHash',
          'verifiedAt','verifiedBy','verifiedByEmail'
        ])
        && request.resource.data.schema == 'danbridge-daily-sharded-backup-v2'
        && request.resource.data.environment == 'production'
        && request.resource.data.companyId == companyId
        && request.resource.data.day == day
        && day.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
        && request.resource.data.state == 'verified'
        && request.resource.data.sourceHash.matches('record-v1:[0-9a-f]{64}')
        && request.resource.data.verifiedHash == request.resource.data.sourceHash
        && request.resource.data.collectionOrder == [
          'students','teachers','lessons','makeups','changes','teacherGroups',
          'winterTeacherGroups','summerCampClasses','summerCampRegistrations',
          'winterCampRegistrations','winterCampClasses','settlementRecords',
          'fixedExpenses','oneTimeExpenses','collectionRecords','branches'
        ]
        && request.resource.data.collections is map
        && request.resource.data.collections.keys().hasOnly(request.resource.data.collectionOrder)
        && request.resource.data.collections.keys().hasAll(request.resource.data.collectionOrder)
        && request.resource.data.chunkCount is int
        && request.resource.data.chunkCount > 0
        && request.resource.data.recordCount is int
        && request.resource.data.recordCount >= 0
        && request.resource.data.maxChunkBytes is int
        && request.resource.data.maxChunkBytes >= 10000
        && request.resource.data.maxChunkBytes <= 180000
        && request.resource.data.counts is map
        && request.resource.data.counts.keys().hasOnly(['students','teachers','lessons','makeups'])
        && request.resource.data.counts.keys().hasAll(['students','teachers','lessons','makeups'])
        && request.resource.data.counts.students is int
        && request.resource.data.counts.students >= 0
        && request.resource.data.counts.teachers is int
        && request.resource.data.counts.teachers >= 0
        && request.resource.data.counts.lessons is int
        && request.resource.data.counts.lessons >= 0
        && request.resource.data.counts.makeups is int
        && request.resource.data.counts.makeups >= 0
        && request.resource.data.verifiedAt == request.time
        && request.resource.data.verifiedBy == request.auth.uid
        && request.resource.data.verifiedByEmail == emailKey();
      allow update: if false;
      allow delete: if isOwner()
        && companyId == 'danbridge'
        && resource.data.verifiedAt is timestamp
        && request.time >= resource.data.verifiedAt + duration.value(30, 'd');
    }

    match /dailyShardedBackups/{companyId}/days/{day}/chunks/{chunkId} {
      allow read: if isOwner() && companyId == 'danbridge';
      allow create: if isOwner()
        && companyId == 'danbridge'
        && request.resource.data.keys().hasOnly([
          'schema','environment','companyId','day','chunkId','collection','index','items',
          'sourceHash','createdAt','createdBy','createdByEmail'
        ])
        && request.resource.data.schema == 'danbridge-daily-sharded-backup-chunk-v2'
        && request.resource.data.environment == 'production'
        && request.resource.data.companyId == companyId
        && request.resource.data.day == day
        && day.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
        && request.resource.data.chunkId == chunkId
        && request.resource.data.collection in [
          'students','teachers','lessons','makeups','changes','teacherGroups',
          'winterTeacherGroups','summerCampClasses','summerCampRegistrations',
          'winterCampRegistrations','winterCampClasses','settlementRecords',
          'fixedExpenses','oneTimeExpenses','collectionRecords','branches'
        ]
        && request.resource.data.index is int
        && request.resource.data.index >= 0
        && request.resource.data.items is list
        && request.resource.data.sourceHash.matches('record-v1:[0-9a-f]{64}')
        && request.resource.data.createdAt == request.time
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.createdByEmail == emailKey();
      allow update: if false;
      allow delete: if isOwner()
        && companyId == 'danbridge'
        && resource.data.createdAt is timestamp
        && ((exists(/databases/$(database)/documents/dailyShardedBackups/$(companyId)/days/$(day))
            && get(/databases/$(database)/documents/dailyShardedBackups/$(companyId)/days/$(day)).data.verifiedAt is timestamp
            && request.time >= get(/databases/$(database)/documents/dailyShardedBackups/$(companyId)/days/$(day)).data.verifiedAt + duration.value(30, 'd'))
          || (!exists(/databases/$(database)/documents/dailyShardedBackups/$(companyId)/days/$(day))
            && request.time >= resource.data.createdAt + duration.value(30, 'd')));
    }

    match /companies/{companyId}/dailyBackups/{day} {
      allow read: if isOwner() && companyId == 'danbridge';
    }

`;

export function patchProductionBackupRules(source,{expectedBaseSha256=EXPECTED_PRODUCTION_RULES_SHA256}={}){
  const validRulesVersion=typeof source==='string'&&(source.includes("rules_version = '2';")||source.includes("rules_version='2';"));
  const validService=typeof source==='string'&&(source.includes('service cloud.firestore')||source.includes('service cloud.firestore{'));
  if(!validRulesVersion||!validService)throw new Error('production Rules source identity invalid');
  if(source.includes(PRODUCTION_BACKUP_RULES_MARKER)){
    if(!source.includes("request.resource.data.environment == 'production'")||!source.includes("match /companies/{companyId}/dailyBackups/{day}"))throw new Error('production backup Rules marker is incomplete');
    return{source,changed:false,beforeSha256:sha256(source),afterSha256:sha256(source)};
  }
  const beforeSha256=sha256(source);
  if(beforeSha256!==expectedBaseSha256)throw new Error(`production Rules drift: ${beforeSha256}`);
  const hasPrettyBackupPath=source.includes('match /dailyShardedBackups/');
  const hasMinifiedBackupPath=source.includes('match/dailyShardedBackups/');
  let patched='';
  if(source.includes(READ_ONLY_BACKUP_RULES)){
    if(source.split(READ_ONLY_BACKUP_RULES).length!==2)throw new Error('production read-only backup Rules marker must be unique');
    patched=source.replace(READ_ONLY_BACKUP_RULES,BACKUP_RULES.trim());
  }else{
    if(hasPrettyBackupPath||hasMinifiedBackupPath)throw new Error('unexpected production daily backup Rules already exist');
    const marker=source.includes(INSERTION_MARKER)?INSERTION_MARKER:MINIFIED_INSERTION_MARKER;
    if(source.split(marker).length!==2)throw new Error('production Rules insertion marker must be unique');
    patched=source.replace(marker,BACKUP_RULES+marker);
  }
  if(!patched.includes(PRODUCTION_BACKUP_RULES_MARKER)||patched.includes("request.resource.data.environment in ['staging','production']"))throw new Error('production backup Rules patch scope invalid');
  return{source:patched,changed:true,beforeSha256,afterSha256:sha256(patched)};
}

export function patchProductionProfileRules(source,{expectedBaseSha256}={}){
  const validRulesVersion=typeof source==='string'&&(source.includes("rules_version = '2';")||source.includes("rules_version='2';"));
  const validService=typeof source==='string'&&(source.includes('service cloud.firestore')||source.includes('service cloud.firestore{'));
  if(!validRulesVersion||!validService)throw new Error('production Rules source identity invalid');
  if(source.includes(PRODUCTION_PROFILE_RULES_MARKER)){
    if(!source.includes("affectedKeys().hasOnly([\n      'displayName','photoURL','lastLoginAt','updatedAt'"))throw new Error('production profile Rules marker is incomplete');
    return{source,changed:false,beforeSha256:sha256(source),afterSha256:sha256(source)};
  }
  const beforeSha256=sha256(source);
  if(expectedBaseSha256&&beforeSha256!==expectedBaseSha256)throw new Error(`production Rules drift: ${beforeSha256}`);
  if(source.split(READ_ONLY_USER_RULE).length!==2)throw new Error('production read-only user Rules marker must be unique');
  const patched=source.replace(READ_ONLY_USER_RULE,PROFILE_RULES);
  if(!patched.includes(PRODUCTION_PROFILE_RULES_MARKER)||PROFILE_RULES.includes('allow delete:'))throw new Error('production profile Rules patch scope invalid');
  return{source:patched,changed:true,beforeSha256,afterSha256:sha256(patched)};
}
