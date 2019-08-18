const SW_CACHE_VER = "v0";

self.addEventListener("install", (event)=> {
    event.waitUntil(
        caches.open(SW_CACHE_VER)
            .then((cache)=>{
                //
            })
            .then(()=> self.skipWaiting())
    );
});

self.addEventListener("activate", (event)=> {
    event.waitUntil(
        caches.keys().then((cahcesNames)=> {
            return Promise.all(
                cahcesNames.map((cache) => {
                    if (cache !== SW_CACHE_VER) return caches.delete(cache);
                })
            )
        })
    );
});

self.addEventListener("fetch", (event)=> {
    event.respondWith(
        fetch(event.request).then((res)=> {
            const clone = res.clone();
            caches.open(SW_CACHE_VER).then((cache)=> {
                cache.put(event.request, clone); //put into cache
            });
            return res;

        }).catch(()=> {
            if (event.request.url.endsWith("/")) console.log("offline mode");
            return caches.match(event.request);
        })
    );
});

self.addEventListener("beforeinstallprompt", (event)=> {
    event.prompt();
});