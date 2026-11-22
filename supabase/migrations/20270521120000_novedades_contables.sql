-- «Novedades contables»: alerts that open the exact process to solve them. Administración and contabilidad see every store; the
-- franquiciado sees only his stores. Sources: contracts without their Siigo invoice, invoices whose value differs from the contract,
-- Siigo documents in error, manual actions left for contabilidad in Siigo (receipts to annul, payment forms to fix), payments
-- with method «Otro» or without account, cash-register days not closed and closings with a difference.
-- novedad_resolver marks a manual Siigo action as done (only administración or contabilidad).
-- Reversible: drop function public.novedades_contables(uuid); drop function public.novedad_resolver(text).

create or replace function public.novedades_contables(p_sede uuid default null)
returns table(clave text, tipo text, sede text, sede_id uuid, titulo text, detalle text, href text, responsable text, resoluble boolean, fecha date)
language plpgsql stable security definer set search_path='' as $$
declare todo boolean:=public.es_admin() or private.es_finanzas();
 franq boolean:=exists(select 1 from public.profiles p join public.roles r on r.id=p.rol_id where p.id=auth.uid() and coalesce(p.activo,true) and r.nombre ilike 'franquiciad%');
 sedes uuid[]; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if auth.uid() is null or not (todo or franq) then return; end if;
 sedes:=case when todo then (select array_agg(id) from public.sedes) else coalesce(private.sedes_usuario(auth.uid()),'{}') end;
 if p_sede is not null then sedes:=array(select unnest(sedes) intersect select p_sede); end if;
 return query
 -- 1. Active contract without its invoice in Siigo.
 select 'sinfac:'||k.id, 'Contrato sin factura en Siigo', s.nombre::text, s.id, k.numero_contrato::text,
  format('Valor $%s · saldo $%s · número escrito: %s',to_char(k.valor_total,'FM999G999G999'),to_char(coalesce(k.saldo,0),'FM999G999G999'),coalesce(nullif(k.numero_factura,''),'—')),
  '/dashboard?contratoId='||k.id, 'Contabilidad', false, k.created_at::date
 from public.contratos k join public.sedes s on s.id=k.sede_id
 where k.sede_id=any(sedes) and private.siigo_activo(k.sede_id) and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','borrador','rechazado')
  and (k.fecha_evento>=hoy-30 or coalesce(k.saldo,0)>0) and k.created_at<now()-interval '1 hour'
  and not exists(select 1 from public.siigo_documentos d where d.contrato_id=k.id and d.tipo='factura' and d.estado in ('enviado','pendiente'))
 union all
 -- 2. Invoices whose value differs from the contract (invoices minus credit notes).
 select 'valfac:'||k.id, 'Factura con valor distinto al contrato', s.nombre::text, s.id, k.numero_contrato::text,
  format('Siigo $%s · contrato $%s',to_char(x.facturado,'FM999G999G999'),to_char(x.contrato,'FM999G999G999')),
  '/dashboard?contratoId='||k.id, 'Contabilidad', false, k.created_at::date
 from public.contratos k join public.sedes s on s.id=k.sede_id
 cross join lateral (select greatest(0,coalesce(k.valor_total,0)-coalesce(k.descuento_plan_ahorro,0))+coalesce(k.total_arreglos,0) contrato,
   coalesce((select sum(coalesce((d.respuesta->>'total')::numeric,0)) from public.siigo_documentos d where d.contrato_id=k.id and d.tipo='factura' and d.estado='enviado'),0)
   -coalesce((select sum((d.datos->>'valor')::numeric) from public.siigo_documentos d where d.contrato_id=k.id and d.tipo='nota_credito' and d.estado='enviado'),0) facturado) x
 where k.sede_id=any(sedes) and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','borrador','rechazado') and (k.fecha_evento>=hoy-60 or coalesce(k.saldo,0)>0)
  and exists(select 1 from public.siigo_documentos d where d.contrato_id=k.id and d.tipo='factura' and d.estado='enviado') and abs(x.facturado-x.contrato)>1000
 union all
 -- 3. Siigo documents in error.
 select 'docerr:'||d.id, 'Documento con error en Siigo', s.nombre::text, s.id, coalesce(k.numero_contrato,d.tipo), left(coalesce(d.error,''),220),
  case when d.contrato_id is not null then '/dashboard?contratoId='||d.contrato_id else '/admin/config/siigo' end, 'Contabilidad', false, d.created_at::date
 from public.siigo_documentos d join public.sedes s on s.id=d.sede_id left join public.contratos k on k.id=d.contrato_id
 where d.sede_id=any(sedes) and d.estado='error' and d.updated_at<now()-interval '20 minutes'
 union all
 -- 4. Manual actions left for contabilidad in Siigo (receipt to annul, payment form to fix…).
 select 'doc:'||d.id, 'Acción pendiente en Siigo', s.nombre::text, s.id, coalesce(k.numero_contrato,'')||coalesce(' · '||d.siigo_numero,''), left(d.error,220),
  '/dashboard/caja?vista=siigo&sede='||d.sede_id, 'Contabilidad', true, d.updated_at::date
 from public.siigo_documentos d join public.sedes s on s.id=d.sede_id left join public.contratos k on k.id=d.contrato_id
 where d.sede_id=any(sedes) and d.estado='anulado' and coalesce(d.datos->>'resuelto','')<>'true' and d.error is not null
  and (d.error ilike '%en Siigo%' or d.error ilike '%contabilidad%')
 union all
 -- 5. Payments with method «Otro» or without the account where the money arrived.
 select 'medio:'||m.id, 'Abono sin medio o cuenta real', s.nombre::text, s.id, coalesce(k.numero_contrato,''),
  format('$%s registrado como «%s»%s',to_char(m.valor,'FM999G999G999'),m.medio,case when m.cuenta_id is null and m.medio<>'Efectivo' then ' sin cuenta' else '' end),
  '/dashboard/caja?sede='||m.sede_id||'&fecha='||m.fecha, 'Sede', false, m.fecha
 from public.caja_movimientos m join public.sedes s on s.id=m.sede_id left join public.contratos k on k.id=m.contrato_id
 where m.sede_id=any(sedes) and m.origen='pago' and m.anulado_at is null and m.fecha>=hoy-30
  and (m.medio not in ('Efectivo','Transferencia','Tarjeta') or (m.medio<>'Efectivo' and m.cuenta_id is null and exists(select 1 from public.cuentas_dinero c where c.activo and c.tipo<>'efectivo' and (c.sede_id is null or c.sede_id=m.sede_id))))
 union all
 -- 6. Cash-register days with movements and no closing (before today).
 select 'sincierre:'||m.sede_id||':'||m.fecha, 'Caja sin cerrar', s.nombre::text, s.id, to_char(m.fecha,'DD/MM/YYYY'), count(*)||' movimientos sin cierre',
  '/dashboard/caja?sede='||m.sede_id||'&fecha='||m.fecha, 'Sede', false, m.fecha
 from public.caja_movimientos m join public.sedes s on s.id=m.sede_id
 where m.sede_id=any(sedes) and m.anulado_at is null and m.fecha<hoy and m.fecha>=hoy-15 and not private.caja_dia_cerrado(m.sede_id,m.fecha)
  and (private.caja_inicio(m.sede_id) is null or m.fecha>=private.caja_inicio(m.sede_id))
 group by m.sede_id,m.fecha,s.nombre,s.id
 union all
 -- 7. Closings with a difference (15 days).
 select 'dif:'||c.id, 'Cierre de caja con diferencia', s.nombre::text, s.id, to_char(c.fecha,'DD/MM/YYYY'),
  format('Diferencia $%s · %s',to_char(c.diferencia,'FM999G999G999'),left(coalesce(c.observaciones,''),150)),
  '/dashboard/caja?sede='||c.sede_id||'&fecha='||c.fecha, 'Administración', false, c.fecha
 from public.caja_cierres c join public.sedes s on s.id=c.sede_id
 where c.sede_id=any(sedes) and c.reabierto_at is null and c.diferencia<>0 and c.fecha>=hoy-15;
end $$;
revoke all on function public.novedades_contables(uuid) from public, anon;
grant execute on function public.novedades_contables(uuid) to authenticated;

create or replace function public.novedad_resolver(p_clave text) returns void
language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad marca esta novedad como resuelta.' using errcode='42501'; end if;
 if p_clave not like 'doc:%' then raise exception 'Esta novedad se resuelve en su proceso, no se marca a mano.'; end if;
 id:=substr(p_clave,5)::uuid;
 update public.siigo_documentos set datos=datos||jsonb_build_object('resuelto',true,'resuelto_por',auth.uid(),'resuelto_at',now()),updated_at=now() where siigo_documentos.id=id;
end $$;
revoke all on function public.novedad_resolver(text) from public, anon;
grant execute on function public.novedad_resolver(text) to authenticated;
