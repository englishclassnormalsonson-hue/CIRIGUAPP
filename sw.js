const CACHE_VERSION = "ciriguapp-static-v23";

const STATIC_ASSETS = [
    "./",
    "./index.html",
    "./login.html",
    "./clientes.html",
    "./pedido.html",
    "./productos.html",
    "./ventas.html",
    "./cierre.html",
    "./cierre-mensual.html",
    "./gastos.html",
    "./historial.html",
    "./historial-diario.html",
    "./historial-cierres.html",
    "./historial-mensual.html",
    "./recibo.html",
    "./reciboMesa.html",
    "./style.css",
    "./utils.js",
    "./supabase.js",
    "./auth.js",
    "./offline.js",
    "./pwa.js",
    "./ventas.js",
    "./script.js",
    "./manifest.webmanifest",
    "./LOGOINICIO1.jpeg",
    "./logo.png",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
    "./icons/apple-touch-icon.png"
];

const STATIC_LIBRARY_HOSTS = [
    "cdn.jsdelivr.net"
];

function isSupabaseRequest(url){
    return url.hostname.endsWith(".supabase.co");
}

function isStaticAsset(requestUrl){
    if(requestUrl.origin !== self.location.origin){
        return false;
    }

    return STATIC_ASSETS.some(function(asset){
        const assetUrl = new URL(asset, self.location);
        return assetUrl.origin === requestUrl.origin &&
            assetUrl.pathname === requestUrl.pathname;
    });
}

function isStaticLibrary(requestUrl){
    return STATIC_LIBRARY_HOSTS.indexOf(requestUrl.hostname) !== -1 &&
        requestUrl.pathname.indexOf("/@supabase/supabase-js@2") !== -1;
}

function responderNetworkFirst(request){
    return fetch(request)
        .then(function(response){
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(function(cache){
                cache.put(request, copy);
            });
            return response;
        })
        .catch(function(){
            return caches.match(request);
        });
}

self.addEventListener("install", function(event){
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(function(cache){
                return cache.addAll(STATIC_ASSETS);
            })
            .then(function(){
                return self.skipWaiting();
            })
    );
});

self.addEventListener("activate", function(event){
    event.waitUntil(
        caches.keys()
            .then(function(keys){
                return Promise.all(keys.map(function(key){
                    if(key !== CACHE_VERSION){
                        return caches.delete(key);
                    }
                    return Promise.resolve();
                }));
            })
            .then(function(){
                return self.clients.claim();
            })
    );
});

self.addEventListener("fetch", function(event){
    const request = event.request;
    const requestUrl = new URL(request.url);

    if(request.method !== "GET" || isSupabaseRequest(requestUrl)){
        return;
    }

    if(isStaticLibrary(requestUrl)){
        event.respondWith(responderNetworkFirst(request));
        return;
    }

    if(!isStaticAsset(requestUrl)){
        return;
    }

    event.respondWith(responderNetworkFirst(request));
});
