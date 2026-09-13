// Keep authentication failures visible without changing authorization or tokens.
export function createGoogleSignInFlow({auth,provider,signInWithPopup,signInWithRedirect,getRedirectResult,hostname,authDomain,preferRedirect=false,onError=()=>{},onBusy=()=>{},schedule=setTimeout,cancel=clearTimeout}){
 let busy=false,lastError='',generation=0;
 const sameOriginRedirect=hostname===authDomain;
 function report(error){
  const code=typeof error?.code==='string'?error.code:'auth/unknown';
  const message=code==='auth/network-request-failed'?'登入連線失敗，請確認網路後再試。':
   ['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(code)?'登入視窗已關閉，請再次按登入。':
   code==='auth/popup-blocked'?'登入彈窗被阻擋，請允許此網站的登入彈窗後再試。':
   code==='auth/unauthorized-domain'?'登入網域未獲授權，請聯絡管理員。':'Google 登入未完成，請重試；若持續發生，請提供此錯誤代碼。';
  lastError=`${message}（${code}）`;onError(lastError);
 }
 async function start(){
  if(busy)return;
  busy=true;lastError='';onError('');onBusy(true);const attempt=++generation;
  // An iframe/popup may never settle after an interrupted connection. Expose
  // retry without treating a timeout as success or starting a second request.
  // Firebase cancels the previous popup when the user explicitly retries.
  const timer=schedule(()=>{if(attempt!==generation)return;busy=false;onBusy(false);if(!auth.currentUser){lastError='Google 登入仍未完成，請完成帳號選擇，或再次按登入重試。';onError(lastError)}},45000);
  try{
   // Cross-origin redirects depend on third-party storage. Keep popup login
   // on web.app/preview hosts; never weaken browser storage protections.
   if(preferRedirect&&sameOriginRedirect)await signInWithRedirect(auth,provider);
   else{
    try{await signInWithPopup(auth,provider)}
    catch(error){
     if(error?.code==='auth/popup-blocked'&&sameOriginRedirect)await signInWithRedirect(auth,provider);
     else throw error;
    }
   }
  }catch(error){if(attempt===generation)report(error)}finally{cancel(timer);if(attempt===generation){busy=false;onBusy(false)}}
 }
 async function completeRedirect(){
  const attempt=generation;
  try{await getRedirectResult(auth)}catch(error){if(attempt===generation&&!auth.currentUser)report(error)}
 }
 return Object.freeze({start,completeRedirect,getError:()=>lastError});
}
