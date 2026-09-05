const CACHE_NAME='danbridge-v11-scheduler-privacy-290';
const APP_SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png?v=20.26.233','./icon-512.png?v=20.26.233','./icon-1024.png?v=20.26.233','./icon-maskable-192.png?v=20.26.233','./icon-maskable-512.png?v=20.26.233','./css/core/77-pwa-install-and-update.css?v=20.26.233','./js/core/pwa-installation.js?v=20.26.233'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  // Firebase 保留登入路徑由網路處理，不得快取、重播或套用首頁離線回退。
  if(url.pathname==='/__'||url.pathname.startsWith('/__/'))return;

  // HTML 採網路優先，避免 GitHub 更新後仍卡在舊版。
  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy));
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  // JS/CSS 採網路優先，避免 GitHub 更新後仍執行舊權限與同步程式。
  if(['script','style'].includes(event.request.destination) || /\.(?:js|css)$/.test(url.pathname)){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response&&response.ok){
            const copy=response.clone();
            caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
          }
          return response;
        })
        .catch(()=>caches.match(event.request))
    );
    return;
  }

  // 圖示與 manifest 可採快取優先並在背景更新。
  event.respondWith(
    caches.match(event.request).then(cached=>{
      const network=fetch(event.request).then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
        }
        return response;
      });
      return cached||network;
    })
  );
});

// V15.29.1: prevent stale cloud snapshots from overwriting pending local schedule changes.
