// Bump CACHE_VERSION on every release; the new version loads the next time the app opens.
const CACHE_VERSION='linesim-v3';
const FILES=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_VERSION).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE_VERSION).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
