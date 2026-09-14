// Observe the original exchange rejection before the SDK reduces it to a status
// and starts its backoff. Never retry, replace a response, or inspect tokens.
const METHODS=new Set(['exchangeRecaptchaEnterpriseToken','exchangeRecaptchaV3Token']);
const STATUS=new Set(['INVALID_ARGUMENT','PERMISSION_DENIED','UNAUTHENTICATED','RESOURCE_EXHAUSTED','UNAVAILABLE','INTERNAL','NOT_FOUND']);
const REASONS=new Set(['API_KEY_INVALID','API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','SERVICE_DISABLED','CONSUMER_INVALID','BILLING_DISABLED','RATE_LIMIT_EXCEEDED','QUOTA_EXCEEDED','ACCESS_TOKEN_EXPIRED']);
function summarize(body){
 const error=body?.error;
 const message=typeof error?.message==='string'?error.message:'';
 const category=/app attestation failed/i.test(message)?'attestation-rejected':
  /api key not valid|invalid api key/i.test(message)?'api-key-invalid':
  /requests? from referer.*blocked/i.test(message)?'referrer-blocked':
  /quota.*exceeded|rate limit/i.test(message)?'quota-or-rate-limit':'unclassified';
 return {category,errorStatus:STATUS.has(error?.status)?error.status:'UNKNOWN',
  reasons:[...new Set((Array.isArray(error?.details)?error.details:[]).filter(d=>d?.['@type']==='type.googleapis.com/google.rpc.ErrorInfo'&&REASONS.has(d.reason)).map(d=>d.reason))]};
}

async function readBoundedJson(response,signal){
 const reader=response.body?.getReader();
 if(!reader)return null;
 const stop=()=>{void reader.cancel().catch(()=>{})};
 signal.addEventListener('abort',stop,{once:true});
 const chunks=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)return null;chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return JSON.parse(new TextDecoder().decode(bytes));
 }catch{return null}finally{signal.removeEventListener('abort',stop);stop()}
}

export function createAppCheckExchangeObserver({fetch,projectId,appId,onEvidence=()=>{},now=()=>Date.now(),context=()=>({}),schedule=setTimeout,cancel=clearTimeout}){
 if(typeof fetch!=='function'||typeof onEvidence!=='function'||!projectId||!appId)throw new TypeError('App Check observer configuration missing');
 const pending=new Set();
 function target(input){
  try{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(url.protocol!=='https:'||url.port||url.username||url.password||!['firebaseappcheck.googleapis.com','content-firebaseappcheck.googleapis.com'].includes(url.hostname))return null;
   const match=/^\/v1\/projects\/([^/]+)\/apps\/([^/]+):(\w+)$/.exec(decodeURIComponent(url.pathname));
   if(!match||match[1]!==projectId||match[2]!==appId||!METHODS.has(match[3]))return null;
   return match[3];
  }catch{return null}
 }
 const observedFetch=(input,init)=>{
  const method=target(input);
  if(!method)return fetch(input,init);
  let start;try{start=now()}catch{}
  // Delegate exactly once with unchanged arguments, including AbortSignal.
  return fetch(input,init).then(response=>{
  if(response.ok)return response;
  try{
  let copy;try{copy=response.clone()}catch{return response}
  const at=now();let state={};try{state=context()||{}}catch{}
  const base={schema:'danbridge-app-check-rejection-v1',at:new Date(at).toISOString(),method,httpStatus:response.status,
   elapsedMs:Math.max(0,at-start),visibility:['visible','hidden'].includes(state.visibility)?state.visibility:'unknown',online:typeof state.online==='boolean'?state.online:null};
  let timer;const controller=new AbortController();
  const task=Promise.race([readBoundedJson(copy,controller.signal),new Promise(resolve=>{timer=schedule(()=>{controller.abort();resolve(null)},1000)})])
   .then(body=>{try{void Promise.resolve(onEvidence(Object.freeze({...base,...summarize(body)}))).catch(()=>{})}catch{}})
   .finally(()=>{cancel(timer);pending.delete(task)});
  pending.add(task);
  }catch{/* Diagnostics must never turn a delivered response into a failure. */}
  return response;
  });
 };
 return Object.freeze({fetch:observedFetch,settled:()=>Promise.all([...pending])});
}

export function installAppCheckExchangeObserver({target,projectId,appId}){
 try{
 const evidence=[];
 const observer=createAppCheckExchangeObserver({fetch:target.fetch.bind(target),projectId,appId,
  context:()=>({visibility:target.document?.visibilityState,online:target.navigator?.onLine}),
  onEvidence:record=>{
   evidence.push(record);if(evidence.length>8)evidence.shift();
   // Only the sanitized schema is retained locally. No requests, tokens,
   // account identity, response bodies, or business data leave this page.
   try{target.sessionStorage.setItem('danbridge_app_check_rejections_v1:'+projectId,JSON.stringify(evidence))}catch{}
   try{target.console.warn('Danbridge App Check exchange rejected',record)}catch{}
  }});
 target.fetch=observer.fetch;
 return observer;
 }catch{return null}
}
