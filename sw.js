const CACHE='abu-ali-shell-3';
const ASSETS=['./','./index.html','./style.css','./app.mjs','./core.mjs','./storage.mjs','./manifest.webmanifest','./arabic.ttf','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('abu-ali-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(caches.match('./index.html').then(page=>page||fetch(event.request)));
  }else event.respondWith(caches.match(event.request).then(asset=>asset||fetch(event.request)));
});



