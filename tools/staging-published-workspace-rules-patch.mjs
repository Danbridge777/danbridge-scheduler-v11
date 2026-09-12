import {createHash} from 'node:crypto';
export const WORKSPACE_RULES_MARKER='DANBRIDGE_PUBLISHED_WORKSPACE_280';
export const digest=source=>createHash('sha256').update(source).digest('hex');
export function revisePublishedWorkspaceRules(live,reviewedBaseline,reviewedCandidate,template,expectedHash){
 if(digest(live)!==expectedHash||live!==reviewedCandidate)throw Error('Reviewed live workspace Rules changed');
 if(reviewedBaseline.includes(WORKSPACE_RULES_MARKER)||!reviewedCandidate.includes(WORKSPACE_RULES_MARKER))throw Error('Invalid reviewed Rules lineage');
 const patch=patchPublishedWorkspaceRules(reviewedBaseline,template,digest(reviewedBaseline));
 return {...patch,baseSha256:expectedHash};
}
export function patchPublishedWorkspaceRules(live,template,expectedHash){
 if(typeof live!=='string'||digest(live)!==expectedHash)throw Error('Staging Rules changed; fresh read required');
 if(live.includes(WORKSPACE_RULES_MARKER)||/match\s*\/acceptancePublishedTransport\//.test(live))throw Error('Workspace Rules already exist; do not overwrite');
 const start=template.indexOf('    // Normal-UI acceptance runs'),end=template.indexOf('    function signedIn()',start);
 if(start<0||end<start)throw Error('Reviewed workspace Rules missing');
 const block=template.slice(start,end);
 if(!block.includes("root.purpose == 'normal-ui-published-280-synthetic-only'")||!block.includes('allow list, write: if false;'))throw Error('Workspace Rules fence missing');
 const boundary=/match\s*\/databases\/\{database\}\/documents\s*\{/g;
 const matches=[...live.matchAll(boundary)];if(matches.length!==1)throw Error('Ambiguous database Rules boundary');
 const at=matches[0].index+matches[0][0].length,addition='\n    // '+WORKSPACE_RULES_MARKER+'\n'+block;
 const source=live.slice(0,at)+addition+live.slice(at);
 if(source.replace(addition,'')!==live)throw Error('Existing Rules changed');
 return{source,baseSha256:expectedHash,candidateSha256:digest(source),changedScope:'acceptancePublishedTransport/workspace-280-<UUID> only'};
}
