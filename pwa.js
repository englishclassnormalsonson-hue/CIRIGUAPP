(function(){
    if(!("serviceWorker" in navigator)){
        return;
    }

    window.addEventListener("load", function(){
        navigator.serviceWorker.register("./sw.js").catch(function(error){
            console.warn("No se pudo registrar el service worker:", error);
        });
    });
})();
