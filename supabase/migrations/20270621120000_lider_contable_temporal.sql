-- Temporary accounting powers for the store leaders (asesora_lider) of their OWN store until 2026-12-10 (owner's decision, to catch up):
-- gastos and pagos fijos panels, corrections on closed cash days, accounting alerts (see and mark «Ya lo hice en Siigo») and approving
-- payment cancellations requested by someone else. Banks, inter-store money, partners' loans and the income statement stay with
-- administration/accounting. On 2026-12-11 a one-shot cron removes the two panel permissions; the function stops by date by itself.
-- Revert: drop the private.lider_contable calls (re-run the previous definitions) and set the two roles_permisos rows activo=false.

create or replace function private.lider_contable(p_sede uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (now() at time zone 'America/Bogota')::date<='2026-12-10'
  and 'asesora_lider'=any(coalesce(private.roles_usuario(auth.uid()),'{}'))
  and (p_sede is null or p_sede=any(coalesce(private.sedes_usuario(auth.uid()),'{}')));
$$;
revoke all on function private.lider_contable(uuid) from public,anon;

insert into public.roles_permisos(rol_id,permiso,activo) values('asesora_lider','panel.gastos',true),('asesora_lider','panel.pagos_fijos',true)
 on conflict(rol_id,permiso) do update set activo=true;

do $mig$
declare d text;
begin
 -- 1. Corrections on closed cash days of her store.
 d:=pg_get_functiondef('private.puede_corregir(uuid,date)'::regprocedure);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'if public.es_admin() or ''contabilidad''=any(roles) then return; end if;','if public.es_admin() or ''contabilidad''=any(roles) or private.lider_contable(p_sede) then return; end if;');
  if position('lider_contable' in d)=0 then raise exception 'parche no aplicado'; end if;
  execute d; end if;
 -- 2. Accounting alerts of her store.
 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'if auth.uid() is null or not (todo or franq) then return; end if;','if auth.uid() is null or not (todo or franq or private.lider_contable(null)) then return; end if;');
  if position('lider_contable' in d)=0 then raise exception 'parche no aplicado'; end if;
  execute d; end if;
 d:=pg_get_functiondef('public.novedad_resolver(text)'::regprocedure);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'if not (public.es_admin() or private.es_finanzas()) then','if not (public.es_admin() or private.es_finanzas() or (p_clave like ''doc:%'' and private.lider_contable((select x.sede_id from public.siigo_documentos x where x.id::text=substr(p_clave,5))))) then');
  if position('lider_contable' in d)=0 then raise exception 'parche no aplicado'; end if;
  execute d; end if;
 -- 3. Payment cancellations of her store requested by someone else.
 d:=pg_get_functiondef('public.anulaciones_pago_pendientes()'::regprocedure);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'select case when not (public.es_admin() or private.es_finanzas()) then','select case when not (public.es_admin() or private.es_finanzas() or private.lider_contable(null)) then');
  d:=replace(d,'where a.estado=''pendiente''),''[]''::jsonb) end;','where a.estado=''pendiente'' and (public.es_admin() or private.es_finanzas() or (private.lider_contable(c.sede_id) and a.solicitado_por is distinct from auth.uid()))),''[]''::jsonb) end;');
  if position('solicitado_por is distinct' in d)=0 then raise exception 'parche pendientes no aplicado'; end if;
  if position('lider_contable' in d)=0 then raise exception 'parche no aplicado'; end if;
  execute d; end if;
 d:=pg_get_functiondef('public.anulaciones_pago_resolver(uuid,boolean,text)'::regprocedure);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'if not (public.es_admin() or private.es_finanzas()) then raise exception ''Solo administración o contabilidad.'' using errcode=''42501''; end if;
 select * into a from public.anulaciones_pago where id=p_id for update;',
  'select * into a from public.anulaciones_pago where id=p_id for update;
 if not (public.es_admin() or private.es_finanzas() or (a.solicitado_por is distinct from auth.uid() and private.lider_contable((select c.sede_id from public.pagos p join public.contratos c on c.id=p.contrato_id where p.id=a.pago_id)))) then raise exception ''Solo administración, contabilidad o la líder de la sede (sin aprobar sus propias solicitudes).'' using errcode=''42501''; end if;');
  if position('lider_contable' in d)=0 then raise exception 'parche no aplicado'; end if;
  execute d; end if;
end $mig$;

select cron.schedule('lider-contable-fin','5 5 11 12 *',$job$
 update public.roles_permisos set activo=false where rol_id='asesora_lider' and permiso in ('panel.gastos','panel.pagos_fijos');
 select cron.unschedule('lider-contable-fin');
$job$);
