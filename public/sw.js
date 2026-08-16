const CACHE="rapone-v3";
const SHELL=["/","/archivio","/offline","/icon.svg"];

self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request);
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  }catch{
    return await caches.match(request)||(fallback?await caches.match(fallback):undefined)||new Response(null,{status:503});
  }
}

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const archived=url.pathname==="/archivio"||url.pathname.startsWith("/archivio/")||url.pathname.startsWith("/api/archive");
  if(archived){event.respondWith(networkFirst(event.request,event.request.mode==="navigate"?"/archivio":undefined));return;}
  if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).catch(()=>caches.match("/offline")));return;}
  if(url.pathname.startsWith("/api/")){event.respondWith(fetch(event.request).catch(()=>new Response(null,{status:503})));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;})));
});
