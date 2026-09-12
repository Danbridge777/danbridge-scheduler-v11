(function(root){
 'use strict';
 function profileFor(hostname,search){
  const params=new URLSearchParams(search),runId=params.get('publishedAcceptance');
  if(!runId)return null;
  if(!['danbridge-d8877-staging.web.app','danbridge-d8877-staging.firebaseapp.com','danbridge-d8877-staging--published-280-f5wzlzb9.web.app','danbridge-d8877-staging--draft-308-q72vphsd.web.app','danbridge-d8877-staging--history-315-j6rlu5ds.web.app'].includes(hostname))throw Error('Published acceptance requires the staging host');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId))throw Error('Invalid published acceptance run');
  const actor=params.get('workspaceActor')||'daniel';
  if(!['daniel','catherine','aa','teacher'].includes(actor))throw Error('Invalid workspace browser identity');
  const prefix='acceptancePublishedTransport/workspace-280-'+runId;
  return Object.freeze({runId,actor,prefix,storagePrefix:'published-workspace-280:'+runId+':'+actor+':',path(value){
   if(typeof value!=='string'||!value||value.split('/').some(part=>!part||part==='.'||part==='..')||value.startsWith('projects/'))throw Error('Invalid acceptance document path');
   // Only existing personal login profiles remain outside the test database.
   // All company data, access projections, notifications and receipts are scoped.
   return value==='users'||value.startsWith('users/')?value:prefix+'/'+value;
  }});
 }
 function isolatedStorage(native,prefix){
  const firebase=key=>/^firebase[:_]/.test(String(key));
  const keyFor=key=>firebase(key)?String(key):prefix+String(key);
  const keys=()=>Array.from({length:native.length},(_,i)=>native.key(i)).filter(key=>key&&key.startsWith(prefix)).map(key=>key.slice(prefix.length));
  return Object.freeze({getItem:key=>native.getItem(keyFor(key)),setItem:(key,value)=>native.setItem(keyFor(key),String(value)),removeItem:key=>native.removeItem(keyFor(key)),key:index=>keys()[index]??null,get length(){return keys().length},clear(){for(const key of keys())native.removeItem(keyFor(key))}});
 }
 if(typeof module==='object'&&module.exports){module.exports={profileFor,isolatedStorage};return}
 const profile=profileFor(root.location.hostname,root.location.search);
 if(!profile)return;
 // Install before the first application script reads a draft. Auth persistence
 // stays unchanged; application cache, clipboard and journals are run-isolated.
 const local=isolatedStorage(root.localStorage,profile.storagePrefix),session=isolatedStorage(root.sessionStorage,profile.storagePrefix),idb=root.indexedDB;
 const scopedIdb=new Proxy(idb,{get(target,key){
  if(key==='open'||key==='deleteDatabase')return(name,...args)=>target[key](String(name).startsWith('danbridge')?profile.storagePrefix+name:name,...args);
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 Object.defineProperty(root,'localStorage',{value:local,configurable:false});
 Object.defineProperty(root,'sessionStorage',{value:session,configurable:false});
 Object.defineProperty(root,'indexedDB',{value:scopedIdb,configurable:false});
 Object.defineProperty(root,'__danbridgePublishedWorkspace',{value:profile,writable:false,configurable:false});
})(globalThis);
