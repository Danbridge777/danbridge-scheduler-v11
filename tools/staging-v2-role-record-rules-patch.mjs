import {createHash} from 'node:crypto';

export const STAGING_V2_ROLE_RULES_BASE_SHA256='4c54980c621a1d8ffb0ee45f3566a40fbc0e8c26588c92102cfea6b213023363';
export const STAGING_V2_ROLE_RULES_MARKER='DANBRIDGE_STAGING_V2_ROLE_RECORD_RUNTIME_V1';

const digest=value=>createHash('sha256').update(value).digest('hex');

function extractFunction(source,name){
 const start=source.indexOf(`function ${name}(`);
 if(start<0)throw Error(`Missing function ${name}`);
 const next=source.indexOf('function ',start+9);
 if(next<0)throw Error(`Missing function boundary after ${name}`);
 return source.slice(start,next);
}

function replaceFunction(source,name,replacement){
 const original=extractFunction(source,name);
 if(source.split(original).length!==2)throw Error(`Expected one function ${name}`);
 return source.replace(original,replacement.trimStart());
}

function insertBeforeFunction(source,name,addition){
 const anchor=`function ${name}(`;
 if(source.split(anchor).length!==2)throw Error(`Expected one insertion anchor ${name}`);
 return source.replace(anchor,`${addition.trim()}\n${anchor}`);
}

function patchMatch(source,path,allowance){
 const startToken=`match/${path}{`;
 const start=source.indexOf(startToken);
 if(start<0)throw Error(`Missing match ${path}`);
 const next=source.indexOf('match/',start+startToken.length);
 if(next<0)throw Error(`Missing match boundary after ${path}`);
 const block=source.slice(start,next);
 if(block.includes(allowance))throw Error(`Allowance already present in ${path}`);
 if(!block.endsWith('}'))throw Error(`Unexpected match shape for ${path}`);
 return source.slice(0,start)+block.slice(0,-1)+allowance+'}'+source.slice(next);
}

export function patchStagingV2RoleRecordRules(liveSource,templateSource,{expectedBaseSha256=STAGING_V2_ROLE_RULES_BASE_SHA256}={}){
 if(typeof liveSource!=='string'||digest(liveSource)!==expectedBaseSha256)throw Error('Staging rules base changed; fresh review required');
 if(typeof templateSource!=='string'||!templateSource.includes(`function v2RoleRecordReadOpen(`))throw Error('Reviewed role-rule template missing');
 if(liveSource.includes(STAGING_V2_ROLE_RULES_MARKER))throw Error('Staging V2 role-record patch already present');

 let patched=liveSource;
 patched=insertBeforeFunction(patched,'v1PermanentFenceExists',`/*${STAGING_V2_ROLE_RULES_MARKER}*/\n${extractFunction(templateSource,'v2RoleRecordReadOpen')}`);
 patched=replaceFunction(patched,'activeRoleRecordViewMatches',extractFunction(templateSource,'activeRoleRecordViewMatches'));
 patched=replaceFunction(patched,'ownRoleRecordViewListIsAllowed',extractFunction(templateSource,'ownRoleRecordViewListIsAllowed'));

 const writeFunctions=['roleRecordTargetScopeMatches','roleRecordCollectionMapsValid','roleRecordWriteRuntimeOpen','roleRecordControlWriteIsValid','roleRecordWriteIsValid']
  .map(name=>extractFunction(templateSource,name))
  .join('\n')
  .replace('|| v2RoleRecordRuntimeOpen(companyId, activationEpoch)','|| v2OwnerRuntimeReadOpen(companyId, activationEpoch)');
 patched=insertBeforeFunction(patched,'ownLessonReport',writeFunctions);
 patched=patchMatch(patched,'stagingRoleRecordViewControls/{companyId}/views/{email}','allow create,update:if roleRecordControlWriteIsValid(companyId,email);');
 patched=patchMatch(patched,'stagingRoleRecordViews/{companyId}/views/{viewKey}/collections/{collectionId}/records/{recordId}','allow create,update:if roleRecordWriteIsValid(companyId,viewKey,collectionId,recordId);');

 const required=[
  STAGING_V2_ROLE_RULES_MARKER,
  'v2RoleRecordReadOpen(companyId, control.activationEpoch)',
  'v2OwnerRuntimeReadOpen(companyId, activationEpoch)',
  'allow create,update:if roleRecordControlWriteIsValid(companyId,email);',
  'allow create,update:if roleRecordWriteIsValid(companyId,viewKey,collectionId,recordId);',
 ];
 for(const token of required)if(!patched.includes(token))throw Error(`Patched rules missing ${token}`);
 if(patched.includes('v2RoleRecordRuntimeOpen(companyId, activationEpoch)'))throw Error('Unreviewed duplicate V2 write gate remained');
 return{
  source:patched,
  beforeSha256:digest(liveSource),
  afterSha256:digest(patched),
  beforeBytes:Buffer.byteLength(liveSource),
  afterBytes:Buffer.byteLength(patched),
  changedScopes:['V2 role projection read gate','role projection control writes','role projection record writes'],
 };
}
