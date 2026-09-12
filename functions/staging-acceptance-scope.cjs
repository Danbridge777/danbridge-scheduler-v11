'use strict';
// Acceptance only: the production protocol runs unchanged inside a staging
// namespace. Even its logical production paths can never escape that root.
function scopedFirestore(native, prefix) {
 if(!/^acceptancePublishedTransport\/callable-279-[a-f0-9-]{36}$/.test(prefix))throw Error('Invalid acceptance namespace');
 const scoped=value=>{if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('..')||value.startsWith('projects/'))throw Error('Invalid scoped path');return prefix+'/'+value};
 const logical=value=>{if(!value.startsWith(prefix+'/'))throw Error('Foreign reference');return value.slice(prefix.length+1)};
 const wrapped=new WeakSet();
 const proxy=(target,handler)=>{if(wrapped.has(target))return target;const result=new Proxy(target,handler);wrapped.add(result);return result};
 const snapshot=s=>proxy(s,{get(target,key){if(key==='ref')return ref(target.ref);if(key==='docs')return target.docs.map(snapshot);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});
 const ref=r=>proxy(r,{get(target,key){
  if(key==='path')return logical(target.path);
  if(key==='get')return async(...args)=>snapshot(await target.get(...args));
  if(['where','orderBy','limit','startAt','startAfter','endAt','endBefore','select'].includes(key))return(...args)=>ref(target[key](...args));
  if(key==='doc'||key==='collection')return value=>{scoped(value);return ref(target[key](value))};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return new Proxy(native,{get(target,key){
  if(key==='doc'||key==='collection')return value=>ref(target[key](scoped(value)));
  if(key==='getAll')return async(...args)=>(await target.getAll(...args)).map(snapshot);
  if(key==='runTransaction')return(callback,...args)=>target.runTransaction(tx=>callback(new Proxy(tx,{get(t,k){if(k==='get')return async(...a)=>snapshot(await t.get(...a));if(k==='getAll')return async(...a)=>(await t.getAll(...a)).map(snapshot);const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})),...args);
  if(['collectionGroup','listCollections','recursiveDelete','bulkWriter'].includes(key))throw Error('Unscoped operation forbidden');
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
module.exports={scopedFirestore};
