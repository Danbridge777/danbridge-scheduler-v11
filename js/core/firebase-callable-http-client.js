const REGION='asia-east1';
const ALLOWED=Object.freeze({
 'danbridge-d8877-staging':'stagingSchedulerOperation',
 'danbridge-d8877':'productionSchedulerOperation'
});
const encoder=new TextEncoder();
const clean=value=>String(value??'').trim().toLowerCase();
const validActor=value=>typeof value==='string'&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
const validEmail=value=>typeof value==='string'&&value===clean(value)&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const functionCode=status=>String(status||'internal').toLowerCase().replaceAll('_','-').replace(/[^a-z-]/g,'')||'internal';

function identity(cfg){
 const user=cfg.getCurrentUser(),uid=user?.uid,email=clean(user?.email);
 if(!user||!validActor(uid)||!validEmail(email)||user.emailVerified!==true)throw new Error('排課需要已驗證的登入身分');
 return{user,uid,email};
}

// This is the official callable wire format, with a pre-acquired single-use
// App Check token.  It avoids generating that token only after the user has
// clicked Save while retaining Auth, App Check replay protection and the exact
// same onCall function boundary.
export function createFirebaseCallableHttpClient(cfg){
 if(!cfg||typeof cfg!=='object'||Array.isArray(cfg)||ALLOWED[cfg.projectId]!==cfg.functionName||![cfg.getCurrentUser,cfg.getIdToken,cfg.getLimitedUseAppCheckToken,cfg.fetch].every(value=>typeof value==='function')||!Number.isSafeInteger(cfg.timeoutMs)||cfg.timeoutMs<1000||cfg.timeoutMs>60000)throw new Error('排課 callable client 設定無效');
 const endpoint=`https://${REGION}-${cfg.projectId}.cloudfunctions.net/${cfg.functionName}`;
 return Object.freeze({
  endpoint,
  async call(data){
   const before=identity(cfg),[idToken,appCheckToken]=await Promise.all([cfg.getIdToken(before.user,false),cfg.getLimitedUseAppCheckToken()]);
   if(typeof idToken!=='string'||idToken.length<8||typeof appCheckToken!=='string'||appCheckToken.length<8)throw new Error('排課 callable token 缺失');
   const sending=identity(cfg);if(sending.user!==before.user||sending.uid!==before.uid||sending.email!==before.email)throw new Error('排課 callable 登入身分已變更');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),cfg.timeoutMs);let response;
   try{response=await cfg.fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${idToken}`,'content-type':'application/json','x-firebase-appcheck':appCheckToken},body:JSON.stringify({data}),cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal})}catch(cause){const error=new Error(cause?.name==='AbortError'?'排課後端回應逾時':'排課後端暫時無法連線',{cause});error.code=cause?.name==='AbortError'?'functions/deadline-exceeded':'functions/unavailable';throw error}finally{clearTimeout(timer)}
   const after=identity(cfg);if(after.user!==before.user||after.uid!==before.uid||after.email!==before.email)throw new Error('排課 callable 登入身分已變更');
   if(!response||typeof response.status!=='number'||typeof response.text!=='function')throw new Error('排課 callable 回應缺失');
   const text=await response.text();if(encoder.encode(text).length>8*1024*1024)throw new Error('排課 callable 回應過大');let parsed;try{parsed=JSON.parse(text)}catch{throw new Error('排課 callable 回應格式無效')}
   if(response.status!==200||parsed?.error){const detail=parsed?.error||{},error=new Error(String(detail.message||'排課後端未完成').slice(0,240));error.code=`functions/${functionCode(detail.status)}`;throw error}
   const key=Object.prototype.hasOwnProperty.call(parsed,'data')?'data':Object.prototype.hasOwnProperty.call(parsed,'result')?'result':'';
   if(!key)throw new Error('排課 callable 回條缺失');return{data:parsed[key]};
  }
 });
}
