import {createHash} from 'node:crypto';

export const STAGING_V2_LIST_RULES_BASE_SHA256='deb717cd11d5bf4eed65c3a885b81e2e63ed3fee5ec413b063f8d4bafd53841b';
export const STAGING_V2_LIST_RULES_MARKER='DANBRIDGE_STAGING_V2_OWNER_LIST_V1';
export const STAGING_V2_HEAD_RULES_MARKER='DANBRIDGE_STAGING_V2_HEAD_REVISION_DISCRIMINATOR_V1';
export const STAGING_V2_LIST_PATHS=Object.freeze([
 'stagingActiveRecordV2Baselines/{companyId}/epochs/{targetV2Epoch}/collections/{collectionId}/records/{recordId}',
 'stagingActiveRecordV2Records/{companyId}/epochs/{targetV2Epoch}/collections/{collectionId}/records/{recordId}',
 'stagingActiveRecordV2SaveCommits/{companyId}/epochs/{targetV2Epoch}/saves/{saveId}',
]);
const digest=value=>createHash('sha256').update(value).digest('hex');
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Patch the observed staging release, not the whole local candidate ruleset.
// No get/write expressions, active controls, or other namespaces are changed.
export function patchStagingV2ListRules(source,{projectId,expectedBaseSha256=STAGING_V2_LIST_RULES_BASE_SHA256}={}){
 if(projectId!=='danbridge-d8877-staging')throw Error('Staging-only rules patch rejects other projects');
 if(typeof source!=='string'||digest(source)!==expectedBaseSha256)throw Error('Staging rules base changed; fresh review required');
 if(source.includes(STAGING_V2_LIST_RULES_MARKER))throw Error('Staging list patch is already present');
 if(!source.includes('function v2OwnerRuntimeReadOpen(')||!source.includes('function v2OwnerRuntimeH0HeadReadOpen(')||!source.includes('function isRecordSyncV2GenesisCollection('))throw Error('Required unchanged staging read gates missing');
 const oldHead="isRecordSyncV2CutoverOperator(companyId)||v2OwnerRuntimeH0HeadReadOpen(companyId,targetV2Epoch,resource.data)||v2OwnerRuntimeReadOpen(companyId,targetV2Epoch)";
 const newHead=`isRecordSyncV2CutoverOperator(companyId)||(resource.data.revision==0&&v2OwnerRuntimeH0HeadReadOpen(companyId,targetV2Epoch,resource.data))||(resource.data.revision>=1&&v2OwnerRuntimeReadOpen(companyId,targetV2Epoch))/*${STAGING_V2_HEAD_RULES_MARKER}*/`;
 if(source.split(oldHead).length!==2)throw Error('Expected one exact staging V2 head read clause');
 let patched=source.replace(oldHead,newHead);const insertions=[];
 for(const target of STAGING_V2_LIST_PATHS){
  const pattern=new RegExp('match\\s*/'+escaped(target)+'\\s*\\{','g');
  const matches=[...patched.matchAll(pattern)];
  if(matches.length!==1)throw Error('Expected one exact staging namespace: '+target);
  const match=matches[0],position=match.index+match[0].length,nextMatch=patched.indexOf('match/',position);
  const blockEnd=nextMatch<0?patched.length:nextMatch,block=patched.slice(position,blockEnd);
  const readPattern=/allow\s+read\s*:\s*if\s+v2OwnerRuntimeReadOpen\(companyId\s*,\s*targetV2Epoch\)/;
  const readMatches=[...block.matchAll(new RegExp(readPattern.source,'g'))];
  if(readMatches.length!==1)throw Error('Expected one V2 runtime read clause: '+target);
  const readStart=position+readMatches[0].index,readOriginal=readMatches[0][0],getReplacement=readOriginal.replace(/allow\s+read/,'allow get');
  patched=patched.slice(0,readStart)+getReplacement+patched.slice(readStart+readOriginal.length);
  const gate='v2OwnerRuntimeReadOpen(companyId,targetV2Epoch)'+(target.includes('{collectionId}')?'&&isRecordSyncV2GenesisCollection(collectionId)':'');
  const insertion=`\n// ${STAGING_V2_LIST_RULES_MARKER}\nallow list:if ${gate};\n`;
  patched=patched.slice(0,position)+insertion+patched.slice(position);insertions.push({path:target,insertion,readOriginal,getReplacement});
 }
 let restored=patched.replace(newHead,oldHead);
 for(const {insertion,getReplacement,readOriginal} of insertions)restored=restored.replace(insertion,'').replace(getReplacement,readOriginal);
 if(restored!==source)throw Error('Patch changed content outside the three list clauses');
 return{source:patched,beforeSha256:digest(source),afterSha256:digest(patched),changedPaths:['stagingActiveRecordV2Heads/{companyId}/epochs/{targetV2Epoch}',...STAGING_V2_LIST_PATHS],insertions,headReplacement:{oldHead,newHead}};
}
