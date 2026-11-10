-- Reseñas de Google: se piden a toda clienta que nos visita (cita presencial, virtual o vitrina) y a quien finaliza contrato.
-- Máximo una solicitud cada 6 meses por persona; nunca con un chat en reclamo o marcado «Atender persona»; nunca a quien no asistió.
-- WhatsApp: al tocar «Asistí» se programa el mensaje «resena» (va como mensaje normal: la clienta acaba de escribir).
-- Reversión: drop function private.resena_permitida(text,text); drop table public.resenas_solicitudes;
--   volver a aplicar respuesta_whatsapp_primera_cita y tomar_mensaje_primera_cita sin los fragmentos de abajo.
create table if not exists public.resenas_solicitudes(
 id bigint generated always as identity primary key,
 telefono text, email text,
 canal text not null check (canal in ('correo','whatsapp')),
 origen text not null check (origen in ('visita','contrato')),
 cita_id uuid, contrato_id uuid, sede_id uuid,
 created_at timestamptz not null default now()
);
create index if not exists resenas_solicitudes_tel on public.resenas_solicitudes(telefono, created_at desc);
create index if not exists resenas_solicitudes_email on public.resenas_solicitudes(lower(email), created_at desc);
alter table public.resenas_solicitudes enable row level security;
create policy resenas_solicitudes_ver on public.resenas_solicitudes for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.resenas_solicitudes from anon, authenticated;

-- true when the person may be asked for a review now (phone = last 10 digits).
create or replace function private.resena_permitida(p_telefono text, p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.resenas_solicitudes s where s.created_at>now()-interval '6 months'
   and ((nullif(right(regexp_replace(coalesce(p_telefono,''),'\D','','g'),10),'') is not null and s.telefono=right(regexp_replace(p_telefono,'\D','','g'),10))
     or (nullif(lower(trim(coalesce(p_email,''))),'') is not null and lower(s.email)=lower(trim(p_email)))))
 and not exists(select 1 from public.whatsapp_conversaciones w where nullif(right(regexp_replace(coalesce(p_telefono,''),'\D','','g'),10),'') is not null
   and right(w.telefono,10)=right(regexp_replace(p_telefono,'\D','','g'),10) and (w.ia_atender or w.etiqueta='reclamo'));
$$;
revoke all on function private.resena_permitida(text,text) from public, anon, authenticated;
grant execute on function private.resena_permitida(text,text) to service_role;
create or replace function public.resena_permitida(p_telefono text, p_email text) returns boolean
language sql stable security definer set search_path='' as $$ select private.resena_permitida(p_telefono,p_email); $$;
revoke all on function public.resena_permitida(text,text) from public, anon, authenticated;
grant execute on function public.resena_permitida(text,text) to service_role;

-- «Asistí» → also the review message, if allowed.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.respuesta_whatsapp_primera_cita(text,text,text,text)'::regprocedure);
 d:=replace(d,$x$ if next_type is not null then insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(c.id,c.revision,next_type,now()) on conflict do nothing;end if;$x$,
  $x$ if next_type is not null then insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(c.id,c.revision,next_type,now()) on conflict do nothing;end if;
 if p_accion='pc_asisti' and private.resena_permitida(c.telefono,c.email) then
  insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(c.id,c.revision,'resena',now()+interval '2 minutes') on conflict do nothing;
 end if;$x$);
 if position('''resena''' in d)=0 then raise exception 'respuesta_whatsapp_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;

-- The review message only goes within 23 hours of her answer.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.tomar_mensaje_primera_cita()'::regprocedure);
 d:=replace(d,$x$ or (m.tipo='recuperar' and$x$,$x$ or (m.tipo='resena' and (m.programado_at<now()-interval '23 hours' or not private.resena_permitida(c.telefono,c.email)))
 or (m.tipo='recuperar' and$x$);
 if position('''resena''' in d)=0 then raise exception 'tomar_mensaje_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
