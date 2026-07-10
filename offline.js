(function(){
    const HEALTH_INTERVAL_MS = 30000;
    const SYNCED_NOTICE_MS = 2500;
    const IDB_NAME = "ciriguapp_offline";
    const IDB_VERSION = 1;
    const STORE_OPERATIONS = "pending_operations";
    const STORE_META = "meta";

    let estadoConexion = "checking";
    let indicador = null;
    let temporizadorSalud = null;
    let temporizadorSincronizado = null;
    let ultimaPruebaOk = false;
    let dbPromise = null;
    let sincronizando = false;

    function abrirDB(){
        if(dbPromise){
            return dbPromise;
        }

        if(!("indexedDB" in window)){
            dbPromise = Promise.resolve(null);
            return dbPromise;
        }

        dbPromise = new Promise(function(resolve){
            const request = indexedDB.open(IDB_NAME, IDB_VERSION);

            request.onupgradeneeded = function(event){
                const db = event.target.result;
                if(!db.objectStoreNames.contains(STORE_OPERATIONS)){
                    const store = db.createObjectStore(STORE_OPERATIONS, {
                        keyPath: "id"
                    });
                    store.createIndex("estado", "estado", { unique: false });
                    store.createIndex("created_at", "created_at", { unique: false });
                }
                if(!db.objectStoreNames.contains(STORE_META)){
                    db.createObjectStore(STORE_META, { keyPath: "key" });
                }
            };

            request.onsuccess = function(){
                resolve(request.result);
            };

            request.onerror = function(){
                console.warn("No se pudo abrir IndexedDB offline:", request.error);
                resolve(null);
            };
        });

        return dbPromise;
    }

    function contarPendientes(){
        return abrirDB().then(function(db){
            if(!db){
                return 0;
            }

            return new Promise(function(resolve){
                const tx = db.transaction(STORE_OPERATIONS, "readonly");
                const index = tx.objectStore(STORE_OPERATIONS).index("estado");
                const request = index.count("pendiente");
                request.onsuccess = function(){
                    resolve(Number(request.result || 0));
                };
                request.onerror = function(){
                    resolve(0);
                };
            });
        });
    }

    function crearOperationId(){
        const cryptoApi = window.crypto || window.msCrypto;
        const random = (cryptoApi && cryptoApi.getRandomValues)
            ? Array.from(cryptoApi.getRandomValues(new Uint32Array(4))).map(function(value){
                return value.toString(16);
            }).join("")
            : Math.random().toString(36).slice(2);

        return "pedido-" + Date.now().toString(36) + "-" + random;
    }

    function transaccionStore(nombre, modo){
        return abrirDB().then(function(db){
            if(!db){
                throw new Error("IndexedDB no disponible");
            }
            return db.transaction(nombre, modo).objectStore(nombre);
        });
    }

    function guardarOperacion(operacion){
        return transaccionStore(STORE_OPERATIONS, "readwrite").then(function(store){
            return new Promise(function(resolve, reject){
                const request = store.put(operacion);
                request.onsuccess = function(){
                    resolve(operacion);
                };
                request.onerror = function(){
                    reject(request.error);
                };
            });
        });
    }

    function eliminarOperacion(id){
        return transaccionStore(STORE_OPERATIONS, "readwrite").then(function(store){
            return new Promise(function(resolve){
                const request = store.delete(id);
                request.onsuccess = function(){
                    resolve();
                };
                request.onerror = function(){
                    resolve();
                };
            });
        });
    }

    function listarPendientes(){
        return abrirDB().then(function(db){
            if(!db){
                return [];
            }

            return new Promise(function(resolve){
                const tx = db.transaction(STORE_OPERATIONS, "readonly");
                const request = tx.objectStore(STORE_OPERATIONS).getAll();
                request.onsuccess = function(){
                    const operaciones = Array.isArray(request.result) ? request.result : [];
                    resolve(operaciones
                        .filter(function(operacion){
                            return operacion.estado === "pendiente";
                        })
                        .sort(function(a, b){
                            return String(a.created_at).localeCompare(String(b.created_at));
                        }));
                };
                request.onerror = function(){
                    resolve([]);
                };
            });
        });
    }

    function encolarOperacionPedido(datos){
        const operacion = {
            id: datos.id || crearOperationId(),
            created_at: new Date().toISOString(),
            estado: "pendiente",
            accion: datos.accion,
            tipo_punto: datos.tipo_punto,
            punto_numero: Number(datos.punto_numero),
            numero_cliente: Number(datos.numero_cliente),
            nombre: String(datos.nombre || ""),
            precio: Number(datos.precio || 0),
            cantidad: Number(datos.cantidad || 1)
        };

        return guardarOperacion(operacion).then(function(){
            aplicarEstado("offline", { persistente: true });
            return operacion;
        });
    }

    function ejecutarOperacionRemota(operacion){
        if(operacion.accion === "agregar_producto"){
            return window.agregarProductoClienteSupabase(
                operacion.punto_numero,
                operacion.numero_cliente,
                operacion.nombre,
                operacion.precio,
                operacion.cantidad,
                operacion.tipo_punto,
                operacion.id
            );
        }

        if(operacion.accion === "quitar_producto"){
            return window.quitarProductoClienteSupabase(
                operacion.punto_numero,
                operacion.numero_cliente,
                operacion.nombre,
                operacion.cantidad,
                operacion.tipo_punto,
                operacion.id
            );
        }

        return Promise.reject(new Error("Operacion offline no soportada"));
    }

    async function sincronizarPendientes(){
        if(sincronizando){
            return;
        }

        const disponible = await supabaseDisponible();
        if(!disponible){
            aplicarEstado("offline", { persistente: true });
            return;
        }

        const pendientes = await listarPendientes();
        if(pendientes.length === 0){
            aplicarEstado("online", { persistente: true });
            return;
        }

        sincronizando = true;
        aplicarEstado("syncing", { persistente: true });

        let errorEncontrado = null;
        try{
            if(typeof window.requireCiriguaSession === "function"){
                await window.requireCiriguaSession();
            }

            for(const operacion of pendientes){
                try{
                    await ejecutarOperacionRemota(operacion);
                    await eliminarOperacion(operacion.id);
                }catch(error){
                    errorEncontrado = error;
                    console.error("No se pudo sincronizar operación offline:", operacion, error);
                    break;
                }
            }
        }finally{
            sincronizando = false;
        }

        if(errorEncontrado){
            aplicarEstado("error", { persistente: true });
            window.dispatchEvent(new CustomEvent("cirigua:offline-sync-error", {
                detail: { error: errorEncontrado }
            }));
            return;
        }

        aplicarEstado("synced");
        window.dispatchEvent(new CustomEvent("cirigua:offline-sync-complete"));
    }

    function crearIndicador(){
        if(indicador){
            return indicador;
        }

        indicador = document.createElement("div");
        indicador.id = "ciriguaOfflineStatus";
        indicador.className = "offline-status offline-status-checking";
        indicador.setAttribute("role", "status");
        indicador.setAttribute("aria-live", "polite");
        indicador.textContent = "Verificando conexión...";
        document.body.appendChild(indicador);
        return indicador;
    }

    function textoEstado(estado, pendientes){
        if(estado === "offline"){
            return pendientes > 0
                ? "Sin conexión · " + pendientes + " pendiente(s)"
                : "Sin conexión";
        }
        if(estado === "syncing"){
            return "Sincronizando...";
        }
        if(estado === "synced"){
            return "Sincronizado";
        }
        if(estado === "error"){
            return "Error de sincronización";
        }
        if(estado === "online"){
            return pendientes > 0
                ? "Conectado · " + pendientes + " pendiente(s)"
                : "Conectado";
        }
        return "Verificando conexión...";
    }

    function aplicarEstado(estado, opciones){
        estadoConexion = estado;
        const opts = opciones || {};
        clearTimeout(temporizadorSincronizado);

        contarPendientes().then(function(pendientes){
            const node = crearIndicador();
            node.className = "offline-status offline-status-" + estado;
            node.textContent = textoEstado(estado, pendientes);
            document.documentElement.dataset.ciriguaConexion = estado;
            document.body.classList.toggle("cirigua-offline", estado === "offline");

            if(estado === "synced" && !opts.persistente){
                temporizadorSincronizado = setTimeout(function(){
                    if(estadoConexion === "synced"){
                        aplicarEstado("online", { persistente: true });
                    }
                }, SYNCED_NOTICE_MS);
            }
        });
    }

    function supabaseDisponible(){
        if(!navigator.onLine){
            return Promise.resolve(false);
        }

        if(typeof SUPABASE_URL === "undefined"){
            return Promise.resolve(true);
        }

        const controller = new AbortController();
        const timeout = setTimeout(function(){
            controller.abort();
        }, 4500);

        const headers = {};
        if(typeof SUPABASE_PUBLISHABLE_KEY !== "undefined"){
            headers.apikey = SUPABASE_PUBLISHABLE_KEY;
        }

        return fetch(SUPABASE_URL + "/auth/v1/health", {
            method: "GET",
            cache: "no-store",
            headers: headers,
            signal: controller.signal
        }).then(function(response){
            clearTimeout(timeout);
            return response.ok;
        }).catch(function(){
            clearTimeout(timeout);
            return false;
        });
    }

    function verificarConexion(){
        return supabaseDisponible().then(function(disponible){
            const estabaOffline = estadoConexion === "offline" || estadoConexion === "error";
            ultimaPruebaOk = disponible;

            if(disponible){
                if(estabaOffline){
                    aplicarEstado("syncing", { persistente: true });
                    sincronizarPendientes();
                    window.dispatchEvent(new CustomEvent("cirigua:online-real"));
                }else{
                    aplicarEstado("online", { persistente: true });
                }
            }else{
                aplicarEstado("offline", { persistente: true });
                window.dispatchEvent(new CustomEvent("cirigua:offline-real"));
            }

            return disponible;
        });
    }

    function iniciarMonitoreo(){
        crearIndicador();
        abrirDB();
        verificarConexion();
        clearInterval(temporizadorSalud);
        temporizadorSalud = setInterval(verificarConexion, HEALTH_INTERVAL_MS);

        window.addEventListener("online", function(){
            aplicarEstado("syncing", { persistente: true });
            verificarConexion().then(function(disponible){
                if(disponible){
                    sincronizarPendientes();
                }
            });
        });

        window.addEventListener("offline", function(){
            ultimaPruebaOk = false;
            aplicarEstado("offline", { persistente: true });
        });
    }

    function estaSinConexion(){
        return estadoConexion === "offline" ||
            estadoConexion === "error" ||
            !navigator.onLine;
    }

    function requiereConexionCritica(mensaje){
        if(!estaSinConexion()){
            return false;
        }

        alert(
            mensaje ||
            "Esta operación necesita conexión para confirmarse de forma segura. El pedido no se ha perdido. Intente nuevamente cuando vuelva internet."
        );
        return true;
    }

    window.ciriguaOffline = {
        abrirDB: abrirDB,
        verificarConexion: verificarConexion,
        estaSinConexion: estaSinConexion,
        requiereConexionCritica: requiereConexionCritica,
        encolarOperacionPedido: encolarOperacionPedido,
        sincronizarPendientes: sincronizarPendientes,
        listarPendientes: listarPendientes,
        aplicarEstado: aplicarEstado,
        contarPendientes: contarPendientes
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", iniciarMonitoreo);
    }else{
        iniciarMonitoreo();
    }
})();
