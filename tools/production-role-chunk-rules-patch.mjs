import {createHash} from 'node:crypto';

// Pure preparation only. No API calls, deployment, or filesystem writes.
// The default is the read-back production 276 ruleset, not repository Rules.
export const PRODUCTION_ROLE_CHUNK_BASE_SHA256='55011bf1e21b39e46f55132050e836be029924def291454f1217fec8713b4df0';
export const PRODUCTION_ROLE_CHUNK_RULES_MARKER='danbridge-published-role-chunks-278';
const digest=value=>createHash('sha256').update(value).digest('hex');
const block=`
    // ${PRODUCTION_ROLE_CHUNK_RULES_MARKER}: immutable, current-head-only reads.
    match /productionRoleChunkViews/{scope} {
      function publishedTargetMatches(identity) {
        let target = get(/databases/$(database)/documents/companyAccess/$(identity.email)).data;
        return target.active == true && target.companyId == 'danbridge'
          && target.teacherId is string && target.teacherId != ''
          && identity.teacherId == target.teacherId
          && ((identity.kind == 'scheduler'
              && identity.email == 'aa0966626336@gmail.com'
              && target.role == 'teacher' && target.canManageSchedule == true
              && identity.branchIds == [])
            || (identity.kind == 'teacher' && target.role == 'teacher'
              && (!('canManageSchedule' in target) || target.canManageSchedule != true)
              && identity.branchIds == [])
            || (identity.kind == 'branch_manager' && target.role == 'branch_manager'
              && target.branchIds is list && target.branchIds.size() > 0
              && identity.branchIds is list
              && identity.branchIds.hasOnly(target.branchIds)
              && target.branchIds.hasOnly(identity.branchIds)));
      }
      function publishedRoleLinked(head) {
        let identity = head.identity;
        let branch = identity.kind == 'branch_manager';
        let view = branch
          ? get(/databases/$(database)/documents/companyAccess/$(identity.email)).data
          : (identity.kind == 'scheduler'
            ? get(/databases/$(database)/documents/companies/danbridge/schedulerViews/$(identity.email)).data
            : get(/databases/$(database)/documents/companies/danbridge/teacherViews/$(identity.email)).data);
        return head.scope == scope
          && head.schema in ['danbridge-role-chunks-experiment-v2','danbridge-role-chunks-experiment-v3']
          && head.digest is string
          && head.sourceRevision is int && head.sourceRevision >= 0
          && head.chunkIds is list && head.chunkIds.size() <= 4096
          && view.roleChunkManifest.digest == head.digest
          && (branch
            ? (view.scopedSourceRecordRevision == head.sourceRevision && view.scopedSourceRecordHash == head.sourceHash)
            : (view.sourceRecordRevision == head.sourceRevision && view.sourceRecordHash == head.sourceHash))
          && publishedTargetMatches(identity)
          && (isOwner() || identity.email == emailKey());
      }
      allow get: if signedIn() && publishedRoleLinked(resource.data);
      allow list, write: if false;
      match /parts/{partId} {
        function partIsPublished() {
          let head = get(/databases/$(database)/documents/productionRoleChunkViews/$(scope)).data;
          return publishedRoleLinked(head) && partId in head.chunkIds
            && resource.data.id == partId && resource.data.scope == scope;
        }
        allow get: if signedIn() && partIsPublished();
        allow list, write: if false;
      }
    }
`;

export function patchProductionRoleChunkRules(source,{expectedBaseSha256=PRODUCTION_ROLE_CHUNK_BASE_SHA256}={}){
 if(typeof source!=='string'||!/^[a-f0-9]{64}$/.test(expectedBaseSha256))throw Error('Invalid production Rules input');
 const hasMarker=source.includes(PRODUCTION_ROLE_CHUNK_RULES_MARKER);
 if(hasMarker&&!source.includes(block))throw Error('Production role Rules patch incomplete or modified');
 const baseline=hasMarker?source.replace(block,''):source;
 if(baseline.includes('productionRoleChunkViews')||baseline.includes(PRODUCTION_ROLE_CHUNK_RULES_MARKER))throw Error('Production role Rules path already exists');
 if(digest(baseline)!==expectedBaseSha256)throw Error('Production Rules baseline drift');
 if(!/^\s*rules_version\s*=\s*'2';\s*service\s+cloud\.firestore\s*\{\s*match\s*\/databases\/\{database\}\/documents\s*\{/.test(baseline))throw Error('Production Rules identity mismatch');
 for(const name of ['signedIn','emailKey','isOwner'])if(!new RegExp('function\\s+'+name+'\\s*\\(').test(baseline))throw Error('Production Rules helper missing: '+name);
 const match=/match\s*\/databases\/\{database\}\/documents\s*\{/.exec(baseline),offset=match.index+match[0].length;
 const result=baseline.slice(0,offset)+block+baseline.slice(offset);
 if(hasMarker&&result!==source)throw Error('Production role Rules patch position mismatch');
 return{source:result,changed:!hasMarker,beforeSha256:digest(source),baseSha256:expectedBaseSha256,afterSha256:digest(result)};
}
