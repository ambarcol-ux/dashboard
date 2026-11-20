-- Ámbar Exitoso · Etapa 2, Manual Ámbar: each protocol of Manuales › Manual Ámbar shows its indicator measured in the ERP
-- (last 30 days, per store the user can see). Read-only. Reversible: drop function public.manual_indicadores().

create or replace function public.manual_indicadores() returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select id,nombre from public.sedes where activo and (public.es_admin() or private.es_finanzas() or private.caja_operar(id))),
 d as (select (now() at time zone 'America/Bogota')::date hoy),
 k as (select c.*,greatest(0,coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)) debe from public.contratos c
  where lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado') and (lower(coalesce(c.estado,''))<>'borrador' or coalesce(c.anticipo,0)>0)),
 resp as (select w.sede_id,
   extract(epoch from (select min(m2.created_at) from public.whatsapp_mensajes m2 where m2.conversacion_id=w.id and m2.direccion='saliente' and m2.created_at>m1.created_at and m2.created_at<m1.created_at+interval '7 days')-m1.created_at)/60 minutos
  from public.whatsapp_conversaciones w
  cross join lateral (select m.created_at from public.whatsapp_mensajes m where m.conversacion_id=w.id and m.direccion='entrante' and m.created_at>now()-interval '31 days' order by m.created_at limit 1) m1
  where coalesce(w.canal,'whatsapp')='whatsapp' and w.created_at>now()-interval '30 days'),
 pc as (select p.* from public.primeras_citas p where p.created_at>now()-interval '30 days' and coalesce(p.estado,'')<>'cancelada' and not coalesce(p.registrada_al_contratar,false))
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.nombre,
  'respuesta_min',(select round(percentile_cont(0.5) within group (order by r.minutos)::numeric,0) from resp r where r.sede_id=s.id and r.minutos is not null),
  'respuesta_15',(select round(100.0*count(*) filter (where r.minutos<=15)/nullif(count(*),0)) from resp r where r.sede_id=s.id and r.minutos is not null),
  'citas',(select count(*) from pc where pc.sede_id=s.id),
  'asistieron',(select count(*) from pc where pc.sede_id=s.id and (pc.estado in ('asistio','seguimiento','no_cerro') or pc.llegada_at is not null or exists(select 1 from public.contratos c2 where c2.primera_cita_id=pc.id))),
  'contrataron',(select count(*) from pc where pc.sede_id=s.id and exists(select 1 from k where k.primera_cita_id=pc.id)),
  'citas_sin_origen',(select count(*) from pc where pc.sede_id=s.id and private.cita_canal(pc)='Sin dato'),
  'contratos',(select count(*) from k where k.sede_id=s.id and k.created_at>now()-interval '30 days'),
  'firmados_erp',(select count(*) from k where k.sede_id=s.id and k.created_at>now()-interval '30 days' and (k.fecha_firma_cliente is not null or k.firma_base64 is not null or k.url_pdf_firmado is not null)),
  'con_correo',(select count(*) from k where k.sede_id=s.id and k.created_at>now()-interval '30 days' and nullif(btrim(coalesce(k.cliente_email,'')),'') is not null),
  'entregas',(select count(*) from k where k.sede_id=s.id and coalesce(k.entregado_evento,false) and k.fecha_entrega_evento>now()-interval '30 days'),
  'entregas_con_saldo',(select count(*) from k where k.sede_id=s.id and coalesce(k.entregado_evento,false) and k.fecha_entrega_evento>now()-interval '30 days' and k.debe>0),
  'depositos_atrasados',(select count(*) from k,d where k.sede_id=s.id and coalesce(k.valor_deposito,0)>0 and coalesce(k.entregado_evento,false) and k.fecha_evento<d.hoy-8 and k.finalizado_at is null
    and not exists(select 1 from public.devoluciones_depositos dd where dd.contrato_id=k.id and lower(coalesce(dd.estado,'completado')) not in ('cancelado','anulado','rechazado'))),
  'dias_habiles',(select count(*) from d, generate_series(d.hoy-30,d.hoy-1,interval '1 day') g where extract(isodow from g)<7),
  'dias_cerrados',(select count(distinct cc.fecha) from public.caja_cierres cc,d where cc.sede_id=s.id and cc.fecha between d.hoy-30 and d.hoy-1 and cc.reabierto_at is null),
  'vestidos',(select count(*) from public.vestidos v where v.sede_actual_id=s.id and not coalesce(v.archivado,false)),
  'vestidos_con_costo',(select count(*) from public.vestidos v where v.sede_actual_id=s.id and not coalesce(v.archivado,false) and v.costo_compra is not null),
  'vestidos_con_foto',(select count(*) from public.vestidos v where v.sede_actual_id=s.id and not coalesce(v.archivado,false) and coalesce(nullif(v.foto_frente,''),nullif(v.imagen_url,'')) is not null)
 ) order by s.nombre),'[]'::jsonb) from s;
$$;
revoke all on function public.manual_indicadores() from public, anon;
grant execute on function public.manual_indicadores() to authenticated;
