import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

const source=new URL('../firebase/firestore.rules',import.meta.url);
const target=new URL('../firebase/firestore.rules.deploy',import.meta.url);
const phaseArgument=process.argv.find(value=>value.startsWith('--phase='));
const phase=phaseArgument?.slice('--phase='.length)??'all';
const allowedPhases=new Set(['all','pause','proof','genesis','reservation','runtime']);
if(!allowedPhases.has(phase))throw new Error(`FIRESTORE_RULES_PHASE_BLOCKED:${phase}`);
const original=readFileSync(source,'utf8').replace(/\r\n/g,'\n');
let deploy='';
let quoted='';
let escaped=false;
let lineComment=false;
let blockComment=false;
let pendingSpace=false;
for(let i=0;i<original.length;i+=1){
  const char=original[i];
  const next=original[i+1];
  if(lineComment){
    if(char==='\n'){lineComment=false;pendingSpace=true;}
    continue;
  }
  if(blockComment){
    if(char==='*'&&next==='/'){blockComment=false;i+=1;pendingSpace=true;}
    continue;
  }
  if(quoted){
    deploy+=char;
    if(escaped)escaped=false;
    else if(char==='\\')escaped=true;
    else if(char===quoted)quoted='';
    continue;
  }
  if(char==='/'&&next==='/'){lineComment=true;i+=1;continue;}
  if(char==='/'&&next==='*'){blockComment=true;i+=1;continue;}
  if(/\s/.test(char)){pendingSpace=true;continue;}
  const previous=deploy.at(-1)??'';
  const word=/[A-Za-z0-9_]/;
  const mergedOperator=new Set(['//','/*','==','!=','<=','>=','&&','||','++','--','=>']);
  if(pendingSpace&&deploy.length&&(
    (word.test(previous)&&word.test(char))||
    (previous===char&&(char==='"'||char==="'"))||
    mergedOperator.has(previous+char)
  ))deploy+=' ';
  pendingSpace=false;
  deploy+=char;
  if(char==='"'||char==="'")quoted=char;
}
deploy=deploy.trim()+'\n';
function balancedBlockEnd(text,bodyStart,label){
  let depth=0;
  let inString='';
  let stringEscape=false;
  for(let i=bodyStart;i<text.length;i+=1){
    const char=text[i];
    if(inString){
      if(stringEscape)stringEscape=false;
      else if(char==='\\')stringEscape=true;
      else if(char===inString)inString='';
      continue;
    }
    if(char==='"'||char==="'"){inString=char;continue;}
    if(char==='{')depth+=1;
    else if(char==='}'&&--depth===0)return i+1;
  }
  throw new Error(`FIRESTORE_RULES_UNBALANCED:${label}`);
}
const phasePaths={
  pause:[
    '/stagingRecordSyncV2FreezeRequests/',
    '/stagingRecordSyncV2FreezeControls/',
    '/stagingRecordSyncV1V2HardPauseReceipts/',
  ],
  proof:[
    '/stagingRecordSyncV1PostPauseScans/',
    '/stagingRecordSyncV1PostPauseScanPairs/',
    '/stagingRecordSyncV1RawCutoverBackups/',
    '/stagingRecordSyncV1FrozenSourceProofs/',
  ],
  genesis:[
    '/stagingRecordSyncV2TakeoverCandidateControls/',
    '/stagingActiveRecordV2Heads/',
    '/stagingRecordSyncV2Genesis/',
    '/stagingRecordSyncV2GenesisAuthorities/',
    '/stagingRecordSyncV2GenesisAuthorityAuditReceipts/',
    '/stagingRecordSyncV2DeploymentAttestations/',
  ],
  reservation:[
    '/stagingRecordSyncV2Reservations/',
    '/stagingRecordSyncV2ReservationFinalizations/',
    '/stagingRecordSyncV2ReservationReadbacks/',
    '/stagingRecordSyncV2ReservationAuthorities/',
    '/stagingRecordSyncV2ReservationAuthorityAuditReceipts/',
    '/stagingRecordSyncV2ActivationCutoverIntents/',
    '/stagingRecordSyncV2DeploymentReceipts/',
  ],
};
if(phase!=='all'&&phase!=='runtime'){
  const phaseOrder=['pause','proof','genesis','reservation'];
  const selected=new Set(phaseOrder.slice(0,phaseOrder.indexOf(phase)+1).flatMap(name=>phasePaths[name]));
  const phasedPrefixes=new Set(Object.values(phasePaths).flat());
  const removals=[];
  const matches=[];
  for(const token of deploy.matchAll(/\bmatch\s*\//g)){
    const pathStart=token.index+token[0].lastIndexOf('/');
    let variableDepth=0;
    let bodyStart=-1;
    for(let i=pathStart;i<deploy.length;i+=1){
      if(deploy[i]==='{'&&deploy[i-1]==='/'){variableDepth=1;continue;}
      if(variableDepth&&deploy[i]==='}'){variableDepth=0;continue;}
      if(deploy[i]==='{'&&!variableDepth){bodyStart=i;break;}
    }
    if(bodyStart<0)throw new Error('FIRESTORE_RULES_MATCH_BODY_NOT_FOUND');
    matches.push({index:token.index,path:deploy.slice(pathStart,bodyStart),bodyStart});
  }
  for(const match of matches){
    const path=match.path;
    const prefix=[...phasedPrefixes].find(value=>path.startsWith(value));
    if(!prefix||selected.has(prefix))continue;
    removals.push({start:match.index,end:balancedBlockEnd(deploy,match.bodyStart,path)});
  }
  // Nested matches can overlap their removed parent; keep only outer spans.
  const outer=removals.filter((candidate,index)=>!removals.some((other,otherIndex)=>otherIndex!==index&&other.start<candidate.start&&candidate.end<=other.end));
  for(const removal of outer.sort((a,b)=>b.start-a.start))deploy=deploy.slice(0,removal.start)+deploy.slice(removal.end);
  const replaceFunction=(name,replacement)=>{
    const match=new RegExp(`\\bfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(deploy);
    if(!match)throw new Error(`FIRESTORE_RULES_PHASE_FUNCTION_NOT_FOUND:${name}`);
    const start=match.index;
    const bodyStart=start+match[0].lastIndexOf('{');
    deploy=deploy.slice(0,start)+replacement+deploy.slice(balancedBlockEnd(deploy,bodyStart,name));
  };
  // The safety and writer documents have their complete schema/transition
  // validation at their own fixed paths. Repeating that full validation graph
  // at every legacy data match makes Firebaserules inline it dozens of times.
  // These phase artifacts keep the same fail-closed state pointers while
  // avoiding redundant cross-document schema expansion.
  replaceFunction('legacyV1WriteOpen',`function legacyV1WriteOpen(companyId){let safety=getAfter(/databases/$(database)/documents/stagingRecordSyncSafetyControls/$(companyId)).data;let writerPath=/databases/$(database)/documents/stagingRecordSyncV1WriterCurrents/$(companyId);return !v1PermanentFenceExists(companyId)&&safety.state=='active'&&safety.writeAllowed==true&&(!existsAfter(writerPath)||(getAfter(writerPath).data.state=='open'&&getAfter(writerPath).data.acceptNewMutations==true));}`);
  replaceFunction('legacyV1CandidateWriteOpen',`function legacyV1CandidateWriteOpen(companyId){return !v1PermanentFenceExists(companyId)&&!existsAfter(/databases/$(database)/documents/stagingRecordSyncV1WriterCurrents/$(companyId))&&getAfter(/databases/$(database)/documents/stagingRecordSyncSafetyControls/$(companyId)).data.state=='active'&&getAfter(/databases/$(database)/documents/stagingRecordSyncSafetyControls/$(companyId)).data.writeAllowed==true;}`);
  if(phase==='pause'){
    replaceFunction('hardPauseWriterBundleMembershipAllowed',`function hardPauseWriterBundleMembershipAllowed(companyId){let w1=getAfter(/databases/$(database)/documents/stagingRecordSyncV1WriterCurrents/$(companyId)).data;let fPath=/databases/$(database)/documents/stagingRecordSyncV2FreezeRequests/$(companyId)/epochs/$(w1.activationEpoch)/freezes/$(w1.currentFreezeId);let kPath=/databases/$(database)/documents/stagingRecordSyncV2FreezeControls/$(companyId)/epochs/$(w1.activationEpoch)/freezes/$(w1.currentFreezeId);return !exists(fPath)&&existsAfter(fPath)&&!exists(kPath)&&existsAfter(kPath);}`);
    replaceFunction('hardPauseSafetyBundleMembershipAllowed',`function hardPauseSafetyBundleMembershipAllowed(companyId){let w1=getAfter(/databases/$(database)/documents/stagingRecordSyncV1WriterCurrents/$(companyId)).data;let s1=getAfter(/databases/$(database)/documents/stagingRecordSyncSafetyControls/$(companyId)).data;let pPath=/databases/$(database)/documents/stagingRecordSyncSafetyEvents/$(companyId)/epochs/$(w1.activationEpoch)/events/$(s1.lastEventId);let hPath=/databases/$(database)/documents/stagingRecordSyncV1V2HardPauseReceipts/$(companyId)/epochs/$(w1.activationEpoch)/freezes/$(w1.currentFreezeId);return !exists(pPath)&&existsAfter(pPath)&&!exists(hPath)&&existsAfter(hPath);}`);
    deploy=deploy
      .replaceAll('&&hardPauseWriterTransitionWitness(companyId)&&hardPauseFreezeRequestAllowed(companyId)','&&hardPauseFreezeRequestAllowed(companyId)')
      .replaceAll('&&hardPauseWriterTransitionWitness(companyId)&&hardPauseFreezeControlAllowed(companyId)','&&hardPauseFreezeControlAllowed(companyId)')
      .replaceAll('&&hardPauseSafetyTransitionWitness(companyId)&&hardPauseEventAllowed(companyId)','&&hardPauseEventAllowed(companyId)')
      .replaceAll('&&hardPauseWriterTransitionWitness(companyId)&&hardPauseSafetyTransitionWitness(companyId)&&hardPauseReceiptAllowed(companyId)','&&hardPauseReceiptAllowed(companyId)');
  }
  const maintenanceWritePrefixes={
    pause:[
      ...phasePaths.pause,
      '/stagingRecordSyncV1WriterCurrents/',
      '/stagingRecordSyncSafetyControls/',
      '/stagingRecordSyncSafetyEvents/',
    ],
    proof:[...phasePaths.proof],
    genesis:[...phasePaths.genesis],
    reservation:[...phasePaths.reservation],
  }[phase];
  const protectedSpans=[];
  for(const token of deploy.matchAll(/\bmatch\s*\//g)){
    const pathStart=token.index+token[0].lastIndexOf('/');
    let variableDepth=0;
    let bodyStart=-1;
    for(let i=pathStart;i<deploy.length;i+=1){
      if(deploy[i]==='{'&&deploy[i-1]==='/'){variableDepth=1;continue;}
      if(variableDepth&&deploy[i]==='}'){variableDepth=0;continue;}
      if(deploy[i]==='{'&&!variableDepth){bodyStart=i;break;}
    }
    const path=deploy.slice(pathStart,bodyStart);
    if(maintenanceWritePrefixes.some(prefix=>path.startsWith(prefix))){
      protectedSpans.push({start:token.index,end:balancedBlockEnd(deploy,bodyStart,path)});
    }
  }
  const writeAllows=[...deploy.matchAll(/\ballow\s+(?:(?:write|create|update|delete)\s*,?\s*)+:\s*if\s+[^;]*;/g)]
    .map(match=>({start:match.index,end:match.index+match[0].length}))
    .filter(allow=>!protectedSpans.some(span=>span.start<allow.start&&allow.end<span.end));
  for(const allow of writeAllows.sort((a,b)=>b.start-a.start))deploy=deploy.slice(0,allow.start)+deploy.slice(allow.end);
}
// The atomic V2 activation artifacts remain immutable in Firestore, but their
// one-time browser maintenance rules must not ship forever.  The live runtime
// surface keeps only authentication/access, current V2 authority reads,
// role-record projections, operational company data, backups and explicit
// fail-closed namespace guards.  Removing the retired migration match graphs
// also keeps the compiled ruleset below Firebase's 250 KiB activation limit.
if(phase==='runtime'){
  const retiredRuntimePrefixes=[
    ...Object.values(phasePaths).flat().filter(prefix=>prefix!=='/stagingActiveRecordV2Heads/'),
    '/stagingRecordShadows/',
    '/stagingRecordSyncCandidateControls/',
    '/stagingFullRecordShadows/',
    '/stagingRecordSyncRoleEvidence/',
    '/stagingRecordSyncActivationManifests/',
    '/stagingRecordSyncControls/',
    '/stagingRecordSyncV1WriterCurrents/',
    '/stagingRecordSyncSafetyControls/',
    '/stagingRecordSyncSafetyEvents/',
    '/stagingRecordSyncRecoveryReceipts/',
    '/stagingRecordSyncOperationReceipts/',
    '/stagingRecordSyncConflictBackups/',
    '/stagingLiveExecutionManifests/',
    '/stagingLiveRecords/',
    '/stagingLiveOperationReceipts/',
    '/stagingLiveRecordControls/',
    '/productionFullRecordShadows/',
    '/stagingRoleViewCandidateManifests/',
    '/stagingRoleViewVerificationReceipts/',
    '/stagingRoleViewCandidates/',
    '/productionRoleViewCandidates/',
    '/stagingRecordCandidateManifests/',
    '/stagingRecordActivationControls/',
    '/stagingRecordShadowRuns/',
    '/stagingRecordShadowControls/',
    '/stagingMigrationBackups/',
    '/stagingMigrationRestoreDrills/',
    '/stagingRecordSyncV2TakeoverCandidateControls/',
  ];
  const removals=[];
  for(const token of deploy.matchAll(/\bmatch\s*\//g)){
    const pathStart=token.index+token[0].lastIndexOf('/');
    let variableDepth=0;
    let bodyStart=-1;
    for(let i=pathStart;i<deploy.length;i+=1){
      if(deploy[i]==='{'&&deploy[i-1]==='/'){variableDepth=1;continue;}
      if(variableDepth&&deploy[i]==='}'){variableDepth=0;continue;}
      if(deploy[i]==='{'&&!variableDepth){bodyStart=i;break;}
    }
    if(bodyStart<0)throw new Error('FIRESTORE_RULES_RUNTIME_MATCH_BODY_NOT_FOUND');
    const path=deploy.slice(pathStart,bodyStart);
    if(retiredRuntimePrefixes.some(prefix=>path.startsWith(prefix))){
      removals.push({start:token.index,end:balancedBlockEnd(deploy,bodyStart,path)});
    }
  }
  const outer=removals.filter((candidate,index)=>!removals.some((other,otherIndex)=>otherIndex!==index&&other.start<candidate.start&&candidate.end<=other.end));
  for(const removal of outer.sort((a,b)=>b.start-a.start))deploy=deploy.slice(0,removal.start)+deploy.slice(removal.end);
}
// Retain only functions reachable from the selected match rules. This removes
// whole inactive phase validator graphs rather than relying on a fragile list.
{
  const declarations=[...deploy.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g)].map(match=>{
    const bodyStart=match.index+match[0].lastIndexOf('{');
    return{name:match[1],start:match.index,end:balancedBlockEnd(deploy,bodyStart,match[1])};
  });
  const names=new Set(declarations.map(value=>value.name));
  const declarationAt=new Map(declarations.map(value=>[value.name,value]));
  const withoutFunctions=declarations.slice().sort((a,b)=>b.start-a.start).reduce((text,value)=>text.slice(0,value.start)+text.slice(value.end),' '+deploy);
  const references=text=>new Set([...text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)].map(match=>match[0]).filter(name=>names.has(name)));
  const reachable=references(withoutFunctions);
  const queue=[...reachable];
  while(queue.length){
    const current=queue.pop();
    const declaration=declarationAt.get(current);
    if(!declaration)continue;
    for(const dependency of references(deploy.slice(declaration.start,declaration.end))){
      if(!reachable.has(dependency)){reachable.add(dependency);queue.push(dependency);}
    }
  }
  const unused=declarations.filter(value=>!reachable.has(value.name));
  for(const value of unused.sort((a,b)=>b.start-a.start))deploy=deploy.slice(0,value.start)+deploy.slice(value.end);
}
deploy=deploy.trim()+'\n';
const denyPattern=/allow\s+(?:read|write|create|update|delete|get|list)(?:\s*,\s*(?:read|write|create|update|delete|get|list))*\s*:\s*if\s+false\s*;/g;
const denyMatches=[...deploy.matchAll(denyPattern)].map(match=>({start:match.index,end:match.index+match[0].length}));
if(denyMatches.length===0)throw new Error('FIRESTORE_RULES_EXPLICIT_DENY_NOT_FOUND');
const braceStack=[];
const bracePairs=[];
quoted='';
escaped=false;
for(let i=0;i<deploy.length;i+=1){
  const char=deploy[i];
  if(quoted){
    if(escaped)escaped=false;
    else if(char==='\\')escaped=true;
    else if(char===quoted)quoted='';
    continue;
  }
  if(char==='"'||char==="'"){quoted=char;continue;}
  if(char==='{')braceStack.push(i);
  else if(char==='}'){
    const open=braceStack.pop();
    if(open===undefined)throw new Error('FIRESTORE_RULES_BRACE_UNDERFLOW');
    bracePairs.push({open,close:i});
  }
}
if(braceStack.length)throw new Error('FIRESTORE_RULES_BRACE_UNBALANCED');
const bodyFor=position=>bracePairs
  .filter(pair=>pair.open<position&&position<pair.close)
  .sort((a,b)=>b.open-a.open)[0];
const deniesByBody=new Map();
for(const deny of denyMatches){
  const body=bodyFor(deny.start);
  if(!body)throw new Error('FIRESTORE_RULES_DENY_OUTSIDE_BODY');
  const key=`${body.open}:${body.close}`;
  const entry=deniesByBody.get(key)??{body,denies:[]};
  entry.denies.push(deny);
  deniesByBody.set(key,entry);
}
const removable=[];
const emptyMatchSpans=[];
for(const {body,denies} of deniesByBody.values()){
  let remainder=deploy.slice(body.open+1,body.close);
  for(const deny of [...denies].sort((a,b)=>b.start-a.start)){
    const localStart=deny.start-(body.open+1);
    remainder=remainder.slice(0,localStart)+remainder.slice(localStart+deny.end-deny.start);
  }
  if(remainder.trim())removable.push(...denies);
  else{
    const matchTokens=[...deploy.slice(0,body.open).matchAll(/\bmatch(?=\s*\/)/g)];
    const matchStart=matchTokens.at(-1)?.index??-1;
    if(matchStart<0)throw new Error('FIRESTORE_RULES_EMPTY_MATCH_START_NOT_FOUND');
    const header=deploy.slice(matchStart,body.open);
    if(!/^match\s*\//.test(header))throw new Error('FIRESTORE_RULES_EMPTY_MATCH_HEADER_BLOCKED');
    emptyMatchSpans.push({start:matchStart,end:body.close+1});
  }
}
const structuralRemovals=[...removable,...emptyMatchSpans].sort((a,b)=>b.start-a.start);
for(const removal of structuralRemovals){
  deploy=deploy.slice(0,removal.start)+deploy.slice(removal.end);
}
const localDeclarations=['all','runtime'].includes(phase)?[...deploy.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g)]:[];
for(const declaration of [...localDeclarations].reverse()){
  const start=declaration.index;
  const bodyStart=start+declaration[0].lastIndexOf('{');
  let depth=0;
  let end=-1;
  quoted='';
  escaped=false;
  for(let i=bodyStart;i<deploy.length;i+=1){
    const char=deploy[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char===quoted)quoted='';
      continue;
    }
    if(char==='"'||char==="'"){quoted=char;continue;}
    if(char==='{')depth+=1;
    else if(char==='}'&&--depth===0){end=i+1;break;}
  }
  if(end<0)throw new Error(`FIRESTORE_RULES_FUNCTION_UNBALANCED:${declaration[1]}`);
  const segment=deploy.slice(start,end);
  const locals=[
    ...declaration[2].split(',').map(value=>value.trim()).filter(Boolean),
    ...[...segment.matchAll(/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map(match=>match[1]),
  ];
  const identifiers=new Set([...segment.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)].map(match=>match[0]));
  const aliases=new Map();
  let aliasIndex=0;
  for(const name of new Set(locals)){
    let alias;
    do{alias=`v${(aliasIndex++).toString(36)}`;}while(identifiers.has(alias));
    if(alias.length<name.length){aliases.set(name,alias);identifiers.add(alias);}
  }
  let renamed='';
  quoted='';
  escaped=false;
  for(let i=0;i<segment.length;){
    const char=segment[i];
    if(quoted){
      renamed+=char;i+=1;
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char===quoted)quoted='';
      continue;
    }
    if(char==='"'||char==="'"){quoted=char;renamed+=char;i+=1;continue;}
    if(/[A-Za-z_]/.test(char)){
      let tokenEnd=i+1;
      while(tokenEnd<segment.length&&/[A-Za-z0-9_]/.test(segment[tokenEnd]))tokenEnd+=1;
      const identifier=segment.slice(i,tokenEnd);
      const previous=segment[i-1]??'';
      renamed+=previous==='.'?identifier:(aliases.get(identifier)??identifier);
      i=tokenEnd;
      continue;
    }
    renamed+=char;i+=1;
  }
  deploy=deploy.slice(0,start)+renamed+deploy.slice(end);
}
const functionNames=[...deploy.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)]
  .map(match=>match[1]);
if(new Set(functionNames).size!==functionNames.length){
  throw new Error('FIRESTORE_RULES_DUPLICATE_FUNCTION_NAME_BLOCKED');
}
const builtins=new Set(['debug','exists','existsAfter','get','getAfter','latlng','path','timestamp']);
const safeFunctionNames=['all','runtime'].includes(phase)?functionNames.filter(name=>{
  if(builtins.has(name))return false;
  const matches=[...deploy.matchAll(new RegExp(`\\b${name}\\b`,'g'))];
  return matches.every(match=>{
    const before=deploy.slice(0,match.index);
    const after=deploy.slice(match.index+name.length);
    const declaration=/function\s*$/.test(before);
    const directCall=/^\s*\(/.test(after)&&!/[.]\s*$/.test(before);
    return declaration||directCall;
  });
}):[];
const functionAliases=new Map(safeFunctionNames.map((name,index)=>[name,`f${index.toString(36)}`]));
let mangled='';
quoted='';
escaped=false;
for(let i=0;i<deploy.length;){
  const char=deploy[i];
  if(quoted){
    mangled+=char;
    i+=1;
    if(escaped)escaped=false;
    else if(char==='\\')escaped=true;
    else if(char===quoted)quoted='';
    continue;
  }
  if(char==='"'||char==="'"){quoted=char;mangled+=char;i+=1;continue;}
  if(/[A-Za-z_]/.test(char)){
    let end=i+1;
    while(end<deploy.length&&/[A-Za-z0-9_]/.test(deploy[end]))end+=1;
    const identifier=deploy.slice(i,end);
    mangled+=functionAliases.get(identifier)??identifier;
    i=end;
    continue;
  }
  mangled+=char;
  i+=1;
}
deploy=mangled;
if(phase==='runtime'){
  for(const path of [
    'match/stagingActiveRecordV2Heads/',
    'match/stagingRecordSyncV2ActiveControls/',
    'match/stagingActiveRecordV2Records/',
    'match/stagingActiveRecordV2AuditAppends/',
    'match/stagingRoleRecordViewControls/',
    'match/stagingRoleRecordViews/',
    'match/companies/',
  ])if(!deploy.includes(path))throw new Error(`FIRESTORE_RULES_RUNTIME_REQUIRED_PATH_MISSING:${path}`);
  for(const path of [
    'match/stagingRecordShadows/',
    'match/stagingLiveRecords/',
    'match/stagingMigrationBackups/',
    'match/stagingRecordSyncV2Genesis/',
    'match/stagingRecordSyncV2Reservations/',
  ])if(deploy.includes(path))throw new Error(`FIRESTORE_RULES_RUNTIME_RETIRED_PATH_PRESENT:${path}`);
}
const bytes=Buffer.byteLength(deploy,'utf8');
if(bytes>256*1024)throw new Error(`FIRESTORE_RULES_DEPLOY_SIZE_BLOCKED:${bytes}`);
writeFileSync(target,deploy,'utf8');
const sha256=createHash('sha256').update(deploy).digest('hex');
process.stdout.write(`${JSON.stringify({status:'FIRESTORE_RULES_DEPLOY_BUILT',phase,bytes,sha256})}\n`);
