// Exact document BatchGet, NOT a collection query or an Admin endpoint.
// Firebase Auth and App Check still apply to every requested document.
const HASH=/^[a-f0-9]{64}$/;
const WORKSPACE=/^acceptancePublishedTransport\/workspace-280-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function createFirestoreRolePartBatchReader({projectId,namespace='',getCurrentUser,getIdToken,getAppCheckToken,fetch:request=globalThis.fetch,timeoutMs=15000}){
 if(!['danbridge-d8877','danbridge-d8877-staging'].includes(projectId)||namespace&&(projectId!=='danbridge-d8877-staging'||!WORKSPACE.test(namespace)))throw Error('Invalid role batch project or namespace');
 if([getCurrentUser,getIdToken,getAppCheckToken,request].some(fn=>typeof fn!=='function')||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid role batch dependencies');
 const database=`projects/${projectId}/databases/(default)`,prefix=`${database}/documents/${namespace?namespace+'/':''}productionRoleChunkViews/`;
 return async(ids,scope)=>{
  if(!Array.isArray(ids)||ids.length<1||ids.length>16||ids.some(id=>!HASH.test(id))||new Set(ids).size!==ids.length||!HASH.test(scope))throw Error('Invalid exact role part IDs');
  const user=getCurrentUser();if(!user?.uid)throw Error('Role batch authentication required');
  const current=()=>getCurrentUser()===user;
  const [idToken,appToken]=await Promise.all([getIdToken(user),getAppCheckToken()]);
  if(!current()||typeof idToken!=='string'||!idToken||typeof appToken!=='string'||!appToken)throw Error('Role batch authentication changed or unavailable');
  const documents=ids.map(id=>`${prefix}${scope}/parts/${id}`),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await request(`https://firestore.googleapis.com/v1/${database}/documents:batchGet`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken,'X-Firebase-AppCheck':appToken},
    body:JSON.stringify({documents}),signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'
   });
   if(!response.ok)throw Error(`Role batch read failed (HTTP ${response.status})`);
   // Bound the whole network body before JSON parsing. Never display an error
   // response that could contain account tokens or arbitrary document data.
   const reader=response.body?.getReader();if(!reader)throw Error('Role batch response stream unavailable');
   const parts=[];let bytes=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8*1024*1024){await reader.cancel();throw Error('Role batch response exceeds bound')}parts.push(value)}}finally{reader.releaseLock()}
   if(!current())throw Error('Role batch account changed during read');
   const buffer=new Uint8Array(bytes);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.byteLength}
   const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
   if(!Array.isArray(rows)||rows.length!==documents.length)throw Error('Role batch response count mismatch');
   const requested=new Set(documents),found=new Map();
   for(const row of rows){
    const document=row?.found;if(row?.error||row?.missing||!document||!requested.has(document.name)||found.has(document.name))throw Error('Role batch contains missing, foreign or duplicate document');
    const fields=document.fields;if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Invalid role batch fields');
    const entries=Object.entries(fields).map(([key,value])=>{
     if(!value||typeof value!=='object'||Object.keys(value).length!==1)throw Error('Invalid role batch value');
     if(typeof value.stringValue==='string')return[key,value.stringValue];
     if(typeof value.integerValue==='string'&&/^-?\d+$/.test(value.integerValue)&&Number.isSafeInteger(Number(value.integerValue)))return[key,Number(value.integerValue)];
     throw Error('Unsupported role batch value');
    });
    const chunk=Object.fromEntries(entries),id=document.name.slice(document.name.lastIndexOf('/')+1);
    if(chunk.id!==id||chunk.scope!==scope)throw Error('Role batch chunk identity mismatch');
    found.set(document.name,chunk);
   }
   // BatchGet does not promise response ordering. The session subsequently
   // verifies each hash, the complete manifest, and a fresh authorized head.
   return documents.map(name=>found.get(name));
  }finally{clearTimeout(timer)}
 };
}
