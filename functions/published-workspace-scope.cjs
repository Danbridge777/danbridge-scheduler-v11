'use strict';

const ROOT_PATTERN=/^acceptancePublishedTransport\/workspace-280-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

// Native Firestore underneath; only references minted by this adapter may be
// used. A logical production path is always relative to ONE staging test run.
function createPublishedWorkspaceScope(native, prefix, beforeTransaction=async()=>{}) {
 if(!ROOT_PATTERN.test(prefix))throw Error('Invalid published workspace root');
 const nativeByProxy=new WeakMap(),proxyByNative=new WeakMap();
 const path=value=>{
  if(typeof value!=='string'||!value||value.split('/').some(p=>!p||p==='.'||p==='..')||value.startsWith('projects/'))throw Error('Invalid workspace path');
  return `${prefix}/${value}`;
 };
 const unwrap=ref=>{const raw=nativeByProxy.get(ref);if(!raw)throw Error('Foreign workspace reference');return raw};
 // Preserve identity only for the SAME immutable native snapshot, within this
 // exact scope. A fresh transaction/version produces a fresh native object.
 // Re-wrapping query.docs used to defeat version-reader materialization reuse.
 const snapshotByNative=new WeakMap();
 const snapshot=row=>{
  if(snapshotByNative.has(row))return snapshotByNative.get(row);
  const result=new Proxy(row,{get(t,key){
  if(key==='ref')return wrap(t.ref);
  if(key==='docs')return t.docs.map(snapshot);
  if(key==='forEach')return fn=>t.docs.forEach(row=>fn(snapshot(row)));
  const value=Reflect.get(t,key,t);return typeof value==='function'?value.bind(t):value;
 }});
  snapshotByNative.set(row,result);return result;
 };
 const wrap=raw=>{
  if(proxyByNative.has(raw))return proxyByNative.get(raw);
  const result=new Proxy(raw,{get(t,key){
   if(key==='path'){if(!t.path?.startsWith(prefix+'/'))throw Error('Foreign workspace path');return t.path.slice(prefix.length+1)}
   if(key==='firestore'||key==='parent')throw Error('Unscoped reference access forbidden');
   if(key==='get')return async(...args)=>snapshot(await t.get(...args));
   if(key==='doc'||key==='collection')return value=>{path(value);return wrap(t[key](value))};
   if(['where','orderBy','limit','startAt','startAfter','endAt','endBefore','select'].includes(key))return(...args)=>wrap(t[key](...args));
   if(['listCollections','listDocuments','onSnapshot','stream','withConverter'].includes(key))throw Error('Unsupported workspace reference operation');
   const value=Reflect.get(t,key,t);return typeof value==='function'?value.bind(t):value;
  }});
  nativeByProxy.set(result,raw);proxyByNative.set(raw,result);return result;
 };
 const writer=(raw,transaction=false)=>{
  const result={};
  for(const method of ['create','set','update','delete'])result[method]=(ref,...args)=>{raw[method](unwrap(ref),...args);return result};
  if(transaction){result.get=async ref=>snapshot(await raw.get(unwrap(ref)));result.getAll=async(...refs)=>(await raw.getAll(...refs.map(unwrap))).map(snapshot)}
  else result.commit=()=>raw.commit();
  return Object.freeze(result);
 };
 return Object.freeze({
  doc:value=>wrap(native.doc(path(value))),collection:value=>wrap(native.collection(path(value))),
  getAll:async(...refs)=>(await native.getAll(...refs.map(unwrap))).map(snapshot),
  batch:()=>writer(native.batch()),
  runTransaction:(callback,...options)=>native.runTransaction(async tx=>{await beforeTransaction(tx);return callback(writer(tx,true))},...options)
 });
}
module.exports={createPublishedWorkspaceScope,ROOT_PATTERN};
