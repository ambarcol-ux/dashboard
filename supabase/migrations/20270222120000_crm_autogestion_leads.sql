-- Autogestión de leads «Interesada» (chats sin cita):
-- 1) Empujón: si la IA respondió y la clienta no volvió ni agendó, a las 16–23 h la IA le escribe un mensaje corto (ventana de 24 h abierta, sin plantilla).
-- 2) Reactivación: con la ventana cerrada, plantilla de seguimiento a los 2 días y otra a los 7 (40 por tanda, primero las de anuncio y las más recientes).
-- 3) Cierre: sin respuesta 5 días después del 2.º intento, el lead pasa a «Cerrada: sin respuesta» (vuelve a «Interesada» si escribe).
-- 4) Aviso emergente para asesoras: chats que piden atención de una persona, según los permisos de WhatsApp de cada una.
-- Reversión: select cron.unschedule('crm-empujon'); select cron.unschedule('crm-reactivacion');
--   drop function public.chats_atender_persona(), private.crm_empujon_tomar(int), private.crm_reactivacion_tomar(int),
--   public.crm_empujon_tomar(int), public.crm_reactivacion_tomar(int);
--   alter table public.whatsapp_conversaciones drop column empujon_at, drop column reactivacion_n, drop column reactivacion_at, drop column cierre_crm_at;
--   volver a aplicar public.crm_pipeline de 20270221120000_crm_pipeline_rapido.sql.
alter table public.whatsapp_conversaciones
 add column if not exists empujon_at timestamptz,
 add column if not exists reactivacion_n int not null default 0,
 add column if not exists reactivacion_at timestamptz,
 add column if not exists cierre_crm_at timestamptz;

-- Phones already handled elsewhere: open first visit (seguimientos handle them) or contract in force.
create or replace function private.crm_tel_ocupado(p_tel text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.primeras_citas c where right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10)
   and c.estado<>'cancelada' and c.created_at>now()-interval '240 days')
  or exists(select 1 from public.contratos k where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado') and k.created_at>now()-interval '240 days'
   and right(regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),10)=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10))
$$;

-- 1) Chats for the nudge (16–23 h after her last message, we answered last, no visit yet). Marks them so they are nudged once per message.
create or replace function private.crm_empujon_tomar(p_limite int) returns setof uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
begin
 return query
 with x as (
  select w.id from public.whatsapp_conversaciones w
  where w.ultimo_entrante_at between now()-interval '23 hours' and now()-interval '16 hours'
   and w.ultimo_at>w.ultimo_entrante_at and not w.ia_pausada and not w.ia_atender and coalesce(w.etiqueta,'')<>'reclamo'
   and (w.empujon_at is null or w.empujon_at<w.ultimo_entrante_at)
   and not private.crm_tel_ocupado(w.telefono)
  order by w.ultimo_entrante_at limit greatest(1,least(p_limite,50))
  for update skip locked)
 update public.whatsapp_conversaciones w set empujon_at=now() from x where w.id=x.id returning w.id;
end $$;

-- 2) and 3) Template reactivation (day 2 and day 7) and closing without answer. Only WhatsApp (templates).
create or replace function private.crm_reactivacion_tomar(p_limite int)
returns table(conv_id uuid, telefono text, nombre text, sede text, sede_id uuid, intento int, resumen text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
begin
 -- Two attempts without answer: closed (until she writes again).
 update public.whatsapp_conversaciones w set cierre_crm_at=now()
 where w.reactivacion_n>=2 and w.reactivacion_at>w.ultimo_entrante_at and w.reactivacion_at<now()-interval '5 days'
  and (w.cierre_crm_at is null or w.cierre_crm_at<w.reactivacion_at);
 return query
 with c as (
  select w.id, case when w.reactivacion_at is null or w.ultimo_entrante_at>w.reactivacion_at then 0 else w.reactivacion_n end n, w.reactivacion_at, w.ultimo_entrante_at, w.anuncio_id
  from public.whatsapp_conversaciones w
  where coalesce(w.canal,'whatsapp')='whatsapp' and length(regexp_replace(coalesce(w.telefono,''),'\D','','g'))>=10
   and w.ultimo_entrante_at<now()-interval '24 hours' and w.ultimo_entrante_at>now()-interval '30 days'
   and not w.ia_pausada and not w.ia_atender and coalesce(w.etiqueta,'')<>'reclamo'
   and (w.cierre_crm_at is null or w.ultimo_entrante_at>w.cierre_crm_at)
   and not exists(select 1 from public.primeras_citas_seguimientos z join public.primeras_citas cz on cz.id=z.cita_id
     where right(regexp_replace(coalesce(cz.telefono,''),'\D','','g'),10)=right(regexp_replace(w.telefono,'\D','','g'),10) and z.realizado_at>now()-interval '3 days')),
 d as (
  select c.id, c.n from c
  where ((c.n=0 and c.ultimo_entrante_at<now()-interval '2 days') or (c.n=1 and c.reactivacion_at<now()-interval '5 days'))
   and not private.crm_tel_ocupado((select w.telefono from public.whatsapp_conversaciones w where w.id=c.id))
  order by (c.anuncio_id is not null) desc, c.ultimo_entrante_at desc
  limit greatest(1,least(p_limite,100))),
 m as (
  update public.whatsapp_conversaciones w set reactivacion_n=d.n+1, reactivacion_at=now() from d where w.id=d.id
  returning w.id, w.telefono, w.nombre, w.sede_id, d.n+1 intento, w.ia_resumen)
 select m.id, m.telefono, m.nombre, s.nombre::text, m.sede_id, m.intento, m.ia_resumen from m left join public.sedes s on s.id=m.sede_id;
end $$;

create or replace function public.crm_empujon_tomar(p_limite int) returns setof uuid
language sql security definer set search_path='' as $$ select private.crm_empujon_tomar(p_limite) $$;
create or replace function public.crm_reactivacion_tomar(p_limite int)
returns table(conv_id uuid, telefono text, nombre text, sede text, sede_id uuid, intento int, resumen text)
language sql security definer set search_path='' as $$ select * from private.crm_reactivacion_tomar(p_limite) $$;
revoke all on function private.crm_tel_ocupado(text), private.crm_empujon_tomar(int), private.crm_reactivacion_tomar(int),
 public.crm_empujon_tomar(int), public.crm_reactivacion_tomar(int) from public, anon, authenticated;
grant execute on function public.crm_empujon_tomar(int), public.crm_reactivacion_tomar(int) to service_role;

-- 4) Chats that need a person, for the pop-up alert (each user sees the chats she can see in WhatsApp 304).
create or replace function public.chats_atender_persona()
returns table(id uuid, nombre text, telefono text, sede text, motivo text, desde timestamptz)
language sql stable security definer set search_path='' as $$
 select w.id, w.nombre, w.telefono, s.nombre::text, w.ia_motivo, coalesce(w.ia_at,w.ultimo_entrante_at)
 from public.whatsapp_conversaciones w left join public.sedes s on s.id=w.sede_id
 where w.ia_atender and w.ultimo_entrante_at>now()-interval '14 days' and private.whatsapp_puede_ver(w.sede_id)
 order by coalesce(w.ia_at,w.ultimo_entrante_at) limit 50
$$;
revoke all on function public.chats_atender_persona() from public, anon;
grant execute on function public.chats_atender_persona() to authenticated;

-- Schedules (Bogotá = UTC-5): nudge every 30 min from 8 a. m. to 8 p. m.; reactivation Mon–Sat 11:05 a. m. and 5:05 p. m.
select cron.schedule('crm-empujon','*/30 13-23,0 * * *',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/crm/automatico',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{"tipo":"empujon"}'::jsonb, timeout_milliseconds:=60000);
$c$);
select cron.schedule('crm-reactivacion','5 16,22 * * 1-6',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/crm/automatico',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{"tipo":"reactivacion"}'::jsonb, timeout_milliseconds:=60000);
$c$);

-- Pipeline: leads cerrados sin respuesta, reactivación en curso (sin alerta: la gestiona el sistema).
create or replace function public.crm_pipeline(p_sede uuid default null, p_dias int default 45)
returns jsonb language sql stable security definer set search_path='' as $$
with prm as (select (now() at time zone 'America/Bogota') ahora, (now() at time zone 'America/Bogota')::date hoy, greatest(7,least(coalesce(p_dias,45),180)) dias),
conv as (
 select distinct on (kk.k) kk.k ck, w.id conv_id, w.nombre conv_nombre, w.canal, w.sede_id conv_sede, w.created_at conv_creada, w.ultimo_at, w.ultimo_entrante_at, w.no_leidos, w.ia_atender, w.etiqueta, w.anuncio_id, w.cierre_crm_at, w.reactivacion_n, w.reactivacion_at
 from public.whatsapp_conversaciones w, prm,
  lateral (select case when length(regexp_replace(coalesce(w.telefono,''),'\D','','g'))>=10 then right(regexp_replace(w.telefono,'\D','','g'),10) else 'c:'||w.id end k) kk
 where w.ultimo_entrante_at>now()-make_interval(days=>prm.dias)
 order by kk.k, w.ultimo_at desc nulls last),
cita as (
 select distinct on (kk.k) kk.k tk, c.*
 from public.primeras_citas c, lateral (select right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10) k) kk
 where length(kk.k)=10 and c.created_at>now()-interval '240 days'
 order by kk.k, c.created_at desc),
keys as (select ck k from conv union select tk from cita),
kc as materialized (
 select right(regexp_replace(coalesce(nullif(x.cliente_whatsapp,''),x.whatsapp,''),'\D','','g'),10) k, x.primera_cita_id, x.created_at,
  jsonb_build_object('id',x.id,'numero',x.numero_contrato,'estado',x.estado,'creado',x.created_at,'saldo',x.saldo,'fecha_evento',x.fecha_evento,'sede_id',x.sede_id) j
 from public.contratos x where lower(coalesce(x.estado,'')) not in ('anulado','cancelado','borrador','rechazado') and x.created_at>now()-interval '240 days'),
sg as materialized (
 select s.cita_id, jsonb_build_object('enviadas',count(*) filter (where s.realizado_at is not null),'total',count(*) filter (where s.anulado_at is null),
   'ultima',max(s.realizado_at),'proxima',min(s.fecha) filter (where s.realizado_at is null and s.anulado_at is null)) seg
 from public.primeras_citas_seguimientos s group by s.cita_id),
base as (
 select ks.k, cv.*, ci.id cita_id, ci.codigo, ci.cliente_nombre, ci.telefono, ci.sede_id cita_sede, ci.origen, ci.modalidad, ci.estado, ci.fecha, ci.hora, ci.fecha_evento, ci.tipo_vestido,
  ci.llegada_at, ci.alquilo, ci.resultado_comercial, ci.resultado_visita, ci.cierre_seguimiento, ci.tipo_seguimiento, ci.posible_seguimiento, ci.enlace_virtual, ci.created_at cita_creada, ci.updated_at cita_act,
  ci.asesora_id,
  (select kc.j from kc where kc.primera_cita_id=ci.id or (length(ks.k)=10 and kc.k=ks.k) order by kc.created_at desc limit 1) contrato,
  sg.seg
 from keys ks left join conv cv on cv.ck=ks.k left join cita ci on ci.tk=ks.k left join sg on sg.cita_id=ci.id),
etapa as (
 select b.*, prm.ahora, prm.hoy,
  coalesce(b.cita_sede,b.conv_sede,(b.contrato->>'sede_id')::uuid) sede,
  case
   when b.contrato is not null and (b.cita_creada is null or (b.contrato->>'creado')::timestamptz>=b.cita_creada-interval '30 days') then 'contrato'
   when b.cita_id is not null and coalesce(b.alquilo,false) then 'contrato'
   when b.cita_id is not null and (b.estado='cancelada' or b.cierre_seguimiento is not null
     or b.resultado_comercial in ('DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO')) then
     case when b.ultimo_entrante_at>coalesce(b.cita_act,b.cita_creada)+interval '1 hour' then 'interesada' else 'cerrada' end
   when b.cita_id is not null and b.estado in ('agendada','confirmada') then case when b.llegada_at is not null then 'asistio' else 'agendada' end
   when b.cita_id is not null and b.estado in ('asistio','seguimiento','no_cerro') and b.tipo_seguimiento is null
     and (b.origen='vitrina' and b.resultado_visita is null or b.origen<>'vitrina' and b.alquilo is null) then 'asistio'
   when b.cita_id is not null and coalesce(b.resultado_comercial,'EN SEGUIMIENTO')='EN SEGUIMIENTO' and b.estado<>'cancelada' then 'seguimiento'
   when b.conv_id is not null then case when b.cita_id is null and b.cierre_crm_at>=b.ultimo_entrante_at then 'cerrada' else 'interesada' end
   else 'cerrada' end etapa
 from base b, prm),
card as (
 select e.*,
  case e.etapa
   when 'interesada' then coalesce(case when e.cita_id is not null and e.ultimo_entrante_at>e.cita_act then e.ultimo_entrante_at end,e.conv_creada)
   when 'agendada' then e.cita_creada
   when 'asistio' then coalesce(e.llegada_at,((e.fecha+e.hora) at time zone 'America/Bogota'))
   when 'seguimiento' then coalesce((e.seg->>'ultima')::timestamptz,e.cita_act)
   when 'contrato' then coalesce((e.contrato->>'creado')::timestamptz,e.cita_act)
   else coalesce(e.cita_act,e.cierre_crm_at,e.ultimo_at) end desde
 from etapa e)
select coalesce(jsonb_agg(jsonb_build_object(
 'clave',c.k,'etapa',c.etapa,'nombre',coalesce(nullif(c.cliente_nombre,''),nullif(c.conv_nombre,''),'Sin nombre'),'telefono',case when c.k like 'c:%' then null else c.k end,
 'canal',coalesce(c.canal,'whatsapp'),'anuncio',c.anuncio_id is not null,'sede_id',c.sede,'sede',(select s.nombre from public.sedes s where s.id=c.sede),
 'conv_id',c.conv_id,'cita_id',c.cita_id,'codigo',c.codigo,'origen',c.origen,'modalidad',c.modalidad,'fecha_cita',c.fecha,'hora',to_char(c.hora,'HH24:MI'),
 'fecha_evento',coalesce(c.fecha_evento,(c.contrato->>'fecha_evento')::date),'tipo_vestido',nullif(c.tipo_vestido,''),'asesora',(select p.nombre from public.profiles p where p.id=c.asesora_id),
 'tipo_seguimiento',c.tipo_seguimiento,'seguimiento',c.seg,'contrato',c.contrato,'cierre',coalesce(c.cierre_seguimiento,c.resultado_comercial,case when c.cierre_crm_at is not null then 'Sin respuesta tras 2 mensajes automáticos' end),
 'reactivacion',case when c.reactivacion_at>c.ultimo_entrante_at then jsonb_build_object('n',c.reactivacion_n,'at',c.reactivacion_at) end,
 'desde',c.desde,'dias',greatest(0,extract(day from now()-c.desde))::int,'ultimo_mensaje',c.ultimo_entrante_at,
 'alerta',case c.etapa
   when 'interesada' then case when c.ia_atender then 'Pide atención de una persona' when c.ultimo_entrante_at>=c.ultimo_at and c.ultimo_entrante_at<now()-interval '15 minutes' then 'Mensaje sin responder'
     when c.reactivacion_at>c.ultimo_entrante_at then null
     when c.desde<now()-interval '2 days' then 'Sin cita hace '||greatest(2,extract(day from now()-c.desde))::int||' días' end
   when 'agendada' then case when (c.fecha+c.hora)<c.ahora then 'Ya pasó la hora: ¿llegó?'
     when c.modalidad='virtual' and coalesce(c.enlace_virtual,'')='' and c.fecha<=c.hoy+1 then 'Virtual sin enlace'
     when c.estado='agendada' and c.fecha<=c.hoy+1 then 'Sin confirmar' end
   when 'asistio' then case when c.desde<now()-interval '20 hours' then 'Registrar resultado' end
   when 'seguimiento' then case when c.ultimo_entrante_at>coalesce((c.seg->>'ultima')::timestamptz,c.cita_act) then 'Respondió: retomar la conversación'
     when c.fecha_evento is not null and c.fecha_evento between c.hoy and c.hoy+30 then 'Evento en '||(c.fecha_evento-c.hoy)||' días' end
   when 'contrato' then case when coalesce((c.contrato->>'saldo')::numeric,0)>0 and (c.contrato->>'fecha_evento')::date between c.hoy and c.hoy+15 then 'Saldo pendiente y evento cerca' end
  end)
 order by c.desde desc),'[]'::jsonb)
from card c
where (p_sede is null or c.sede=p_sede)
 -- Same visibility as the screens: visits by store/modality permission and store limit; chats by WhatsApp permission.
 and (case when c.cita_id is not null then private.acceso_primera_cita(c.cita_sede,c.modalidad) and (private.sedes_limitadas() is null or c.cita_sede=any(private.sedes_limitadas()))
   else private.whatsapp_puede_ver(c.conv_sede) end)
 and (c.etapa<>'cerrada' or c.desde>now()-interval '15 days')
 and (c.etapa<>'contrato' or c.desde>now()-interval '30 days')
 and (c.etapa<>'interesada' or c.ultimo_entrante_at>now()-make_interval(days=>(select dias from prm)) or c.cita_id is not null)
$$;
revoke all on function public.crm_pipeline(uuid,int) from public, anon;
grant execute on function public.crm_pipeline(uuid,int) to authenticated;
