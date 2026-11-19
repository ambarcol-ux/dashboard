-- Facturación por sede: «column reference "activo" is ambiguous» (the RETURNS TABLE column clashed with profiles.activo). Same signature, qualified columns.
-- Reversa: no aplica (la versión anterior fallaba siempre).
create or replace function public.listar_configuracion_siigo()
 returns table(sede_id uuid, usuario_api text, partner_id text, producto_codigo text, producto_nombre text, activo boolean, access_key_configurada boolean, updated_at timestamptz)
 language plpgsql security definer set search_path to ''
as $function$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and lower(coalesce(p.rol,''))='admin' and coalesce(p.activo,true)) then raise exception 'Solo administrador.' using errcode='42501'; end if;
 return query select c.sede_id,c.usuario_api,c.partner_id,c.producto_codigo,c.producto_nombre,c.activo,(nullif(c.access_key,'') is not null),c.updated_at from private.credenciales_siigo c;
end $function$;
