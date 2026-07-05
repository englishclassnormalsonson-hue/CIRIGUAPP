// =======================================
// GESTIÓN DEL HISTORIAL DE VENTAS
// =======================================

function obtenerFechaUltimoCierre() {
    let cierre = null;
    cierre = safeParse(localStorage.getItem("ultimoCierreCaja"), null);
    if (!cierre) {
        return null;
    }
    if (cierre.timestamp) {
        let fecha = new Date(cierre.timestamp);
        return isNaN(fecha.getTime()) ? null : fecha;
    }
    if (!cierre.fecha || !cierre.hora) {
        return null;
    }
    let fecha = parseFechaHoraLocal(cierre.fecha, cierre.hora);
    return fecha && !isNaN(fecha.getTime()) ? fecha : null;
}

function obtenerTimestampVenta(venta) {
    if (!venta || typeof venta !== 'object') {
        return null;
    }
    if (venta.timestamp) {
        let fecha = new Date(venta.timestamp);
        return isNaN(fecha.getTime()) ? null : fecha;
    }
    if (!venta.fecha || !venta.hora) {
        return null;
    }
    let fecha = parseFechaHoraLocal(venta.fecha, venta.hora);
    return fecha && !isNaN(fecha.getTime()) ? fecha : null;
}

function esVentaDespuesDelUltimoCierre(venta) {
    let fechaCierre = obtenerFechaUltimoCierre();
    if (!fechaCierre) {
        return true;
    }
    let fechaVenta = obtenerTimestampVenta(venta);
    if (!fechaVenta) {
        return false;
    }
    return fechaVenta > fechaCierre;
}

function obtenerVentasDelDia() {
    let historial = obtenerHistorialVentas();
    let hoyISO = fechaLocalISO(new Date());
    return historial.filter(function(venta){
        if(!venta || typeof venta !== 'object'){
            return false;
        }
        let fechaVenta = obtenerTimestampVenta(venta);
        let fechaVentaISO = fechaVenta ? fechaLocalISO(fechaVenta) : null;
        let mismoDia = fechaVentaISO
            ? fechaVentaISO === hoyISO
            : String(venta.fecha) === ((typeof fechaHoy === 'function') ? fechaHoy() : new Date().toLocaleDateString());
        return mismoDia && esVentaDespuesDelUltimoCierre(venta);
    });
}

function obtenerResumenDelDia() {
    let ventas = obtenerVentasDelDia();
    let totalVentas = 0;
    let cantidadFacturas = ventas.length;
    let productoContador = {};
    let clientesAtendidos = 0;

    ventas.forEach(function(venta){
        totalVentas += Number(venta.total) || 0;
        clientesAtendidos += contarClientesVenta(venta);
        let productosNormalizados = normalizarProductosVenta(venta);
        for(let nombre in productosNormalizados){
            productoContador[nombre] =
                (productoContador[nombre] || 0) + Number(productosNormalizados[nombre].cantidad);
        }
    });

    let promedio = cantidadFacturas > 0 ? totalVentas / cantidadFacturas : 0;

    let productoTop = "-";
    let maxCantidad = 0;
    Object.keys(productoContador).forEach(function(producto){
        if(productoContador[producto] > maxCantidad){
            maxCantidad = productoContador[producto];
            productoTop = producto;
        }
    });

    return {
        totalVentas: totalVentas,
        cantidadFacturas: cantidadFacturas,
        clientesAtendidos: clientesAtendidos,
        productoTop: productoTop,
        promedio: promedio
    };
}

function sumarTotalVentas(ventas) {
    if(!Array.isArray(ventas)){
        return 0;
    }
    return ventas.reduce(function(total, venta){
        return total + (Number(venta && venta.total) || 0);
    }, 0);
}

function guardarHistorialVentas(historial) {

    setStorageItem(
        "historialVentas",
        JSON.stringify(historial)
    );

}

function normalizarProductosVenta(venta) {
    let productos = {};
    if(!venta || typeof venta !== 'object') {
        return productos;
    }

    let origenProductos = venta.productos;
    if(!origenProductos && venta.productosPorCliente){
        origenProductos = calcularProductosTotales(venta.productosPorCliente);
    }
    if(!origenProductos){
        return productos;
    }

    if(Array.isArray(origenProductos)){
        origenProductos.forEach(function(producto){
            if(!producto || !producto.nombre) return;
            let nombre = producto.nombre;
            let cantidad = Number(producto.cantidad);
            let precio = Number(producto.precio);
            if(!Number.isFinite(cantidad) || !Number.isFinite(precio)) return;
            if(cantidad <= 0 || precio < 0) return;
            if(!productos[nombre]){
                productos[nombre] = {cantidad: 0, precio: precio};
            }
            productos[nombre].cantidad += cantidad;
            productos[nombre].precio = precio;
        });
    } else if(typeof origenProductos === 'object'){
        let clienteKeys = Object.keys(origenProductos).filter(function(key){
            return String(key).indexOf('cliente_') === 0;
        });
        if(clienteKeys.length > 0){
            clienteKeys.forEach(function(clienteKey){
                let productosCliente = origenProductos[clienteKey] || {};
                for(let nombre in productosCliente){
                    let item = productosCliente[nombre];
                    if(!item || typeof item !== 'object' || Array.isArray(item)) continue;
                    let cantidad = Number(item.cantidad);
                    let precio = Number(item.precio);
                    if(!Number.isFinite(cantidad) || !Number.isFinite(precio)) continue;
                    if(cantidad <= 0 || precio < 0) continue;
                    if(!productos[nombre]){
                        productos[nombre] = {cantidad: 0, precio: precio};
                    }
                    productos[nombre].cantidad += cantidad;
                    productos[nombre].precio = precio;
                }
            });
        } else {
            for(let nombre in origenProductos){
                let item = origenProductos[nombre];
                if(!item || typeof item !== 'object') continue;
                let cantidad = Number(item.cantidad);
                let precio = Number(item.precio);
                if(!Number.isFinite(cantidad) || !Number.isFinite(precio)) continue;
                if(cantidad <= 0 || precio < 0) continue;
                if(!productos[nombre]){
                    productos[nombre] = {cantidad: 0, precio: precio};
                }
                productos[nombre].cantidad += cantidad;
                productos[nombre].precio = precio;
            }
        }
    }
    return productos;
}

function calcularProductosTotales(productosPorCliente) {
    let productosTotales = {};
    if(!productosPorCliente || typeof productosPorCliente !== 'object'){
        return productosTotales;
    }
    Object.keys(productosPorCliente).forEach(function(clienteKey){
        let productosCliente = productosPorCliente[clienteKey] || {};
        Object.keys(productosCliente).forEach(function(nombre){
            let item = productosCliente[nombre];
            if(!item || typeof item !== 'object' || Array.isArray(item)) return;
            let cantidad = Number(item.cantidad);
            let precio = Number(item.precio);
            if(!Number.isFinite(cantidad) || !Number.isFinite(precio)) return;
            if(cantidad <= 0 || precio < 0) return;
            if(!productosTotales[nombre]){
                productosTotales[nombre] = {cantidad: 0, precio: precio};
            }
            productosTotales[nombre].cantidad += cantidad;
            productosTotales[nombre].precio = precio;
        });
    });
    return productosTotales;
}

function crearDatosFacturaVenta(config) {
    let ahora = new Date();
    let productosPorCliente = config.productosPorCliente || {};
    let datosFactura = {
        factura: obtenerSiguienteFactura(),
        fecha: ahora.toLocaleDateString(),
        hora: ahora.toLocaleTimeString(),
        timestamp: ahora.toISOString(),
        mesa: Number(config.mesa) || 0,
        cliente: Number(config.cliente) || 0,
        tipo: String(config.tipo || '').trim() || 'Cobro',
        total: Number(config.total) || 0,
        productosPorCliente: productosPorCliente,
        productos: calcularProductosTotales(productosPorCliente)
    };
    return datosFactura;
}

function contarClientesVenta(venta) {
    if(!venta || typeof venta !== 'object'){
        return 0;
    }
    if(venta.tipo && String(venta.tipo).toLowerCase().includes('mesa')){
        if(typeof venta.productosPorCliente === 'object'){
            let clientes = Object.keys(venta.productosPorCliente || {}).filter(function(key){
                return String(key).indexOf('cliente_') === 0;
            });
            if(clientes.length > 0){
                return clientes.length;
            }
        }
        if(typeof venta.productos === 'object'){
            let clientes = Object.keys(venta.productos || {}).filter(function(key){
                return String(key).indexOf('cliente_') === 0;
            });
            if(clientes.length > 0){
                return clientes.length;
            }
        }
        return 1;
    }
    return 1;
}

function obtenerSiguienteFactura() {

    return obtenerConsecutivoFactura();

}

function aumentarConsecutivoFactura() {

    let numero = obtenerSiguienteFactura();

    numero++;

    setStorageItem(
        "consecutivoFactura",
        numero
    );

}

function ventasEquivalentes(ventaA, ventaB){
    return Number(ventaA && ventaA.mesa) === Number(ventaB && ventaB.mesa) &&
        Number(ventaA && ventaA.cliente) === Number(ventaB && ventaB.cliente) &&
        String((ventaA && ventaA.tipo) || "") === String((ventaB && ventaB.tipo) || "") &&
        Number(ventaA && ventaA.total) === Number(ventaB && ventaB.total) &&
        JSON.stringify((ventaA && ventaA.productosPorCliente) || {}) === JSON.stringify((ventaB && ventaB.productosPorCliente) || {});
}

function restaurarVentaParcial(snapshot){
    try{
        if(snapshot.historialVentas === null){
            removeStorageItem("historialVentas");
        }else{
            setStorageItem("historialVentas", snapshot.historialVentas);
        }
        if(snapshot.ultimaVenta === null){
            removeStorageItem("ultimaVenta");
        }else{
            setStorageItem("ultimaVenta", snapshot.ultimaVenta);
        }
        if(snapshot.consecutivoFactura === null){
            removeStorageItem("consecutivoFactura");
        }else{
            setStorageItem("consecutivoFactura", snapshot.consecutivoFactura);
        }
    }catch(e){
        console.error("No se pudo restaurar la venta parcial", e);
    }
}

function registrarVenta(datosFactura) {
    let snapshot = {
        historialVentas: localStorage.getItem("historialVentas"),
        ultimaVenta: localStorage.getItem("ultimaVenta"),
        consecutivoFactura: localStorage.getItem("consecutivoFactura")
    };

    let historial = obtenerHistorialVentas();
    if(!datosFactura || typeof datosFactura !== "object"){
        console.error("Venta inválida", datosFactura);
        return false;
    }
    try{
        let factura = Number(datosFactura.factura);
        if(!Number.isInteger(factura) || factura <= 0){
            factura = obtenerSiguienteFactura();
            datosFactura.factura = factura;
        }

        let ventaExistente = historial.find(function(venta){
            return Number(venta && venta.factura) === factura;
        });

        if(ventaExistente && ventasEquivalentes(ventaExistente, datosFactura)){
            let siguiente = Math.max(obtenerConsecutivoFactura(), factura + 1);
            setStorageItem("consecutivoFactura", siguiente);
            setStorageItem("ultimaVenta", JSON.stringify(ventaExistente));
            return true;
        }

        if(ventaExistente){
            factura = obtenerSiguienteFactura();
            datosFactura.factura = factura;
        }

        if(!datosFactura.timestamp){
            datosFactura.timestamp = new Date().toISOString();
        }

        let siguienteFactura = Math.max(obtenerConsecutivoFactura(), factura + 1);
        setStorageItem("consecutivoFactura", siguienteFactura);

        historial.push(datosFactura);
        guardarHistorialVentas(historial);
        setStorageItem("ultimaVenta", JSON.stringify(datosFactura));

        return true;
    }catch(e){
        restaurarVentaParcial(snapshot);
        console.error("No se pudo registrar la venta", e);
        return false;
    }
}

async function registrarVentaConfirmada(datosFactura) {
    if(typeof registrarVentaSupabase !== "function"){
        throw new Error("Supabase no está disponible para registrar la venta");
    }

    let ventaSupabase = await registrarVentaSupabase(datosFactura);
    if(!ventaSupabase){
        throw new Error("Supabase no devolvió la venta registrada");
    }
    registrarVenta(ventaSupabase);
    return ventaSupabase;
}

function guardarHistorialVentasEnCache(historial){
    if(Array.isArray(historial)){
        guardarHistorialVentas(historial);
        if(historial.length > 0){
            setStorageItem("ultimaVenta", JSON.stringify(historial[historial.length - 1]));
        }
    }
}
