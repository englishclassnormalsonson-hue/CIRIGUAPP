-- CIRIGUAPP - Barras y observaciones por ocupacion
-- Migracion incremental, no destructiva e idempotente.

create extension if not exists pgcrypto;

create table if not exists public.puntos_atencion (
    tipo text not null check (tipo in ('mesa', 'barra')),
    numero integer not null check (numero > 0),
    estado text not null default 'libre' check (estado in ('libre', 'ocupada', 'cobro', 'pagada')),
    ocupacion_id uuid references public.ocupaciones_mesa(id),
    fijo boolean not null default false,
    visible boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tipo, numero)
);

alter table public.clientes_mesa
add column if not exists tipo_punto text not null default 'mesa' check (tipo_punto in ('mesa', 'barra'));

alter table public.ocupaciones_mesa
add column if not exists tipo_punto text not null default 'mesa' check (tipo_punto in ('mesa', 'barra')),
add column if not exists observacion text;

alter table public.ventas
add column if not exists tipo_punto text not null default 'mesa' check (tipo_punto in ('mesa', 'barra')),
add column if not exists punto_numero integer,
add column if not exists observacion text;

update public.ventas
set punto_numero = coalesce(punto_numero, mesa_numero)
where punto_numero is null;

insert into public.puntos_atencion (tipo, numero, estado, ocupacion_id, fijo, visible, updated_at)
select 'mesa', m.numero, m.estado, m.ocupacion_id, true, true, m.updated_at
from public.mesas m
on conflict (tipo, numero) do update
set estado = excluded.estado,
    ocupacion_id = excluded.ocupacion_id,
    fijo = true,
    visible = true,
    updated_at = now();

insert into public.puntos_atencion (tipo, numero, estado, fijo, visible)
select 'barra', n, 'libre', true, true
from generate_series(1, 5) as n
on conflict (tipo, numero) do update
set fijo = true,
    visible = true,
    updated_at = now();

do $$
begin
    if exists (
        select 1 from pg_constraint
        where conrelid = 'public.clientes_mesa'::regclass
          and conname = 'clientes_mesa_mesa_numero_fkey'
    ) then
        alter table public.clientes_mesa
        drop constraint clientes_mesa_mesa_numero_fkey;
    end if;

    if exists (
        select 1 from pg_constraint
        where conrelid = 'public.clientes_mesa'::regclass
          and conname = 'clientes_mesa_mesa_numero_numero_cliente_key'
    ) then
        alter table public.clientes_mesa
        drop constraint clientes_mesa_mesa_numero_numero_cliente_key;
    end if;
end $$;

drop index if exists public.ocupaciones_mesa_abierta_unica;

create unique index if not exists clientes_mesa_punto_cliente_unico
on public.clientes_mesa (tipo_punto, mesa_numero, numero_cliente);

create unique index if not exists ocupaciones_punto_abierta_unica
on public.ocupaciones_mesa (tipo_punto, mesa_numero)
where estado = 'abierta';

create index if not exists clientes_mesa_punto_idx
on public.clientes_mesa (tipo_punto, mesa_numero);

create index if not exists ventas_punto_idx
on public.ventas (tipo_punto, punto_numero, "timestamp");

create or replace function public.cirigua_normalizar_tipo_punto(p_tipo text)
returns text
language sql
security invoker
set search_path = public
as $$
    select case when lower(coalesce(nullif(trim(p_tipo), ''), 'mesa')) = 'barra' then 'barra' else 'mesa' end;
$$;

create or replace function public.cirigua_sync_punto_estado(
    p_tipo text,
    p_numero integer,
    p_estado text,
    p_ocupacion uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_fijo boolean;
    v_visible boolean;
begin
    if p_numero is null or p_numero <= 0 then
        raise exception 'punto invalido';
    end if;
    if p_estado not in ('libre', 'ocupada', 'cobro', 'pagada') then
        raise exception 'estado invalido';
    end if;

    v_fijo := (v_tipo = 'mesa') or (v_tipo = 'barra' and p_numero between 1 and 5);
    v_visible := v_fijo or p_estado <> 'libre' or p_ocupacion is not null;

    insert into public.puntos_atencion (tipo, numero, estado, ocupacion_id, fijo, visible, updated_at)
    values (v_tipo, p_numero, p_estado, p_ocupacion, v_fijo, v_visible, now())
    on conflict (tipo, numero) do update
    set estado = excluded.estado,
        ocupacion_id = excluded.ocupacion_id,
        fijo = public.puntos_atencion.fijo or excluded.fijo,
        visible = excluded.visible,
        updated_at = now();

    if v_tipo = 'mesa' then
        update public.mesas
        set estado = p_estado,
            ocupacion_id = p_ocupacion,
            updated_at = now()
        where numero = p_numero;
    end if;
end;
$$;

create or replace function public.cirigua_ocupacion_punto_abierta(
    p_tipo text,
    p_numero integer
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_ocupacion uuid;
begin
    if p_numero is null or p_numero <= 0 then
        raise exception 'punto invalido';
    end if;

    perform pg_advisory_xact_lock(hashtext(v_tipo || ':' || p_numero::text));

    select ocupacion_id
    into v_ocupacion
    from public.puntos_atencion
    where tipo = v_tipo and numero = p_numero
    for update;

    if v_ocupacion is not null and exists (
        select 1 from public.ocupaciones_mesa
        where id = v_ocupacion and estado = 'abierta'
    ) then
        return v_ocupacion;
    end if;

    insert into public.ocupaciones_mesa (tipo_punto, mesa_numero)
    values (v_tipo, p_numero)
    on conflict (tipo_punto, mesa_numero) where estado = 'abierta'
    do update set updated_at = now()
    returning id into v_ocupacion;

    perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'ocupada', v_ocupacion);

    return v_ocupacion;
end;
$$;

create or replace function public.cirigua_ocupacion_abierta(p_mesa integer)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
    return public.cirigua_ocupacion_punto_abierta('mesa', p_mesa);
end;
$$;

create or replace function public.actualizar_estado_punto_cirigua(
    p_tipo text,
    p_numero integer
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_estado text;
    v_ocupacion uuid;
    v_tiene_consumo boolean;
begin
    select estado, ocupacion_id
    into v_estado, v_ocupacion
    from public.puntos_atencion
    where tipo = v_tipo and numero = p_numero
    for update;

    if not found then
        perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'libre', null);
        v_estado := 'libre';
        v_ocupacion := null;
    end if;

    select exists (
        select 1
        from public.clientes_mesa
        where tipo_punto = v_tipo
          and mesa_numero = p_numero
          and productos is not null
          and productos <> '{}'::jsonb
    ) into v_tiene_consumo;

    if v_tiene_consumo then
        if v_estado not in ('cobro', 'pagada') then
            perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'ocupada', v_ocupacion);
            v_estado := 'ocupada';
        end if;
    else
        if v_estado not in ('cobro', 'pagada') then
            if v_ocupacion is not null then
                update public.ocupaciones_mesa
                set estado = 'cerrada', fin = coalesce(fin, now()), updated_at = now()
                where id = v_ocupacion and estado = 'abierta';
            end if;
            perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'libre', null);
            v_estado := 'libre';
        end if;
    end if;

    return v_estado;
end;
$$;

create or replace function public.actualizar_estado_mesa_cirigua(p_mesa integer)
returns text
language plpgsql
security invoker
set search_path = public
as $$
begin
    return public.actualizar_estado_punto_cirigua('mesa', p_mesa);
end;
$$;

create or replace function public.liberar_punto_cirigua(
    p_tipo text,
    p_numero integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_ocupacion uuid;
begin
    if p_numero is null or p_numero <= 0 then
        raise exception 'punto invalido';
    end if;

    perform pg_advisory_xact_lock(hashtext(v_tipo || ':' || p_numero::text));

    delete from public.clientes_mesa
    where tipo_punto = v_tipo
      and mesa_numero = p_numero;

    update public.ocupaciones_mesa
    set estado = 'cerrada',
        fin = coalesce(fin, now()),
        observacion = null,
        updated_at = now()
    where tipo_punto = v_tipo
      and mesa_numero = p_numero
      and estado = 'abierta'
    returning id into v_ocupacion;

    perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'libre', null);

    return jsonb_build_object('ok', true, 'ocupacion_id', v_ocupacion);
end;
$$;

create or replace function public.guardar_pedido_punto_cirigua(
    p_tipo text,
    p_numero integer,
    p_cliente integer,
    p_productos jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_ocupacion uuid;
    v_cliente record;
begin
    if p_productos is null or p_productos = '{}'::jsonb then
        delete from public.clientes_mesa
        where tipo_punto = v_tipo
          and mesa_numero = p_numero
          and numero_cliente = p_cliente;

        perform public.actualizar_estado_punto_cirigua(v_tipo, p_numero);
        return jsonb_build_object('ok', true, 'borrado', true);
    end if;

    v_ocupacion := public.cirigua_ocupacion_punto_abierta(v_tipo, p_numero);

    insert into public.clientes_mesa (tipo_punto, mesa_numero, numero_cliente, productos, ocupacion_id, updated_at)
    values (v_tipo, p_numero, p_cliente, p_productos, v_ocupacion, now())
    on conflict (tipo_punto, mesa_numero, numero_cliente)
    do update set
        productos = excluded.productos,
        ocupacion_id = excluded.ocupacion_id,
        updated_at = now()
    returning * into v_cliente;

    perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'ocupada', v_ocupacion);

    return jsonb_build_object('ok', true, 'cliente', to_jsonb(v_cliente));
end;
$$;

create or replace function public.guardar_pedido_cliente_cirigua(p_mesa integer, p_cliente integer, p_productos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
    return public.guardar_pedido_punto_cirigua('mesa', p_mesa, p_cliente, p_productos);
end;
$$;

create or replace function public.agregar_producto_punto_cirigua(
    p_tipo text,
    p_numero integer,
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
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
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

    v_ocupacion := public.cirigua_ocupacion_punto_abierta(v_tipo, p_numero);

    insert into public.clientes_mesa (tipo_punto, mesa_numero, numero_cliente, productos, ocupacion_id, updated_at)
    values (v_tipo, p_numero, p_cliente, '{}'::jsonb, v_ocupacion, now())
    on conflict (tipo_punto, mesa_numero, numero_cliente)
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
        jsonb_build_object('precio', p_precio, 'cantidad', v_cantidad),
        true
    );

    update public.clientes_mesa
    set productos = v_productos,
        ocupacion_id = v_ocupacion,
        updated_at = now()
    where tipo_punto = v_tipo
      and mesa_numero = p_numero
      and numero_cliente = p_cliente;

    perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'ocupada', v_ocupacion);

    return jsonb_build_object('ok', true, 'productos', v_productos, 'ocupacion_id', v_ocupacion);
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
begin
    return public.agregar_producto_punto_cirigua('mesa', p_mesa, p_cliente, p_nombre, p_precio, p_cantidad);
end;
$$;

create or replace function public.quitar_producto_punto_cirigua(
    p_tipo text,
    p_numero integer,
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
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
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
    where tipo_punto = v_tipo
      and mesa_numero = p_numero
      and numero_cliente = p_cliente
    for update;

    if not found then
        perform public.actualizar_estado_punto_cirigua(v_tipo, p_numero);
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
            jsonb_build_object('precio', v_precio, 'cantidad', v_cantidad),
            true
        );
    end if;

    if v_productos = '{}'::jsonb then
        delete from public.clientes_mesa
        where tipo_punto = v_tipo
          and mesa_numero = p_numero
          and numero_cliente = p_cliente;
    else
        update public.clientes_mesa
        set productos = v_productos,
            updated_at = now()
        where tipo_punto = v_tipo
          and mesa_numero = p_numero
          and numero_cliente = p_cliente;
    end if;

    perform public.actualizar_estado_punto_cirigua(v_tipo, p_numero);

    return jsonb_build_object('ok', true, 'productos', v_productos);
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
begin
    return public.quitar_producto_punto_cirigua('mesa', p_mesa, p_cliente, p_nombre, p_cantidad);
end;
$$;

create or replace function public.guardar_observacion_ocupacion_cirigua(
    p_tipo text,
    p_numero integer,
    p_observacion text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_ocupacion uuid;
    v_observacion text := nullif(trim(coalesce(p_observacion, '')), '');
    v_tiene_consumo boolean;
begin
    if v_observacion is not null and length(v_observacion) > 120 then
        v_observacion := left(v_observacion, 120);
    end if;

    if v_observacion is null then
        select ocupacion_id into v_ocupacion
        from public.puntos_atencion
        where tipo = v_tipo and numero = p_numero;
        if v_ocupacion is null then
            return jsonb_build_object('ok', true, 'ocupacion_id', null, 'observacion', null);
        end if;
    else
        v_ocupacion := public.cirigua_ocupacion_punto_abierta(v_tipo, p_numero);
    end if;

    update public.ocupaciones_mesa
    set observacion = v_observacion,
        updated_at = now()
    where id = v_ocupacion
    returning observacion into v_observacion;

    if v_observacion is null then
        select exists (
            select 1
            from public.clientes_mesa
            where tipo_punto = v_tipo
              and mesa_numero = p_numero
              and productos is not null
              and productos <> '{}'::jsonb
        ) into v_tiene_consumo;

        if not v_tiene_consumo then
            perform public.actualizar_estado_punto_cirigua(v_tipo, p_numero);
        end if;
    end if;

    return jsonb_build_object('ok', true, 'ocupacion_id', v_ocupacion, 'observacion', v_observacion);
end;
$$;

create or replace function public.registrar_venta_punto_cirigua(
    p_tipo text,
    p_numero integer,
    p_cliente integer,
    p_tipo_cobro text,
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
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_existente record;
    v_factura bigint;
    v_ocupacion uuid;
    v_observacion text;
    v_venta record;
    v_quedan_consumos boolean;
begin
    if p_idempotency_key is null or length(trim(p_idempotency_key)) < 12 then
        raise exception 'idempotency_key invalida';
    end if;
    if p_total is null or p_total <= 0 then
        raise exception 'total invalido';
    end if;

    select * into v_existente
    from public.ventas
    where idempotency_key = p_idempotency_key;

    if found then
        return jsonb_build_object('ok', true, 'idempotente', true, 'venta', to_jsonb(v_existente));
    end if;

    v_ocupacion := public.cirigua_ocupacion_punto_abierta(v_tipo, p_numero);

    select observacion into v_observacion
    from public.ocupaciones_mesa
    where id = v_ocupacion;

    if coalesce(p_cliente, 0) > 0 and not exists (
        select 1 from public.clientes_mesa
        where tipo_punto = v_tipo
          and mesa_numero = p_numero
          and numero_cliente = p_cliente
          and productos is not null
          and productos <> '{}'::jsonb
    ) then
        raise exception 'no hay consumo pendiente para este cliente';
    end if;

    if coalesce(p_cliente, 0) = 0 and not exists (
        select 1 from public.clientes_mesa
        where tipo_punto = v_tipo
          and mesa_numero = p_numero
          and productos is not null
          and productos <> '{}'::jsonb
    ) then
        raise exception 'no hay consumo pendiente para este punto';
    end if;

    insert into public.facturas (id, ultimo_numero, updated_at)
    values (1, 1, now())
    on conflict (id) do update
    set ultimo_numero = public.facturas.ultimo_numero + 1,
        updated_at = now()
    returning ultimo_numero into v_factura;

    insert into public.ventas (
        numero_factura, factura, mesa_numero, tipo_punto, punto_numero, ocupacion_id,
        cliente, tipo, total, fecha, hora, "timestamp",
        productos_por_cliente, productos, idempotency_key, observacion
    )
    values (
        v_factura, v_factura, p_numero, v_tipo, p_numero, v_ocupacion,
        coalesce(p_cliente, 0), coalesce(nullif(trim(p_tipo_cobro), ''), 'Cobro'),
        p_total, now(), to_char(now(), 'HH24:MI:SS'), now(),
        coalesce(p_productos_por_cliente, '{}'::jsonb), coalesce(p_productos, '{}'::jsonb),
        p_idempotency_key, v_observacion
    )
    returning * into v_venta;

    if coalesce(p_cliente, 0) > 0 then
        delete from public.clientes_mesa
        where tipo_punto = v_tipo and mesa_numero = p_numero and numero_cliente = p_cliente;
    else
        delete from public.clientes_mesa
        where tipo_punto = v_tipo and mesa_numero = p_numero;
    end if;

    select exists (
        select 1 from public.clientes_mesa
        where tipo_punto = v_tipo
          and mesa_numero = p_numero
          and productos is not null
          and productos <> '{}'::jsonb
    ) into v_quedan_consumos;

    if v_quedan_consumos then
        perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'ocupada', v_ocupacion);
    else
        update public.ocupaciones_mesa
        set estado = 'cerrada', fin = now(), updated_at = now()
        where id = v_ocupacion;
        perform public.cirigua_sync_punto_estado(v_tipo, p_numero, 'libre', null);
    end if;

    return jsonb_build_object('ok', true, 'idempotente', false, 'venta', to_jsonb(v_venta));
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
begin
    return public.registrar_venta_punto_cirigua(
        'mesa', p_mesa, p_cliente, p_tipo, p_total,
        p_productos_por_cliente, p_productos, p_idempotency_key
    );
end;
$$;

create or replace function public.crear_barra_dinamica_cirigua()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_numero integer;
begin
    perform pg_advisory_xact_lock(hashtext('cirigua:crear_barra_dinamica'));

    select n into v_numero
    from generate_series(6, 500) as n
    where not exists (
        select 1 from public.puntos_atencion p
        where p.tipo = 'barra'
          and p.numero = n
          and p.visible = true
    )
    order by n
    limit 1;

    if v_numero is null then
        raise exception 'no se pudo asignar barra dinamica';
    end if;

    insert into public.puntos_atencion (tipo, numero, estado, fijo, visible, updated_at)
    values ('barra', v_numero, 'libre', false, true, now())
    on conflict (tipo, numero) do update
    set estado = 'libre',
        ocupacion_id = null,
        visible = true,
        updated_at = now();

    return jsonb_build_object('ok', true, 'tipo', 'barra', 'numero', v_numero);
end;
$$;

grant select, insert, update on public.puntos_atencion to authenticated;
revoke delete, truncate, references, trigger on public.puntos_atencion from authenticated;
revoke all on public.puntos_atencion from anon;

grant execute on function public.cirigua_normalizar_tipo_punto(text) to authenticated;
grant execute on function public.cirigua_sync_punto_estado(text, integer, text, uuid) to authenticated;
grant execute on function public.cirigua_ocupacion_punto_abierta(text, integer) to authenticated;
grant execute on function public.actualizar_estado_punto_cirigua(text, integer) to authenticated;
grant execute on function public.liberar_punto_cirigua(text, integer) to authenticated;
grant execute on function public.guardar_pedido_punto_cirigua(text, integer, integer, jsonb) to authenticated;
grant execute on function public.agregar_producto_punto_cirigua(text, integer, integer, text, numeric, integer) to authenticated;
grant execute on function public.quitar_producto_punto_cirigua(text, integer, integer, text, integer) to authenticated;
grant execute on function public.guardar_observacion_ocupacion_cirigua(text, integer, text) to authenticated;
grant execute on function public.registrar_venta_punto_cirigua(text, integer, integer, text, numeric, jsonb, jsonb, text) to authenticated;
grant execute on function public.crear_barra_dinamica_cirigua() to authenticated;

revoke execute on function public.cirigua_normalizar_tipo_punto(text) from public, anon;
revoke execute on function public.cirigua_sync_punto_estado(text, integer, text, uuid) from public, anon;
revoke execute on function public.cirigua_ocupacion_punto_abierta(text, integer) from public, anon;
revoke execute on function public.actualizar_estado_punto_cirigua(text, integer) from public, anon;
revoke execute on function public.liberar_punto_cirigua(text, integer) from public, anon;
revoke execute on function public.guardar_pedido_punto_cirigua(text, integer, integer, jsonb) from public, anon;
revoke execute on function public.agregar_producto_punto_cirigua(text, integer, integer, text, numeric, integer) from public, anon;
revoke execute on function public.quitar_producto_punto_cirigua(text, integer, integer, text, integer) from public, anon;
revoke execute on function public.guardar_observacion_ocupacion_cirigua(text, integer, text) from public, anon;
revoke execute on function public.registrar_venta_punto_cirigua(text, integer, integer, text, numeric, jsonb, jsonb, text) from public, anon;
revoke execute on function public.crear_barra_dinamica_cirigua() from public, anon;

alter table public.puntos_atencion enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'puntos_atencion'
          and policyname = 'puntos_atencion_auth_select'
    ) then
        create policy puntos_atencion_auth_select
        on public.puntos_atencion for select to authenticated using (true);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'puntos_atencion'
          and policyname = 'puntos_atencion_auth_insert'
    ) then
        create policy puntos_atencion_auth_insert
        on public.puntos_atencion for insert to authenticated with check (true);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'puntos_atencion'
          and policyname = 'puntos_atencion_auth_update'
    ) then
        create policy puntos_atencion_auth_update
        on public.puntos_atencion for update to authenticated using (true) with check (true);
    end if;
end $$;
