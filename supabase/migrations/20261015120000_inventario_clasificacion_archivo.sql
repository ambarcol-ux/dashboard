-- Inventario: clasificación de vestidos (con Pajecita), archivar códigos con historial en vez de borrarlos
-- y estado "De Baja" unificado en "Dañado/Baja".

-- 1. Catálogo de clasificaciones (un administrador puede agregar opciones sin tocar código).
create table public.clasificaciones_vestido (
 id smallint generated always as identity primary key,
 nombre text not null unique check (length(btrim(nombre)) between 2 and 40),
 orden smallint not null default 0,
 activo boolean not null default true
);
insert into public.clasificaciones_vestido (nombre, orden) values
 ('Novia',1),('XV Años',2),('Gala',3),('Pajecita',4),('Otro',5);
alter table public.clasificaciones_vestido enable row level security;
revoke all on public.clasificaciones_vestido from public,anon;
grant select,insert,update on public.clasificaciones_vestido to authenticated;
create policy clasificaciones_leer on public.clasificaciones_vestido for select to authenticated using (true);
create policy clasificaciones_admin_crear on public.clasificaciones_vestido for insert to authenticated with check (public.es_admin());
create policy clasificaciones_admin_editar on public.clasificaciones_vestido for update to authenticated using (public.es_admin()) with check (public.es_admin());

alter table public.vestidos
 add column clasificacion_id smallint references public.clasificaciones_vestido(id),
 add column archivado boolean not null default false,
 add column archivado_at timestamptz,
 add column archivado_por uuid references public.profiles(id),
 add column motivo_archivo text;

-- Clasificación sugerida a partir del nombre/código; el resto queda "Sin clasificar" para revisión manual.
update public.vestidos v set clasificacion_id = c.id
from public.clasificaciones_vestido c
where v.clasificacion_id is null and c.nombre = case
 when v.nombre ~* 'paje' or v.codigo ~* 'paje' then 'Pajecita'
 when v.nombre ~* 'novia' then 'Novia'
 when v.nombre ~* '(\mxv\M|quince)' then 'XV Años'
 when v.nombre ~* 'gala' then 'Gala'
end;

-- 2. Estado: "De Baja" y "Dañado/Baja" eran el mismo estado.
update public.vestidos set estado = 'Dañado/Baja' where estado = 'De Baja';
create function private.vestido_estado_baja() returns trigger language plpgsql set search_path='' as $$
begin new.estado:='Dañado/Baja'; return new; end $$;
create trigger vestidos_estado_baja before insert or update of estado on public.vestidos
 for each row when (new.estado = 'De Baja') execute function private.vestido_estado_baja();

-- 3. Archivar / restaurar. Quien puede gestionar un código: usuario activo, no Contabilidad, y si su cuenta
--    está limitada a una sede, solo códigos de esa sede (misma regla que la política operaciones_sede_limitada).
create function private.vestido_gestionable(p_id uuid) returns public.vestidos language plpgsql stable security definer set search_path='' as $$
declare v public.vestidos;
begin
 select * into v from public.vestidos where id=p_id;
 if not found then raise exception 'El código no existe o ya fue eliminado.'; end if;
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and lower(btrim(coalesce(p.rol,'')))<>'contabilidad')
  or ((select private.sede_operativa_limitada()) is not null and v.sede_actual_id is distinct from (select private.sede_operativa_limitada()))
 then raise exception 'No tienes permiso sobre códigos de esta sede.' using errcode='42501'; end if;
 return v;
end $$;

-- Historial que impide borrar un código (y que se debe conservar).
create function private.vestido_referencias(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.vestido_gestionable(p_id);
 return jsonb_build_object(
  'contratos',(select count(*) from public.contrato_items_vestidos where vestido_id=p_id),
  'traslados',(select count(*) from public.traslados_bitacora where vestido_id=p_id),
  'fuera_tienda',(select count(*) from public.vestidos_fuera_tienda where vestido_id=p_id),
  'cambios_contrato',(select count(*) from public.historial_cambios_contrato where vestido_anterior_id=p_id or vestido_nuevo_id=p_id),
  'bloqueo_contrato',(select count(*) from public.contratos where bloqueo_especial_vestido_id=p_id),
  'mantenimiento',(select count(*) from public.mantenimiento_vestidos where vestido_id=p_id)+(select count(*) from public.mantenimiento_bitacora where vestido_id=p_id),
  'prestamos',(select count(*) from public.prestamos_vestidos_sedes where vestido_id=p_id));
end $$;

create function private.archivar_vestido(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare v public.vestidos; reason text:=btrim(coalesce(p_motivo,''));
begin
 v:=private.vestido_gestionable(p_id);
 if v.archivado then raise exception 'El código % ya está archivado.',v.codigo; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo del archivo (mínimo 5 caracteres).'; end if;
 if exists(select 1 from public.contrato_items_vestidos i join public.contratos c on c.id=i.contrato_id
   where i.vestido_id=p_id and lower(coalesce(c.estado,'')) not in ('finalizado','cancelado','anulado') and c.fecha_evento>=(now() at time zone 'America/Bogota')::date)
 then raise exception 'El código % tiene contratos vigentes o eventos próximos; no se puede archivar todavía.',v.codigo; end if;
 update public.vestidos set archivado=true,archivado_at=now(),archivado_por=auth.uid(),motivo_archivo=reason where id=p_id;
end $$;

create function private.restaurar_vestido(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v public.vestidos;
begin
 v:=private.vestido_gestionable(p_id);
 if not v.archivado then raise exception 'El código % no está archivado.',v.codigo; end if;
 update public.vestidos set archivado=false,archivado_at=null,archivado_por=null,motivo_archivo=null where id=p_id;
end $$;

create function public.vestido_referencias(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.vestido_referencias(p_id); $$;
create function public.archivar_vestido(p_id uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.archivar_vestido(p_id,p_motivo); $$;
create function public.restaurar_vestido(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.restaurar_vestido(p_id); $$;

revoke all on function private.vestido_estado_baja(),private.vestido_gestionable(uuid),private.vestido_referencias(uuid),private.archivar_vestido(uuid,text),private.restaurar_vestido(uuid),
 public.vestido_referencias(uuid),public.archivar_vestido(uuid,text),public.restaurar_vestido(uuid) from public,anon;
grant execute on function private.vestido_gestionable(uuid),private.vestido_referencias(uuid),private.archivar_vestido(uuid,text),private.restaurar_vestido(uuid),
 public.vestido_referencias(uuid),public.archivar_vestido(uuid,text),public.restaurar_vestido(uuid) to authenticated;
