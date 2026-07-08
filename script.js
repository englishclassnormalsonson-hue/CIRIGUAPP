let total = 0;

const parametros =
    new URLSearchParams(window.location.search);

let mesaActual =
Number(parametros.get(parametros.has("barra") ? "barra" : "mesa") || parametros.get("mesa") || 1);

let tipoActualPedido =
    typeof tipoPuntoActual !== "undefined"
        ? normalizarTipoPuntoCirigua(tipoPuntoActual)
        : normalizarTipoPuntoCirigua(parametros.get("tipo") || (parametros.has("barra") ? "barra" : "mesa"));

let clienteActual =
parametros.get("cliente") || 1;
// Mesa-related helper functions are centralized in `utils.js` (claveCliente, leerProductosCliente, etc.)

let productos = {};
let sincronizandoPedidoRemoto = false;
let canalPedidoTiempoReal = null;
let temporizadorPedidoTiempoReal = null;
let pedidoTiempoRealCargando = false;
let pedidoTiempoRealPendiente = false;

let categoriaSeleccionada = "";

let categoriasSupabase = [];
let productosSupabase = [];

const ORDEN_VISUAL_CATEGORIAS_CIRIGUA = [
    "Greca",
    "Tragos",
    "Cervezas",
    "Gaseosas",
    "Micheladas",
    "Jugos y bebidas",
    "Aguas",
    "Energizantes",
    "Mecato",
    "Confitería",
    "Chocolatinas",
    "Medias",
    "Botellas",
    "Litros",
    "Garrafas",
    "Otros"
];

function normalizarCategoriaOrden(valor){
    return normalizeText(valor).replace(/\s+/g, " ").trim();
}

function ordenarCategoriasPedido(categorias){
    const prioridad = {};
    ORDEN_VISUAL_CATEGORIAS_CIRIGUA.forEach(function(nombre, indice){
        prioridad[normalizarCategoriaOrden(nombre)] = indice;
    });

    return (categorias || []).slice().sort(function(a, b){
        const prioridadA = prioridad[normalizarCategoriaOrden(a)];
        const prioridadB = prioridad[normalizarCategoriaOrden(b)];
        const tienePrioridadA = typeof prioridadA === "number";
        const tienePrioridadB = typeof prioridadB === "number";

        if(tienePrioridadA && tienePrioridadB){
            return prioridadA - prioridadB;
        }

        if(tienePrioridadA){
            return -1;
        }

        if(tienePrioridadB){
            return 1;
        }

        return String(a || "").localeCompare(String(b || ""), "es", {
            sensitivity: "base"
        });
    });
}

function mostrarCategoriasProductos(){

    const contenedor =
        document.getElementById("categoriasProductos");

    if(!contenedor){
        return;
    }

    contenedor.innerHTML = "";

    let categorias =
        ordenarCategoriasPedido(categoriasSupabase).concat(["Todos"]);

    categorias.forEach(function(categoria){

        let boton =
            document.createElement("button");

        boton.classList.add("categoria-btn");

        if(categoria === categoriaSeleccionada){

            boton.classList.add("categoria-activa");
        }

        boton.innerHTML = categoria;

        boton.onclick = function(){

            categoriaSeleccionada = categoria;

            mostrarCategoriasProductos();

            mostrarProductosDisponibles();
        };

        contenedor.appendChild(boton);
    });
}

function mostrarVentaRapida(){

    const contenedor =
        document.getElementById("ventaRapida");

    if(!contenedor){
        return;
    }

    contenedor.innerHTML = "";

    [100, 200, 500, 1000, 2000, 3000, 5000].forEach(function(valor){

        let boton =
            document.createElement("button");

        boton.classList.add("venta-rapida-btn");

        boton.innerHTML =
            "$" + valor.toLocaleString();

        boton.onclick = function(){
            let concepto = prompt(
                "Concepto para la venta rápida (por ejemplo Propina, Recarga, Servicio especial):",
                "Venta rápida"
            );
            if(concepto === null){
                return;
            }
            concepto = String(concepto).trim();
            if(!concepto){
                concepto = "Venta rápida";
            }
            concepto = canonizarConceptoRapido(concepto);
            agregarProducto(concepto, valor);
        };

        contenedor.appendChild(boton);
    });
}

function mostrarProductosDisponibles(){

    const contenedor =
        document.getElementById("productos");

    if(!contenedor){
        return;
    }

    contenedor.innerHTML = "";

    let busqueda =
        normalizeText(document.getElementById("buscarProducto").value);

    let tieneBusqueda =
        busqueda.length > 0;

    let tieneCategoriaSeleccionada =
        categoriaSeleccionada !== "";

    if(!tieneBusqueda && !tieneCategoriaSeleccionada){
        let mensajeInicial =
            document.createElement("p");

        mensajeInicial.classList.add("mensaje-vacio");

        mensajeInicial.innerHTML =
            "Seleccione una categoría o busque un producto.";

        contenedor.appendChild(mensajeInicial);

        return;
    }

    let productosFiltrados =
        productosSupabase.filter(function(producto){

            let coincideCategoria =
                !tieneCategoriaSeleccionada ||
                categoriaSeleccionada === "Todos" ||
                producto.categoria === categoriaSeleccionada;

            let coincideBusqueda =
                normalizeText(producto.nombre).includes(busqueda);

            return coincideCategoria && coincideBusqueda;
        });

    if(productosFiltrados.length === 0){

        let mensaje =
            document.createElement("p");

        mensaje.classList.add("mensaje-vacio");

        mensaje.innerHTML =
            "No hay productos para mostrar.";

        contenedor.appendChild(mensaje);

        return;
    }

    productosFiltrados.forEach(function(producto){

        let boton =
            document.createElement("button");

        boton.classList.add("producto-btn");

        boton.innerHTML =
            producto.nombre +
            " $" +
            producto.precio.toLocaleString();

        boton.onclick = function(){

            agregarProducto(
                producto.nombre,
                producto.precio
            );
        };

        contenedor.appendChild(boton);
    });
}

function filtrarProductos(){

    mostrarProductosDisponibles();
}
// Mesa list / totals / state utilities are provided by `utils.js` (obtenerClientesDinamicos, calcularTotalMesa, actualizarEstadoMesa, etc.)

function actualizarTituloCliente(){
    const titulo =
        document.getElementById("tituloCliente");

    if(!titulo){
        return;
    }

    const etiqueta =
        (tipoActualPedido === "barra" ? "Barra " : "Mesa ") +
        mesaActual +
        " - Cliente " +
        clienteActual;

    titulo.innerHTML =
        etiqueta +
        " <span class=\"total-titulo-cliente\">· $" +
        total.toLocaleString() +
        "</span>";
}

async function recargarPedidoDesdeSupabase(){
    try{
        let productosRemotos =
            await leerPedidoClienteSupabase(
                mesaActual,
                clienteActual,
                tipoActualPedido
            );
        if(!productosRemotos || typeof productosRemotos !== "object" || Array.isArray(productosRemotos)){
            productosRemotos = {};
        }
        aplicarPedidoRemoto(productosRemotos);
    }catch(error){
        console.error("Error sincronizando pedido desde Supabase:", error);
    }
}

function eventoPedidoCorresponde(payload){
    if(!payload){
        return true;
    }

    const registro = payload.new || payload.old || {};

    if(registro.tipo_punto && normalizarTipoPuntoCirigua(registro.tipo_punto) !== tipoActualPedido){
        return false;
    }

    if(registro.mesa_numero !== undefined && Number(registro.mesa_numero) !== Number(mesaActual)){
        return false;
    }

    if(registro.numero_cliente !== undefined && Number(registro.numero_cliente) !== Number(clienteActual)){
        return false;
    }

    return true;
}

function programarRecargaPedidoTiempoReal(){
    clearTimeout(temporizadorPedidoTiempoReal);
    temporizadorPedidoTiempoReal = setTimeout(recargarPedidoTiempoReal, 100);
}

async function recargarPedidoTiempoReal(){
    if(pedidoTiempoRealCargando){
        pedidoTiempoRealPendiente = true;
        return;
    }

    pedidoTiempoRealCargando = true;
    try{
        await recargarPedidoDesdeSupabase();
    }finally{
        pedidoTiempoRealCargando = false;
        if(pedidoTiempoRealPendiente){
            pedidoTiempoRealPendiente = false;
            programarRecargaPedidoTiempoReal();
        }
    }
}

function suscribirPedidoTiempoReal(){
    if(canalPedidoTiempoReal || !supabaseClient || typeof supabaseClient.channel !== "function"){
        return;
    }

    canalPedidoTiempoReal = supabaseClient
        .channel("cirigua-pedido-" + tipoActualPedido + "-" + mesaActual + "-" + clienteActual)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "clientes_mesa",
            filter: "mesa_numero=eq." + Number(mesaActual)
        }, function(payload){
            if(eventoPedidoCorresponde(payload)){
                programarRecargaPedidoTiempoReal();
            }
        })
        .subscribe(function(estado){
            if(estado === "CHANNEL_ERROR" || estado === "TIMED_OUT"){
                const canalAnterior = canalPedidoTiempoReal;
                canalPedidoTiempoReal = null;
                if(supabaseClient && typeof supabaseClient.removeChannel === "function"){
                    supabaseClient.removeChannel(canalAnterior);
                }
                setTimeout(suscribirPedidoTiempoReal, 1500);
            }
        });
}

function aplicarPedidoRemoto(productosRemotos){
    if(!productosRemotos || typeof productosRemotos !== "object" || Array.isArray(productosRemotos)){
        productosRemotos = {};
    }
    productos = productosRemotos;
    if(Object.keys(productos).length === 0){
        removeStorageItem(claveCliente(clienteActual));
    }else{
        setStorageItem(
            claveCliente(clienteActual),
            JSON.stringify(productos)
        );
    }
    sincronizandoPedidoRemoto = true;
    try{
        actualizarPedido();
    }finally{
        sincronizandoPedidoRemoto = false;
    }
}

function limpiarCliente(numeroCliente){

    removeStorageItem(claveCliente(numeroCliente));

    if(Number(mesaActual) === 1){
        removeStorageItem("cliente_" + numeroCliente);
    }

    if(Number(numeroCliente) === Number(clienteActual)){
        productos = {};
        total = 0;
    }

    return borrarPedidoClienteSupabase(
        mesaActual,
        numeroCliente,
        tipoActualPedido
    ).then(function(){

        return actualizarEstadoMesaPorConsumosSupabase(
            mesaActual,
            tipoActualPedido
        );

    }).catch(function(error){

        console.error(
            "Error borrando pedido o actualizando estado en Supabase:",
            error
        );

        throw error;
    });
}

async function agregarProducto(nombre, precio) {
    try{
        let productosRemotos =
            await agregarProductoClienteSupabase(
                mesaActual,
                clienteActual,
                nombre,
                precio,
                1,
                tipoActualPedido
            );
        aplicarPedidoRemoto(productosRemotos);
    }catch(error){
        console.error("Error agregando producto en Supabase:", error);
        alert("No se pudo agregar el producto. Intente de nuevo.");
    }
}

async function quitarProducto(nombre) {

    let confirmar = confirm(
        "¿Desea eliminar una unidad de " + nombre + "?"
    );

    if (!confirmar) {
        return;
    }

    if (productos[nombre]) {
        try{
            let productosRemotos =
                await quitarProductoClienteSupabase(
                    mesaActual,
                    clienteActual,
                    nombre,
                    1,
                    tipoActualPedido
                );
            aplicarPedidoRemoto(productosRemotos);
        }catch(error){
            console.error("Error quitando producto en Supabase:", error);
            alert("No se pudo quitar el producto. Intente de nuevo.");
        }
    }
}

function actualizarPedido() {

    const pedido =
        document.getElementById("pedido");

    pedido.innerHTML = "";

    total = 0;

    let productosValidos = {};

    for (let nombre in productos) {

        let productoActual = productos[nombre];
        if(!productoActual || typeof productoActual !== "object" || Array.isArray(productoActual)){
            continue;
        }

        let cantidad =
            Number(productoActual.cantidad);

        let precio =
            Number(productoActual.precio);

        if(!Number.isFinite(cantidad) || !Number.isFinite(precio)){
            continue;
        }

        if(cantidad <= 0 || precio < 0){
            continue;
        }

        productosValidos[nombre] = {
            precio: precio,
            cantidad: cantidad
        };

        let subtotal =
            cantidad * precio;

        total += subtotal;

        let item =
            document.createElement("div");

        item.classList.add("item-pedido");

        let info =
            document.createElement("div");

        info.classList.add("info-producto");

        let titulo =
            document.createElement("h3");

        titulo.innerHTML = nombre;

        let cantidadTexto =
            document.createElement("p");

        cantidadTexto.innerHTML =
            "Cantidad: " + cantidad;

        let subtotalTexto =
            document.createElement("p");

        subtotalTexto.innerHTML =
            "Subtotal: $" + subtotal.toLocaleString();

        let botonQuitar =
            document.createElement("button");

        botonQuitar.innerHTML = "➖";

        botonQuitar.onclick = function(){

            quitarProducto(nombre);
        };

        info.appendChild(titulo);
        info.appendChild(cantidadTexto);
        info.appendChild(subtotalTexto);

        item.appendChild(info);
        item.appendChild(botonQuitar);

        pedido.appendChild(item);
    }

    productos = productosValidos;

    document.getElementById("total").innerHTML =
        "TOTAL: $" + total.toLocaleString();

    actualizarTituloCliente();

    if(Object.keys(productos).length === 0){
        removeStorageItem(claveCliente(clienteActual));
    }else{
        setStorageItem(
            claveCliente(clienteActual),
            JSON.stringify(productos)
        );
    }

    actualizarEstadoMesa();
}

window.onload = async function () {
    await ciriguaAuthReady;

    const { data: categorias, error: errorCategorias } =
        await supabaseClient
            .from("categorias")
            .select("nombre")
            .eq("activo", true)
            .order("orden");

    if(errorCategorias){
        console.error("Error leyendo categorías de Supabase:", errorCategorias);
        return;
    }

    const { data: productosDB, error: errorProductos } =
        await supabaseClient
            .from("productos")
            .select(`
                id,
                nombre,
                precio,
                activo,
                categorias (
                    nombre
                )
            `)
            .eq("activo", true)
            .order("orden");

    if(errorProductos){
        console.error("Error leyendo productos de Supabase:", errorProductos);
        return;
    }

    categoriasSupabase = categorias.map(function(categoria){
        return categoria.nombre;
    });

    productosSupabase = productosDB.map(function(producto){
        return {
            id: producto.id,
            nombre: producto.nombre,
            precio: producto.precio,
            categoria: producto.categorias ? producto.categorias.nombre : "",
            activo: producto.activo
        };
    });

        try{

        productos =
            await leerPedidoClienteSupabase(
                mesaActual,
                clienteActual,
                tipoActualPedido
            );

        if(!productos || typeof productos !== "object" || Array.isArray(productos)){
            productos = {};
        }

    }catch(error){

        console.error(
            "Error leyendo pedido desde Supabase:",
            error
        );

        productos =
            leerProductosCliente(clienteActual);
    }

    mostrarCategoriasProductos();

    mostrarVentaRapida();

    mostrarProductosDisponibles();

    actualizarPedido();

    suscribirPedidoTiempoReal();

}

// Removed guardarPedido: pedidos se guardan automáticamente en localStorage

function cobrarCliente(boton){
    return ejecutarAccionCritica(boton, async function(){

    if(total <= 0){

        alert("No hay nada para cobrar");

        return false;
    }

    let confirmar = confirm(
        "¿Confirma el cobro de $" +
        total.toLocaleString() +
        "?"
    );

    if(!confirmar){
        return false;
    }

    let productosPorCliente = {};
    productosPorCliente["cliente_" + clienteActual] = JSON.parse(JSON.stringify(productos));

    let datosFactura = crearDatosFacturaVenta({
        mesa: mesaActual,
        tipoPunto: tipoActualPedido,
        puntoNumero: mesaActual,
        cliente: clienteActual,
        tipo: "Cobro Individual",
        total: total,
        productosPorCliente: productosPorCliente
    });

    let ventaRegistrada = null;

    try{
        ventaRegistrada = await registrarVentaConfirmada(datosFactura);
    }catch(error){
        console.error("No se pudo registrar el pago en Supabase:", error);
    }

    if(!ventaRegistrada){
        alert("No se pudo registrar el pago. El pedido NO fue borrado. Intente de nuevo.");
        return false;
    }

    try{
        await limpiarCliente(clienteActual);
    }catch(error){
        alert("La venta fue registrada, pero no se pudo limpiar el pedido. Revise la mesa antes de volver a cobrar.");
        return false;
    }

    alert(
        "Pago registrado correctamente"
    );

    window.location.href =
    urlPuntoCirigua("clientes.html", tipoActualPedido, mesaActual);
    });
}

function verRecibo(){

    window.open(

        urlPuntoCirigua("recibo.html", tipoActualPedido, mesaActual, "cliente=" + clienteActual),

        "_blank"
    );
}
