-- Sedes where the current user may register in-store visits (same rule the database applies when saving).
-- Revert: remove public.sedes_primeras_visitas().
create or replace function public.sedes_primeras_visitas() returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.id),'{}') from public.sedes s where s.activo is true and private.acceso_primera_cita(s.id,'presencial')
$$;
revoke all on function public.sedes_primeras_visitas() from public,anon;
grant execute on function public.sedes_primeras_visitas() to authenticated;
