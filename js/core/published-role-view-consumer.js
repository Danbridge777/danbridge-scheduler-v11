import {createRoleViewTransportSession} from './role-view-transport-session.js';

// A server-published manifest, not a URL flag, enables the new reader. The
// existing authorized role document remains the subscription boundary.
export function createPublishedRoleViewConsumer({identity,readCurrentHead,readPart,readParts=null,isActive,apply,onState=()=>{},schedule=setTimeout,cancel=clearTimeout}){
 let closed=false,enabled=false,timer=null,serial=0,retries=0;
 const active=()=>!closed&&isActive();
 const clear=()=>{if(timer!==null){cancel(timer);timer=null}};
 const session=createRoleViewTransportSession({identity,readCurrentHead,readPart,readParts,isActive:active,apply,onState:event=>{if(active())onState(event)}});
 function retry(error,token){
  if(!active()||token!==serial)return;
  onState({state:'blocked',error:String(error?.message||error)});
  clear();timer=schedule(async()=>{
   timer=null;if(!active()||token!==serial)return;
   try{await consume(await readCurrentHead(),token)}catch(nextError){retry(nextError,token)}
  },Math.min(15000,500*2**Math.min(retries++,5)));
 }
 async function consume(head,token){
  if(!active()||token!==serial)return;
  try{
   const result=await session.receive(head);
   if(active()&&token===serial&&['applied','unchanged'].includes(result.state))retries=0;
  }catch(error){
   if(!active()||token!==serial)return;
   // Keep the journal and last complete view; retry the authorized server head,
   // never the rejected payload or an embedded legacy db.
   retry(error,token);
  }
 }
 return Object.freeze({
  invalidate(){closed=true;serial++;clear();session.invalidate()},
  diagnostics(){return{...session.diagnostics(),enabled,retries,retryPending:timer!==null}},
  async receiveSnapshot({exists=true,data,fromCache=false,hasPendingWrites=false}){
   if(!active())return true;
   if(hasPendingWrites||fromCache)return enabled||Object.hasOwn(data||{},'roleChunkManifest');
   if(Object.hasOwn(data||{},'roleChunkManifest'))enabled=true;
   if(!enabled)return false;
   clear();const token=++serial;
   await consume(exists?data:null,token);
   return true;
  }
 });
}
