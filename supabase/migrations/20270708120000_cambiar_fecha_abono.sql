-- «Cambiar fecha del abono»: the store leader (or the franquiciado who approves accounting, or administration) moves a payment to the
-- day the money really came in, without annulling it. The cash movement moves too; closed cash days are refused. If the receipt is
-- already in Siigo, an «Acción pendiente en Siigo» asks Contabilidad to change its date there; a receipt not sent yet goes with the new date.
-- Reversible: the functions can stay unused.
create or replace function private.cambiar_fecha_abono(p_pago uuid,p_fecha date,p_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pg public.pagos; c record; cm record; m text:=btrim(coalesce(p_motivo,'')); antes date; hoy date:=(now() at time zone 'America/Bogota')::date; doc record;
begin
 select * into pg from public.pagos where id=p_pago for update;
 if pg.id is null or pg.anulado_at is not null then raise exception 'Abono no encontrado o anulado.'; end if;
 select id,sede_id,numero_contrato into c from public.contratos where id=pg.contrato_id;
 if not private.puede_rebajar_deposito(c.sede_id) then raise exception 'Solo la líder de la sede, el franquiciado que aprueba lo contable o administración cambian la fecha de un abono.' using errcode='42501'; end if;
 if length(m)<5 then raise exception 'Escribe el motivo (mínimo 5 caracteres).'; end if;
 if p_fecha is null or p_fecha>hoy then raise exception 'La fecha no puede ser futura.'; end if;
 antes:=(pg.fecha_pago at time zone 'UTC')::date;
 if antes=p_fecha then raise exception 'El abono ya tiene esa fecha.'; end if;
 select id,sede_id,fecha into cm from public.caja_movimientos where origen='pago' and origen_id=pg.id and anulado_at is null limit 1 for update;
 for doc in select unnest(array[antes,p_fecha]) f loop
  if private.caja_dia_cerrado(coalesce(cm.sede_id,c.sede_id),doc.f) and (private.caja_inicio(coalesce(cm.sede_id,c.sede_id)) is null or doc.f>=private.caja_inicio(coalesce(cm.sede_id,c.sede_id))) then
   raise exception 'La caja del % ya está cerrada: pide reabrir ese día antes de mover el abono.',to_char(doc.f,'DD/MM/YYYY'); end if;
 end loop;
 update public.pagos set fecha_pago=(p_fecha::text||' 00:00:00+00')::timestamptz,updated_at=now() where id=pg.id;
 if cm.id is not null then update public.caja_movimientos set fecha=p_fecha where id=cm.id; end if;
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo)
  values(c.id,auth.uid(),m,format('Fecha del abono de $%s: %s → %s',to_char(pg.valor_pagado,'FM999G999G999'),to_char(antes,'DD/MM/YYYY'),to_char(p_fecha,'DD/MM/YYYY')),pg.valor_pagado,pg.valor_pagado);
 -- Siigo: a receipt still in the queue goes with the new date; one already sent becomes a pending action for Contabilidad.
 update public.siigo_documentos set datos=jsonb_set(datos,'{fecha}',to_jsonb(p_fecha::text)),updated_at=now()
  where origen_id=pg.id and tipo='recibo_caja' and estado in ('pendiente','error');
 select siigo_numero,sede_id into doc from public.siigo_documentos where origen_id=pg.id and tipo='recibo_caja' and estado='enviado' limit 1;
 if doc.siigo_numero is not null then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,estado,error,siigo_numero,creado_por)
  values(doc.sede_id,'recibo_caja','cambio_fecha_abono',pg.id,c.id,jsonb_build_object('fecha',p_fecha,'antes',antes,'valor',pg.valor_pagado),'anulado',
   format('Cambiar en Siigo la fecha de %s del %s al %s (la fecha del abono se corrigió en el ERP: %s).',doc.siigo_numero,to_char(antes,'DD/MM/YYYY'),to_char(p_fecha,'DD/MM/YYYY'),left(m,120)),
   doc.siigo_numero,auth.uid()) on conflict do nothing;
 end if;
 return jsonb_build_object('ok',true,'siigo',doc.siigo_numero);
end $$;
revoke all on function private.cambiar_fecha_abono(uuid,date,text) from public,anon;
grant execute on function private.cambiar_fecha_abono(uuid,date,text) to authenticated;
create or replace function public.cambiar_fecha_abono(p_pago uuid,p_fecha date,p_motivo text) returns jsonb language sql set search_path='' as $$ select private.cambiar_fecha_abono(p_pago,p_fecha,p_motivo); $$;
grant execute on function public.cambiar_fecha_abono(uuid,date,text) to authenticated;
-- Stores where the user may change a payment's date (to show the button).
create or replace function public.cambio_fecha_abono_sedes() returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.id),'{}') from public.sedes s where private.puede_rebajar_deposito(s.id);
$$;
grant execute on function public.cambio_fecha_abono_sedes() to authenticated;
