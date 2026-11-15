-- Después de devolver el vestido (contrato finalizado): encuesta de satisfacción por WhatsApp con botones
-- [Excelente · Bien · Puede mejorar] y reseña de Google a todas (sin filtrar por la respuesta, política de Google):
-- al responder Excelente/Bien, a las 24 h si no responde y, con «Puede mejorar», cuando administración cierra el caso o a las 72 h.
-- «Puede mejorar» pide qué mejorar (lista) y abre un caso solo para administración (mismo aviso morado de las citas).
-- Reversión: drop function public.post_evento_tomar(int), public.post_evento_resena_tomar(int), public.post_evento_respuesta(uuid,text,text);
--   alter table public.contratos drop column encuesta_wa_at, drop column satisfaccion, drop column satisfaccion_falla,
--    drop column satisfaccion_cerrada_at, drop column satisfaccion_cerrada_por, drop column resena_wa_at;
--   select cron.unschedule('post-evento-whatsapp'); re-aplicar satisfaccion_casos y satisfaccion_cerrar de 20270307120000.
alter table public.contratos add column if not exists encuesta_wa_at timestamptz,
 add column if not exists satisfaccion text,
 add column if not exists satisfaccion_falla text,
 add column if not exists satisfaccion_cerrada_at timestamptz,
 add column if not exists satisfaccion_cerrada_por uuid references public.profiles(id) on delete set null,
 add column if not exists resena_wa_at timestamptz;

-- Contracts finalized 20 hours to 4 days ago, not asked yet (marks them).
create or replace function public.post_evento_tomar(p_limite int) returns table(id uuid,nombre text,telefono text,sede text)
language sql security definer set search_path='' as $$
 with x as (select k.id from public.contratos k
  where k.finalizado_at between now()-interval '4 days' and now()-interval '20 hours' and k.encuesta_wa_at is null
   and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador')
   and length(regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'))>=10
  order by k.finalizado_at limit greatest(1,least(p_limite,50)) for update skip locked)
 update public.contratos k set encuesta_wa_at=now() from x where k.id=x.id
 returning k.id,split_part(btrim(coalesce(k.cliente_nombre,'')),' ',1),regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),
  (select s.nombre::text from public.sedes s where s.id=k.sede_id);
$$;

-- Review requests due (no answer in 24 h, or «Puede mejorar» closed / 72 h), once per contract and per phone every 6 months.
create or replace function public.post_evento_resena_tomar(p_limite int) returns table(id uuid,nombre text,telefono text,email text,sede_id uuid,resena_url text)
language sql security definer set search_path='' as $$
 with x as (select k.id from public.contratos k
  where k.encuesta_wa_at>now()-interval '10 days' and k.resena_wa_at is null
   and ((k.satisfaccion is null and k.encuesta_wa_at<now()-interval '24 hours')
    or (k.satisfaccion='Puede mejorar' and (k.satisfaccion_cerrada_at is not null or k.encuesta_wa_at<now()-interval '72 hours')))
   and private.resena_permitida(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp),k.cliente_email)
  order by k.encuesta_wa_at limit greatest(1,least(p_limite,50)) for update skip locked)
 update public.contratos k set resena_wa_at=now() from x where k.id=x.id
 returning k.id,split_part(btrim(coalesce(k.cliente_nombre,'')),' ',1),regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),k.cliente_email,k.sede_id,
  (select s.resena_url from public.sedes s where s.id=k.sede_id);
$$;

-- A tapped button of the survey. Returns what to send next: resena (with the store's link), falla (list) or gracias.
create or replace function public.post_evento_respuesta(p_contrato uuid,p_telefono text,p_accion text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k public.contratos; v text; out jsonb:='{}';
begin
 select * into k from public.contratos where id=p_contrato for update;
 if k.id is null or right(regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),10)<>right(regexp_replace(coalesce(p_telefono,''),'\D','','g'),10) then return null; end if;
 if p_accion in ('exc','bien','mej') then
  if k.satisfaccion is not null then return '{}'; end if;
  v:=case p_accion when 'exc' then 'Excelente' when 'bien' then 'Bien' else 'Puede mejorar' end;
  update public.contratos set satisfaccion=v where id=k.id;
  if p_accion='mej' then out:=jsonb_build_object('siguiente','falla');
  elsif k.resena_wa_at is null and private.resena_permitida(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp),k.cliente_email) then
   update public.contratos set resena_wa_at=now() where id=k.id;
   out:=jsonb_build_object('siguiente','resena','resena_url',(select s.resena_url from public.sedes s where s.id=k.sede_id),'sede_id',k.sede_id,'email',k.cliente_email);
  end if;
 else
  v:=case p_accion when 'atencion' then 'Atención' when 'espera' then 'Tiempo de espera' when 'vestidos' then 'Vestidos' when 'precio' then 'Precio'
   when 'instalaciones' then 'Instalaciones' when 'entrega' then 'Entrega o devolución' when 'otro' then 'Otro' end;
  if v is null or k.satisfaccion<>'Puede mejorar' or k.satisfaccion_falla is not null then return '{}'; end if;
  update public.contratos set satisfaccion_falla=v where id=k.id;
  out:=jsonb_build_object('siguiente','gracias');
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(k.id,'Satisfacción (WhatsApp)',v,'Clienta');
 return out||jsonb_build_object('nombre',split_part(btrim(coalesce(k.cliente_nombre,'')),' ',1));
end $$;
revoke all on function public.post_evento_tomar(int), public.post_evento_resena_tomar(int), public.post_evento_respuesta(uuid,text,text) from public, anon, authenticated;
grant execute on function public.post_evento_tomar(int), public.post_evento_resena_tomar(int), public.post_evento_respuesta(uuid,text,text) to service_role;

-- Administration sees «Puede mejorar» from visits and from events in the same place.
create or replace function public.satisfaccion_casos() returns table(id uuid,cliente text,telefono text,sede text,fecha date,asesora text,falla text,respondida timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then return; end if;
 return query
 select c.id,c.cliente_nombre::text,c.telefono::text,s.nombre::text,c.fecha,coalesce(p.nombre,'—')::text,c.satisfaccion_falla,c.updated_at
 from public.primeras_citas c left join public.sedes s on s.id=c.sede_id left join public.profiles p on p.id=c.asesora_id
 where c.satisfaccion='Puede mejorar' and c.satisfaccion_cerrada_at is null
 union all
 select k.id,('Contrato '||coalesce(k.numero_contrato::text,'')||' · '||coalesce(k.cliente_nombre,''))::text,coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp)::text,s.nombre::text,k.fecha_evento,
  coalesce(k.nombre_asesora,k.asesora,'—')::text,k.satisfaccion_falla,k.encuesta_wa_at
 from public.contratos k left join public.sedes s on s.id=k.sede_id
 where k.satisfaccion='Puede mejorar' and k.satisfaccion_cerrada_at is null
 order by 8;
end $$;
create or replace function public.satisfaccion_cerrar(p_id uuid,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración cierra estos casos.' using errcode='42501'; end if;
 update public.primeras_citas set satisfaccion_cerrada_at=now(),satisfaccion_cerrada_por=auth.uid(),updated_at=clock_timestamp() where id=p_id and satisfaccion='Puede mejorar';
 if found then
  update public.primeras_citas_mensajes set programado_at=now() where cita_id=p_id and tipo='resena' and estado='pendiente';
  insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,auth.uid(),'Satisfacción','Caso atendido por administración'||coalesce(' · '||nullif(btrim(p_nota),''),''));
  return;
 end if;
 update public.contratos set satisfaccion_cerrada_at=now(),satisfaccion_cerrada_por=auth.uid() where id=p_id and satisfaccion='Puede mejorar';
 if not found then raise exception 'Caso no encontrado.'; end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(p_id,'Satisfacción','Caso atendido por administración'||coalesce(' · '||nullif(btrim(p_nota),''),''),'Administración');
end $$;

-- 10:20 a. m. and 4:20 p. m. Bogotá: surveys of contracts finalized yesterday and the review requests that are due.
select cron.schedule('post-evento-whatsapp','20 15,21 * * *',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/contratos/post-evento',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb, timeout_milliseconds:=60000);
$c$);
