-- Código de vestido único en todas las sedes (un vestido que cambia de sede se mueve con Traslados, no se crea otra ficha).
-- Para los 17 códigos ya repetidos: Inventario › Duplicados permite unificar (la ficha que queda recibe contratos, traslados,
-- mantenimientos, bitácora y demás historial; la otra se archiva) con opción de deshacer, o cambiar el código si son vestidos distintos.
-- Reversión: drop trigger vestidos_codigo_unico on public.vestidos; drop function private.vestido_codigo_unico(),
--   public.vestidos_duplicados(), public.unificar_vestidos(uuid,uuid,text), public.deshacer_unificacion_vestidos(bigint),
--   public.cambiar_codigo_vestido(uuid,text,text); drop table public.vestidos_unificaciones;
create table if not exists public.vestidos_unificaciones(
 id bigint generated always as identity primary key,
 codigo text not null, queda_id uuid not null, sobra_id uuid not null,
 movidos jsonb not null default '[]', sobra_antes jsonb not null, motivo text not null,
 usuario_id uuid, created_at timestamptz not null default now(), deshecho_at timestamptz, deshecho_por uuid
);
alter table public.vestidos_unificaciones enable row level security;
create policy vestidos_unificaciones_ver on public.vestidos_unificaciones for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.vestidos_unificaciones from anon, authenticated;

-- New codes, code changes and restoring an archived dress cannot repeat an active code of any store.
create or replace function private.vestido_codigo_unico() returns trigger language plpgsql security definer set search_path='' as $$
declare s text;
begin
 if coalesce(new.archivado,false) or current_setting('ambar.unificacion',true)='1' then return new; end if;
 if tg_op='UPDATE' and upper(btrim(coalesce(new.codigo,'')))=upper(btrim(coalesce(old.codigo,''))) and not coalesce(old.archivado,false) then return new; end if;
 select coalesce(sd.nombre,'otra sede') into s from public.vestidos v left join public.sedes sd on sd.id=v.sede_actual_id
 where upper(btrim(v.codigo))=upper(btrim(new.codigo)) and v.id<>new.id and not coalesce(v.archivado,false) limit 1;
 if found then raise exception 'El código % ya existe en %. Si el vestido cambió de sede, usa Traslados; si es otro vestido, usa un código distinto.',btrim(new.codigo),s using errcode='23505'; end if;
 return new;
end $$;
drop trigger if exists vestidos_codigo_unico on public.vestidos;
create trigger vestidos_codigo_unico before insert or update of codigo, archivado on public.vestidos for each row execute function private.vestido_codigo_unico();

-- Active codes with more than one record, with what each record has (administration only).
create or replace function public.vestidos_duplicados() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if not coalesce(public.es_admin(),false) then raise exception 'Solo administración.' using errcode='42501'; end if;
 with d as (select upper(btrim(codigo)) k from public.vestidos where not coalesce(archivado,false) group by 1 having count(*)>1)
 select coalesce(jsonb_agg(jsonb_build_object('codigo',g.k,'fichas',g.fichas) order by g.k),'[]') into r from (
  select d.k, jsonb_agg(jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre,'talla',v.talla,'color',v.color,'estado',v.estado,'sede',sd.nombre,
   'creado',(v.created_at at time zone 'America/Bogota')::date,'foto',coalesce(nullif(v.foto_frente,''),nullif(v.imagen_url,'')),
   'contratos',(select count(distinct k.id) from public.contratos k where k.vestido_id=v.id or k.id in (select i.contrato_id from public.contrato_items_vestidos i where i.vestido_id=v.id)),
   'traslados',(select count(*) from public.traslados_bitacora t where t.vestido_id=v.id),
   'mantenimientos',(select count(*) from public.mantenimiento_vestidos m where m.vestido_id=v.id)) order by v.created_at) fichas
  from d join public.vestidos v on upper(btrim(v.codigo))=d.k and not coalesce(v.archivado,false) left join public.sedes sd on sd.id=v.sede_actual_id group by d.k) g;
 return r;
end $$;

-- Keeps p_queda and moves every reference of p_sobra to it; p_sobra is archived. Everything moved is logged for undo.
create or replace function public.unificar_vestidos(p_queda uuid,p_sobra uuid,p_motivo text) returns bigint language plpgsql security definer set search_path='' as $$
declare q public.vestidos; s public.vestidos; mov jsonb:='[]'; ids jsonb; t record; new_id bigint; email text;
begin
 if not coalesce(public.es_admin(),false) then raise exception 'Solo administración puede unificar vestidos.' using errcode='42501'; end if;
 if length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Explica en al menos 10 caracteres por qué se unifican.'; end if;
 select * into q from public.vestidos where id=p_queda for update; select * into s from public.vestidos where id=p_sobra for update;
 if q.id is null or s.id is null or q.id=s.id then raise exception 'Elige dos fichas distintas.'; end if;
 if upper(btrim(q.codigo))<>upper(btrim(s.codigo)) then raise exception 'Solo se unifican fichas con el mismo código.'; end if;
 if coalesce(q.archivado,false) or coalesce(s.archivado,false) then raise exception 'Alguna de las fichas ya está archivada.'; end if;
 perform set_config('ambar.fusion_ficha','1',true); perform set_config('ambar.unificacion','1',true);
 for t in select * from (values ('contratos','vestido_id'),('contratos','bloqueo_especial_vestido_id'),('contrato_items_vestidos','vestido_id'),('traslados_bitacora','vestido_id'),
   ('bitacora_vestidos','vestido_id'),('mantenimiento_vestidos','vestido_id'),('mantenimiento_bitacora','vestido_id'),('historial_cambios_contrato','vestido_anterior_id'),
   ('historial_cambios_contrato','vestido_nuevo_id'),('vestidos_fuera_tienda','vestido_id'),('prestamos_vestidos_sedes','vestido_id'),('ventas_vestidos','vestido_id'),
   ('vestido_excepciones_ficha','vestido_id'),('bitacora_eliminaciones_contrato','vestido_id')) x(tabla,columna) loop
  execute format('with u as (update public.%I set %I=$1 where %I=$2 returning id) select coalesce(jsonb_agg(id),''[]'') from u',t.tabla,t.columna,t.columna) into ids using p_queda,p_sobra;
  if jsonb_array_length(ids)>0 then mov:=mov||jsonb_build_object('tabla',t.tabla,'columna',t.columna,'ids',ids); end if;
 end loop;
 update public.vestidos set archivado=true,archivado_at=now(),archivado_por=auth.uid(),motivo_archivo=left('Duplicado unificado con la ficha de '||coalesce((select nombre from public.sedes where id=q.sede_actual_id),'otra sede')||': '||btrim(p_motivo),500) where id=p_sobra;
 insert into public.vestidos_unificaciones(codigo,queda_id,sobra_id,movidos,sobra_antes,motivo,usuario_id)
 values(q.codigo,p_queda,p_sobra,mov,jsonb_build_object('archivado',s.archivado,'archivado_at',s.archivado_at,'archivado_por',s.archivado_por,'motivo_archivo',s.motivo_archivo),btrim(p_motivo),auth.uid()) returning id into new_id;
 select x.email into email from auth.users x where x.id=auth.uid();
 insert into public.bitacora_vestidos(vestido_id,usuario_email,accion,motivo,detalle,fecha) values
  (p_queda,email,'Unificación de duplicado',btrim(p_motivo),'Recibió el historial de la ficha duplicada del mismo código ('||jsonb_array_length(mov)||' tipos de registro).',now()),
  (p_sobra,email,'Archivado por duplicado',btrim(p_motivo),'Su historial pasó a la ficha que queda. Se puede deshacer desde Inventario › Duplicados.',now());
 return new_id;
end $$;

-- Undo: moves the logged rows back and restores the archived record as it was.
create or replace function public.deshacer_unificacion_vestidos(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare u public.vestidos_unificaciones; m jsonb; email text;
begin
 if not coalesce(public.es_admin(),false) then raise exception 'Solo administración.' using errcode='42501'; end if;
 select * into u from public.vestidos_unificaciones where id=p_id for update;
 if u.id is null or u.deshecho_at is not null then raise exception 'Esta unificación no existe o ya se deshizo.'; end if;
 perform set_config('ambar.fusion_ficha','1',true); perform set_config('ambar.unificacion','1',true);
 for m in select * from jsonb_array_elements(u.movidos) loop
  execute format('update public.%I set %I=$1 where id::text in (select jsonb_array_elements_text($2))',m->>'tabla',m->>'columna') using u.sobra_id,m->'ids';
 end loop;
 update public.vestidos set archivado=coalesce((u.sobra_antes->>'archivado')::boolean,false),archivado_at=(u.sobra_antes->>'archivado_at')::timestamptz,
  archivado_por=(u.sobra_antes->>'archivado_por')::uuid,motivo_archivo=u.sobra_antes->>'motivo_archivo' where id=u.sobra_id;
 update public.vestidos_unificaciones set deshecho_at=now(),deshecho_por=auth.uid() where id=p_id;
 select x.email into email from auth.users x where x.id=auth.uid();
 insert into public.bitacora_vestidos(vestido_id,usuario_email,accion,motivo,detalle,fecha) values
  (u.queda_id,email,'Unificación deshecha',null,'El historial volvió a la ficha duplicada.',now()),(u.sobra_id,email,'Unificación deshecha',null,'La ficha volvió a estar activa con su historial.',now());
end $$;

-- Different dresses that share a code: one of them gets a new code (unique in all stores).
create or replace function public.cambiar_codigo_vestido(p_id uuid,p_codigo text,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare v public.vestidos; email text;
begin
 if not coalesce(public.es_admin(),false) then raise exception 'Solo administración.' using errcode='42501'; end if;
 if length(btrim(coalesce(p_codigo,'')))<2 then raise exception 'Escribe el código nuevo.'; end if;
 select * into v from public.vestidos where id=p_id for update;
 if v.id is null then raise exception 'Vestido no encontrado.'; end if;
 update public.vestidos set codigo=btrim(p_codigo) where id=p_id;
 select x.email into email from auth.users x where x.id=auth.uid();
 insert into public.bitacora_vestidos(vestido_id,usuario_email,accion,motivo,detalle,fecha) values
  (p_id,email,'Cambio de código',nullif(btrim(coalesce(p_motivo,'')),''),'Código anterior: '||v.codigo||' · nuevo: '||btrim(p_codigo)||'.',now());
end $$;

revoke all on function public.vestidos_duplicados(), public.unificar_vestidos(uuid,uuid,text), public.deshacer_unificacion_vestidos(bigint), public.cambiar_codigo_vestido(uuid,text,text) from public, anon;
grant execute on function public.vestidos_duplicados(), public.unificar_vestidos(uuid,uuid,text), public.deshacer_unificacion_vestidos(bigint), public.cambiar_codigo_vestido(uuid,text,text) to authenticated;
