const DEFAULT_WARM_CACHE_MS=90_000;
const DEFAULT_MAX_TOKEN_AGE_MS=120_000;

function assertFunction(value,label){
 if(typeof value!=='function')throw new TypeError(`${label} must be a function`)
}

function assertDuration(value,label){
 if(!Number.isSafeInteger(value)||value<0)throw new TypeError(`${label} must be a non-negative safe integer`)
}

function tokenFromResult(result,missingMessage){
 if(typeof result?.token!=='string'||result.token.length<8)throw new Error(missingMessage);
 return result.token
}

export function createLimitedUseAppCheckTokenPool({
 appCheck,
 getLimitedUseToken,
 missingMessage='limited-use App Check token missing',
 unavailableMessage='limited-use App Check unavailable',
 now=()=>Date.now(),
 schedule=callback=>setTimeout(callback,0),
 warmCacheMs=DEFAULT_WARM_CACHE_MS,
 maxTokenAgeMs=DEFAULT_MAX_TOKEN_AGE_MS
}={}){
 assertFunction(getLimitedUseToken,'getLimitedUseToken');
 assertFunction(now,'now');
 assertFunction(schedule,'schedule');
 assertDuration(warmCacheMs,'warmCacheMs');
 assertDuration(maxTokenAgeMs,'maxTokenAgeMs');
 if(typeof missingMessage!=='string'||!missingMessage.trim()||typeof unavailableMessage!=='string'||!unavailableMessage.trim())throw new TypeError('limited-use App Check messages invalid');

 let slot=null;
 let startedAt=0;

 function clear(expected){
  if(slot===expected){slot=null;startedAt=0}
 }

 function warm(){
  if(!appCheck)return null;
  const current=now();
  if(slot&&current-startedAt<=warmCacheMs)return slot;
  slot=null;
  startedAt=current;
  const pending=getLimitedUseToken(appCheck).then(result=>Object.freeze({token:tokenFromResult(result,missingMessage),createdAt:now()})).catch(error=>{clear(pending);throw error});
  slot=pending;
  return pending
 }

 async function take(){
  let pending=slot||warm();
  if(!pending)throw new Error(unavailableMessage);
  clear(pending);
  let tokenSlot=await pending;
  if(now()-tokenSlot.createdAt>maxTokenAgeMs){
   pending=warm();
   if(!pending)throw new Error(unavailableMessage);
   clear(pending);
   tokenSlot=await pending
  }
  schedule(()=>{warm()?.catch(()=>{})});
  return tokenSlot.token
 }

 return Object.freeze({warm,take})
}

export async function takeFreshLimitedUseAppCheckToken({appCheck,getLimitedUseToken,missingMessage='limited-use App Check token missing',unavailableMessage='limited-use App Check unavailable'}={}){
 assertFunction(getLimitedUseToken,'getLimitedUseToken');
 if(!appCheck)throw new Error(unavailableMessage);
 return tokenFromResult(await getLimitedUseToken(appCheck),missingMessage)
}
