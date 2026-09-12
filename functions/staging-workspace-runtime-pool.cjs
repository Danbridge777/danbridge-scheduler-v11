'use strict';
const {ROOT_PATTERN}=require('./published-workspace-scope.cjs');

// Reuse the runtime and its version-checked history reader, never an identity,
// authorization decision, root state or transaction. Each execute still runs
// the normal live-member/root fence and full authority verification.
function createWorkspaceRuntimePool({maxEntries=4,maxIdleMs=300000,clock=Date.now}={}){
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxIdleMs)||maxIdleMs<1||typeof clock!=='function')throw Error('Invalid workspace runtime pool');
 const clients=new WeakMap();
 return Object.freeze({get(native,{prefix,kind,preserveLegacyViews},create){
  if(!native||typeof native!=='object'||!ROOT_PATTERN.test(prefix)||!['owner','scheduler'].includes(kind)||typeof preserveLegacyViews!=='boolean'||typeof create!=='function')throw Error('Invalid workspace runtime scope');
  let entries=clients.get(native);if(!entries){entries=new Map();clients.set(native,entries)}
  const at=clock(),key=JSON.stringify([prefix,kind,preserveLegacyViews]);
  for(const [id,row] of entries)if(at-row.lastUsed>=maxIdleMs)entries.delete(id);
  const saved=entries.get(key);
  if(saved){saved.lastUsed=at;entries.delete(key);entries.set(key,saved);return saved.value}
  while(entries.size>=maxEntries)entries.delete(entries.keys().next().value);
  const row={lastUsed:at,value:null};
  row.value=Promise.resolve().then(create).catch(error=>{if(entries.get(key)===row)entries.delete(key);throw error});
  entries.set(key,row);return row.value;
 }});
}
module.exports={createWorkspaceRuntimePool};
