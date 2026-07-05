const SUPABASE_URL = "https://ysxrdcflxzdpbrnsxddt.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mQGR5mkG99lyJ7rNfQ8XyQ_CYtaibvJ";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

window.supabaseClient = supabaseClient;

async function asegurarSesionCirigua(){
    if(typeof window !== "undefined" && typeof window.requireCiriguaSession === "function"){
        await window.requireCiriguaSession();
    }
}

async function obtenerCategoriasSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("categorias")
        .select("id,nombre,orden,activo")
        .order("orden", { ascending: true });

    if(error){
        throw error;
    }

    return data || [];
}

async function obtenerProductosSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("productos")
        .select("id,nombre,precio,categoria_id,activo,orden")
        .order("orden", { ascending: true });

    if(error){
        throw error;
    }

    return data || [];
}

async function crearCategoriaSupabase(nombre, orden){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("categorias")
        .insert({
            nombre: nombre,
            orden: orden,
            activo: true
        })
        .select()
        .single();

    if(error){
        throw error;
    }

    return data;
}

async function crearProductoSupabase(nombre, precio, categoriaId, orden){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("productos")
        .insert({
            nombre: nombre,
            precio: precio,
            categoria_id: categoriaId,
            activo: true,
            orden: orden
        })
        .select()
        .single();

    if(error){
        throw error;
    }

    return data;
}

async function editarProductoSupabase(id, nombre, precio, categoriaId){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("productos")
        .update({
            nombre: nombre,
            precio: precio,
            categoria_id: categoriaId,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

    if(error){
        throw error;
    }

    return data;
}

async function cambiarEstadoProductoSupabase(id, activo){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("productos")
        .update({
            activo: activo,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

    if(error){
        throw error;
    }

    return data;
}

function formatearFechaSupabase(fechaValor){
    if(!fechaValor){
        return "";
    }
    let fecha = new Date(fechaValor);
    if(isNaN(fecha.getTime())){
        return String(fechaValor);
    }
    return fecha.toLocaleDateString();
}

async function guardarPedidoClienteSupabase(mesa, numeroCliente, productos){
    await asegurarSesionCirigua();

    const { data: dataRpc, error: errorRpc } = await supabaseClient
        .rpc("guardar_pedido_cliente_cirigua", {
            p_mesa: Number(mesa),
            p_cliente: Number(numeroCliente),
            p_productos: productos || {}
        });

    if(errorRpc){
        throw errorRpc;
    }

    return dataRpc;
}

async function agregarProductoClienteSupabase(mesa, numeroCliente, nombre, precio, cantidad){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .rpc("agregar_producto_cliente_cirigua", {
            p_mesa: Number(mesa),
            p_cliente: Number(numeroCliente),
            p_nombre: String(nombre || ""),
            p_precio: Number(precio),
            p_cantidad: Number(cantidad || 1)
        });

    if(error){
        throw error;
    }

    return data && data.productos ? data.productos : {};
}

async function quitarProductoClienteSupabase(mesa, numeroCliente, nombre, cantidad){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .rpc("quitar_producto_cliente_cirigua", {
            p_mesa: Number(mesa),
            p_cliente: Number(numeroCliente),
            p_nombre: String(nombre || ""),
            p_cantidad: Number(cantidad || 1)
        });

    if(error){
        throw error;
    }

    return data && data.productos ? data.productos : {};
}

async function leerPedidoClienteSupabase(mesa, numeroCliente){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("clientes_mesa")
        .select("productos")
        .eq("mesa_numero", Number(mesa))
        .eq("numero_cliente", Number(numeroCliente))
        .maybeSingle();

    if(error){
        throw error;
    }

    return data ? data.productos : {};
}

async function borrarPedidoClienteSupabase(mesa, numeroCliente){
    await asegurarSesionCirigua();

    const { error } = await supabaseClient
        .from("clientes_mesa")
        .delete()
        .eq("mesa_numero", Number(mesa))
        .eq("numero_cliente", Number(numeroCliente));

    if(error){
        throw error;
    }
}

async function crearClienteMesaSupabase(mesa, numeroCliente){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("clientes_mesa")
        .upsert({
            mesa_numero: Number(mesa),
            numero_cliente: Number(numeroCliente),
            productos: {},
            updated_at: new Date().toISOString()
        }, {
            onConflict: "mesa_numero,numero_cliente"
        })
        .select()
        .single();

    if(error){
        throw error;
    }

    return data;
}

async function obtenerClientesMesaSupabase(mesa){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("clientes_mesa")
        .select("numero_cliente,productos")
        .eq("mesa_numero", Number(mesa))
        .order("numero_cliente", { ascending: true });

    if(error){
        throw error;
    }

    return data || [];
}

async function borrarTodosClientesMesaSupabase(mesa){
    await asegurarSesionCirigua();

    const { error } = await supabaseClient
        .from("clientes_mesa")
        .delete()
        .eq("mesa_numero", Number(mesa));

    if(error){
        throw error;
    }
}

async function cambiarEstadoMesaSupabase(mesa, estado){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("mesas")
        .update({
            estado: estado,
            updated_at: new Date().toISOString()
        })
        .eq("numero", Number(mesa))
        .select()
        .single();

    if(error){
        throw error;
    }

    return data;
}

async function obtenerMesasSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("mesas")
        .select("numero,estado,updated_at")
        .order("numero", { ascending: true });

    if(error){
        throw error;
    }

    return data || [];
}

async function actualizarEstadoMesaPorConsumosSupabase(mesa){
    await asegurarSesionCirigua();

    const { data: estadoRpc, error: errorRpc } = await supabaseClient
        .rpc("actualizar_estado_mesa_cirigua", {
            p_mesa: Number(mesa)
        });

    if(errorRpc){
        throw errorRpc;
    }

    return estadoRpc;
}

function crearIdempotencyKeyCirigua(prefijo){
    let randomPart = "";
    if(window.crypto && typeof window.crypto.randomUUID === "function"){
        randomPart = window.crypto.randomUUID();
    }else{
        randomPart = String(Date.now()) + "-" + String(Math.random()).slice(2);
    }
    return String(prefijo || "cirigua") + "-" + randomPart;
}

function normalizarVentaDesdeSupabase(venta){
    if(!venta || typeof venta !== "object"){
        return null;
    }
    let timestamp = venta.timestamp || venta.created_at || new Date().toISOString();
    let fechaVenta = new Date(timestamp);
    if(isNaN(fechaVenta.getTime())){
        fechaVenta = new Date();
    }
    return {
        id: venta.id,
        factura: Number(venta.factura),
        fecha: formatearFechaSupabase(venta.fecha || timestamp),
        hora: venta.hora || fechaVenta.toLocaleTimeString(),
        timestamp: fechaVenta.toISOString(),
        mesa: Number(venta.mesa_numero || venta.mesa || 0),
        ocupacion_id: venta.ocupacion_id || null,
        cliente: Number(venta.cliente || 0),
        tipo: venta.tipo || "Cobro",
        total: Number(venta.total || 0),
        productosPorCliente: venta.productos_por_cliente || venta.productosPorCliente || {},
        productos: venta.productos || {},
        cierre_id: venta.cierre_id || null
    };
}

async function registrarVentaSupabase(datosFactura){
    await asegurarSesionCirigua();

    if(!datosFactura || typeof datosFactura !== "object"){
        throw new Error("Venta inválida");
    }

    let idempotencyKey =
        datosFactura.idempotency_key ||
        datosFactura.idempotencyKey ||
        crearIdempotencyKeyCirigua("venta");

    const { data, error } = await supabaseClient
        .rpc("registrar_venta_cirigua", {
            p_mesa: Number(datosFactura.mesa),
            p_cliente: Number(datosFactura.cliente || 0),
            p_tipo: String(datosFactura.tipo || "Cobro"),
            p_total: Number(datosFactura.total || 0),
            p_productos_por_cliente: datosFactura.productosPorCliente || {},
            p_productos: datosFactura.productos || {},
            p_idempotency_key: idempotencyKey
        });

    if(error){
        throw error;
    }

    let venta = data && data.venta ? data.venta : data;
    return normalizarVentaDesdeSupabase(venta);
}

async function obtenerVentasSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("ventas")
        .select("id,factura,mesa_numero,ocupacion_id,cliente,tipo,total,fecha,hora,timestamp,created_at,productos_por_cliente,productos,cierre_id")
        .order("timestamp", { ascending: true });

    if(error){
        throw error;
    }

    return (data || []).map(normalizarVentaDesdeSupabase).filter(function(venta){
        return venta !== null;
    });
}

async function obtenerUltimaVentaSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("ventas")
        .select("id,factura,mesa_numero,ocupacion_id,cliente,tipo,total,fecha,hora,timestamp,created_at,productos_por_cliente,productos,cierre_id")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

    if(error){
        throw error;
    }

    return normalizarVentaDesdeSupabase(data);
}

async function obtenerVentaPorFacturaSupabase(factura){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("ventas")
        .select("id,factura,mesa_numero,ocupacion_id,cliente,tipo,total,fecha,hora,timestamp,created_at,productos_por_cliente,productos,cierre_id")
        .eq("factura", Number(factura))
        .maybeSingle();

    if(error){
        throw error;
    }

    return normalizarVentaDesdeSupabase(data);
}

async function obtenerVentasPorOcupacionSupabase(ocupacionId){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("ventas")
        .select("id,factura,mesa_numero,ocupacion_id,cliente,tipo,total,fecha,hora,timestamp,created_at,productos_por_cliente,productos,cierre_id")
        .eq("ocupacion_id", ocupacionId)
        .order("timestamp", { ascending: true });

    if(error){
        throw error;
    }

    return (data || []).map(normalizarVentaDesdeSupabase).filter(function(venta){
        return venta !== null;
    });
}

function normalizarGastoDesdeSupabase(gasto){
    if(!gasto || typeof gasto !== "object"){
        return null;
    }
    return {
        id: gasto.id,
        concepto: gasto.concepto || "Gasto",
        valor: Number(gasto.valor || 0),
        fecha: formatearFechaSupabase(gasto.fecha || gasto.timestamp || gasto.created_at),
        timestamp: gasto.timestamp || gasto.created_at || null,
        periodo_id: gasto.periodo_id || null,
        cierre_id: gasto.cierre_id || null,
        activo: gasto.activo !== false
    };
}

async function crearGastoSupabase(concepto, valor){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .rpc("crear_gasto_cirigua", {
            p_concepto: concepto,
            p_valor: Number(valor)
        });

    if(error){
        throw error;
    }

    return normalizarGastoDesdeSupabase(data && data.gasto ? data.gasto : data);
}

async function obtenerGastosSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("gastos")
        .select("id,created_at,fecha,concepto,valor,timestamp,periodo_id,cierre_id,activo")
        .eq("activo", true)
        .is("cierre_id", null)
        .order("created_at", { ascending: true });

    if(error){
        throw error;
    }

    return (data || []).map(normalizarGastoDesdeSupabase).filter(function(gasto){
        return gasto !== null;
    });
}

async function eliminarGastoSupabase(id){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .rpc("eliminar_gasto_cirigua", {
            p_id: id
        });

    if(error){
        throw error;
    }

    return data;
}

function normalizarCierreDesdeSupabase(cierre){
    if(!cierre || typeof cierre !== "object"){
        return null;
    }
    let timestamp = cierre.timestamp || cierre.created_at || new Date().toISOString();
    let fechaCierre = new Date(timestamp);
    if(isNaN(fechaCierre.getTime())){
        fechaCierre = new Date();
    }
    return {
        id: cierre.id,
        fecha: formatearFechaSupabase(cierre.fecha || timestamp),
        hora: cierre.hora || fechaCierre.toLocaleTimeString(),
        timestamp: fechaCierre.toISOString(),
        ventas: Number(cierre.ventas || 0),
        gastos: Number(cierre.gastos || 0),
        utilidad: Number(cierre.utilidad || 0),
        facturas: Number(cierre.facturas || 0),
        clientes: Number(cierre.clientes || 0),
        productoTop: cierre.producto_top || cierre.productoTop || "-",
        promedio: Number(cierre.promedio || 0),
        gastosDetalle: cierre.gastos_detalle || cierre.gastosDetalle || [],
        inicioPeriodo: cierre.inicio_periodo || null,
        finPeriodo: cierre.fin_periodo || null
    };
}

async function cerrarCajaSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .rpc("cerrar_caja_cirigua");

    if(error){
        throw error;
    }

    return normalizarCierreDesdeSupabase(data && data.cierre ? data.cierre : data);
}

async function obtenerCierresSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("cierres_caja")
        .select("id,created_at,fecha,hora,timestamp,ventas,gastos,utilidad,facturas,clientes,producto_top,promedio,gastos_detalle,inicio_periodo,fin_periodo")
        .order("timestamp", { ascending: true });

    if(error){
        throw error;
    }

    return (data || []).map(normalizarCierreDesdeSupabase).filter(function(cierre){
        return cierre !== null;
    });
}

function normalizarResumenMensualDesdeSupabase(resumen){
    if(!resumen || typeof resumen !== "object"){
        return null;
    }

    let periodo = resumen.periodo || {};

    return {
        periodo: {
            id: periodo.id || null,
            estado: periodo.estado || "abierto",
            inicio: periodo.inicio || null,
            nombre: periodo.nombre || "Periodo mensual"
        },
        ventas: Number(resumen.ventas || 0),
        gastos: Number(resumen.gastos || 0),
        resultado: Number(resumen.resultado || 0),
        cantidadVentas: Number(resumen.cantidad_ventas || resumen.cantidadVentas || 0),
        cantidadGastos: Number(resumen.cantidad_gastos || resumen.cantidadGastos || 0),
        ventasDetalle: resumen.ventas_detalle || resumen.ventasDetalle || [],
        gastosDetalle: resumen.gastos_detalle || resumen.gastosDetalle || []
    };
}

function normalizarCierreMensualDesdeSupabase(cierre){
    if(!cierre || typeof cierre !== "object"){
        return null;
    }

    let timestamp = cierre.timestamp || cierre.created_at || new Date().toISOString();
    let fechaCierre = new Date(timestamp);
    if(isNaN(fechaCierre.getTime())){
        fechaCierre = new Date();
    }

    return {
        id: cierre.id,
        periodoId: cierre.periodo_id || null,
        nombrePeriodo: cierre.nombre_periodo || "Periodo mensual",
        inicioPeriodo: cierre.inicio_periodo || null,
        finPeriodo: cierre.fin_periodo || null,
        fecha: formatearFechaSupabase(cierre.fecha || timestamp),
        hora: cierre.hora || fechaCierre.toLocaleTimeString(),
        timestamp: fechaCierre.toISOString(),
        ventas: Number(cierre.ventas || 0),
        gastos: Number(cierre.gastos || 0),
        resultado: Number(cierre.resultado || 0),
        cantidadVentas: Number(cierre.cantidad_ventas || 0),
        cantidadGastos: Number(cierre.cantidad_gastos || 0),
        ventasDetalle: cierre.ventas_detalle || [],
        gastosDetalle: cierre.gastos_detalle || []
    };
}

async function obtenerResumenMensualSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .rpc("obtener_resumen_mensual_cirigua");

    if(error){
        throw error;
    }

    return normalizarResumenMensualDesdeSupabase(data);
}

async function cerrarMesSupabase(periodoId, idempotencyKey){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .rpc("cerrar_mes_cirigua", {
            p_periodo_id: periodoId,
            p_idempotency_key: idempotencyKey || crearIdempotencyKeyCirigua("cierre-mensual")
        });

    if(error){
        throw error;
    }

    return normalizarCierreMensualDesdeSupabase(data && data.cierre ? data.cierre : data);
}

async function obtenerCierresMensualesSupabase(){
    await asegurarSesionCirigua();

    const { data, error } = await supabaseClient
        .from("cierres_mensuales")
        .select("id,periodo_id,nombre_periodo,inicio_periodo,fin_periodo,fecha,hora,timestamp,ventas,gastos,resultado,cantidad_ventas,cantidad_gastos,ventas_detalle,gastos_detalle")
        .order("timestamp", { ascending: true });

    if(error){
        throw error;
    }

    return (data || []).map(normalizarCierreMensualDesdeSupabase).filter(function(cierre){
        return cierre !== null;
    });
}
