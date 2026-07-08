-- CIRIGUAPP - permiso minimo para eliminar productos no historicos
-- Ejecutar en Supabase SQL Editor del proyecto CIRIGUAPP.
-- No borra datos. Solo permite DELETE sobre productos al rol authenticated.

grant delete on public.productos to authenticated;

drop policy if exists cirigua_auth_delete on public.productos;

create policy cirigua_auth_delete
on public.productos
for delete
to authenticated
using (true);
