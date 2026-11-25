-- 1) Payments (abonos) and deposit payments/returns can be registered with any past date (not only the last 15 days); future dates
--    and closed cash days are still refused.
-- 2) Deleting a contract: administration, contabilidad, and the store leader or franquiciado of its own store. A contract with money
--    (active payments, a paid deposit or active cash movements) can no longer be deleted: first annul the payments or return the money.
-- Reversible: re-run the previous definitions of these functions.
create or replace function private.puede_eliminar_contrato(p_sede uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_admin() or private.es_finanzas() or (p_sede is not null and p_sede=any(coalesce(private.sedes_usuario(auth.uid()),'{}'))
  and coalesce(private.roles_usuario(auth.uid()),'{}') && array['asesora_lider','franquiciado']);
$$;
revoke all on function private.puede_eliminar_contrato(uuid) from public,anon;
create or replace function public.eliminar_contrato_sedes() returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.id),'{}') from public.sedes s where private.puede_eliminar_contrato(s.id);
$$;
grant execute on function public.eliminar_contrato_sedes() to authenticated;

do $mig$
declare d text;
begin
 d:=pg_get_functiondef('private.registrar_abono_contrato_fecha'::regproc);
 d:=replace(d,'if f<hoy-15 then raise exception ''La fecha del pago solo puede ser de los últimos 15 días (desde el %).'',to_char(hoy-15,''DD/MM/YYYY''); end if;','');
 execute d;
 d:=pg_get_functiondef('private.gestionar_deposito(text,jsonb)'::regprocedure);
 d:=replace(d,' or fecha<(now() at time zone ''America/Bogota'')::date-15 then raise exception ''La fecha del pago debe ser de hoy o de los últimos 15 días.''',' then raise exception ''La fecha del pago no puede ser futura.''');
 d:=replace(d,'fecha<least((s.created_at at time zone ''America/Bogota'')::date,(now() at time zone ''America/Bogota'')::date-15) then raise exception ''Revisa la fecha de pago (puede ser de hasta 15 días atrás).''','false then raise exception ''Revisa la fecha de pago.''');
 execute d;
 d:=pg_get_functiondef('private.eliminar_contrato(uuid,text)'::regprocedure);
 if position('puede_eliminar_contrato' in d)=0 then
  d:=replace(d,'if not public.es_admin() then raise exception ''Solo administración puede eliminar contratos.'' using errcode=''42501''; end if;','');
  d:=replace(d,' if c.id is null then raise exception ''Contrato no encontrado.''; end if;',
   ' if c.id is null then raise exception ''Contrato no encontrado.''; end if;
 if not private.puede_eliminar_contrato(c.sede_id) then raise exception ''Solo la líder o el franquiciado de la sede, contabilidad o administración pueden eliminar contratos.'' using errcode=''42501''; end if;
 if exists(select 1 from public.pagos p where p.contrato_id=c.id and p.anulado_at is null and coalesce(p.valor_pagado,0)>0) or private.deposito_pagado(c.id)>0
  or exists(select 1 from public.caja_movimientos m where m.contrato_id=c.id and m.anulado_at is null) then
  raise exception ''El contrato % tiene dinero registrado (abonos, depósito o movimientos de caja): no se puede eliminar. Anula primero los abonos o devuelve el dinero, o déjalo como cancelado.'',c.numero_contrato;
 end if;');
  if position('puede_eliminar_contrato' in d)=0 then raise exception 'eliminar_contrato: no aplicado'; end if;
  execute d;
 end if;
end $mig$;
