-- Visibilidad de Aliados directos (decisión de la dueña, 14/11/2026):
-- · Directorio público «Aliados Ámbar» con nombre comercial, logo, servicios, redes y WhatsApp de los aliados que lo autorizan.
-- · Formulario de vinculación con redes (Instagram obligatorio), logo, descripción y autorización de directorio y etiquetas.
-- · Tablero de publicaciones: bienvenida (1 mención), por cada evento con vestido Ámbar 3 historias (Instagram, TikTok, Facebook)
--   + 1 reel en colaboración esa semana, y aliado constante (≥1 evento en cada uno de los 3 meses anteriores) 1 publicación semanal
--   con etiqueta en Instagram, TikTok, Facebook y estados de WhatsApp. El aliado envía el material máximo 3 días después del evento.
-- Reversión: select cron.unschedule('aliados-publicaciones'); drop table public.aliado_publicaciones;
--   drop function public.directorio_aliados(), public.aliado_publicacion_marcar(uuid,text,text,text), public.aliado_visibilidad_guardar(uuid,jsonb), private.aliado_publicaciones_generar();
--   alter table public.aliados drop column nombre_comercial, drop column instagram, drop column facebook, drop column tiktok, drop column descripcion_servicios,
--   drop column logo_path, drop column autoriza_directorio, drop column autoriza_directorio_at; delete from storage.buckets where id='aliados_logos';
--   delete from public.roles_permisos where permiso='panel.aliados_publicaciones'; delete from public.permisos where codigo='panel.aliados_publicaciones';
alter table public.aliados
 add column if not exists nombre_comercial text check (nombre_comercial is null or length(btrim(nombre_comercial)) between 2 and 80),
 add column if not exists instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
 add column if not exists facebook text check (facebook is null or length(facebook)<=200),
 add column if not exists tiktok text check (tiktok is null or tiktok ~ '^[A-Za-z0-9._]{1,30}$'),
 add column if not exists descripcion_servicios text check (descripcion_servicios is null or length(descripcion_servicios)<=300),
 add column if not exists logo_path text,
 add column if not exists autoriza_directorio boolean not null default false,
 add column if not exists autoriza_directorio_at timestamptz;

insert into storage.buckets(id,name,public) values ('aliados_logos','aliados_logos',true) on conflict (id) do nothing;

create table if not exists public.aliado_publicaciones(
 id uuid primary key default gen_random_uuid(),
 aliado_id uuid not null references public.aliados(id) on delete cascade,
 contrato_id uuid references public.contratos(id) on delete set null,
 tipo text not null check (tipo in ('bienvenida','evento_historias','evento_reel','constante_semanal')),
 redes text[] not null,
 cantidad int not null default 1 check (cantidad between 1 and 10),
 semana date not null,
 material_hasta date,
 vence date not null,
 sin_autorizacion_imagen boolean not null default false,
 estado text not null default 'pendiente' check (estado in ('pendiente','publicada','omitida')),
 enlace text check (enlace is null or length(enlace)<=500),
 nota text check (nota is null or length(nota)<=300),
 publicado_por uuid references public.profiles(id),
 publicado_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists aliado_publicaciones_unica on public.aliado_publicaciones(aliado_id,tipo,coalesce(contrato_id,'00000000-0000-0000-0000-000000000000'::uuid),semana);
create index if not exists aliado_publicaciones_estado on public.aliado_publicaciones(estado,semana);
alter table public.aliado_publicaciones enable row level security;
create policy aliado_publicaciones_ver on public.aliado_publicaciones for select to authenticated
 using (public.es_admin() or private.tiene_permiso('panel.aliados_publicaciones'));
revoke insert,update,delete on public.aliado_publicaciones from anon, authenticated;

-- Daily: creates the publication tasks that are due (welcome, per event, steady ally).
create or replace function private.aliado_publicaciones_generar() returns int
language plpgsql security definer set search_path='' as $$
declare n int:=0; m int; hoy date:=(now() at time zone 'America/Bogota')::date; lunes date:=date_trunc('week',(now() at time zone 'America/Bogota'))::date;
begin
 insert into public.aliado_publicaciones(aliado_id,tipo,redes,cantidad,semana,vence)
 select a.id,'bienvenida',array['instagram','tiktok','facebook'],1,lunes,hoy+7 from public.aliados a
 where a.estado='activo' and a.autoriza_directorio
  and not exists(select 1 from public.aliado_publicaciones p where p.aliado_id=a.id and p.tipo='bienvenida')
 on conflict do nothing;
 get diagnostics m=row_count; n:=n+m;
 insert into public.aliado_publicaciones(aliado_id,contrato_id,tipo,redes,cantidad,semana,material_hasta,vence,sin_autorizacion_imagen)
 select k.aliado_id,k.id,t.tipo,t.redes,t.cantidad,date_trunc('week',k.fecha_evento)::date,k.fecha_evento+3,k.fecha_evento+7,not coalesce(k.autoriza_uso_imagen,false)
 from public.contratos k join public.aliados a on a.id=k.aliado_id
 cross join (values ('evento_historias',array['instagram','tiktok','facebook'],3),('evento_reel',array['instagram'],1)) t(tipo,redes,cantidad)
 where a.estado='activo' and a.autoriza_directorio and k.fecha_evento between hoy-7 and hoy+14
  and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado')
 on conflict do nothing;
 get diagnostics m=row_count; n:=n+m;
 insert into public.aliado_publicaciones(aliado_id,tipo,redes,cantidad,semana,vence)
 select a.id,'constante_semanal',array['instagram','tiktok','facebook','whatsapp'],1,lunes,lunes+6 from public.aliados a
 where a.estado='activo' and a.autoriza_directorio
  and (select count(distinct date_trunc('month',k.fecha_evento)) from public.contratos k
       where k.aliado_id=a.id and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado')
        and k.fecha_evento>=(date_trunc('month',hoy)-interval '3 months')::date and k.fecha_evento<date_trunc('month',hoy)::date)=3
 on conflict do nothing;
 get diagnostics m=row_count; n:=n+m;
 return n;
end $$;
revoke all on function private.aliado_publicaciones_generar() from public, anon, authenticated;
select cron.schedule('aliados-publicaciones','5 11 * * *',$c$ select private.aliado_publicaciones_generar(); $c$);

-- Marks a task as published (with the link) or skipped.
create or replace function public.aliado_publicacion_marcar(p_id uuid,p_estado text,p_enlace text,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.tiene_permiso('panel.aliados_publicaciones')) then raise exception 'No tienes permiso para el tablero de publicaciones.'; end if;
 if p_estado not in ('pendiente','publicada','omitida') then raise exception 'Estado no válido.'; end if;
 update public.aliado_publicaciones set estado=p_estado,enlace=nullif(left(btrim(coalesce(p_enlace,'')),500),''),nota=nullif(left(btrim(coalesce(p_nota,'')),300),''),
  publicado_por=case when p_estado='pendiente' then null else auth.uid() end,publicado_at=case when p_estado='pendiente' then null else now() end
 where id=p_id;
end $$;

-- Social data of an ally from the board (for allies who signed up before the new form).
create or replace function public.aliado_visibilidad_guardar(p_id uuid,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.tiene_permiso('panel.aliados_publicaciones')) then raise exception 'No tienes permiso.'; end if;
 update public.aliados set
  nombre_comercial=nullif(btrim(coalesce(p_datos->>'nombre_comercial','')),''),
  instagram=nullif(regexp_replace(coalesce(p_datos->>'instagram',''),'^.*instagram\.com/|^@|/.*$','','g'),''),
  tiktok=nullif(regexp_replace(coalesce(p_datos->>'tiktok',''),'^.*tiktok\.com/@?|^@|/.*$','','g'),''),
  facebook=nullif(btrim(coalesce(p_datos->>'facebook','')),''),
  descripcion_servicios=nullif(btrim(coalesce(p_datos->>'descripcion_servicios','')),''),
  autoriza_directorio=coalesce((p_datos->>'autoriza_directorio')::boolean,autoriza_directorio),
  autoriza_directorio_at=case when coalesce((p_datos->>'autoriza_directorio')::boolean,false) and not autoriza_directorio then now() else autoriza_directorio_at end
 where id=p_id;
end $$;
revoke all on function public.aliado_publicacion_marcar(uuid,text,text,text), public.aliado_visibilidad_guardar(uuid,jsonb) from public, anon;
grant execute on function public.aliado_publicacion_marcar(uuid,text,text,text), public.aliado_visibilidad_guardar(uuid,jsonb) to authenticated;

-- Public directory (read by the server for the public page).
create or replace function public.directorio_aliados()
returns table(nombre text, tipo text, sede text, descripcion text, instagram text, tiktok text, facebook text, whatsapp text, logo_path text, destacado boolean)
language sql stable security definer set search_path='' as $$
 select coalesce(a.nombre_comercial,a.nombre_completo), t.nombre, s.nombre, a.descripcion_servicios, a.instagram, a.tiktok, a.facebook,
  regexp_replace(a.celular,'\D','','g'), a.logo_path,
  exists(select 1 from public.aliado_publicaciones p where p.aliado_id=a.id and p.tipo='constante_semanal' and p.semana>=current_date-35)
 from public.aliados a left join public.tipos_aliado t on t.id=a.tipo_aliado_id left join public.sedes s on s.id=a.sede_principal
 where a.estado='activo' and a.autoriza_directorio
 order by 10 desc, s.nombre, 1
$$;
revoke all on function public.directorio_aliados() from public, anon, authenticated;
grant execute on function public.directorio_aliados() to service_role;

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values ('panel.aliados_publicaciones','Red de aliados','Ver tablero de publicaciones de aliados','Publicaciones en redes por aliado: bienvenida, eventos y aliados constantes',false,40)
on conflict (codigo) do nothing;

-- Board: tasks of the last 5 weeks and the next 2, with the ally's social data and the contract.
create or replace function public.aliado_publicaciones_listar()
returns table(id uuid, aliado_id uuid, aliado text, nombre_comercial text, instagram text, tiktok text, facebook text, celular text, descripcion text, autoriza_directorio boolean,
 sede text, tipo text, redes text[], cantidad int, semana date, material_hasta date, vence date, sin_autorizacion_imagen boolean, estado text, enlace text, nota text,
 contrato text, clienta text, fecha_evento date)
language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.tiene_permiso('panel.aliados_publicaciones')) then raise exception 'No tienes permiso para el tablero de publicaciones.'; end if;
 return query
 select p.id,a.id,a.nombre_completo,a.nombre_comercial,a.instagram,a.tiktok,a.facebook,a.celular,a.descripcion_servicios,a.autoriza_directorio,s.nombre::text,p.tipo,p.redes,p.cantidad,p.semana,
  p.material_hasta,p.vence,p.sin_autorizacion_imagen,p.estado,p.enlace,p.nota,k.numero_contrato::text,k.cliente_nombre::text,k.fecha_evento
 from public.aliado_publicaciones p join public.aliados a on a.id=p.aliado_id left join public.sedes s on s.id=a.sede_principal left join public.contratos k on k.id=p.contrato_id
 where p.semana between current_date-35 and current_date+14
 order by (p.estado='pendiente') desc, p.vence, a.nombre_completo;
end $$;
revoke all on function public.aliado_publicaciones_listar() from public, anon;
grant execute on function public.aliado_publicaciones_listar() to authenticated;

-- Active allies (to complete their social data from the board).
create or replace function public.aliados_visibilidad_listar()
returns table(id uuid, nombre text, nombre_comercial text, instagram text, tiktok text, facebook text, descripcion text, autoriza_directorio boolean, sede text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.tiene_permiso('panel.aliados_publicaciones')) then raise exception 'No tienes permiso.'; end if;
 return query select a.id,a.nombre_completo,a.nombre_comercial,a.instagram,a.tiktok,a.facebook,a.descripcion_servicios,a.autoriza_directorio,s.nombre::text
 from public.aliados a left join public.sedes s on s.id=a.sede_principal where a.estado='activo' order by a.nombre_completo;
end $$;
revoke all on function public.aliados_visibilidad_listar() from public, anon;
grant execute on function public.aliados_visibilidad_listar() to authenticated;
