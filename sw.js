const CACHE_NAME='danbridge-v11-staging-leave-381';
const APP_SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png?v=20.26.363','./icon-512.png?v=20.26.363','./icon-1024.png?v=20.26.363','./icon-maskable-192.png?v=20.26.363','./icon-maskable-512.png?v=20.26.363','./css/core/77-pwa-install-and-update.css?v=20.26.363','./js/core/pwa-installation.js?v=20.26.363'];

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

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting())});

function keepCacheWriteAlive(event,network,key){
  // Cache persistence must outlive the fetch handler, but must not hold up the
  // network response or turn a quota/storage error into a failed script load.
  event.waitUntil(network.then(response=>{
    if(!response?.ok)return;
    const copy=response.clone();
    return caches.open(CACHE_NAME).then(cache=>cache.put(key,copy));
  }).catch(()=>{}));
}

async function cachedOrNetworkError(key){
  try{return await (await caches.open(CACHE_NAME)).match(key)||Response.error()}
  catch{return Response.error()}
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  // Firebase 保留登入路徑由網路處理，不得快取、重播或套用首頁離線回退。
  if(url.pathname==='/__'||url.pathname.startsWith('/__/'))return;

  // HTML 採網路優先，避免 GitHub 更新後仍卡在舊版。
  if(event.request.mode==='navigate'){
    const network=fetch(event.request,{cache:'no-store'});
    keepCacheWriteAlive(event,network,'./index.html');
    event.respondWith(network.catch(()=>cachedOrNetworkError('./index.html')));
    return;
  }

  // JS/CSS 採網路優先，避免 GitHub 更新後仍執行舊權限與同步程式。
  if(['script','style'].includes(event.request.destination) || /\.(?:js|css)$/.test(url.pathname)){
    const network=fetch(event.request,{cache:'no-store'});
    keepCacheWriteAlive(event,network,event.request);
    event.respondWith(network.catch(()=>cachedOrNetworkError(event.request)));
    return;
  }

  // 圖示與 manifest 可採快取優先並在背景更新。
  const network=fetch(event.request);
  keepCacheWriteAlive(event,network,event.request);
  const safeNetwork=network.catch(()=>cachedOrNetworkError(event.request));
  event.respondWith(caches.open(CACHE_NAME).then(cache=>cache.match(event.request)).catch(()=>null).then(cached=>cached||safeNetwork));
});

// V15.29.1: prevent stale cloud snapshots from overwriting pending local schedule changes.
