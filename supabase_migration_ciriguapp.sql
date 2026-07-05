-- CIRIGUAPP - migracion segura a Supabase
-- Ejecutar en el SQL editor del proyecto https://ysxrdcflxzdpbrnsxddt.supabase.co
-- No borra datos existentes. Agrega columnas, tablas y RPC atomicas.

create extension if not exists pgcrypto;

create table if not exists public.ocupaciones_mesa (
    id uuid primary key default gen_random_uuid(),
    mesa_numero integer not null,
    estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
    inicio timestamptz not null default now(),
    fin timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists ocupaciones_mesa_abierta_unica
on public.ocupaciones_mesa (mesa_numero)
where estado = 'abierta';

alter table public.mesas
add column if not exists ocupacion_id uuid references public.ocupaciones_mesa(id);

alter table public.mesas
drop constraint if exists mesas_estado_check;

alter table public.mesas
add constraint mesas_estado_check
check (estado in ('libre', 'ocupada', 'cobro', 'pagada'));

alter table public.clientes_mesa
add column if not exists ocupacion_id uuid references public.ocupaciones_mesa(id);

alter table public.clientes_mesa
alter column productos set default '{}'::jsonb;

update public.clientes_mesa
set productos = '{}'::jsonb
where productos = '[]'::jsonb;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'clientes_mesa_mesa_numero_numero_cliente_key'
          and conrelid = 'public.clientes_mesa'::regclass
    ) then
        alter table public.clientes_mesa
        add constraint clientes_mesa_mesa_numero_numero_cliente_key
        unique (mesa_numero, numero_cliente);
    end if;
end;
$$;

alter table public.ventas
add column if not exists numero_factura bigint,
add column if not exists factura bigint,
add column if not exists ocupacion_id uuid references public.ocupaciones_mesa(id),
add column if not exists cliente integer,
add column if not exists tipo text,
add column if not exists hora text,
add column if not exists "timestamp" timestamptz,
add column if not exists productos_por_cliente jsonb not null default '{}'::jsonb,
add column if not exists productos jsonb not null default '{}'::jsonb,
add column if not exists idempotency_key text,
add column if not exists cierre_id text;

create unique index if not exists ventas_factura_unica
on public.ventas (factura)
where factura is not null;

create unique index if not exists ventas_idempotency_key_unica
on public.ventas (idempotency_key)
where idempotency_key is not null;

create table if not exists public.facturas (
    id integer primary key default 1 check (id = 1),
    ultimo_numero bigint not null default 0,
    updated_at timestamptz not null default now()
);

insert into public.facturas (id, ultimo_numero)
values (
    1,
    greatest(
        coalesce((select max(factura) from public.ventas), 0),
        coalesce((select max(numero_factura) from public.ventas), 0)
    )
)
on conflict (id) do update
set ultimo_numero = greatest(public.facturas.ultimo_numero, excluded.ultimo_numero),
    updated_at = now();

create table if not exists public.caja_periodos (
    id uuid primary key default gen_random_uuid(),
    estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
    inicio timestamptz not null default now(),
    fin timestamptz,
    created_at timestamptz not null default now()
);

insert into public.caja_periodos (estado)
select 'abierto'
where not exists (
    select 1 from public.caja_periodos where estado = 'abierto'
);

create unique index if not exists caja_periodos_abierto_unico
on public.caja_periodos ((estado))
where estado = 'abierto';

alter table public.gastos
add column if not exists "timestamp" timestamptz,
add column if not exists periodo_id uuid references public.caja_periodos(id),
add column if not exists cierre_id text,
add column if not exists activo boolean not null default true;

alter table public.cierres_caja
add column if not exists hora text,
add column if not exists "timestamp" timestamptz,
add column if not exists periodo_id uuid references public.caja_periodos(id),
add column if not exists ventas numeric not null default 0,
add column if not exists gastos numeric not null default 0,
add column if not exists utilidad numeric not null default 0,
add column if not exists facturas integer not null default 0,
add column if not exists clientes integer not null default 0,
add column if not exists producto_top text,
add column if not exists promedio numeric not null default 0,
add column if not exists gastos_detalle jsonb not null default '[]'::jsonb,
add column if not exists inicio_periodo timestamptz,
add column if not exists fin_periodo timestamptz;

create or replace function public.cirigua_ocupacion_abierta(p_mesa integer)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_ocupacion uuid;
begin
    select ocupacion_id
    into v_ocupacion
    from public.mesas
    where numero = p_mesa
    for update;

    if v_ocupacion is not null and exists (
        select 1 from public.ocupaciones_mesa
        where id = v_ocupacion and estado = 'abierta'
    ) then
        return v_ocupacion;
    end if;

    insert into public.ocupaciones_mesa (mesa_numero)
    values (p_mesa)
    on conflict (mesa_numero) where estado = 'abierta'
    do update set updated_at = now()
    returning id into v_ocupacion;

    update public.mesas
    set ocupacion_id = v_ocupacion,
        estado = 'ocupada',
        updated_at = now()
    where numero = p_mesa;

    return v_ocupacion;
end;
$$;

create or replace function public.registrar_venta_cirigua(
    p_mesa integer,
    p_cliente integer,
    p_tipo text,
    p_total numeric,
    p_productos_por_cliente jsonb,
    p_productos jsonb,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_existente record;
    v_factura bigint;
    v_ocupacion uuid;
    v_venta record;
    v_quedan_consumos boolean;
    v_productos_cliente_actual jsonb;
    v_productos_por_cliente_actual jsonb;
    v_total_calculado numeric;
begin
    if p_idempotency_key is null or length(trim(p_idempotency_key)) < 12 then
        raise exception 'idempotency_key invalida';
    end if;
    if p_total is null or p_total <= 0 then
        raise exception 'total invalido';
    end if;

    select *
    into v_existente
    from public.ventas
    where idempotency_key = p_idempotency_key;

    if found then
        return jsonb_build_object(
            'ok', true,
            'idempotente', true,
            'venta', to_jsonb(v_existente)
        );
    end if;

    if coalesce(p_cliente, 0) > 0 then
        select coalesce(productos, '{}'::jsonb)
        into v_productos_cliente_actual
        from public.clientes_mesa
        where mesa_numero = p_mesa
          and numero_cliente = p_cliente
        for update;

        if not found or v_productos_cliente_actual = '{}'::jsonb then
            raise exception 'no hay consumo pendiente para este cliente';
        end if;

        v_productos_por_cliente_actual :=
            jsonb_build_object('cliente_' || p_cliente, v_productos_cliente_actual);
    else
        with clientes_bloqueados as (
            select numero_cliente, coalesce(productos, '{}'::jsonb) as productos
            from public.clientes_mesa
            where mesa_numero = p_mesa
              and productos is not null
              and jsonb_typeof(productos) = 'object'
              and productos <> '{}'::jsonb
            order by numero_cliente
            for update
        )
        select coalesce(
            jsonb_object_agg('cliente_' || numero_cliente, productos),
            '{}'::jsonb
        )
        into v_productos_por_cliente_actual
        from clientes_bloqueados;

        if v_productos_por_cliente_actual = '{}'::jsonb then
            raise exception 'no hay consumo pendiente para esta mesa';
        end if;
    end if;

    if coalesce(p_productos_por_cliente, '{}'::jsonb) <> v_productos_por_cliente_actual then
        raise exception 'el pedido cambio antes del cobro';
    end if;

    select coalesce(sum(
        coalesce(nullif(item.value ->> 'cantidad', '')::numeric, 0) *
        coalesce(nullif(item.value ->> 'precio', '')::numeric, 0)
    ), 0)
    into v_total_calculado
    from jsonb_each(v_productos_por_cliente_actual) as cliente(key, value)
    cross join lateral jsonb_each(cliente.value) as item(key, value)
    where jsonb_typeof(cliente.value) = 'object'
      and jsonb_typeof(item.value) = 'object';

    if v_total_calculado <> p_total then
        raise exception 'total no coincide con el pedido actual';
    end if;

    v_ocupacion := public.cirigua_ocupacion_abierta(p_mesa);

    insert into public.facturas (id, ultimo_numero, updated_at)
    values (1, 1, now())
    on conflict (id) do update
    set ultimo_numero = public.facturas.ultimo_numero + 1,
        updated_at = now()
    returning ultimo_numero into v_factura;

    insert into public.ventas (
        numero_factura,
        factura,
        mesa_numero,
        ocupacion_id,
        cliente,
        tipo,
        total,
        fecha,
        hora,
        "timestamp",
        productos_por_cliente,
        productos,
        idempotency_key
    )
    values (
        v_factura,
        v_factura,
        p_mesa,
        v_ocupacion,
        coalesce(p_cliente, 0),
        coalesce(nullif(trim(p_tipo), ''), 'Cobro'),
        p_total,
        now(),
        to_char(now(), 'HH24:MI:SS'),
        now(),
        coalesce(p_productos_por_cliente, '{}'::jsonb),
        coalesce(p_productos, '{}'::jsonb),
        p_idempotency_key
    )
    returning * into v_venta;

    if coalesce(p_cliente, 0) > 0 then
        delete from public.clientes_mesa
        where mesa_numero = p_mesa
          and numero_cliente = p_cliente;
    else
        delete from public.clientes_mesa
        where mesa_numero = p_mesa;
    end if;

    select exists (
        select 1
        from public.clientes_mesa
        where mesa_numero = p_mesa
          and productos is not null
          and jsonb_typeof(productos) = 'object'
          and productos <> '{}'::jsonb
    ) into v_quedan_consumos;

    if v_quedan_consumos then
        update public.mesas
        set estado = 'ocupada',
            ocupacion_id = v_ocupacion,
            updated_at = now()
        where numero = p_mesa;
    else
        update public.ocupaciones_mesa
        set estado = 'cerrada',
            fin = now(),
            updated_at = now()
        where id = v_ocupacion;

        update public.mesas
        set estado = 'libre',
            ocupacion_id = null,
            updated_at = now()
        where numero = p_mesa;
    end if;

    return jsonb_build_object(
        'ok', true,
        'idempotente', false,
        'venta', to_jsonb(v_venta)
    );
end;
$$;

create or replace function public.guardar_pedido_cliente_cirigua(
    p_mesa integer,
    p_cliente integer,
    p_productos jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_ocupacion uuid;
    v_cliente record;
begin
    if p_productos is null or p_productos = '{}'::jsonb or p_productos = '[]'::jsonb then
        delete from public.clientes_mesa
        where mesa_numero = p_mesa
          and numero_cliente = p_cliente;

        perform public.actualizar_estado_mesa_cirigua(p_mesa);
        return jsonb_build_object('ok', true, 'borrado', true);
    end if;

    v_ocupacion := public.cirigua_ocupacion_abierta(p_mesa);

    insert into public.clientes_mesa (
        mesa_numero,
        numero_cliente,
        productos,
        ocupacion_id,
        updated_at
    )
    values (
        p_mesa,
        p_cliente,
        p_productos,
        v_ocupacion,
        now()
    )
    on conflict (mesa_numero, numero_cliente)
    do update set
        productos = excluded.productos,
        ocupacion_id = excluded.ocupacion_id,
        updated_at = now()
    returning * into v_cliente;

    update public.mesas
    set estado = 'ocupada',
        ocupacion_id = v_ocupacion,
        updated_at = now()
    where numero = p_mesa
      and estado not in ('cobro', 'pagada');

    return jsonb_build_object('ok', true, 'cliente', to_jsonb(v_cliente));
end;
$$;

create or replace function public.actualizar_estado_mesa_cirigua(p_mesa integer)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_estado text;
    v_tiene_consumo boolean;
    v_ocupacion uuid;
begin
    select estado, ocupacion_id
    into v_estado, v_ocupacion
    from public.mesas
    where numero = p_mesa
    for update;

    select exists (
        select 1
        from public.clientes_mesa
        where mesa_numero = p_mesa
          and productos is not null
          and jsonb_typeof(productos) = 'object'
          and productos <> '{}'::jsonb
    ) into v_tiene_consumo;

    if v_tiene_consumo then
        if v_estado not in ('cobro', 'pagada') then
            update public.mesas set estado = 'ocupada', updated_at = now()
            where numero = p_mesa;
            v_estado := 'ocupada';
        end if;
    else
        if v_estado not in ('cobro', 'pagada') then
            if v_ocupacion is not null then
                update public.ocupaciones_mesa
                set estado = 'cerrada', fin = coalesce(fin, now()), updated_at = now()
                where id = v_ocupacion and estado = 'abierta';
            end if;
            update public.mesas
            set estado = 'libre', ocupacion_id = null, updated_at = now()
            where numero = p_mesa;
            v_estado := 'libre';
        end if;
    end if;

    return v_estado;
end;
$$;

create or replace function public.agregar_producto_cliente_cirigua(
    p_mesa integer,
    p_cliente integer,
    p_nombre text,
    p_precio numeric,
    p_cantidad integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_ocupacion uuid;
    v_productos jsonb;
    v_actual jsonb;
    v_cantidad numeric;
begin
    if p_nombre is null or length(trim(p_nombre)) = 0 then
        raise exception 'producto invalido';
    end if;
    if p_precio is null or p_precio < 0 then
        raise exception 'precio invalido';
    end if;
    if p_cantidad is null or p_cantidad <= 0 then
        raise exception 'cantidad invalida';
    end if;

    v_ocupacion := public.cirigua_ocupacion_abierta(p_mesa);

    insert into public.clientes_mesa (
        mesa_numero,
        numero_cliente,
        productos,
        ocupacion_id,
        updated_at
    )
    values (
        p_mesa,
        p_cliente,
        '{}'::jsonb,
        v_ocupacion,
        now()
    )
    on conflict (mesa_numero, numero_cliente)
    do update set
        ocupacion_id = coalesce(public.clientes_mesa.ocupacion_id, excluded.ocupacion_id),
        updated_at = now()
    returning coalesce(productos, '{}'::jsonb)
    into v_productos;

    v_actual := coalesce(v_productos -> p_nombre, '{}'::jsonb);
    v_cantidad := coalesce(nullif(v_actual ->> 'cantidad', '')::numeric, 0) + p_cantidad;

    v_productos := jsonb_set(
        v_productos,
        array[p_nombre],
        jsonb_build_object(
            'precio', p_precio,
            'cantidad', v_cantidad
        ),
        true
    );

    update public.clientes_mesa
    set productos = v_productos,
        ocupacion_id = v_ocupacion,
        updated_at = now()
    where mesa_numero = p_mesa
      and numero_cliente = p_cliente;

    update public.mesas
    set estado = 'ocupada',
        ocupacion_id = v_ocupacion,
        updated_at = now()
    where numero = p_mesa
      and estado not in ('cobro', 'pagada');

    return jsonb_build_object(
        'ok', true,
        'productos', v_productos,
        'ocupacion_id', v_ocupacion
    );
end;
$$;

create or replace function public.quitar_producto_cliente_cirigua(
    p_mesa integer,
    p_cliente integer,
    p_nombre text,
    p_cantidad integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_productos jsonb;
    v_actual jsonb;
    v_cantidad numeric;
    v_precio numeric;
begin
    if p_nombre is null or length(trim(p_nombre)) = 0 then
        raise exception 'producto invalido';
    end if;
    if p_cantidad is null or p_cantidad <= 0 then
        raise exception 'cantidad invalida';
    end if;

    select coalesce(productos, '{}'::jsonb)
    into v_productos
    from public.clientes_mesa
    where mesa_numero = p_mesa
      and numero_cliente = p_cliente
    for update;

    if not found then
        perform public.actualizar_estado_mesa_cirigua(p_mesa);
        return jsonb_build_object('ok', true, 'productos', '{}'::jsonb);
    end if;

    v_actual := coalesce(v_productos -> p_nombre, '{}'::jsonb);
    v_cantidad := coalesce(nullif(v_actual ->> 'cantidad', '')::numeric, 0) - p_cantidad;
    v_precio := coalesce(nullif(v_actual ->> 'precio', '')::numeric, 0);

    if v_cantidad <= 0 then
        v_productos := v_productos - p_nombre;
    else
        v_productos := jsonb_set(
            v_productos,
            array[p_nombre],
            jsonb_build_object(
                'precio', v_precio,
                'cantidad', v_cantidad
            ),
            true
        );
    end if;

    if v_productos = '{}'::jsonb then
        delete from public.clientes_mesa
        where mesa_numero = p_mesa
          and numero_cliente = p_cliente;
    else
        update public.clientes_mesa
        set productos = v_productos,
            updated_at = now()
        where mesa_numero = p_mesa
          and numero_cliente = p_cliente;
    end if;

    perform public.actualizar_estado_mesa_cirigua(p_mesa);

    return jsonb_build_object(
        'ok', true,
        'productos', v_productos
    );
end;
$$;

create or replace function public.crear_gasto_cirigua(
    p_concepto text,
    p_valor numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_periodo uuid;
    v_gasto record;
begin
    if p_valor is null or p_valor <= 0 then
        raise exception 'valor invalido';
    end if;

    select id into v_periodo
    from public.caja_periodos
    where estado = 'abierto'
    order by inicio desc
    limit 1;

    if v_periodo is null then
        insert into public.caja_periodos (estado)
        values ('abierto')
        returning id into v_periodo;
    end if;

    insert into public.gastos (fecha, concepto, valor, "timestamp", periodo_id, activo)
    values (now(), coalesce(nullif(trim(p_concepto), ''), 'Gasto'), p_valor, now(), v_periodo, true)
    returning * into v_gasto;

    return jsonb_build_object('ok', true, 'gasto', to_jsonb(v_gasto));
end;
$$;

create or replace function public.eliminar_gasto_cirigua(p_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
    update public.gastos
    set activo = false
    where id::text = p_id
      and cierre_id is null;

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cerrar_caja_cirigua()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_periodo record;
    v_ventas numeric;
    v_gastos numeric;
    v_facturas integer;
    v_clientes integer;
    v_promedio numeric;
    v_producto_top text;
    v_gastos_detalle jsonb;
    v_cierre record;
    v_nuevo_periodo uuid;
begin
    select *
    into v_periodo
    from public.caja_periodos
    where estado = 'abierto'
    order by inicio desc
    limit 1
    for update;

    if not found then
        insert into public.caja_periodos (estado)
        values ('abierto')
        returning * into v_periodo;
    end if;

    select coalesce(sum(total), 0), count(*)
    into v_ventas, v_facturas
    from public.ventas
    where "timestamp" >= v_periodo.inicio
      and cierre_id is null;

    select coalesce(sum(valor), 0)
    into v_gastos
    from public.gastos
    where periodo_id = v_periodo.id
      and cierre_id is null
      and activo = true;

    select coalesce(sum(
        case
            when coalesce(cliente, 0) = 0
            then greatest((
                select count(*)
                from jsonb_object_keys(coalesce(productos_por_cliente, '{}'::jsonb))
            ), 1)
            else 1
        end
    ), 0)
    into v_clientes
    from public.ventas
    where "timestamp" >= v_periodo.inicio
      and cierre_id is null;

    v_promedio := case when v_facturas > 0 then v_ventas / v_facturas else 0 end;

    with items as (
        select key as nombre, sum((value->>'cantidad')::numeric) as cantidad
        from public.ventas v,
        lateral jsonb_each(coalesce(v.productos, '{}'::jsonb))
        where v."timestamp" >= v_periodo.inicio
          and v.cierre_id is null
          and jsonb_typeof(value) = 'object'
        group by key
        order by cantidad desc
        limit 1
    )
    select nombre into v_producto_top from items;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'concepto', concepto,
        'valor', valor,
        'timestamp', "timestamp"
    ) order by created_at), '[]'::jsonb)
    into v_gastos_detalle
    from public.gastos
    where periodo_id = v_periodo.id
      and cierre_id is null
      and activo = true;

    if v_facturas = 0 and v_gastos = 0 then
        raise exception 'no hay movimientos pendientes para cerrar';
    end if;

    insert into public.cierres_caja (
        fecha,
        hora,
        "timestamp",
        periodo_id,
        ventas,
        gastos,
        utilidad,
        facturas,
        clientes,
        producto_top,
        promedio,
        gastos_detalle,
        inicio_periodo,
        fin_periodo
    )
    values (
        now(),
        to_char(now(), 'HH24:MI:SS'),
        now(),
        v_periodo.id,
        v_ventas,
        v_gastos,
        v_ventas - v_gastos,
        v_facturas,
        v_clientes,
        coalesce(v_producto_top, '-'),
        v_promedio,
        v_gastos_detalle,
        v_periodo.inicio,
        now()
    )
    returning * into v_cierre;

    update public.ventas
    set cierre_id = v_cierre.id::text
    where "timestamp" >= v_periodo.inicio
      and cierre_id is null;

    update public.gastos
    set cierre_id = v_cierre.id::text
    where periodo_id = v_periodo.id
      and cierre_id is null;

    update public.caja_periodos
    set estado = 'cerrado', fin = now()
    where id = v_periodo.id;

    insert into public.caja_periodos (estado)
    values ('abierto')
    returning id into v_nuevo_periodo;

    return jsonb_build_object(
        'ok', true,
        'cierre', to_jsonb(v_cierre),
        'nuevo_periodo_id', v_nuevo_periodo
    );
end;
$$;

grant usage on schema public to anon, authenticated;

alter table public.mesas enable row level security;
alter table public.clientes_mesa enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.ventas enable row level security;
alter table public.gastos enable row level security;
alter table public.cierres_caja enable row level security;
alter table public.ocupaciones_mesa enable row level security;
alter table public.facturas enable row level security;
alter table public.caja_periodos enable row level security;

do $$
declare
    tabla text;
begin
    foreach tabla in array array[
        'auditoria',
        'papelera',
        'configuracion'
    ] loop
        if to_regclass('public.' || tabla) is not null then
            execute format('alter table public.%I enable row level security', tabla);
        end if;
    end loop;
end;
$$;

-- CIERRE MENSUAL independiente del cierre diario.
create table if not exists public.periodos_mensuales (
    id uuid primary key default gen_random_uuid(),
    estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
    inicio timestamptz not null default now(),
    fin timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists periodos_mensuales_abierto_unico
on public.periodos_mensuales ((estado))
where estado = 'abierto';

create table if not exists public.cierres_mensuales (
    id uuid primary key default gen_random_uuid(),
    periodo_id uuid not null references public.periodos_mensuales(id),
    nombre_periodo text not null,
    inicio_periodo timestamptz not null,
    fin_periodo timestamptz not null,
    fecha date not null default current_date,
    hora text not null default to_char(now(), 'HH24:MI:SS'),
    "timestamp" timestamptz not null default now(),
    ventas numeric not null default 0,
    gastos numeric not null default 0,
    resultado numeric not null default 0,
    cantidad_ventas integer not null default 0,
    cantidad_gastos integer not null default 0,
    ventas_detalle jsonb not null default '[]'::jsonb,
    gastos_detalle jsonb not null default '[]'::jsonb,
    idempotency_key text,
    created_at timestamptz not null default now(),
    unique (periodo_id)
);

create unique index if not exists cierres_mensuales_idempotency_key_unica
on public.cierres_mensuales (idempotency_key)
where idempotency_key is not null;

alter table public.ventas
add column if not exists cierre_mensual_id uuid references public.cierres_mensuales(id);

alter table public.gastos
add column if not exists cierre_mensual_id uuid references public.cierres_mensuales(id);

create index if not exists ventas_cierre_mensual_idx
on public.ventas (cierre_mensual_id, "timestamp");

create index if not exists gastos_cierre_mensual_idx
on public.gastos (cierre_mensual_id, "timestamp")
where activo = true;

create or replace function public.cirigua_nombre_periodo_mensual(p_inicio timestamptz)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_fecha timestamp;
    v_mes integer;
    v_nombre text;
begin
    v_fecha := p_inicio at time zone 'America/Bogota';
    v_mes := extract(month from v_fecha)::integer;
    v_nombre := case v_mes
        when 1 then 'Enero'
        when 2 then 'Febrero'
        when 3 then 'Marzo'
        when 4 then 'Abril'
        when 5 then 'Mayo'
        when 6 then 'Junio'
        when 7 then 'Julio'
        when 8 then 'Agosto'
        when 9 then 'Septiembre'
        when 10 then 'Octubre'
        when 11 then 'Noviembre'
        else 'Diciembre'
    end;

    return v_nombre || ' ' || extract(year from v_fecha)::integer::text;
end;
$$;

create or replace function public.cirigua_periodo_mensual_abierto()
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_periodo uuid;
    v_inicio timestamptz;
begin
    select id
    into v_periodo
    from public.periodos_mensuales
    where estado = 'abierto'
    order by inicio desc
    limit 1;

    if v_periodo is not null then
        return v_periodo;
    end if;

    select coalesce(min(momento), now())
    into v_inicio
    from (
        select coalesce("timestamp", created_at) as momento
        from public.ventas
        where cierre_mensual_id is null
        union all
        select coalesce("timestamp", created_at, fecha) as momento
        from public.gastos
        where cierre_mensual_id is null
          and activo = true
    ) movimientos
    where momento is not null;

    insert into public.periodos_mensuales (estado, inicio)
    values ('abierto', v_inicio)
    returning id into v_periodo;

    return v_periodo;
end;
$$;

create or replace function public.obtener_resumen_mensual_cirigua()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_periodo record;
    v_ventas numeric;
    v_gastos numeric;
    v_cantidad_ventas integer;
    v_cantidad_gastos integer;
    v_gastos_detalle jsonb;
    v_ventas_detalle jsonb;
begin
    perform public.cirigua_periodo_mensual_abierto();

    select *
    into v_periodo
    from public.periodos_mensuales
    where estado = 'abierto'
    order by inicio desc
    limit 1;

    select coalesce(sum(total), 0), count(*)
    into v_ventas, v_cantidad_ventas
    from public.ventas
    where coalesce("timestamp", created_at) >= v_periodo.inicio
      and cierre_mensual_id is null;

    select coalesce(sum(valor), 0), count(*)
    into v_gastos, v_cantidad_gastos
    from public.gastos
    where coalesce("timestamp", created_at, fecha) >= v_periodo.inicio
      and cierre_mensual_id is null
      and activo = true;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'factura', coalesce(factura, numero_factura),
        'mesa_numero', mesa_numero,
        'cliente', cliente,
        'tipo', coalesce(tipo, tipo_cobro),
        'total', total,
        'timestamp', coalesce("timestamp", created_at)
    ) order by coalesce("timestamp", created_at)), '[]'::jsonb)
    into v_ventas_detalle
    from public.ventas
    where coalesce("timestamp", created_at) >= v_periodo.inicio
      and cierre_mensual_id is null;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'concepto', concepto,
        'valor', valor,
        'timestamp', coalesce("timestamp", created_at, fecha)
    ) order by coalesce("timestamp", created_at, fecha)), '[]'::jsonb)
    into v_gastos_detalle
    from public.gastos
    where coalesce("timestamp", created_at, fecha) >= v_periodo.inicio
      and cierre_mensual_id is null
      and activo = true;

    return jsonb_build_object(
        'ok', true,
        'periodo', jsonb_build_object(
            'id', v_periodo.id,
            'estado', v_periodo.estado,
            'inicio', v_periodo.inicio,
            'nombre', public.cirigua_nombre_periodo_mensual(v_periodo.inicio)
        ),
        'ventas', v_ventas,
        'gastos', v_gastos,
        'resultado', v_ventas - v_gastos,
        'cantidad_ventas', v_cantidad_ventas,
        'cantidad_gastos', v_cantidad_gastos,
        'ventas_detalle', v_ventas_detalle,
        'gastos_detalle', v_gastos_detalle
    );
end;
$$;

create or replace function public.cerrar_mes_cirigua(
    p_periodo_id uuid,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_existente record;
    v_periodo record;
    v_fin timestamptz;
    v_ventas numeric;
    v_gastos numeric;
    v_cantidad_ventas integer;
    v_cantidad_gastos integer;
    v_ventas_detalle jsonb;
    v_gastos_detalle jsonb;
    v_cierre record;
    v_nuevo_periodo uuid;
begin
    if p_periodo_id is null then
        raise exception 'periodo mensual invalido';
    end if;

    if p_idempotency_key is null or length(trim(p_idempotency_key)) < 12 then
        raise exception 'idempotency_key invalida';
    end if;

    select *
    into v_existente
    from public.cierres_mensuales
    where idempotency_key = p_idempotency_key;

    if found then
        return jsonb_build_object(
            'ok', true,
            'idempotente', true,
            'cierre', to_jsonb(v_existente)
        );
    end if;

    perform pg_advisory_xact_lock(hashtext('cirigua_cierre_mensual'));

    select *
    into v_periodo
    from public.periodos_mensuales
    where id = p_periodo_id
    for update;

    if not found then
        raise exception 'periodo mensual no existe';
    end if;

    if v_periodo.estado <> 'abierto' then
        raise exception 'periodo mensual ya cerrado';
    end if;

    v_fin := clock_timestamp();

    select coalesce(sum(total), 0), count(*)
    into v_ventas, v_cantidad_ventas
    from public.ventas
    where coalesce("timestamp", created_at) >= v_periodo.inicio
      and coalesce("timestamp", created_at) < v_fin
      and cierre_mensual_id is null;

    select coalesce(sum(valor), 0), count(*)
    into v_gastos, v_cantidad_gastos
    from public.gastos
    where coalesce("timestamp", created_at, fecha) >= v_periodo.inicio
      and coalesce("timestamp", created_at, fecha) < v_fin
      and cierre_mensual_id is null
      and activo = true;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'factura', coalesce(factura, numero_factura),
        'mesa_numero', mesa_numero,
        'cliente', cliente,
        'tipo', coalesce(tipo, tipo_cobro),
        'total', total,
        'timestamp', coalesce("timestamp", created_at)
    ) order by coalesce("timestamp", created_at)), '[]'::jsonb)
    into v_ventas_detalle
    from public.ventas
    where coalesce("timestamp", created_at) >= v_periodo.inicio
      and coalesce("timestamp", created_at) < v_fin
      and cierre_mensual_id is null;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'concepto', concepto,
        'valor', valor,
        'timestamp', coalesce("timestamp", created_at, fecha)
    ) order by coalesce("timestamp", created_at, fecha)), '[]'::jsonb)
    into v_gastos_detalle
    from public.gastos
    where coalesce("timestamp", created_at, fecha) >= v_periodo.inicio
      and coalesce("timestamp", created_at, fecha) < v_fin
      and cierre_mensual_id is null
      and activo = true;

    insert into public.cierres_mensuales (
        periodo_id,
        nombre_periodo,
        inicio_periodo,
        fin_periodo,
        fecha,
        hora,
        "timestamp",
        ventas,
        gastos,
        resultado,
        cantidad_ventas,
        cantidad_gastos,
        ventas_detalle,
        gastos_detalle,
        idempotency_key
    ) values (
        v_periodo.id,
        public.cirigua_nombre_periodo_mensual(v_periodo.inicio),
        v_periodo.inicio,
        v_fin,
        v_fin::date,
        to_char(v_fin, 'HH24:MI:SS'),
        v_fin,
        v_ventas,
        v_gastos,
        v_ventas - v_gastos,
        v_cantidad_ventas,
        v_cantidad_gastos,
        v_ventas_detalle,
        v_gastos_detalle,
        p_idempotency_key
    ) returning * into v_cierre;

    update public.ventas
    set cierre_mensual_id = v_cierre.id
    where coalesce("timestamp", created_at) >= v_periodo.inicio
      and coalesce("timestamp", created_at) < v_fin
      and cierre_mensual_id is null;

    update public.gastos
    set cierre_mensual_id = v_cierre.id
    where coalesce("timestamp", created_at, fecha) >= v_periodo.inicio
      and coalesce("timestamp", created_at, fecha) < v_fin
      and cierre_mensual_id is null
      and activo = true;

    update public.periodos_mensuales
    set estado = 'cerrado',
        fin = v_fin,
        updated_at = clock_timestamp()
    where id = v_periodo.id;

    insert into public.periodos_mensuales (estado, inicio)
    values ('abierto', v_fin)
    returning id into v_nuevo_periodo;

    return jsonb_build_object(
        'ok', true,
        'idempotente', false,
        'cierre', to_jsonb(v_cierre),
        'nuevo_periodo_id', v_nuevo_periodo
    );
end;
$$;

insert into public.periodos_mensuales (estado, inicio)
select 'abierto', coalesce(min(momento), now())
from (
    select coalesce("timestamp", created_at) as momento
    from public.ventas
    where cierre_mensual_id is null
    union all
    select coalesce("timestamp", created_at, fecha) as momento
    from public.gastos
    where cierre_mensual_id is null
      and activo = true
) movimientos
where not exists (
    select 1 from public.periodos_mensuales where estado = 'abierto'
);

grant select, insert, update on public.periodos_mensuales to authenticated;
grant select, insert on public.cierres_mensuales to authenticated;
grant execute on function public.cirigua_nombre_periodo_mensual(timestamptz) to authenticated;
grant execute on function public.cirigua_periodo_mensual_abierto() to authenticated;
grant execute on function public.obtener_resumen_mensual_cirigua() to authenticated;
grant execute on function public.cerrar_mes_cirigua(uuid, text) to authenticated;

revoke all on public.periodos_mensuales from anon;
revoke all on public.cierres_mensuales from anon;
revoke delete on public.periodos_mensuales from authenticated;
revoke update, delete on public.cierres_mensuales from authenticated;
revoke execute on function public.cirigua_nombre_periodo_mensual(timestamptz) from public, anon;
revoke execute on function public.cirigua_periodo_mensual_abierto() from public, anon;
revoke execute on function public.obtener_resumen_mensual_cirigua() from public, anon;
revoke execute on function public.cerrar_mes_cirigua(uuid, text) from public, anon;

alter table public.periodos_mensuales enable row level security;
alter table public.cierres_mensuales enable row level security;

do $$
declare
    v_policy record;
begin
    for v_policy in
        select policyname, tablename
        from pg_policies
        where schemaname = 'public'
          and tablename in ('periodos_mensuales', 'cierres_mensuales')
    loop
        execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_policy.tablename);
    end loop;
end;
$$;

create policy periodos_mensuales_auth_select
on public.periodos_mensuales
for select to authenticated
using (true);

create policy periodos_mensuales_auth_insert
on public.periodos_mensuales
for insert to authenticated
with check (true);

create policy periodos_mensuales_auth_update
on public.periodos_mensuales
for update to authenticated
using (true)
with check (true);

create policy cierres_mensuales_auth_select
on public.cierres_mensuales
for select to authenticated
using (true);

create policy cierres_mensuales_auth_insert
on public.cierres_mensuales
for insert to authenticated
with check (true);

revoke all privileges on table
    public.mesas,
    public.clientes_mesa,
    public.categorias,
    public.productos,
    public.ventas,
    public.gastos,
    public.cierres_caja,
    public.ocupaciones_mesa,
    public.facturas,
    public.caja_periodos
from anon, authenticated;

do $$
declare
    tabla text;
begin
    foreach tabla in array array[
        'auditoria',
        'papelera',
        'configuracion'
    ] loop
        if to_regclass('public.' || tabla) is not null then
            execute format('revoke all privileges on table public.%I from anon, authenticated', tabla);
        end if;
    end loop;
end;
$$;

revoke all privileges on all sequences in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;

grant select, insert, update on public.categorias to authenticated;
grant select, insert, update on public.productos to authenticated;
grant select, update on public.mesas to authenticated;
grant select, insert, update, delete on public.clientes_mesa to authenticated;
grant select, insert, update on public.ventas to authenticated;
grant select, insert, update on public.gastos to authenticated;
grant select, insert on public.cierres_caja to authenticated;
grant select, insert, update on public.ocupaciones_mesa to authenticated;
grant select, insert, update on public.facturas to authenticated;
grant select, insert, update on public.caja_periodos to authenticated;

revoke execute on function public.cirigua_ocupacion_abierta(integer) from public, anon;
revoke execute on function public.registrar_venta_cirigua(integer, integer, text, numeric, jsonb, jsonb, text) from public, anon;
revoke execute on function public.guardar_pedido_cliente_cirigua(integer, integer, jsonb) from public, anon;
revoke execute on function public.actualizar_estado_mesa_cirigua(integer) from public, anon;
revoke execute on function public.agregar_producto_cliente_cirigua(integer, integer, text, numeric, integer) from public, anon;
revoke execute on function public.quitar_producto_cliente_cirigua(integer, integer, text, integer) from public, anon;
revoke execute on function public.crear_gasto_cirigua(text, numeric) from public, anon;
revoke execute on function public.eliminar_gasto_cirigua(text) from public, anon;
revoke execute on function public.cerrar_caja_cirigua() from public, anon;

grant execute on function public.cirigua_ocupacion_abierta(integer) to authenticated;
grant execute on function public.registrar_venta_cirigua(integer, integer, text, numeric, jsonb, jsonb, text) to authenticated;
grant execute on function public.guardar_pedido_cliente_cirigua(integer, integer, jsonb) to authenticated;
grant execute on function public.actualizar_estado_mesa_cirigua(integer) to authenticated;
grant execute on function public.agregar_producto_cliente_cirigua(integer, integer, text, numeric, integer) to authenticated;
grant execute on function public.quitar_producto_cliente_cirigua(integer, integer, text, integer) to authenticated;
grant execute on function public.crear_gasto_cirigua(text, numeric) to authenticated;
grant execute on function public.eliminar_gasto_cirigua(text) to authenticated;
grant execute on function public.cerrar_caja_cirigua() to authenticated;

do $$
declare
    tabla text;
    politica text;
begin
    foreach tabla in array array[
        'mesas',
        'clientes_mesa',
        'categorias',
        'productos',
        'ventas',
        'gastos',
        'cierres_caja',
        'ocupaciones_mesa',
        'facturas',
        'caja_periodos',
        'auditoria',
        'papelera',
        'configuracion'
    ] loop
        if to_regclass('public.' || tabla) is not null then
            foreach politica in array array[
                'cirigua_anon_select',
                'cirigua_anon_insert',
                'cirigua_anon_update',
                'cirigua_anon_delete',
                'ciriguapp_' || tabla,
                'cirigua_auth_select',
                'cirigua_auth_insert',
                'cirigua_auth_update',
                'cirigua_auth_delete'
            ] loop
                execute format('drop policy if exists %I on public.%I', politica, tabla);
            end loop;
        end if;
    end loop;
end;
$$;

create policy cirigua_auth_select on public.categorias for select to authenticated using (true);
create policy cirigua_auth_insert on public.categorias for insert to authenticated with check (true);
create policy cirigua_auth_update on public.categorias for update to authenticated using (true) with check (true);

create policy cirigua_auth_select on public.productos for select to authenticated using (true);
create policy cirigua_auth_insert on public.productos for insert to authenticated with check (true);
create policy cirigua_auth_update on public.productos for update to authenticated using (true) with check (true);

create policy cirigua_auth_select on public.mesas for select to authenticated using (true);
create policy cirigua_auth_update on public.mesas for update to authenticated using (true) with check (true);

create policy cirigua_auth_select on public.clientes_mesa for select to authenticated using (true);
create policy cirigua_auth_insert on public.clientes_mesa for insert to authenticated with check (true);
create policy cirigua_auth_update on public.clientes_mesa for update to authenticated using (true) with check (true);
create policy cirigua_auth_delete on public.clientes_mesa for delete to authenticated using (true);

create policy cirigua_auth_select on public.ventas for select to authenticated using (true);
create policy cirigua_auth_insert on public.ventas for insert to authenticated with check (true);
create policy cirigua_auth_update on public.ventas for update to authenticated using (true) with check (true);

create policy cirigua_auth_select on public.gastos for select to authenticated using (true);
create policy cirigua_auth_insert on public.gastos for insert to authenticated with check (true);
create policy cirigua_auth_update on public.gastos for update to authenticated using (true) with check (true);

create policy cirigua_auth_select on public.cierres_caja for select to authenticated using (true);
create policy cirigua_auth_insert on public.cierres_caja for insert to authenticated with check (true);

create policy cirigua_auth_select on public.ocupaciones_mesa for select to authenticated using (true);
create policy cirigua_auth_insert on public.ocupaciones_mesa for insert to authenticated with check (true);
create policy cirigua_auth_update on public.ocupaciones_mesa for update to authenticated using (true) with check (true);

create policy cirigua_auth_select on public.facturas for select to authenticated using (true);
create policy cirigua_auth_insert on public.facturas for insert to authenticated with check (true);
create policy cirigua_auth_update on public.facturas for update to authenticated using (true) with check (true);

create policy cirigua_auth_select on public.caja_periodos for select to authenticated using (true);
create policy cirigua_auth_insert on public.caja_periodos for insert to authenticated with check (true);
create policy cirigua_auth_update on public.caja_periodos for update to authenticated using (true) with check (true);
