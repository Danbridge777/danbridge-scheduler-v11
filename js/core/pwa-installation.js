/* PWA 安裝與更新：不影響 Firebase、老師權限及課程回報功能。 */
(function(){
  let deferredInstallPrompt=null;
  let refreshing=false;
  let reloadForAcceptedUpdate=false;
  let acceptedWorker=null;
  let pendingWorker=null;
  let safetyRetryTimer=0;
  let updateAttempt=0;
  let hasControlledPage=Boolean(navigator.serviceWorker?.controller);
  const UPDATE_RECHECK_MS=1000;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;

  function installGuide(){
    let guide=document.getElementById('pwaInstallGuide');
    if(guide)return guide;
    guide=document.createElement('div');
    guide.id='pwaInstallGuide';
    guide.className='pwa-guide-backdrop';
    guide.hidden=true;
    guide.innerHTML='<section class="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwaGuideTitle"><button type="button" class="pwa-guide-close" aria-label="關閉安裝說明">×</button><span class="pwa-guide-mark" aria-hidden="true">DS</span><h2 id="pwaGuideTitle">安裝 Danbridge</h2><p>請使用 Safari 開啟正式網站，點選下方的「分享」按鈕，再選擇「加入主畫面」。</p><ol><li>點 Safari 工具列的「分享」</li><li>選擇「加入主畫面」</li><li>確認名稱後點「加入」</li></ol><button type="button" class="btn primary pwa-guide-done">我知道了</button></section>';
    const close=()=>{guide.hidden=true;document.body.classList.remove('pwa-guide-open')};
    guide.addEventListener('click',event=>{if(event.target===guide)close()});
    guide.querySelector('.pwa-guide-close').addEventListener('click',close);
    guide.querySelector('.pwa-guide-done').addEventListener('click',close);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!guide.hidden)close()});
    document.body.appendChild(guide);
    return guide;
  }

  function showInstallGuide(){
    const guide=installGuide();
    guide.hidden=false;
    document.body.classList.add('pwa-guide-open');
    guide.querySelector('.pwa-guide-close').focus({preventScroll:true});
  }

  function updateBanner(){
    let banner=document.getElementById('pwaUpdateBanner');
    if(banner)return banner;
    banner=document.createElement('aside');
    banner.id='pwaUpdateBanner';
    banner.className='pwa-update-banner';
    banner.hidden=true;
    banner.setAttribute('role','status');
    banner.setAttribute('aria-live','polite');
    banner.innerHTML='<div><strong>Danbridge 正在準備更新</strong><span>同步完成後會自動更新，不需要重複按按鈕。</span></div><div class="pwa-update-actions"><button type="button" class="btn pwa-update-later">暫時隱藏</button><button type="button" class="btn primary pwa-update-now">立即檢查</button></div>';
    banner.querySelector('.pwa-update-later').addEventListener('click',()=>{banner.hidden=true});
    document.body.appendChild(banner);
    return banner;
  }

  function clearSafetyRecheck(){
    if(!safetyRetryTimer)return;
    clearTimeout(safetyRetryTimer);
    safetyRetryTimer=0;
  }

  function scheduleSafetyRecheck(delay=UPDATE_RECHECK_MS){
    if(safetyRetryTimer||refreshing||(!pendingWorker&&!reloadForAcceptedUpdate))return;
    safetyRetryTimer=setTimeout(()=>{
      safetyRetryTimer=0;
      if(reloadForAcceptedUpdate)reloadAcceptedUpdate();
      else if(pendingWorker)acceptUpdate(pendingWorker);
    },delay);
  }

  function reloadAcceptedUpdate(){
    if(!reloadForAcceptedUpdate||refreshing)return;
    // Activation and taking control are separate events. Never navigate on a
    // timer or while the old worker still owns this page.
    if(acceptedWorker?.state!=='activated'||navigator.serviceWorker.controller!==acceptedWorker){scheduleSafetyRecheck();return;}
    if(!allowUpdateNow()){scheduleSafetyRecheck();return;}
    clearSafetyRecheck();
    refreshing=true;
    updateBanner().hidden=true;
    const freshUrl=new URL(window.location.href);
    freshUrl.searchParams.set('__danbridge_refresh',Date.now().toString(36));
    window.location.replace(freshUrl.href);
  }

  function allowUpdateNow(){
    const visible=element=>!element.hidden&&element.getClientRects().length>0;
    const editorOpen=[...document.querySelectorAll('dialog[open],.modal-backdrop.show,[role="dialog"][aria-modal="true"]')].some(visible);
    const crmOpen=['studentName','teacherName'].some(id=>String(document.getElementById(id)?.value||'').trim());
    let synced=false;
    try{synced=typeof window.__danbridgeCanReloadForUpdate==='function'?window.__danbridgeCanReloadForUpdate()===true:document.body.classList.contains('auth-locked')}catch{}
    if(!editorOpen&&!crmOpen&&synced)return true;
    const banner=updateBanner(),message=banner.querySelector('span'),button=banner.querySelector('.pwa-update-now');
    banner.hidden=false;message.textContent=editorOpen||crmOpen?'正在等候編輯完成；儲存或關閉表單後會自動更新。':'正在等候同步與本機保存完成；完成後會自動更新。';
    button.disabled=false;button.textContent='立即檢查';return false;
  }

  function acceptUpdate(worker){
    if(!worker||refreshing||reloadForAcceptedUpdate)return;
    pendingWorker=worker;
    const banner=updateBanner();
    banner.hidden=false;
    const updateNow=banner.querySelector('.pwa-update-now');
    if(!allowUpdateNow()){scheduleSafetyRecheck();return;}
    clearSafetyRecheck();
    updateNow.disabled=true;
    updateNow.textContent='自動更新中…';
    reloadForAcceptedUpdate=true;
    acceptedWorker=worker;
    pendingWorker=null;
    const attempt=++updateAttempt;
    const retry=()=>{
      if(attempt!==updateAttempt||refreshing||!reloadForAcceptedUpdate)return;
      if(worker.state==='activated'){scheduleSafetyRecheck();return;}
      reloadForAcceptedUpdate=false;acceptedWorker=null;
      pendingWorker=worker.state==='redundant'?null:worker;
      banner.hidden=false;
      banner.querySelector('span').textContent=pendingWorker?'新版接管較久，系統會自動重試；目前畫面與資料已保留。':'這份新版已失效，系統會等待下一個可用版本；目前資料已保留。';
      updateNow.disabled=!pendingWorker;updateNow.textContent=pendingWorker?'立即重試':'等待新版';
      if(pendingWorker)scheduleSafetyRecheck(3000);
    };
    worker.addEventListener('statechange',()=>{
      if(attempt!==updateAttempt)return;
      if(worker.state==='activated')reloadAcceptedUpdate();
      else if(worker.state==='redundant')retry();
    });
    if(worker.state==='activated')reloadAcceptedUpdate();
    else try{worker.postMessage({type:'SKIP_WAITING'})}catch(error){console.warn('Service Worker 更新訊息失敗：',error);retry()}
    setTimeout(retry,20000);
  }

  function offerUpdate(worker){
    if(!worker)return;
    pendingWorker=worker;
    const banner=updateBanner();
    banner.hidden=false;
    banner.querySelector('span').textContent='同步完成後會自動更新，不需要重複按按鈕。';
    const updateNow=banner.querySelector('.pwa-update-now');
    updateNow.disabled=false;
    updateNow.textContent='立即檢查';
    updateNow.onclick=()=>acceptUpdate(worker);
    scheduleSafetyRecheck(50);
  }

  async function handleInstallClick(btn){
    if(isIOS){
      showInstallGuide();
    }else if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      try{await deferredInstallPrompt.userChoice}catch(_){}
      deferredInstallPrompt=null;
      btn.style.display='none';
    }
  }

  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('#pwaInstallBtn');
    if(btn)handleInstallClick(btn);
  });

  function installButton(){
    let btn=document.getElementById('pwaInstallBtn');
    if(btn)return btn;
    const host=document.querySelector('.header-auth-actions');
    if(!host)return null;
    btn=document.createElement('button');
    btn.type='button';
    btn.id='pwaInstallBtn';
    btn.className='btn';
    btn.textContent=window.matchMedia('(max-width: 700px)').matches?'安裝':'安裝 App';
    btn.style.display='none';
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
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        const controller=navigator.serviceWorker.controller;
        const wasControlled=hasControlledPage;
        hasControlledPage=Boolean(controller);
        if(!reloadForAcceptedUpdate&&wasControlled&&controller){
          acceptedWorker=controller;
          reloadForAcceptedUpdate=true;
        }
        reloadAcceptedUpdate();
      });
      // Keep the registration URL stable across releases and tabs. The worker
      // contents trigger updates; a page's old version must not change its URL.
      navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
        if(!reg)return;
        reg.update().catch(()=>{});
        if(reg.waiting&&navigator.serviceWorker.controller)offerUpdate(reg.waiting);
        reg.addEventListener('updatefound',()=>{
          const worker=reg.installing;
          if(!worker)return;
          worker.addEventListener('statechange',()=>{
            if(worker.state==='installed'&&navigator.serviceWorker.controller)offerUpdate(worker);
          });
        });
      }).catch(err=>console.warn('Service Worker 註冊失敗：',err));
    }
  });

  ['input','change','close'].forEach(type=>document.addEventListener(type,()=>scheduleSafetyRecheck(),true));
  window.addEventListener('focus',()=>scheduleSafetyRecheck(100));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleSafetyRecheck(100)});
  window.addEventListener('danbridge:update-safety-change',()=>scheduleSafetyRecheck(100));
})();
