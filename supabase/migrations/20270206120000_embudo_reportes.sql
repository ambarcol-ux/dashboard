-- Reporte del embudo de citas (agendó → asistió → alquiló): cada lunes la IA analiza la semana cerrada contra las 4 anteriores, explica
-- qué pasa y separa lo que el sistema ajusta solo (instrucciones de la IA de WhatsApp) de lo que depende de personas (por sede y asesora).
-- Reversión: select cron.unschedule('embudo-reporte-semanal'); drop function public.embudo_metricas(date,date); drop table public.embudo_reportes;
create table if not exists public.embudo_reportes(
 id bigint generated always as identity primary key,
 desde date not null, hasta date not null,
 metricas jsonb not null, anteriores jsonb, resumen text not null, acciones jsonb not null default '[]', aplicados jsonb,
 created_at timestamptz not null default now()
);
alter table public.embudo_reportes enable row level security;
create policy embudo_reportes_ver on public.embudo_reportes for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.embudo_reportes from anon, authenticated;

-- Funnel metrics of the visits dated between p_desde and p_hasta (attendance as in the ERP: QR/video/WhatsApp arrival, result or contract).
create or replace function public.embudo_metricas(p_desde date,p_hasta date) returns jsonb
language sql stable security definer set search_path='' as $$
with c as (
 select c.*, s.nombre sede_n, coalesce(a.nombre,'Sin asesora') asesora_n,
  exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(k.estado) not in ('anulado','cancelado','borrador')) contrato,
  (c.fecha-(c.created_at at time zone 'America/Bogota')::date) anticipacion
 from public.primeras_citas c join public.sedes s on s.id=c.sede_id left join public.profiles a on a.id=c.asesora_id
 where c.fecha between p_desde and p_hasta and c.estado<>'cancelada'),
k as (select *, case when origen='vitrina' or estado in ('asistio','seguimiento','no_cerro') or contrato or alquilo is true or llegada_at is not null then 'asistio'
  when estado='no_asistio' then 'no_asistio' else 'sin_registrar' end asis, (contrato or alquilo is true) alq,
  (estado='confirmada' or respuesta_asistencia is not null or exists(select 1 from public.primeras_citas_historial h where h.cita_id=c.id and h.accion ilike '%confirm%')) confirmo,
  exists(select 1 from public.primeras_citas_mensajes m where m.cita_id=c.id and m.tipo in ('confirmacion','recordatorio24','recordatorio2') and m.entrega_estado in ('delivered','read')) whatsapp_ok
 from c)
select jsonb_build_object('desde',p_desde,'hasta',p_hasta,
 'total',(select jsonb_build_object('citas',count(*) filter (where origen='cita'),'asistieron',count(*) filter (where origen='cita' and asis='asistio'),
   'no_asistieron',count(*) filter (where origen='cita' and asis='no_asistio'),'sin_registrar',count(*) filter (where origen='cita' and asis='sin_registrar'),
   'alquilaron_cita',count(*) filter (where origen='cita' and alq),'vitrinas',count(*) filter (where origen='vitrina'),'alquilaron_vitrina',count(*) filter (where origen='vitrina' and alq),
   'asistio_sin_alquilar_sin_motivo',count(*) filter (where asis='asistio' and not alq and coalesce(motivo_no_alquiler,'')=''),
   'atendidas_sin_asesora',count(*) filter (where asis='asistio' and asesora_id is null),
   'llegada_qr',count(*) filter (where llegada_via='qr'),'llegada_video',count(*) filter (where llegada_via='videollamada'),'llegada_whatsapp',count(*) filter (where llegada_via='whatsapp'),
   'vitrinas_autoregistro',count(*) filter (where origen='vitrina' and llegada_via='qr')) from k),
 'por_sede',(select coalesce(jsonb_agg(x order by x.citas desc),'[]') from (select sede_n sede,count(*) filter (where origen='cita') citas,count(*) filter (where origen='cita' and asis='asistio') asistieron,
   count(*) filter (where origen='cita' and asis='no_asistio') no_asistieron,count(*) filter (where origen='cita' and asis='sin_registrar') sin_registrar,
   count(*) filter (where origen='cita' and alq) alquilaron_cita,count(*) filter (where origen='vitrina') vitrinas,count(*) filter (where origen='vitrina' and alq) alquilaron_vitrina,
   count(*) filter (where asis='asistio' and not alq and coalesce(motivo_no_alquiler,'')='') sin_motivo,count(*) filter (where asis='asistio' and asesora_id is null) sin_asesora,
   count(*) filter (where origen='cita' and modalidad='virtual') virtuales,count(*) filter (where origen='cita' and modalidad='virtual' and asis='asistio') virtuales_asistieron from k group by 1) x),
 'por_asesora',(select coalesce(jsonb_agg(x order by x.atendidas desc),'[]') from (select asesora_n asesora,sede_n sede,count(*) filter (where asis='asistio') atendidas,count(*) filter (where asis='asistio' and alq) alquilaron,
   count(*) filter (where asis='asistio' and not alq and coalesce(motivo_no_alquiler,'')='') sin_motivo from k group by 1,2 having count(*) filter (where asis='asistio')>0) x),
 'confirmacion',(select coalesce(jsonb_agg(x),'[]') from (select confirmo,count(*) citas,count(*) filter (where asis='asistio') asistieron from k where origen='cita' group by 1) x),
 'whatsapp_entregado',(select coalesce(jsonb_agg(x),'[]') from (select whatsapp_ok,count(*) citas,count(*) filter (where asis='asistio') asistieron from k where origen='cita' group by 1) x),
 'anticipacion',(select coalesce(jsonb_agg(x order by x.rango),'[]') from (select case when anticipacion<=0 then '0 mismo día' when anticipacion<=2 then '1-2 días' when anticipacion<=7 then '3-7 días' else '8+ días' end rango,
   count(*) citas,count(*) filter (where asis='asistio') asistieron from k where origen='cita' group by 1) x),
 'dia_semana',(select coalesce(jsonb_agg(x order by x.dia),'[]') from (select extract(isodow from fecha)::int dia,count(*) citas,count(*) filter (where asis='asistio') asistieron,count(*) filter (where alq) alquilaron from k where origen='cita' group by 1) x),
 'hora',(select coalesce(jsonb_agg(x order by x.hora),'[]') from (select extract(hour from hora)::int hora,count(*) citas,count(*) filter (where asis='asistio') asistieron from k where origen='cita' group by 1) x),
 'modalidad',(select coalesce(jsonb_agg(x),'[]') from (select modalidad,count(*) citas,count(*) filter (where asis='asistio') asistieron,count(*) filter (where asis='asistio' and alq) alquilaron from k where origen='cita' group by 1) x),
 'tipo_vestido',(select coalesce(jsonb_agg(x order by x.atendidas desc),'[]') from (select coalesce(nullif(tipo_vestido,''),'Sin dato') tipo,count(*) filter (where asis='asistio') atendidas,count(*) filter (where asis='asistio' and alq) alquilaron from k group by 1) x),
 'meses_al_evento',(select coalesce(jsonb_agg(x order by x.rango),'[]') from (select case when fecha_evento is null then 'sin fecha' when fecha_evento-fecha<=30 then 'a) hasta 1 mes' when fecha_evento-fecha<=90 then 'b) 1 a 3 meses' when fecha_evento-fecha<=180 then 'c) 3 a 6 meses' else 'd) más de 6 meses' end rango,
   count(*) filter (where asis='asistio') atendidas,count(*) filter (where asis='asistio' and alq) alquilaron from k group by 1) x),
 'motivos_no_alquiler',(select coalesce(jsonb_agg(x order by x.n desc),'[]') from (select upper(motivo_no_alquiler) motivo,count(*) n from k where asis='asistio' and not alq and coalesce(motivo_no_alquiler,'')<>'' group by 1) x),
 'mensajes',(select coalesce(jsonb_agg(x),'[]') from (select m.tipo,count(*) filter (where m.estado='enviado') enviados,count(*) filter (where m.estado in ('revisar','error')) fallidos,count(*) filter (where m.entrega_estado='read') leidos
   from public.primeras_citas_mensajes m join k on k.id=m.cita_id group by 1) x)
)
$$;
revoke all on function public.embudo_metricas(date,date) from public, anon, authenticated;
grant execute on function public.embudo_metricas(date,date) to service_role;

-- Mondays 7:20 a. m. (Bogotá).
select cron.schedule('embudo-reporte-semanal','20 12 * * 1',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/reportes/embudo',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$$);
