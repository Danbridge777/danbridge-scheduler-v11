export function isRetryableAuthPermissionError(error){
 const code=String(error?.code||'').toLowerCase();
 return code==='permission-denied'||code==='firestore/permission-denied';
}

export async function loadProfileAfterAuthReady({
 user,
 loadProfile,
 sleep=delay=>new Promise(resolve=>setTimeout(resolve,delay)),
 maxAttempts=3,
 retryDelay=180
}={}){
 if(!user||typeof user.getIdToken!=='function')throw new Error('登入使用者無法確認權杖');
 if(typeof loadProfile!=='function')throw new Error('缺少權限資料讀取程序');
 if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw new Error('登入權限重試次數無效');
 let lastError=null;
 for(let attempt=0;attempt<maxAttempts;attempt++){
  await user.getIdToken(attempt>0);
  try{return await loadProfile()}
  catch(error){
   lastError=error;
   if(!isRetryableAuthPermissionError(error)||attempt===maxAttempts-1)throw error;
   await sleep(retryDelay*Math.pow(2,attempt));
  }
 }
 throw lastError||new Error('登入權限確認失敗');
}
