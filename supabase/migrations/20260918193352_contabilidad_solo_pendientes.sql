-- Accounting is an explicit, restrictive boundary; other roles keep existing policies.
create or replace function private.es_contabilidad() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and lower(btrim(rol))='contabilidad');
$$;
revoke all on function private.es_contabilidad() from public,anon;
grant execute on function private.es_contabilidad() to authenticated;

do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname not in ('profiles','solicitudes_depositos','historial_solicitudes_depositos') loop
  execute format('create policy contabilidad_bandeja_exclusiva on public.%I as restrictive for all to authenticated using (not (select private.es_contabilidad())) with check (not (select private.es_contabilidad()))',t.relname);
 end loop;
end $$;
create policy contabilidad_bandeja_perfil_propio on public.profiles as restrictive for select to authenticated
 using (not (select private.es_contabilidad()) or id=(select auth.uid()));
create policy contabilidad_perfil_no_insertar on public.profiles as restrictive for insert to authenticated with check (not (select private.es_contabilidad()));
create policy contabilidad_perfil_no_editar on public.profiles as restrictive for update to authenticated using (not (select private.es_contabilidad())) with check (not (select private.es_contabilidad()));
create policy contabilidad_perfil_no_eliminar on public.profiles as restrictive for delete to authenticated using (not (select private.es_contabilidad()));
create policy contabilidad_solicitudes_pendientes on public.solicitudes_depositos as restrictive for select to authenticated
 using (not (select private.es_contabilidad()) or (estado in ('pendiente','en_proceso','pagado') and (select private.current_profile_role())='contabilidad'));
create policy contabilidad_historial_pendiente on public.historial_solicitudes_depositos as restrictive for select to authenticated
 using (not (select private.es_contabilidad()) or exists(select 1 from public.solicitudes_depositos s where s.id=solicitud_id and s.estado in ('pendiente','en_proceso','pagado')));
-- No direct writes; the existing RPC is atomic, validates receipts, balance and ownership.
do $$ declare t text; begin
 foreach t in array array['solicitudes_depositos','historial_solicitudes_depositos'] loop
  execute format('create policy contabilidad_no_insertar on public.%I as restrictive for insert to authenticated with check (not (select private.es_contabilidad()))',t);
  execute format('create policy contabilidad_no_editar on public.%I as restrictive for update to authenticated using (not (select private.es_contabilidad())) with check (not (select private.es_contabilidad()))',t);
  execute format('create policy contabilidad_no_eliminar on public.%I as restrictive for delete to authenticated using (not (select private.es_contabilidad()))',t);
 end loop;
end $$;
-- Project only identification needed in the queue, never the complete contract.
create function private.contratos_depositos_pendientes()
returns table(id uuid,numero_contrato text,cliente_nombre text,sede text)
language sql stable security definer set search_path='' as $$
 select c.id,c.numero_contrato::text,c.cliente_nombre::text,c.sede::text from public.contratos c
 where auth.uid() is not null and private.es_contabilidad()
 and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true))
 and exists(select 1 from public.solicitudes_depositos s where s.contrato_id=c.id and s.estado in ('pendiente','en_proceso','pagado')) order by c.id;
$$;
revoke all on function private.contratos_depositos_pendientes() from public,anon;
grant execute on function private.contratos_depositos_pendientes() to authenticated;
create function public.contratos_depositos_pendientes()
returns table(id uuid,numero_contrato text,cliente_nombre text,sede text)
language sql stable security invoker set search_path='' as $$ select * from private.contratos_depositos_pendientes(); $$;
revoke all on function public.contratos_depositos_pendientes() from public,anon;
grant execute on function public.contratos_depositos_pendientes() to authenticated;

-- Restrict privileged operations without replacing their existing payment logic.
do $$ declare definition text; needle text:=E'if not found then raise exception ''Perfil no autorizado.''; end if;'; begin
 select pg_get_functiondef('private.gestionar_deposito(text,jsonb)'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Unexpected deposit function; review before changing authorization.'; end if;
 definition:=replace(definition,needle,needle||E'\n if private.es_contabilidad() and (p_accion is null or p_accion not in (''proceso'',''pagar'',''cancelar'')) then raise exception ''Contabilidad solo puede procesar devoluciones pendientes.'' using errcode=''42501''; end if;');
 execute definition;
end $$;
-- Expired/inactive Accounting sessions must not bypass old discount guards.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validar_y_quemar_codigo' loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'private.current_profile_role() = ''contabilidad''','private.es_contabilidad()');
  execute definition;
 end loop;
end $$;
-- Receipts are limited to pending requests. Upload only the assigned request's payment receipt.
create policy contabilidad_comprobantes_pendientes on storage.objects as restrictive for select to authenticated
using (not (select private.es_contabilidad()) or (bucket_id='comprobantes_depositos' and exists(select 1 from public.solicitudes_depositos s where s.contrato_id::text=split_part(name,'/',1) and s.estado in ('pendiente','en_proceso','pagado'))));
create policy contabilidad_comprobante_salida on storage.objects as restrictive for insert to authenticated
with check (not (select private.es_contabilidad()) or (bucket_id='comprobantes_depositos' and exists(select 1 from public.solicitudes_depositos s where s.contrato_id::text=split_part(name,'/',1) and s.id::text=split_part(name,'/',2) and s.estado='en_proceso' and s.responsable_id=(select auth.uid()))));
create policy contabilidad_no_modificar_comprobantes on storage.objects as restrictive for update to authenticated using (not (select private.es_contabilidad())) with check (not (select private.es_contabilidad()));
create policy contabilidad_no_borrar_comprobantes on storage.objects as restrictive for delete to authenticated using (not (select private.es_contabilidad()));

-- Existing receipt policies join contracts, which Accounting can no longer read.
-- These grants are scoped to the pending queue and intersect restrictive policies.
create policy contabilidad_leer_comprobante_pendiente on storage.objects for select to authenticated
using ((select private.es_contabilidad()) and bucket_id='comprobantes_depositos' and exists(select 1 from public.solicitudes_depositos s where s.contrato_id::text=split_part(name,'/',1) and s.estado in ('pendiente','en_proceso','pagado')));
create policy contabilidad_subir_comprobante_asignado on storage.objects for insert to authenticated
with check ((select private.es_contabilidad()) and bucket_id='comprobantes_depositos' and exists(select 1 from public.solicitudes_depositos s where s.contrato_id::text=split_part(name,'/',1) and s.id::text=split_part(name,'/',2) and s.estado='en_proceso' and s.responsable_id=(select auth.uid())));
