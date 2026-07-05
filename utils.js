function safeParse(value, fallback){
    try{
        return JSON.parse(value);
    }catch(e){
        return (typeof fallback !== 'undefined') ? fallback : [];
    }
}

function notifyLocalStorageChange(key){
    if(!key) return;
    window.dispatchEvent(new CustomEvent('localStorageChange', {
        detail: { key: String(key) }
    }));
}

function setStorageItem(key, value){
    localStorage.setItem(key, value);
    notifyLocalStorageChange(key);
}

function removeStorageItem(key){
    localStorage.removeItem(key);
    notifyLocalStorageChange(key);
}

function normalizeText(value){
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function canonizarConceptoRapido(concepto){
    let texto = normalizeText(concepto);
    let coincidencias = {
        'venta rapida':'Venta rápida',
        'ventarapida':'Venta rápida',
        'venta rápida':'Venta rápida',
        'propina':'Propina',
        'recarga':'Recarga',
        'servicio especial':'Servicio especial',
        'servicioespecial':'Servicio especial',
        'extra':'Extra'
    };
    return coincidencias[texto] || String(concepto || '').trim().replace(/\s+/g, ' ');
}

function productosIniciales(){
    return [
        {nombre:"Tinto", precio:1000, categoria:"☕ Greca"},
        {nombre:"Aromática", precio:1000, categoria:"☕ Greca"},
        {nombre:"Aromática en leche", precio:1500, categoria:"☕ Greca"},
        {nombre:"Milo", precio:1500, categoria:"☕ Greca"},
        {nombre:"Café en leche", precio:2000, categoria:"☕ Greca"},
        {nombre:"Mañanita", precio:2000, categoria:"☕ Greca"},
        {nombre:"Cerveza", precio:4000, categoria:"🍺 Cervezas"},
        {nombre:"Cerveza lata", precio:5000, categoria:"🍺 Cervezas"},
        {nombre:"Costeñita", precio:4000, categoria:"🍺 Cervezas"},
        {nombre:"Águila Light", precio:4000, categoria:"🍺 Cervezas"},
        {nombre:"Pilsen", precio:4000, categoria:"🍺 Cervezas"},
        {nombre:"Águila Negra", precio:4000, categoria:"🍺 Cervezas"},
        {nombre:"Club Colombia Dorada", precio:5000, categoria:"🍺 Cervezas"},
        {nombre:"Coronita", precio:5000, categoria:"🍺 Cervezas"},
        {nombre:"Corona", precio:10000, categoria:"🍺 Cervezas"},
        {nombre:"Aguardiente (trago)", precio:4000, categoria:"🥃 Tragos"},
        {nombre:"Ron Medellín (trago)", precio:4000, categoria:"🥃 Tragos"},
        {nombre:"Ron Caldas (trago)", precio:4000, categoria:"🥃 Tragos"},
        {nombre:"Brandy (trago)", precio:4000, categoria:"🥃 Tragos"},
        {nombre:"Ron Medellín 8 años (trago)", precio:7000, categoria:"🥃 Tragos"},
        {nombre:"Ron Caldas 8 años (trago)", precio:7000, categoria:"🥃 Tragos"},
        {nombre:"Whisky", precio:12000, categoria:"🥃 Tragos"},
        {nombre:"Baileys", precio:7000, categoria:"🥃 Tragos"},
        {nombre:"Tequila", precio:7000, categoria:"🥃 Tragos"},
        {nombre:"Media de Ron", precio:50000, categoria:"🍾 Medias"},
        {nombre:"Media de Brandy", precio:55000, categoria:"🍾 Medias"},
        {nombre:"Media de Guaro", precio:45000, categoria:"🍾 Medias"},
        {nombre:"Media de Guaro Amarillo", precio:50000, categoria:"🍾 Medias"},
        {nombre:"Media Ron 8 años", precio:95000, categoria:"🍾 Medias"},
        {nombre:"Media Ron Esencial", precio:50000, categoria:"🍾 Medias"},
        {nombre:"Botella de Guaro", precio:100000, categoria:"🍾 Botellas"},
        {nombre:"Botella de Guaro Amarillo", precio:110000, categoria:"🍾 Botellas"},
        {nombre:"Botella de Ron", precio:110000, categoria:"🍾 Botellas"},
        {nombre:"Botella Ron 8 años", precio:180000, categoria:"🍾 Botellas"},
        {nombre:"Botella Buchanan's", precio:280000, categoria:"🍾 Botellas"},
        {nombre:"Botella Old Parr", precio:260000, categoria:"🍾 Botellas"},
        {nombre:"Garrafa Rojo", precio:210000, categoria:"🍶 Garrafas"},
        {nombre:"Garrafa Azul", precio:220000, categoria:"🍶 Garrafas"},
        {nombre:"Garrafa Ron Medellín", precio:230000, categoria:"🍶 Garrafas"},
        {nombre:"Garrafa Ron Caldas", precio:240000, categoria:"🍶 Garrafas"},
        {nombre:"Litro de Guaro", precio:110000, categoria:"🥃 Litros"},
        {nombre:"Litro de Amarillo", precio:110000, categoria:"🥃 Litros"},
        {nombre:"Litro Ron Medellín", precio:120000, categoria:"🥃 Litros"},
        {nombre:"Litro Ron Caldas", precio:130000, categoria:"🥃 Litros"},
        {nombre:"Michelada de Tamarindo", precio:4000, categoria:"🍹 Micheladas"},
        {nombre:"Michelada de Soda", precio:4000, categoria:"🍹 Micheladas"},
        {nombre:"Michelada de Cuatro", precio:4000, categoria:"🍹 Micheladas"},
        {nombre:"Michelada Águila Light", precio:4000, categoria:"🍹 Micheladas"},
        {nombre:"Michelada Pilsen", precio:4000, categoria:"🍹 Micheladas"},
        {nombre:"Michelada Águila Negra", precio:4000, categoria:"🍹 Micheladas"},
        {nombre:"Coca-Cola 3 Litros", precio:8000, categoria:"🥤 Gaseosas"},
        {nombre:"Coca-Cola", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Coca-Cola Plástica", precio:3500, categoria:"🥤 Gaseosas"},
        {nombre:"Quatro", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Premio", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"7UP Limonada", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Tamarindo", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Colombiana", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Bretaña", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Manzana", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Uva", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Naranjada", precio:3000, categoria:"🥤 Gaseosas"},
        {nombre:"Manzana Plástica", precio:3500, categoria:"🥤 Gaseosas"},
        {nombre:"Soda Pequeña", precio:3500, categoria:"🥤 Gaseosas"},
        {nombre:"Canada Dry", precio:3500, categoria:"🥤 Gaseosas"},
        {nombre:"Hit", precio:3500, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Jugo de Caja", precio:3000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Tutti Frutti Guanábana", precio:2000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Tutti Frutti Avena", precio:2000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Tutti Frutti Lulo", precio:2000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Tutti Frutti Mora", precio:2000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Tutti Frutti Mango", precio:2000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Malta", precio:3000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Avena Alpina", precio:5000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"Bon Yurt", precio:5000, categoria:"🧃 Jugos y bebidas"},
        {nombre:"H2O", precio:5000, categoria:"💧 Aguas"},
        {nombre:"Saviloe", precio:3500, categoria:"💧 Aguas"},
        {nombre:"Agua Pequeña", precio:1000, categoria:"💧 Aguas"},
        {nombre:"Agua Grande", precio:2000, categoria:"💧 Aguas"},
        {nombre:"Vive 100 Pequeño", precio:3000, categoria:"⚡ Energizantes"},
        {nombre:"Vive 100 Grande", precio:4000, categoria:"⚡ Energizantes"},
        {nombre:"Red Bull", precio:10000, categoria:"⚡ Energizantes"},
        {nombre:"Cerveza Latón", precio:5000, categoria:"🍺 Cervezas"},
        {nombre:"Cola y Pola", precio:4000, categoria:"🍺 Cervezas"},
        {nombre:"Ron 8 Años", precio:7000, categoria:"🥃 Tragos"},
        {nombre:"Halls XS", precio:3000, categoria:"🍬 Confitería"},
        {nombre:"Halls Tubo", precio:2000, categoria:"🍬 Confitería"},
        {nombre:"Halls Individual", precio:300, categoria:"🍬 Confitería"},
        {nombre:"Trident Individual", precio:300, categoria:"🍬 Confitería"},
        {nombre:"Trident x3", precio:1000, categoria:"🍬 Confitería"},
        {nombre:"Trident x5", precio:2000, categoria:"🍬 Confitería"},
        {nombre:"Trident Americano", precio:5000, categoria:"🍬 Confitería"},
        {nombre:"Trident Splash", precio:4000, categoria:"🍬 Confitería"},
        {nombre:"Botella Trident", precio:10000, categoria:"🍬 Confitería"},
        {nombre:"Sparkies", precio:2000, categoria:"🍬 Confitería"},
        {nombre:"Chao", precio:1500, categoria:"🍬 Confitería"},
        {nombre:"Mechas Locas", precio:5000, categoria:"🍬 Confitería"},
        {nombre:"Tic Tac", precio:3000, categoria:"🍬 Confitería"},
        {nombre:"Teteros", precio:5000, categoria:"🍬 Confitería"},
        {nombre:"Bombón Grande", precio:600, categoria:"🍬 Confitería"},
        {nombre:"Bombón Pequeño", precio:300, categoria:"🍬 Confitería"},
        {nombre:"Menta", precio:100, categoria:"🍬 Confitería"},
        {nombre:"Big Ben", precio:200, categoria:"🍬 Confitería"},
        {nombre:"Moritas", precio:100, categoria:"🍬 Confitería"},
        {nombre:"Max Combi", precio:200, categoria:"🍬 Confitería"},
        {nombre:"Confite Anís", precio:100, categoria:"🍬 Confitería"},
        {nombre:"Festival", precio:2000, categoria:"🍬 Confitería"},
        {nombre:"Wafer Vainilla", precio:1000, categoria:"🍬 Confitería"},
        {nombre:"Barrilete", precio:400, categoria:"🍬 Confitería"},
        {nombre:"Bianchi", precio:200, categoria:"🍬 Confitería"},
        {nombre:"Confite Fruticas", precio:100, categoria:"🍬 Confitería"},
        {nombre:"Jumbo Mini", precio:1500, categoria:"🍫 Chocolatinas"},
        {nombre:"Jumbo Mediana", precio:4000, categoria:"🍫 Chocolatinas"},
        {nombre:"Jumbo Grande", precio:8000, categoria:"🍫 Chocolatinas"},
        {nombre:"Gol", precio:1500, categoria:"🍫 Chocolatinas"},
        {nombre:"Golochips", precio:2000, categoria:"🍫 Chocolatinas"},
        {nombre:"Maní", precio:2500, categoria:"🍫 Chocolatinas"},
        {nombre:"Chcolatina #1", precio:1500, categoria:"🍫 Chocolatinas"},
        {nombre:"Wafer Jet", precio:2500, categoria:"🍫 Chocolatinas"},
        {nombre:"Dux", precio:1500, categoria:"🍫 Chocolatinas"},
        {nombre:"Choco Ramo", precio:3000, categoria:"🍫 Chocolatinas"},
        {nombre:"Salchichas", precio:8000, categoria:"🧂 Otros"},
        {nombre:"Sonsnack Limón Pimienta", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Sonsnack Limón", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Sonsnack BBQ", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Sonsnack Mayonesa", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Sonsnack Natural", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Sonsnack Pollo", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Margarita Limón", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Margarita Cebolla", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Margarita Pollo", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Margarita Tomate", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Margarita BBQ", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Margarita Grande", precio:8000, categoria:"🥜 Mecato"},
        {nombre:"De Todito Limón", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"De Todito BBQ", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"De Todito Natural", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"De Todito Pollo Parrillero", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"De Todito Mix", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"De Todito Grande", precio:8000, categoria:"🥜 Mecato"},
        {nombre:"Boliquesos", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Boliquesos Grande", precio:8000, categoria:"🥜 Mecato"},
        {nombre:"Choquitos", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Doritos", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Platanitos Maduros", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Platanitos Verdes", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Maizitos Natural", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Maizitos Limón", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Ticos", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Questris", precio:3000, categoria:"🥜 Mecato"},
        {nombre:"Rosquillas", precio:2000, categoria:"🥜 Mecato"}
    ];
}

function categoriasIniciales(){
    return [
        "☕ Greca",
        "🥤 Gaseosas",
        "🧃 Jugos y bebidas",
        "💧 Aguas",
        "⚡ Energizantes",
        "🍺 Cervezas",
        "🥃 Tragos",
        "🍬 Confitería",
        "🍫 Chocolatinas",
        "🧂 Otros",
        "🥜 Mecato",
        "🍾 Medias",
        "🍾 Botellas",
        "🍶 Garrafas",
        "🥃 Litros",
        "🍹 Micheladas"
    ];
}

function ordenCategoriasPreferidas(){
    return [
        "☕ Greca",
        "🥤 Gaseosas",
        "🧃 Jugos y bebidas",
        "💧 Aguas",
        "⚡ Energizantes",
        "🍺 Cervezas",
        "🥃 Tragos",
        "🍬 Confitería",
        "🍫 Chocolatinas",
        "🧂 Otros",
        "🥜 Mecato",
        "🍾 Medias",
        "🍾 Botellas",
        "🍶 Garrafas",
        "🥃 Litros",
        "🍹 Micheladas"
    ];
}

function ordenarCategorias(categorias){
    let orden = ordenCategoriasPreferidas();
    return categorias.slice().sort(function(a,b){
        let ia = orden.indexOf(a);
        let ib = orden.indexOf(b);
        if(ia === -1) ia = orden.length;
        if(ib === -1) ib = orden.length;
        if(ia !== ib) return ia - ib;
        return a.localeCompare(b);
    });
}

function prepararProductos(){
    let necesitaGuardarCategorias = false;
    let categoriasActuales = safeParse(localStorage.getItem("categoriasCirigua"), []);
    if(!Array.isArray(categoriasActuales)){
        categoriasActuales = [];
    }
    categoriasActuales = categoriasActuales.reduce(function(lista, categoria){
        if(typeof categoria !== "string"){
            necesitaGuardarCategorias = true;
            return lista;
        }
        let nombreCategoria = categoria.trim();
        if(!nombreCategoria){
            necesitaGuardarCategorias = true;
            return lista;
        }
        let yaExiste = lista.some(function(categoriaExistente){
            return normalizeText(categoriaExistente) === normalizeText(nombreCategoria);
        });
        if(!yaExiste){
            lista.push(nombreCategoria);
        }else{
            necesitaGuardarCategorias = true;
        }
        return lista;
    }, []);

    categoriasIniciales().forEach(function(nombreCategoria){
        let yaExiste = categoriasActuales.some(function(categoria){
            return normalizeText(categoria) === normalizeText(nombreCategoria);
        });

        if(!yaExiste){
            categoriasActuales.push(nombreCategoria);
            necesitaGuardarCategorias = true;
        }
    });

    if(necesitaGuardarCategorias){
        guardarCategorias(categoriasActuales);
    }

    let necesitaGuardarProductos = false;
    let productosActuales = safeParse(localStorage.getItem("productosCirigua"), []);
    if(!Array.isArray(productosActuales)){
        productosActuales = [];
    } else {
        productosActuales = productosActuales.reduce(function(lista, producto){
            let productoNormalizado = normalizarProductoGuardado(producto);
            if(!productoNormalizado){
                necesitaGuardarProductos = true;
                return lista;
            }
            let yaExiste = lista.some(function(productoExistente){
                return normalizeText(productoExistente.nombre) === normalizeText(productoNormalizado.nombre);
            });
            if(!yaExiste){
                lista.push(productoNormalizado);
            }else{
                necesitaGuardarProductos = true;
            }
            return lista;
        }, []);
    }

    let productosObsoletos = [
        "Margarita Limón Grande",
        "Margarita Cebolla Grande",
        "Margarita Pollo Grande",
        "Margarita Tomate Grande",
        "Margarita BBQ Grande",
        "De Todito Limón Grande",
        "De Todito BBQ Grande",
        "De Todito Natural Grande",
        "De Todito Pollo Parrillero Grande",
        "De Todito Mix Grande"
    ];

    productosActuales = productosActuales.filter(function(productoActual){
        let esObsoleto = productosObsoletos.some(function(nombreObsoleto){
            return normalizeText(productoActual.nombre) === normalizeText(nombreObsoleto) &&
                productoActual.categoria === "🥜 Mecato";
        });
        if(esObsoleto){
            necesitaGuardarProductos = true;
        }
        return !esObsoleto;
    });

    productosIniciales().forEach(function(productoBase, indice){
        let productoExistente = productosActuales.find(function(productoActual){
            return normalizeText(productoActual.nombre) === normalizeText(productoBase.nombre);
        });

        if(!productoExistente){
            productosActuales.push({
                id: "producto_" + (indice + 1) + "_nuevo",
                nombre: productoBase.nombre,
                precio: productoBase.precio,
                categoria: productoBase.categoria,
                activo: true
            });
            necesitaGuardarProductos = true;
        }
    });

    if(necesitaGuardarProductos){
        guardarProductos(productosActuales);
    }
}

function normalizarProductoGuardado(producto){
    if(!producto || typeof producto !== "object" || Array.isArray(producto)){
        return null;
    }
    let nombre = String(producto.nombre || "").trim();
    let precio = Number(producto.precio);
    let categoria = String(producto.categoria || "").trim();
    if(!nombre || !Number.isFinite(precio) || precio <= 0 || !categoria){
        return null;
    }
    return {
        id: producto.id || ("producto_" + Date.now()),
        nombre: nombre,
        precio: precio,
        categoria: categoria,
        activo: producto.activo !== false
    };
}

function obtenerProductos(){
    prepararProductos();
    let productos = safeParse(localStorage.getItem("productosCirigua"), []);
    if(!Array.isArray(productos)){
        return [];
    }
    return productos.map(normalizarProductoGuardado);
}

function obtenerProductosDisponibles(){
    return obtenerProductos().filter(function(producto){
        return producto.activo !== false;
    });
}

function obtenerCategoriasDisponibles(){
    prepararProductos();
    let categorias = safeParse(localStorage.getItem("categoriasCirigua"), []);
    if(!Array.isArray(categorias)){
        return [];
    }
    return ordenarCategorias(categorias);
}

function guardarProductos(productos){
    setStorageItem(
        "productosCirigua",
        JSON.stringify((productos || []).map(normalizarProductoGuardado).filter(function(producto){
            return producto !== null;
        }))
    );
}

function guardarCategorias(categorias){
    setStorageItem(
        "categoriasCirigua",
        JSON.stringify(categorias)
    );
}

function obtenerCategorias(){
    return obtenerCategoriasDisponibles();
}

function reverseSafe(array){
    return Array.isArray(array) ? array.slice().reverse() : [];
}

function parseNumber(value, fallback){
    let number = Number(value);
    return isNaN(number) ? fallback : number;
}

function ejecutarAccionCritica(boton, accion){
    if(boton && boton.disabled){
        return;
    }
    if(boton){
        boton.disabled = true;
    }
    try{
        let resultado = accion();
        if(resultado && typeof resultado.then === "function"){
            return resultado.then(function(valor){
                if(valor === false && boton){
                    boton.disabled = false;
                }
                return valor;
            }).catch(function(error){
                if(boton){
                    boton.disabled = false;
                }
                throw error;
            });
        }
        if(resultado === false && boton){
            boton.disabled = false;
        }
        return resultado;
    }catch(e){
        if(boton){
            boton.disabled = false;
        }
        throw e;
    }
}

function guardarEnPapelera(tipo, item){
    let papelera = safeParse(localStorage.getItem("papeleraCirigua"), []);
    if(!Array.isArray(papelera)) papelera = [];
    papelera.push({
        tipo: tipo,
        fecha: new Date().toISOString(),
        item: item
    });
    setStorageItem("papeleraCirigua", JSON.stringify(papelera));
    registrarAuditoria("papelera", {
        tipo: tipo,
        item: item
    });
}

function registrarAuditoria(accion, detalle){
    let auditoria = safeParse(localStorage.getItem("auditoriaCirigua"), []);
    if(!Array.isArray(auditoria)) auditoria = [];
    auditoria.push({
        fecha: new Date().toISOString(),
        accion: accion,
        detalle: detalle || {}
    });
    setStorageItem("auditoriaCirigua", JSON.stringify(auditoria));
}

function existeProductoConNombre(productos, nombre, idIgnorado){
    let nombreNormalizado = normalizeText(nombre);
    return (productos || []).some(function(producto){
        return producto.id !== idIgnorado && normalizeText(producto.nombre) === nombreNormalizado;
    });
}

function existeCategoriaConNombre(categorias, nombre){
    let nombreNormalizado = normalizeText(nombre);
    return (categorias || []).some(function(categoria){
        return normalizeText(categoria) === nombreNormalizado;
    });
}

function maxClientesPorMesa(){
    let valor = parseInt(localStorage.getItem("maxClientesPorMesa"));
    return valor > 0 ? valor : 20;
}

function obtenerHistorialVentas(){
    let historial = safeParse(localStorage.getItem("historialVentas"), []);
    if(!Array.isArray(historial)){
        return [];
    }
    return historial.filter(function(venta){
        return venta && typeof venta === "object" && !Array.isArray(venta);
    });
}

function obtenerUltimaVenta(){
    return safeParse(localStorage.getItem("ultimaVenta"), null);
}

function obtenerConsecutivoFactura(){
    let valorGuardado = Number(localStorage.getItem("consecutivoFactura"));
    let siguienteHistorial = obtenerHistorialVentas().reduce(function(maximo, venta){
        let factura = Number(venta && venta.factura);
        if(Number.isInteger(factura) && factura > maximo){
            return factura;
        }
        return maximo;
    }, 0) + 1;

    if(Number.isInteger(valorGuardado) && valorGuardado > 0){
        return Math.max(valorGuardado, siguienteHistorial);
    }

    return siguienteHistorial;
}

function normalizarGastos(gastos){
    if(!Array.isArray(gastos)){
        return [];
    }
    return gastos.reduce(function(lista, gasto){
        if(!gasto || typeof gasto !== "object" || Array.isArray(gasto)){
            return lista;
        }
        let valor = Number(gasto.valor);
        if(!Number.isFinite(valor) || valor <= 0){
            return lista;
        }
        lista.push({
            concepto: String(gasto.concepto || "Gasto").trim() || "Gasto",
            valor: valor
        });
        return lista;
    }, []);
}

function obtenerGastosHoy(){
    return normalizarGastos(safeParse(localStorage.getItem("gastosHoy"), []));
}

function calcularTotalGastos(gastos){
    return normalizarGastos(gastos).reduce(function(total, gasto){
        return total + gasto.valor;
    }, 0);
}

function fechaHoy(){
    return new Date().toLocaleDateString();
}

function fechaLocalISO(fecha){
    if(!(fecha instanceof Date) || isNaN(fecha.getTime())){
        return "";
    }
    let anio = fecha.getFullYear();
    let mes = String(fecha.getMonth() + 1).padStart(2, "0");
    let dia = String(fecha.getDate()).padStart(2, "0");
    return anio + "-" + mes + "-" + dia;
}

function fechaInputComoLocalString(fechaInput){
    if(!fechaInput){
        return "";
    }
    let partes = String(fechaInput).split("-");
    if(partes.length !== 3){
        return "";
    }
    let fecha = new Date(
        Number(partes[0]),
        Number(partes[1]) - 1,
        Number(partes[2])
    );
    return isNaN(fecha.getTime()) ? "" : fecha.toLocaleDateString();
}

function parseFechaHoraLocal(fecha, hora){
    if(!fecha){
        return null;
    }
    let fechaTexto = String(fecha).trim();
    let horaTexto = String(hora || '').trim().toLowerCase();
    horaTexto = horaTexto.replace(/\./g, '').replace(/\s+/g, ' ').trim();

    let día, mes, año;
    if(fechaTexto.indexOf('/') !== -1){
        let partes = fechaTexto.split('/').map(function(item){ return item.trim(); });
        if(partes.length === 3){
            día = Number(partes[0]);
            mes = Number(partes[1]);
            año = Number(partes[2]);
        }
    } else if(fechaTexto.indexOf('-') !== -1){
        let partes = fechaTexto.split('-').map(function(item){ return item.trim(); });
        if(partes.length === 3){
            año = Number(partes[0]);
            mes = Number(partes[1]);
            día = Number(partes[2]);
        }
    }

    let fechaISO = '';
    if(Number.isInteger(día) && Number.isInteger(mes) && Number.isInteger(año)){
        if(día < 1 || mes < 1 || mes > 12){
            return null;
        }
        let diasDelMes = new Date(año, mes, 0).getDate();
        if(día > diasDelMes){
            return null;
        }
        fechaISO = año + '-' + String(mes).padStart(2,'0') + '-' + String(día).padStart(2,'0');
    }

    let horaISO = '';
    let h = 0;
    let m = 0;
    let s = 0;
    if(horaTexto){
        let ampmMatch = /\b([ap])\s*m\b/.exec(horaTexto);
        let horaSinAmpm = horaTexto.replace(/\b([ap])\s*m\b/, '').trim();
        let partesHora = horaSinAmpm.split(':').map(function(item){ return item.trim(); });
        if(partesHora.length < 1 || partesHora.length > 3){
            return null;
        }
        let hRaw = Number(partesHora[0]);
        let mRaw = partesHora.length > 1 ? Number(partesHora[1]) : 0;
        let sRaw = partesHora.length > 2 ? Number(partesHora[2]) : 0;
        if(!Number.isInteger(hRaw) || !Number.isInteger(mRaw) || !Number.isInteger(sRaw)){
            return null;
        }
        // If AM/PM suffix exists, original hour must be 1-12.
        if(ampmMatch){
            if(hRaw < 1 || hRaw > 12){
                return null;
            }
        } else {
            if(hRaw < 0 || hRaw > 23){
                return null;
            }
        }
        h = hRaw;
        m = mRaw;
        s = sRaw;
        if(ampmMatch){
            if(ampmMatch[1] === 'p' && h < 12){
                h += 12;
            }
            if(ampmMatch[1] === 'a' && h === 12){
                h = 0;
            }
        }
        if(h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59){
            return null;
        }
        horaISO = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    if(fechaISO && horaISO){
        let fechaCompleta = new Date(fechaISO + 'T' + horaISO);
        if(isNaN(fechaCompleta.getTime())){
            return null;
        }
        if(
            fechaCompleta.getFullYear() !== año ||
            fechaCompleta.getMonth() !== mes - 1 ||
            fechaCompleta.getDate() !== día ||
            fechaCompleta.getHours() !== h ||
            fechaCompleta.getMinutes() !== m ||
            fechaCompleta.getSeconds() !== s
        ){
            return null;
        }
        return fechaCompleta;
    }
    if(fechaISO){
        let fechaSolo = new Date(fechaISO);
        return isNaN(fechaSolo.getTime()) ? null : fechaSolo;
    }
    let fallback = new Date(fechaTexto + (horaTexto ? ' ' + horaTexto : ''));
    return isNaN(fallback.getTime()) ? null : fallback;
}

function cierreCoincideConFecha(cierre, fechaInput){
    if(!fechaInput){
        return true;
    }
    if(cierre && cierre.timestamp){
        let fechaTimestamp = new Date(cierre.timestamp);
        if(fechaLocalISO(fechaTimestamp) === fechaInput){
            return true;
        }
    }
    return cierre && cierre.fecha === fechaInputComoLocalString(fechaInput);
}

/* Mesas: funciones compartidas y compatibles con llamadas existentes.
   Each function accepts either (mesa, ...) or a single param (uses global mesaActual if present).
*/
function _resolveMesaArg(mesa){
    if(typeof mesa === 'undefined' || mesa === null){
        if(typeof mesaActual !== 'undefined') return mesaActual;
        return 1;
    }
    return mesa;
}

function claveCliente(mesa, numeroCliente){
    if(typeof numeroCliente === 'undefined'){
        numeroCliente = mesa;
        mesa = _resolveMesaArg();
    }else{
        mesa = _resolveMesaArg(mesa);
    }
    return "mesa_" + mesa + "_cliente_" + numeroCliente;
}

function claveClientesDinamicos(mesa){
    mesa = _resolveMesaArg(mesa);
    return "mesa_" + mesa + "_clientes";
}

function claveClientesInicializados(mesa){
    mesa = _resolveMesaArg(mesa);
    return "mesa_" + mesa + "_clientesInicializados";
}

function claveTotalMesa(mesa){
    mesa = _resolveMesaArg(mesa);
    return "totalMesa" + mesa;
}

function claveEstadoMesa(mesa){
    mesa = _resolveMesaArg(mesa);
    return "estadoMesa" + mesa;
}

function leerProductosCliente(mesa, numeroCliente){
    if(typeof numeroCliente === 'undefined'){
        numeroCliente = mesa;
        mesa = _resolveMesaArg();
    }else{
        mesa = _resolveMesaArg(mesa);
    }
    let datos = safeParse(localStorage.getItem(claveCliente(mesa, numeroCliente)), null);
    if(!datos || typeof datos !== 'object' || Array.isArray(datos)){
        datos = null;
    }

    if(!datos && mesa == 1){
        // migrate legacy key
        let datosAntiguos = safeParse(localStorage.getItem("cliente_" + numeroCliente), null);
        if(datosAntiguos && typeof datosAntiguos === 'object' && !Array.isArray(datosAntiguos)){
            setStorageItem(claveCliente(mesa, numeroCliente), JSON.stringify(datosAntiguos));
            removeStorageItem("cliente_" + numeroCliente);
            datos = datosAntiguos;
        }
    }

    if(datos && typeof datos === 'object' && !Array.isArray(datos)){
        return datos;
    }
    return {};
}

function calcularTotalCliente(mesa, numeroCliente){
    if(typeof numeroCliente === 'undefined'){
        numeroCliente = mesa;
        mesa = _resolveMesaArg();
    }else{
        mesa = _resolveMesaArg(mesa);
    }
    let datos = leerProductosCliente(mesa, numeroCliente);
    let total = 0;
    for(let nombre in datos){
        let item = datos[nombre];
        if(!item || typeof item !== "object" || Array.isArray(item)){
            continue;
        }
        let cantidad = Number(item.cantidad);
        let precio = Number(item.precio);
        if(!Number.isFinite(cantidad) || !Number.isFinite(precio)){
            continue;
        }
        if(cantidad <= 0 || precio < 0){
            continue;
        }
        total += cantidad * precio;
    }
    return total;
}

function obtenerClientesDinamicos(mesa){
    mesa = _resolveMesaArg(mesa);
    let inicializados = localStorage.getItem(claveClientesInicializados(mesa));
    if(!inicializados){
        setStorageItem(claveClientesDinamicos(mesa), JSON.stringify([]));
        setStorageItem(claveClientesInicializados(mesa), "si");
    }
    let clientes = safeParse(localStorage.getItem(claveClientesDinamicos(mesa)), []);
    if(!Array.isArray(clientes)){
        return [];
    }
    return clientes.reduce(function(lista, cliente){
        let numero = Number(cliente);
        if(Number.isInteger(numero) && numero > 3 && lista.indexOf(numero) === -1){
            lista.push(numero);
        }
        return lista;
    }, []);
}

function guardarClientesDinamicos(mesa, clientes){
    if(typeof clientes === 'undefined'){
        clientes = mesa;
        mesa = _resolveMesaArg();
    }else{
        mesa = _resolveMesaArg(mesa);
    }
    let clientesValidos = Array.isArray(clientes) ? clientes.reduce(function(lista, cliente){
        let numero = Number(cliente);
        if(Number.isInteger(numero) && numero > 3 && lista.indexOf(numero) === -1){
            lista.push(numero);
        }
        return lista;
    }, []) : [];
    setStorageItem(claveClientesDinamicos(mesa), JSON.stringify(clientesValidos));
}

function obtenerTodosLosClientes(mesa){
    mesa = _resolveMesaArg(mesa);
    const clientesFijos = [1,2,3];
    return clientesFijos.concat(obtenerClientesDinamicos(mesa));
}

function calcularTotalMesa(mesa){
    mesa = _resolveMesaArg(mesa);
    let total = 0;
    obtenerTodosLosClientes(mesa).forEach(function(numero){
        total += calcularTotalCliente(mesa, numero);
    });
    return total;
}

function actualizarEstadoMesa(mesa, totalMesa){
    if(typeof totalMesa === 'undefined'){
        totalMesa = calcularTotalMesa(mesa);
    }
    mesa = _resolveMesaArg(mesa);
    if(totalMesa <= 0){
        removeStorageItem(claveTotalMesa(mesa));
        let estadoActual = localStorage.getItem(claveEstadoMesa(mesa));
        if(estadoActual !== "pagada" && estadoActual !== "cobro"){
            setStorageItem(claveEstadoMesa(mesa), "libre");
        }
    }else{
        setStorageItem(claveTotalMesa(mesa), totalMesa);
        let estadoActual = localStorage.getItem(claveEstadoMesa(mesa));
        if(estadoActual !== "cobro" && estadoActual !== "pagada"){
            setStorageItem(claveEstadoMesa(mesa), "ocupada");
        }
    }
}
