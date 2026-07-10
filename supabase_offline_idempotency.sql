-- CIRIGUAPP - idempotencia para operaciones offline de pedidos
-- Ejecutar en el SQL editor del proyecto Supabase.
-- No borra datos. No modifica ventas, facturas, cierres, gastos, productos ni categorias.

create table if not exists public.pedido_operaciones_idempotencia (
    operation_id text primary key,
    user_id uuid not null default auth.uid(),
    accion text not null check (accion in ('agregar_producto', 'quitar_producto')),
    tipo_punto text not null check (tipo_punto in ('mesa', 'barra')),
    punto_numero integer not null,
    numero_cliente integer not null,
    request_hash text not null,
    resultado jsonb,
    estado text not null default 'procesando' check (estado in ('procesando', 'completada', 'error')),
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.pedido_operaciones_idempotencia enable row level security;

drop policy if exists pedido_operaciones_idem_authenticated_select on public.pedido_operaciones_idempotencia;
drop policy if exists pedido_operaciones_idem_authenticated_insert on public.pedido_operaciones_idempotencia;
drop policy if exists pedido_operaciones_idem_authenticated_update on public.pedido_operaciones_idempotencia;

create policy pedido_operaciones_idem_authenticated_select
on public.pedido_operaciones_idempotencia
for select
to authenticated
using (auth.uid() = user_id);

create policy pedido_operaciones_idem_authenticated_insert
on public.pedido_operaciones_idempotencia
for insert
to authenticated
with check (auth.uid() = user_id);

create policy pedido_operaciones_idem_authenticated_update
on public.pedido_operaciones_idempotencia
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.pedido_operaciones_idempotencia from public, anon;
grant select, insert, update on public.pedido_operaciones_idempotencia to authenticated;

create or replace function public.cirigua_request_hash_operacion_pedido(
    p_accion text,
    p_tipo text,
    p_numero integer,
    p_cliente integer,
    p_nombre text,
    p_precio numeric,
    p_cantidad integer
)
returns text
language sql
stable
set search_path = public
as $$
    select md5(
        jsonb_build_object(
            'accion', p_accion,
            'tipo', public.cirigua_normalizar_tipo_punto(p_tipo),
            'numero', p_numero,
            'cliente', p_cliente,
            'nombre', coalesce(p_nombre, ''),
            'precio', coalesce(p_precio, 0),
            'cantidad', coalesce(p_cantidad, 0)
        )::text
    );
$$;

create or replace function public.agregar_producto_punto_cirigua_idem(
    p_tipo text,
    p_numero integer,
    p_cliente integer,
    p_nombre text,
    p_precio numeric,
    p_cantidad integer default 1,
    p_operation_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_operation_id text := nullif(trim(coalesce(p_operation_id, '')), '');
    v_hash text;
    v_insertadas integer := 0;
    v_existente record;
    v_resultado jsonb;
begin
    if v_operation_id is null or length(v_operation_id) < 12 then
        raise exception 'operation_id invalido';
    end if;

    v_hash := public.cirigua_request_hash_operacion_pedido(
        'agregar_producto',
        v_tipo,
        p_numero,
        p_cliente,
        p_nombre,
        p_precio,
        p_cantidad
    );

    insert into public.pedido_operaciones_idempotencia (
        operation_id,
        user_id,
        accion,
        tipo_punto,
        punto_numero,
        numero_cliente,
        request_hash
    )
    values (
        v_operation_id,
        auth.uid(),
        'agregar_producto',
        v_tipo,
        p_numero,
        p_cliente,
        v_hash
    )
    on conflict (operation_id) do nothing;

    get diagnostics v_insertadas = row_count;

    if v_insertadas = 0 then
        select *
        into v_existente
        from public.pedido_operaciones_idempotencia
        where operation_id = v_operation_id
        for update;

        if not found then
            raise exception 'operacion idempotente no encontrada';
        end if;

        if v_existente.request_hash <> v_hash then
            raise exception 'operation_id reutilizado con datos distintos';
        end if;

        if v_existente.estado = 'completada' and v_existente.resultado is not null then
            return v_existente.resultado;
        end if;

        raise exception 'operacion pendiente de confirmacion, reintente';
    end if;

    v_resultado := public.agregar_producto_punto_cirigua(
        v_tipo,
        p_numero,
        p_cliente,
        p_nombre,
        p_precio,
        p_cantidad
    );

    update public.pedido_operaciones_idempotencia
    set resultado = v_resultado,
        estado = 'completada',
        error = null,
        updated_at = now()
    where operation_id = v_operation_id;

    return v_resultado;
exception
    when others then
        update public.pedido_operaciones_idempotencia
        set estado = 'error',
            error = sqlerrm,
            updated_at = now()
        where operation_id = v_operation_id
          and auth.uid() = user_id;
        raise;
end;
$$;

create or replace function public.quitar_producto_punto_cirigua_idem(
    p_tipo text,
    p_numero integer,
    p_cliente integer,
    p_nombre text,
    p_cantidad integer default 1,
    p_operation_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo text := public.cirigua_normalizar_tipo_punto(p_tipo);
    v_operation_id text := nullif(trim(coalesce(p_operation_id, '')), '');
    v_hash text;
    v_insertadas integer := 0;
    v_existente record;
    v_resultado jsonb;
begin
    if v_operation_id is null or length(v_operation_id) < 12 then
        raise exception 'operation_id invalido';
    end if;

    v_hash := public.cirigua_request_hash_operacion_pedido(
        'quitar_producto',
        v_tipo,
        p_numero,
        p_cliente,
        p_nombre,
        null,
        p_cantidad
    );

    insert into public.pedido_operaciones_idempotencia (
        operation_id,
        user_id,
        accion,
        tipo_punto,
        punto_numero,
        numero_cliente,
        request_hash
    )
    values (
        v_operation_id,
        auth.uid(),
        'quitar_producto',
        v_tipo,
        p_numero,
        p_cliente,
        v_hash
    )
    on conflict (operation_id) do nothing;

    get diagnostics v_insertadas = row_count;

    if v_insertadas = 0 then
        select *
        into v_existente
        from public.pedido_operaciones_idempotencia
        where operation_id = v_operation_id
        for update;

        if not found then
            raise exception 'operacion idempotente no encontrada';
        end if;

        if v_existente.request_hash <> v_hash then
            raise exception 'operation_id reutilizado con datos distintos';
        end if;

        if v_existente.estado = 'completada' and v_existente.resultado is not null then
            return v_existente.resultado;
        end if;

        raise exception 'operacion pendiente de confirmacion, reintente';
    end if;

    v_resultado := public.quitar_producto_punto_cirigua(
        v_tipo,
        p_numero,
        p_cliente,
        p_nombre,
        p_cantidad
    );

    update public.pedido_operaciones_idempotencia
    set resultado = v_resultado,
        estado = 'completada',
        error = null,
        updated_at = now()
    where operation_id = v_operation_id;

    return v_resultado;
exception
    when others then
        update public.pedido_operaciones_idempotencia
        set estado = 'error',
            error = sqlerrm,
            updated_at = now()
        where operation_id = v_operation_id
          and auth.uid() = user_id;
        raise;
end;
$$;

grant execute on function public.cirigua_request_hash_operacion_pedido(text, text, integer, integer, text, numeric, integer) to authenticated;
grant execute on function public.agregar_producto_punto_cirigua_idem(text, integer, integer, text, numeric, integer, text) to authenticated;
grant execute on function public.quitar_producto_punto_cirigua_idem(text, integer, integer, text, integer, text) to authenticated;

revoke execute on function public.cirigua_request_hash_operacion_pedido(text, text, integer, integer, text, numeric, integer) from public, anon;
revoke execute on function public.agregar_producto_punto_cirigua_idem(text, integer, integer, text, numeric, integer, text) from public, anon;
revoke execute on function public.quitar_producto_punto_cirigua_idem(text, integer, integer, text, integer, text) from public, anon;
