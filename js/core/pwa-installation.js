/* PWA 安裝與更新：不影響 Firebase、老師權限及課程回報功能。 */
(function(){
  let deferredInstallPrompt=null;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;

  function installButton(){
    let btn=document.getElementById('pwaInstallBtn');
    if(btn)return btn;
    const host=document.querySelector('.header-auth-actions');
    if(!host)return null;
    btn=document.createElement('button');
    btn.type='button';
    btn.id='pwaInstallBtn';
    btn.className='btn';
    btn.textContent='安裝 App';
    btn.style.display='none';
    btn.addEventListener('click',async()=>{
      if(deferredInstallPrompt){
        deferredInstallPrompt.prompt();
        try{await deferredInstallPrompt.userChoice}catch(_){}
        deferredInstallPrompt=null;
        btn.style.display='none';
      }else if(isIOS){
        alert('請用 Safari 開啟網站，點「分享」→「加入主畫面」。');
      }
    });
    host.insertBefore(btn,host.firstChild);
    return btn;
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    const btn=installButton();
    if(btn&&!isStandalone)btn.style.display='';
  });

  window.addEventListener('appinstalled',()=>{
    deferredInstallPrompt=null;
    const btn=document.getElementById('pwaInstallBtn');
    if(btn)btn.style.display='none';
  });

  window.addEventListener('load',()=>{
    const btn=installButton();
    if(btn&&isIOS&&!isStandalone){btn.style.display='';btn.textContent='加入主畫面';}
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
        reg.update().catch(()=>{});
        if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
      }).catch(err=>console.warn('Service Worker 註冊失敗：',err));
    }
  });
})();
