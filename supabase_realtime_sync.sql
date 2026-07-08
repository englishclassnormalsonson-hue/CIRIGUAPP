-- CIRIGUAPP - sincronizacion Realtime entre dispositivos
-- Ejecutar en el SQL Editor de Supabase si Realtime no emite cambios.
-- No borra datos. No cambia RLS. No concede permisos a anon.

alter table public.puntos_atencion replica identity full;
alter table public.clientes_mesa replica identity full;
alter table public.ocupaciones_mesa replica identity full;

do $$
declare
    tabla text;
begin
    if exists (
        select 1 from pg_publication
        where pubname = 'supabase_realtime'
    ) then
        foreach tabla in array array[
            'puntos_atencion',
            'clientes_mesa',
            'ocupaciones_mesa',
            'mesas',
            'productos',
            'categorias'
        ] loop
            if to_regclass('public.' || tabla) is not null
               and not exists (
                    select 1
                    from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public'
                      and tablename = tabla
               ) then
                execute format(
                    'alter publication supabase_realtime add table public.%I',
                    tabla
                );
            end if;
        end loop;
    end if;
end $$;
