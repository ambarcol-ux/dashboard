-- Ventas y CRM › WhatsApp 304: conversaciones y mensajes del número de WhatsApp conectado, unidos a la ficha de la clienta.
-- El webhook (cuenta de servicio) guarda lo que escriben las clientas y lo que se responde desde el celular; el ERP envía con su API.
-- La IA (Anthropic) deja etiqueta, resumen y respuesta sugerida; no envía nada sola.
-- Reversión: drop function public.whatsapp_ficha(uuid); drop function public.whatsapp_contexto_servidor(text); drop function private.whatsapp_contexto(text);
--   drop function private.whatsapp_puede_ver(uuid); drop table public.whatsapp_mensajes; drop table public.whatsapp_conversaciones;
--   delete from public.roles_permisos where permiso='panel.whatsapp'; delete from public.permisos where codigo='panel.whatsapp';

create table public.whatsapp_conversaciones(
 id uuid primary key default gen_random_uuid(),
 telefono text not null unique check (telefono ~ '^\d{8,15}$'),
 nombre text,
 sede_id uuid references public.sedes(id) on delete set null,
 ultimo_mensaje text,
 ultimo_at timestamptz not null default now(),
 ultimo_entrante_at timestamptz,
 no_leidos integer not null default 0,
 etiqueta text,
 ia_resumen text,
 ia_sugerencia text,
 ia_at timestamptz,
 ia_error text,
 created_at timestamptz not null default now()
);
create index whatsapp_conversaciones_ultimo on public.whatsapp_conversaciones(ultimo_at desc);

create table public.whatsapp_mensajes(
 id uuid primary key default gen_random_uuid(),
 conversacion_id uuid not null references public.whatsapp_conversaciones(id) on delete cascade,
 wa_id text unique,
 direccion text not null check (direccion in ('entrante','saliente')),
 origen text not null check (origen in ('clienta','erp','celular')),
 tipo text not null default 'text',
 texto text,
 estado text,
 enviado_por uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index whatsapp_mensajes_conversacion on public.whatsapp_mensajes(conversacion_id, created_at);

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values ('panel.whatsapp','Ventas y CRM','Ver WhatsApp 304','Chats del 304 de sus sedes y los que aún no tienen sede; responder y usar la respuesta sugerida por la IA',false,61)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso,activo,todas_sedes)
select r,'panel.whatsapp',true,false from unnest(array['asesora','asesora_lider','franquiciado']) r
on conflict do nothing;

-- Who sees a chat: administration, or the panel permission for its sede (or chats still without sede).
create or replace function private.whatsapp_puede_ver(p_sede uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.es_admin() or (private.tiene_permiso('panel.whatsapp') and (p_sede is null or private.sedes_limitadas() is null or p_sede=any(private.sedes_limitadas())))
$$;

alter table public.whatsapp_conversaciones enable row level security;
alter table public.whatsapp_mensajes enable row level security;
create policy whatsapp_conversaciones_ver on public.whatsapp_conversaciones for select to authenticated using ((select private.whatsapp_puede_ver(sede_id)));
create policy whatsapp_mensajes_ver on public.whatsapp_mensajes for select to authenticated
 using (exists(select 1 from public.whatsapp_conversaciones c where c.id=conversacion_id and private.whatsapp_puede_ver(c.sede_id)));
-- Writes go only through the server (service role), after checking the user can see the chat.
revoke insert,update,delete on public.whatsapp_conversaciones, public.whatsapp_mensajes from anon, authenticated;

-- Customer file by phone (last 10 digits): name, sede, latest first visits and contracts.
create or replace function private.whatsapp_contexto(p_tel text) returns jsonb
language sql stable security definer set search_path='' as $$
 with t as (select right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10) d),
 citas as (
  select pc.id,pc.fecha,pc.hora,pc.estado,pc.modalidad,pc.cliente_nombre,pc.sede_id,s.nombre sede,pc.tipo_vestido,pc.fecha_evento,pc.created_at
  from public.primeras_citas pc left join public.sedes s on s.id=pc.sede_id, t
  where length(t.d)=10 and right(regexp_replace(coalesce(pc.telefono,''),'\D','','g'),10)=t.d
  order by pc.created_at desc limit 3),
 cons as (
  select c.id,c.numero_contrato,c.estado,c.fecha_evento,c.cliente_nombre,c.sede_id,s.nombre sede,c.valor_total,c.created_at
  from public.contratos c left join public.sedes s on s.id=c.sede_id, t
  where length(t.d)=10 and (right(regexp_replace(coalesce(c.whatsapp,''),'\D','','g'),10)=t.d or right(regexp_replace(coalesce(c.cliente_whatsapp,''),'\D','','g'),10)=t.d)
  order by c.created_at desc limit 3)
 select jsonb_build_object(
  'nombre',coalesce((select cliente_nombre from cons limit 1),(select cliente_nombre from citas limit 1)),
  'sede_id',coalesce((select sede_id from cons where sede_id is not null limit 1),(select sede_id from citas where sede_id is not null limit 1)),
  'citas',coalesce((select jsonb_agg(to_jsonb(citas)-'created_at') from citas),'[]'::jsonb),
  'contratos',coalesce((select jsonb_agg(to_jsonb(cons)-'created_at') from cons),'[]'::jsonb))
$$;
-- Server only (webhook and AI).
create or replace function public.whatsapp_contexto_servidor(p_tel text) returns jsonb
language sql stable security definer set search_path='' as $$ select private.whatsapp_contexto(p_tel) $$;
revoke all on function public.whatsapp_contexto_servidor(text) from public, anon, authenticated;
grant execute on function public.whatsapp_contexto_servidor(text) to service_role;
-- Screen: the file of a chat the user can see.
create or replace function public.whatsapp_ficha(p_conversacion uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.whatsapp_contexto(c.telefono) from public.whatsapp_conversaciones c where c.id=p_conversacion and private.whatsapp_puede_ver(c.sede_id)
$$;
revoke all on function public.whatsapp_ficha(uuid) from public, anon;
grant execute on function public.whatsapp_ficha(uuid) to authenticated;
revoke all on function private.whatsapp_contexto(text), private.whatsapp_puede_ver(uuid) from public, anon;
grant execute on function private.whatsapp_puede_ver(uuid) to authenticated;
