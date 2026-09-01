import {createHash} from 'node:crypto';

export const EXPECTED_PRODUCTION_RULES_SHA256='46e65a5653b7e503db910e099051dee98a476b607a7a6fd359b3ee8468be3e63';
export const PRODUCTION_BACKUP_RULES_MARKER='DANBRIDGE_PRODUCTION_BACKUP_RULES_V1';
const INSERTION_MARKER='    match /companies/{companyId}/{document=**} {';
const sha256=value=>createHash('sha256').update(value).digest('hex');

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
  if(typeof source!=='string'||!source.includes("rules_version = '2';")||!source.includes('service cloud.firestore'))throw new Error('production Rules source identity invalid');
  if(source.includes(PRODUCTION_BACKUP_RULES_MARKER)){
    if(!source.includes("request.resource.data.environment == 'production'")||!source.includes("match /companies/{companyId}/dailyBackups/{day}"))throw new Error('production backup Rules marker is incomplete');
    return{source,changed:false,beforeSha256:sha256(source),afterSha256:sha256(source)};
  }
  const beforeSha256=sha256(source);
  if(beforeSha256!==expectedBaseSha256)throw new Error(`production Rules drift: ${beforeSha256}`);
  if(source.includes('match /dailyShardedBackups/'))throw new Error('unexpected production daily backup Rules already exist');
  if(source.split(INSERTION_MARKER).length!==2)throw new Error('production Rules insertion marker must be unique');
  const patched=source.replace(INSERTION_MARKER,BACKUP_RULES+INSERTION_MARKER);
  if(!patched.includes(PRODUCTION_BACKUP_RULES_MARKER)||patched.includes("request.resource.data.environment in ['staging','production']"))throw new Error('production backup Rules patch scope invalid');
  return{source:patched,changed:true,beforeSha256,afterSha256:sha256(patched)};
}
