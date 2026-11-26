-- Every attention is rated: 3 hours after a visit is marked as attended (vitrina, store or virtual) the customer gets the survey
-- (Excelente · Bien · Puede mejorar); then the Google review as before. At most one survey per phone every 30 days.
-- The contract survey goes 1 to 3 days after the event date (not after the return). Ratings by store and asesora show in the Puntaje Ámbar
-- (informative, they do not change the 100 points).
-- Reversible: remove trigger encuesta_visita_encolar and re-run the previous definitions of the patched functions.
create or replace function private.encuesta_visita_encolar() returns trigger language plpgsql security definer set search_path='' as $$
declare tel text:=right(regexp_replace(coalesce(new.telefono,''),'\D','','g'),10); t timestamptz:=now()+interval '3 hours'; h int;
begin
 if new.estado not in ('asistio','seguimiento','no_cerro') or (tg_op='UPDATE' and old.estado in ('asistio','seguimiento','no_cerro')) then return new; end if;
 if new.satisfaccion is not null or coalesce(new.resultado_comercial,'')='NO CONTACTAR' or length(tel)<10 then return new; end if;
 if new.crm_origen_id is not null and not new.crm_mensajes_activos then return new; end if;
 if exists(select 1 from public.primeras_citas_mensajes m join public.primeras_citas p on p.id=m.cita_id
   where m.tipo in ('satisfaccion','encuesta_visita') and m.estado in ('pendiente','enviando','enviado') and m.programado_at>now()-interval '30 days'
    and right(regexp_replace(coalesce(p.telefono,''),'\D','','g'),10)=tel)
  or exists(select 1 from public.contratos k where k.encuesta_wa_at>now()-interval '30 days'
    and right(regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),10)=tel) then return new; end if;
 -- Not at night: after 8 p.m. or before 9 a.m. it goes at 10 a.m.
 h:=extract(hour from t at time zone 'America/Bogota');
 if h>=20 or h<9 then t:=(((t at time zone 'America/Bogota')::date+case when h>=20 then 1 else 0 end)+time '10:00') at time zone 'America/Bogota'; end if;
 insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(new.id,new.revision,'encuesta_visita',t) on conflict do nothing;
 if private.resena_permitida(new.telefono,new.email) then
  insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(new.id,new.revision,'resena',t+interval '24 hours') on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.encuesta_visita_encolar() from public,anon,authenticated;
create or replace trigger encuesta_visita_encolar after insert or update of estado on public.primeras_citas
 for each row execute function private.encuesta_visita_encolar();

-- Ratings of the last 30 days for a store: visits (by fecha) and contracts (by event date), with the split by asesora.
create or replace function private.satisfaccion_sede(p_sede uuid,p_desde date) returns jsonb language sql stable security definer set search_path='' as $$
 with z as (select pc.satisfaccion s,(select pr.nombre from public.profiles pr where pr.id=pc.asesora_id) a from public.primeras_citas pc
   where pc.sede_id=p_sede and pc.satisfaccion is not null and pc.fecha>=p_desde
  union all select k.satisfaccion,coalesce((select pr.nombre from public.profiles pr where pr.id=k.asesora_id),nullif(btrim(k.nombre_asesora),''),nullif(btrim(k.asesora),''))
   from public.contratos k where k.sede_id=p_sede and k.satisfaccion is not null and k.fecha_evento>=p_desde)
 select jsonb_build_object('respuestas',(select count(*) from z),
  'excelente_pct',coalesce((select round(100.0*count(*) filter (where s='Excelente')/nullif(count(*),0)) from z),0),
  'mejorar',(select count(*) from z where s='Puede mejorar'),
  'por_asesora',coalesce((select jsonb_agg(jsonb_build_object('nombre',q.a,'respuestas',q.n,'excelente_pct',q.pct) order by q.n desc)
   from (select coalesce(nullif(btrim(a),''),'Sin asesora') a,count(*) n,round(100.0*count(*) filter (where s='Excelente')/count(*)) pct from z group by 1) q),'[]'::jsonb));
$$;
revoke all on function private.satisfaccion_sede(uuid,date) from public,anon,authenticated;

do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('public.tomar_mensaje_primera_cita'::regproc);
 if position('encuesta_visita' in d)=0 then
  a:=' or (m.tipo=''recuperar''';
  if position(a in d)=0 then raise exception 'tomar_mensaje_primera_cita: punto no encontrado'; end if;
  d:=replace(d,a,' or (m.tipo=''encuesta_visita'' and (c.satisfaccion is not null or m.programado_at<now()-interval ''3 days''))'||a);
  execute d;
 end if;
 d:=pg_get_functiondef('public.respuesta_whatsapp_primera_cita'::regproc);
 if position('encuesta_visita' in d)=0 then
  a:='elsif m.tipo=''satisfaccion'' and c.satisfaccion is null';
  if position(a in d)=0 then raise exception 'respuesta_whatsapp_primera_cita: punto no encontrado'; end if;
  d:=replace(d,a,'elsif m.tipo in (''satisfaccion'',''encuesta_visita'') and c.satisfaccion is null');
  execute d;
 end if;
 d:=pg_get_functiondef('public.post_evento_tomar'::regproc);
 if position('fecha_evento between' in d)=0 then
  a:='k.finalizado_at between now()-interval ''4 days'' and now()-interval ''20 hours''';
  if position(a in d)=0 then raise exception 'post_evento_tomar: punto no encontrado'; end if;
  d:=replace(d,a,'k.fecha_evento between (now() at time zone ''America/Bogota'')::date-3 and (now() at time zone ''America/Bogota'')::date-1');
  d:=replace(d,'order by k.finalizado_at','order by k.fecha_evento');
  execute d;
 end if;
 d:=pg_get_functiondef('public.puntaje_ambar'::regproc);
 if position('satisfaccion_sede' in d)=0 then
  a:='   jsonb_build_object(''nombre'',''Penalizaciones';
  if position(a in d)=0 or position('''puntaje'',greatest(' in d)=0 then raise exception 'puntaje_ambar: punto no encontrado'; end if;
  d:=replace(d,a,'   jsonb_build_object(''nombre'',''Satisfacción de clientas: % «Excelente» (informativo, meta 90)'',''puntos'',(private.satisfaccion_sede(p.id::uuid,hoy-30)->>''excelente_pct'')::numeric,''max'',0),
'||a);
  d:=replace(d,'''puntaje'',greatest(','''satisfaccion'',private.satisfaccion_sede(p.id::uuid,hoy-30),''puntaje'',greatest(');
  execute d;
 end if;
end $mig$;
