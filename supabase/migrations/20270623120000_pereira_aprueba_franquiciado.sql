-- Stores whose accounting is handled by their franquiciado (Pereira: it does not pay the general accountant): the franquiciado of
-- that store approves its accounting items (payment cancellations, accounting alerts, corrections on closed days, transfer deposit
-- returns). private.lider_contable now also answers true for him, with no end date; the temporary store-leader rule is unchanged.
-- Reversible: set sedes.contabilidad_franquiciado=false (the column can stay) and re-run 20270621120000 for private.lider_contable.
alter table public.sedes add column if not exists contabilidad_franquiciado boolean not null default false;
update public.sedes set contabilidad_franquiciado=true where nombre='Pereira';

create or replace function private.lider_contable(p_sede uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_sede is null or p_sede=any(coalesce(private.sedes_usuario(auth.uid()),'{}'))) and (
  ((now() at time zone 'America/Bogota')::date<='2026-12-10' and 'asesora_lider'=any(coalesce(private.roles_usuario(auth.uid()),'{}')))
  or ('franquiciado'=any(coalesce(private.roles_usuario(auth.uid()),'{}')) and exists(select 1 from public.sedes s
       where s.contabilidad_franquiciado and s.id=any(coalesce(private.sedes_usuario(auth.uid()),'{}')) and (p_sede is null or s.id=p_sede))));
$$;

-- Stores where the current user approves accounting items (the deposit-return screen uses it to show «Tomar solicitud» / «Pagar»).
create or replace function public.aprobador_contable_sedes() returns uuid[] language sql stable security definer set search_path='' as $$
 select case when public.es_admin() or private.es_finanzas() then (select array_agg(id) from public.sedes)
  else coalesce((select array_agg(s.id) from public.sedes s where private.lider_contable(s.id)),'{}') end;
$$;
grant execute on function public.aprobador_contable_sedes() to authenticated;

do $mig$
declare d text:=pg_get_functiondef('private.gestionar_deposito(text,jsonb)'::regprocedure);
 a text:='if lower(u.rol) not in (''admin'',''contabilidad'') then raise exception ''Solo Contabilidad puede gestionar el pago de transferencias.''; end if;';
begin
 if position('not private.lider_contable(c.sede_id) then raise exception ''Solo Contabilidad puede gestionar' in d)>0 then return; end if;
 if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'gestionar_deposito: punto no encontrado'; end if;
 d:=replace(d,a,'if lower(u.rol) not in (''admin'',''contabilidad'') and not private.lider_contable(c.sede_id) then raise exception ''Solo Contabilidad (o quien aprueba lo contable de la sede) puede gestionar el pago de transferencias.''; end if;');
 execute d;
end $mig$;
