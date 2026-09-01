/* PWA 安裝與更新：不影響 Firebase、老師權限及課程回報功能。 */
(function(){
  let deferredInstallPrompt=null;
  let refreshing=false;
  let reloadForAcceptedUpdate=false;
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
    banner.innerHTML='<div><strong>Danbridge 有新版本</strong><span>更新後會自動重新開啟，不會影響已儲存資料。</span></div><div class="pwa-update-actions"><button type="button" class="btn pwa-update-later">稍後</button><button type="button" class="btn primary pwa-update-now">立即更新</button></div>';
    banner.querySelector('.pwa-update-later').addEventListener('click',()=>{banner.hidden=true});
    document.body.appendChild(banner);
    return banner;
  }

  function reloadAcceptedUpdate(){
    if(!reloadForAcceptedUpdate||refreshing)return;
    refreshing=true;
    const freshUrl=new URL(window.location.href);
    freshUrl.searchParams.set('__danbridge_refresh',Date.now().toString(36));
    window.location.replace(freshUrl.href);
  }

  function offerUpdate(worker){
    if(!worker)return;
    const banner=updateBanner();
    banner.hidden=false;
    const updateNow=banner.querySelector('.pwa-update-now');
    updateNow.onclick=()=>{
      updateNow.disabled=true;
      updateNow.textContent='更新中…';
      reloadForAcceptedUpdate=true;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='activated')reloadAcceptedUpdate();
      });
      if(worker.state==='activated')return reloadAcceptedUpdate();
      try{worker.postMessage({type:'SKIP_WAITING'})}catch(error){console.warn('Service Worker 更新訊息失敗：',error)}
      setTimeout(reloadAcceptedUpdate,1800);
    };
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
        reloadAcceptedUpdate();
      });
      navigator.serviceWorker.register('./sw.js?v=20.26.136',{scope:'./'}).then(reg=>{
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
})();
