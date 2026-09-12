// Test-only namespace adapter. Native Firestore still owns transactions,
// preconditions and commit timestamps; logical paths cannot escape the root.
export function scopedFirestore(native, prefix) {
 if(!/^acceptancePublishedTransport\/(run-277|owner-278)-[a-z0-9-]+$/.test(prefix))throw Error('Invalid isolated test namespace');
 const path=value=>{if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('..')||value.startsWith('projects/'))throw Error('Invalid scoped path');return prefix+'/'+value};
 const logical=value=>{if(!value.startsWith(prefix+'/'))throw Error('Reference outside test namespace');return value.slice(prefix.length+1)};
 const wrapped=new WeakSet();
 const proxy=(target,handler)=>{if(wrapped.has(target))return target;const value=new Proxy(target,handler);wrapped.add(value);return value};
 const wrapSnapshot=s=>proxy(s,{get(target,key){
  if(key==='ref')return wrapRef(target.ref);
  if(key==='docs')return target.docs.map(wrapSnapshot);
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 const wrapRef=ref=>proxy(ref,{get(target,key){
  if(key==='path')return logical(target.path);
  if(key==='get')return async(...args)=>wrapSnapshot(await target.get(...args));
  if(['where','orderBy','limit','startAt','startAfter','endAt','endBefore','select'].includes(key))return(...args)=>wrapRef(target[key](...args));
  if(key==='doc'||key==='collection')return value=>{path(value);return wrapRef(target[key](value))};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 const wrapTransaction=transaction=>new Proxy(transaction,{get(target,key){
  if(key==='get')return async(...args)=>wrapSnapshot(await target.get(...args));
  if(key==='getAll')return async(...args)=>(await target.getAll(...args)).map(wrapSnapshot);
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return new Proxy(native,{get(target,key){
  if(key==='doc'||key==='collection')return value=>wrapRef(target[key](path(value)));
  if(key==='getAll')return async(...args)=>(await target.getAll(...args)).map(wrapSnapshot);
  if(key==='runTransaction')return(callback,...args)=>target.runTransaction(tx=>callback(wrapTransaction(tx)),...args);
  if(['collectionGroup','listCollections','recursiveDelete','bulkWriter'].includes(key))throw Error('Unscoped operation unavailable to test runtime');
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
