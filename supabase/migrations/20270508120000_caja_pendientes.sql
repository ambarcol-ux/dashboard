-- Cierres de caja › «Pendientes de la sede»: what the store still has to do, in plain words, so the advisor does not have to guess:
-- days with movements not closed, bank deposit pending (cash cap), outflows not registered for Siigo or with Siigo error, payments of
-- the day without support, contract payments of closed days outside the cash register, receipts that did not reach the customer, and
-- annulments waiting for approval. Data: 2026-11-20 the days of Bogotá, Barranquilla and Villavicencio before that date were closed
-- administratively («Cierre administrativo de puesta al día», caja_cierres.totales.puesta_al_dia) with the expected cash; the first real
-- count shows any accumulated difference. Reversible: drop function public.caja_pendientes.

create or replace function public.caja_pendientes(p_sede uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare hoy date:=private.caja_hoy(); ini date; r jsonb:='[]'::jsonb; n int; v numeric; d date; siigo boolean;
begin
 if p_sede is null or not private.caja_ver(p_sede) then return '[]'::jsonb; end if;
 ini:=coalesce(private.caja_inicio(p_sede),'-infinity'::date); siigo:=private.siigo_activo(p_sede);
 -- Days before today with movements and no closing.
 select count(distinct m.fecha),min(m.fecha) into n,d from public.caja_movimientos m where m.sede_id=p_sede and m.anulado_at is null and m.fecha<hoy and m.fecha>=ini
  and not private.caja_dia_cerrado(p_sede,m.fecha);
 if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','alta','texto',format('Cerrar la caja de %s día(s) pendiente(s), desde el %s, con el conteo por billetes.',n,to_char(d,'DD/MM')),'fecha',d)); end if;
 -- Bank deposit pending because of the cash cap.
 v:=private.caja_exceso_sin_consignar(p_sede,hoy);
 if v>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','alta','texto',format('Consignar al banco al menos %s y registrarlo como «Consignación a banco» con el comprobante: el cajón pasó el tope.','$'||to_char(v,'FM999G999G999')))); end if;
 -- Payments of today without support.
 n:=jsonb_array_length(coalesce(private.pagos_sin_soporte(p_sede,hoy),'[]'::jsonb));
 if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','alta','texto',format('Adjuntar el soporte de %s abono(s) de hoy (sin eso no se puede cerrar).',n),'fecha',hoy)); end if;
 if siigo then
  -- Outflows of the last 31 days not registered for Siigo (bank deposits and payroll do not go).
  select count(*),min(m.fecha) into n,d from public.caja_movimientos m where m.sede_id=p_sede and m.tipo='egreso' and m.anulado_at is null and m.origen is null
   and m.categoria not in ('Consignación a banco','Nómina / anticipos') and m.fecha>=greatest(ini,hoy-31) and m.fecha>=date '2026-11-20'
   and not exists(select 1 from public.siigo_documentos x where x.origen='caja' and x.origen_id=m.id and x.tipo='compra' and x.estado<>'anulado');
  if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','media','texto',format('Registrar en Siigo %s gasto(s) de caja con su cuenta contable (botón «Siigo» en cada egreso).',n),'fecha',d)); end if;
  select count(*) into n from public.siigo_documentos x where x.sede_id=p_sede and x.tipo='compra' and x.estado='error';
  if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','alta','texto',format('Corregir %s gasto(s) que Siigo rechazó (botón «Corregir» en el egreso).',n))); end if;
 end if;
 -- Contract payments of closed days that are not in the cash register.
 select count(*) into n from jsonb_array_elements(coalesce(private.caja_abonos_pendientes(),'[]'::jsonb)) x where (x->>'sede_id')::uuid=p_sede;
 if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','media','texto',format('%s abono(s) de días ya cerrados no están en la caja: avisa a administración para reabrir ese día.',n))); end if;
 -- Receipts that did not reach the customer.
 select count(*) into n from public.recibos_clienta x join public.contratos c on c.id=x.contrato_id where c.sede_id=p_sede and x.enviado_at is null and x.error is not null and x.created_at>now()-interval '7 days';
 if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','baja','texto',format('%s recibo(s) no le llegaron a la clienta (sin WhatsApp ni correo): actualiza su teléfono o correo en el contrato.',n))); end if;
 -- Annulments waiting for approval.
 select count(*) into n from public.anulaciones_pago a join public.pagos p on p.id=a.pago_id join public.contratos c on c.id=p.contrato_id where c.sede_id=p_sede and a.estado='pendiente';
 if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','baja','texto',format('%s anulación(es) de abono esperando aprobación de administración.',n))); end if;
 return r;
end $$;
revoke all on function public.caja_pendientes(uuid) from public, anon;
grant execute on function public.caja_pendientes(uuid) to authenticated;
