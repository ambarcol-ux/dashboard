-- Configuración reutilizable (solo Administrador): Listas, Parámetros y Formularios, con historial.
-- Listas reutiliza public.listas_contrato (banco / tipo_cuenta siguen igual). Lo usado se desactiva; lo bloqueado no se oculta ni se cambia.
-- Revert:
--   drop function if exists public.config_quitar(text,text,text); drop function if exists private.config_valor_en_uso(text,text);
--   drop trigger if exists config_guardia on public.listas_contrato; drop trigger if exists config_historial on public.listas_contrato;
--   delete from public.listas_contrato where lista like 'pv\_%';
--   alter table public.listas_contrato drop constraint if exists listas_contrato_lista_fk, drop column if exists etiqueta, drop column if exists bloqueado;
--   alter table public.listas_contrato add constraint listas_contrato_lista_check check (lista in ('banco','tipo_cuenta'));
--   drop table if exists public.config_formularios, public.config_parametros, public.config_listas, public.config_historial;
--   drop function if exists private.config_registrar_historial(), private.config_guardia_listas(), private.config_guardia_items(), private.config_guardia_parametros(), private.config_guardia_formularios();

create table if not exists public.config_historial(
 id uuid primary key default gen_random_uuid(),
 tabla text not null, clave text not null, accion text not null check (accion in ('crear','editar','eliminar')),
 anterior jsonb, nuevo jsonb,
 usuario_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists config_historial_tabla_clave on public.config_historial(tabla,clave,created_at desc);

create table if not exists public.config_listas(
 clave text primary key check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
 nombre text not null check (length(btrim(nombre)) between 2 and 80),
 modulo text not null default 'General',
 descripcion text not null default '',
 cerrada boolean not null default false,
 uso jsonb,
 activo boolean not null default true,
 updated_at timestamptz not null default now()
);

create table if not exists public.config_parametros(
 clave text primary key check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
 nombre text not null check (length(btrim(nombre)) between 2 and 80),
 modulo text not null default 'General',
 descripcion text not null default '',
 tipo text not null default 'entero' check (tipo in ('entero','decimal','texto','booleano')),
 valor jsonb not null,
 minimo numeric, maximo numeric,
 bloqueado boolean not null default false,
 uso text,
 activo boolean not null default true,
 updated_at timestamptz not null default now()
);

create table if not exists public.config_formularios(
 clave text primary key check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
 nombre text not null check (length(btrim(nombre)) between 2 and 80),
 modulo text not null default 'General',
 descripcion text not null default '',
 campos jsonb not null default '[]'::jsonb check (jsonb_typeof(campos)='array'),
 uso text,
 activo boolean not null default true,
 updated_at timestamptz not null default now()
);

-- Listas: listas_contrato pasa a aceptar cualquier lista registrada en config_listas.
insert into public.config_listas(clave,nombre,modulo,descripcion,uso) values
 ('banco','Bancos','Contratos','Banco para devolver el depósito.','["contratos.banco_deposito","solicitudes_depositos.banco","aliados.banco","proveedores.banco"]'),
 ('tipo_cuenta','Tipos de cuenta','Contratos','Tipo de cuenta para devolver el depósito.','["contratos.tipo_cuenta_deposito","solicitudes_depositos.tipo_cuenta","aliados.tipo_cuenta","proveedores.tipo_cuenta"]')
on conflict (clave) do nothing;
alter table public.listas_contrato add column if not exists etiqueta text, add column if not exists bloqueado boolean not null default false;
alter table public.listas_contrato drop constraint if exists listas_contrato_lista_check;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='listas_contrato_lista_fk') then
  alter table public.listas_contrato add constraint listas_contrato_lista_fk foreign key (lista) references public.config_listas(clave) on update cascade;
 end if;
end $$;

alter table public.config_historial enable row level security;
alter table public.config_listas enable row level security;
alter table public.config_parametros enable row level security;
alter table public.config_formularios enable row level security;
revoke all on public.config_historial, public.config_listas, public.config_parametros, public.config_formularios from anon;
revoke insert, update, delete on public.config_historial from authenticated;
create policy config_historial_admin on public.config_historial for select to authenticated using (public.es_admin());
create policy config_listas_leer on public.config_listas for select to authenticated using (true);
create policy config_listas_admin on public.config_listas for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy config_parametros_leer on public.config_parametros for select to authenticated using (true);
create policy config_parametros_admin on public.config_parametros for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy config_formularios_leer on public.config_formularios for select to authenticated using (true);
create policy config_formularios_admin on public.config_formularios for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Historial de todo cambio hecho desde la aplicación o por migración.
create or replace function private.config_registrar_historial() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb; k text;
begin
 if tg_op='DELETE' then j:=to_jsonb(old); else j:=to_jsonb(new); end if;
 k:=case when tg_table_name='listas_contrato' then (j->>'lista')||':'||(j->>'valor') else j->>'clave' end;
 insert into public.config_historial(tabla,clave,accion,anterior,nuevo,usuario_id)
 values(tg_table_name,k,case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'editar' else 'eliminar' end,
  case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end,
  (select p.id from public.profiles p where p.id=auth.uid()));
 return null;
end $$;

-- Guardias: solo aplican a cambios hechos desde la aplicación (auth.uid() no nulo); las migraciones no se limitan.
create or replace function private.config_guardia_listas() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then new.updated_at:=now(); return new; end if;
 if tg_op='INSERT' then new.cerrada:=false; new.uso:=null;
 else
  if new.clave<>old.clave then raise exception 'La clave de una lista no se puede cambiar.'; end if;
  new.cerrada:=old.cerrada; new.uso:=old.uso;
  if old.cerrada and new.activo is distinct from old.activo then raise exception 'Esta lista la usa el sistema: no se puede desactivar.'; end if;
 end if;
 new.updated_at:=now(); return new;
end $$;

create or replace function private.config_guardia_items() returns trigger language plpgsql security definer set search_path='' as $$
declare cerrada boolean;
begin
 if auth.uid() is null then return coalesce(new,old); end if;
 select l.cerrada into cerrada from public.config_listas l where l.clave=coalesce(new.lista,old.lista);
 if tg_op='DELETE' then
  if old.bloqueado or coalesce(cerrada,false) then raise exception 'Este valor lo usa el sistema: no se puede eliminar.'; end if;
  if private.config_valor_en_uso(old.lista,old.valor) then raise exception 'Este valor ya se usó: desactívalo en lugar de eliminarlo.'; end if;
  return old;
 end if;
 if tg_op='INSERT' then
  if coalesce(cerrada,false) then raise exception 'Esta lista la valida el sistema: no admite valores nuevos.'; end if;
  new.bloqueado:=false; return new;
 end if;
 if new.lista<>old.lista or new.valor<>old.valor then raise exception 'El valor guardado no se puede cambiar; crea uno nuevo y desactiva este.'; end if;
 new.bloqueado:=old.bloqueado;
 if old.bloqueado and (new.activo is distinct from old.activo or new.etiqueta is distinct from old.etiqueta) then raise exception 'Este valor está bloqueado: el sistema depende de él.'; end if;
 return new;
end $$;

create or replace function private.config_guardia_parametros() returns trigger language plpgsql security definer set search_path='' as $$
declare n numeric;
begin
 if auth.uid() is null then if tg_op<>'DELETE' then new.updated_at:=now(); end if; return coalesce(new,old); end if;
 if tg_op='DELETE' then
  if old.bloqueado or old.uso is not null then raise exception 'Este parámetro está en uso: desactívalo en lugar de eliminarlo.'; end if;
  return old;
 end if;
 if tg_op='INSERT' then new.bloqueado:=false; new.uso:=null;
 else
  if new.clave<>old.clave then raise exception 'La clave de un parámetro no se puede cambiar.'; end if;
  if old.bloqueado and to_jsonb(new)-'updated_at' is distinct from to_jsonb(old)-'updated_at' then raise exception 'Este parámetro es un cálculo del sistema: está bloqueado.'; end if;
  new.bloqueado:=old.bloqueado; new.uso:=old.uso; new.tipo:=old.tipo;
 end if;
 if new.tipo in ('entero','decimal') then
  if jsonb_typeof(new.valor)<>'number' then raise exception 'Escribe un número.'; end if;
  n:=(new.valor)::text::numeric;
  if new.tipo='entero' and n<>trunc(n) then raise exception 'Escribe un número entero.'; end if;
  if (new.minimo is not null and n<new.minimo) or (new.maximo is not null and n>new.maximo) then raise exception 'El valor debe estar entre % y %.',coalesce(new.minimo::text,'—'),coalesce(new.maximo::text,'—'); end if;
 elsif new.tipo='booleano' and jsonb_typeof(new.valor)<>'boolean' then raise exception 'Elige sí o no.';
 elsif new.tipo='texto' and jsonb_typeof(new.valor)<>'string' then raise exception 'Escribe un texto.';
 end if;
 new.updated_at:=now(); return new;
end $$;

create or replace function private.config_guardia_formularios() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 if auth.uid() is null then if tg_op<>'DELETE' then new.updated_at:=now(); end if; return coalesce(new,old); end if;
 if tg_op='DELETE' then
  if old.uso is not null then raise exception 'Este formulario está en uso: desactívalo en lugar de eliminarlo.'; end if;
  if exists(select 1 from jsonb_array_elements(old.campos) e where coalesce((e->>'bloqueado')::boolean,false)) then raise exception 'Este formulario tiene campos bloqueados: no se puede eliminar.'; end if;
  return old;
 end if;
 if tg_op='INSERT' then
  new.uso:=null;
  new.campos:=coalesce((select jsonb_agg(e-'bloqueado') from jsonb_array_elements(new.campos) e),'[]'::jsonb);
 else
  if new.clave<>old.clave then raise exception 'La clave de un formulario no se puede cambiar.'; end if;
  new.uso:=old.uso;
  for c in select e from jsonb_array_elements(old.campos) e where coalesce((e->>'bloqueado')::boolean,false) loop
   if not exists(select 1 from jsonb_array_elements(new.campos) x where x=c) then raise exception 'El campo "%" está bloqueado: no se puede quitar ni cambiar.',c->>'etiqueta'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(new.campos) x where coalesce((x->>'bloqueado')::boolean,false) and not exists(select 1 from jsonb_array_elements(old.campos) o where o=x)) then raise exception 'Solo el sistema puede bloquear campos.'; end if;
 end if;
 if exists(select 1 from jsonb_array_elements(new.campos) x where coalesce(x->>'campo','')!~'^[a-z][a-z0-9_]{0,40}$' or length(btrim(coalesce(x->>'etiqueta','')))<2) then raise exception 'Cada campo necesita un nombre interno (minúsculas) y una etiqueta.'; end if;
 if exists(select 1 from jsonb_array_elements(new.campos) x where x->>'lista' is not null and not exists(select 1 from public.config_listas l where l.clave=x->>'lista')) then raise exception 'Uno de los campos usa una lista que no existe.'; end if;
 new.updated_at:=now(); return new;
end $$;

-- ¿Ya se guardó este valor en algún registro? Solo revisa las columnas declaradas en config_listas.uso.
create or replace function private.config_valor_en_uso(p_lista text,p_valor text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare u text; t text; c text; hit boolean;
begin
 for u in select jsonb_array_elements_text(coalesce(l.uso,'[]'::jsonb)) from public.config_listas l where l.clave=p_lista loop
  t:=split_part(u,'.',1); c:=split_part(u,'.',2);
  if exists(select 1 from information_schema.columns ic where ic.table_schema='public' and ic.table_name=t and ic.column_name=c) then
   execute format('select exists(select 1 from public.%I where %I::text=$1)',t,c) into hit using p_valor;
   if hit then return true; end if;
  end if;
 end loop;
 return false;
end $$;

-- Quitar: elimina si nunca se usó; si ya se usó, lo desactiva. Devuelve 'eliminado' o 'desactivado'.
create or replace function public.config_quitar(p_tipo text,p_clave text,p_valor text default null) returns text language plpgsql security definer set search_path='' as $$
declare usado boolean;
begin
 if not public.es_admin() then raise exception 'Solo Administrador puede cambiar la configuración.' using errcode='42501'; end if;
 if p_tipo='item' then
  if exists(select 1 from public.listas_contrato where lista=p_clave and valor=p_valor and bloqueado) then raise exception 'Este valor está bloqueado: el sistema depende de él.'; end if;
  if exists(select 1 from public.listas_contrato i join public.config_listas l on l.clave=i.lista where i.lista=p_clave and i.valor=p_valor and l.cerrada) then
   update public.listas_contrato set activo=false where lista=p_clave and valor=p_valor; return 'desactivado';
  end if;
  usado:=private.config_valor_en_uso(p_clave,p_valor);
  if usado then update public.listas_contrato set activo=false where lista=p_clave and valor=p_valor; return 'desactivado'; end if;
  delete from public.listas_contrato where lista=p_clave and valor=p_valor; return 'eliminado';
 elsif p_tipo='lista' then
  if exists(select 1 from public.config_listas where clave=p_clave and cerrada) then raise exception 'Esta lista la usa el sistema: no se puede quitar.'; end if;
  if exists(select 1 from public.config_listas where clave=p_clave and (cerrada or uso is not null)) or exists(select 1 from public.listas_contrato where lista=p_clave) then
   update public.config_listas set activo=false where clave=p_clave; return 'desactivado';
  end if;
  delete from public.config_listas where clave=p_clave; return 'eliminado';
 elsif p_tipo='parametro' then
  if exists(select 1 from public.config_parametros where clave=p_clave and bloqueado) then raise exception 'Este parámetro es un cálculo del sistema: está bloqueado.'; end if;
  if exists(select 1 from public.config_parametros where clave=p_clave and (bloqueado or uso is not null)) then
   update public.config_parametros set activo=false where clave=p_clave; return 'desactivado';
  end if;
  delete from public.config_parametros where clave=p_clave; return 'eliminado';
 elsif p_tipo='formulario' then
  if exists(select 1 from public.config_formularios f where f.clave=p_clave and (f.uso is not null or exists(select 1 from jsonb_array_elements(f.campos) e where coalesce((e->>'bloqueado')::boolean,false)))) then
   update public.config_formularios set activo=false where clave=p_clave; return 'desactivado';
  end if;
  delete from public.config_formularios where clave=p_clave; return 'eliminado';
 end if;
 raise exception 'Tipo no válido.';
end $$;
revoke all on function public.config_quitar(text,text,text) from public, anon;
grant execute on function public.config_quitar(text,text,text) to authenticated;
revoke all on function private.config_valor_en_uso(text,text), private.config_registrar_historial(), private.config_guardia_listas(), private.config_guardia_items(), private.config_guardia_parametros(), private.config_guardia_formularios() from public, anon, authenticated;

create trigger config_guardia before insert or update on public.config_listas for each row execute function private.config_guardia_listas();
create trigger config_guardia before insert or update or delete on public.listas_contrato for each row execute function private.config_guardia_items();
create trigger config_guardia before insert or update or delete on public.config_parametros for each row execute function private.config_guardia_parametros();
create trigger config_guardia before insert or update or delete on public.config_formularios for each row execute function private.config_guardia_formularios();
create trigger config_historial after insert or update or delete on public.config_listas for each row execute function private.config_registrar_historial();
create trigger config_historial after insert or update or delete on public.listas_contrato for each row execute function private.config_registrar_historial();
create trigger config_historial after insert or update or delete on public.config_parametros for each row execute function private.config_registrar_historial();
create trigger config_historial after insert or update or delete on public.config_formularios for each row execute function private.config_registrar_historial();

-- Primeras visitas: lo que estaba fijo en el código. Las listas son cerradas porque la base valida esos valores.
insert into public.config_listas(clave,nombre,modulo,descripcion,cerrada,uso) values
 ('pv_canales','Canales de seguimiento','Primeras visitas','Canal con el que se hizo el seguimiento.',true,'["primeras_citas_seguimientos.canal"]'),
 ('pv_resultados_asistida','Resultados · cita asistida','Primeras visitas','Resultado de un seguimiento de cita asistida que no alquiló.',true,'["primeras_citas_seguimientos.resultado"]'),
 ('pv_resultados_vitrina','Resultados · vitrina','Primeras visitas','Resultado de un seguimiento de visita de vitrina.',true,'["primeras_citas_seguimientos.resultado"]'),
 ('pv_resultados_no_asistida','Resultados · cita no asistida','Primeras visitas','Resultado de un seguimiento de cita no asistida.',true,'["primeras_citas_seguimientos.resultado"]'),
 ('pv_motivos_desistio','Motivos de desistimiento','Primeras visitas','Se pide cuando el resultado es Desistió.',true,'["primeras_citas_seguimientos.motivo"]'),
 ('pv_resultados_finalizar','Resultados al finalizar','Primeras visitas','Resultado con el que se cierra el seguimiento.',true,'["primeras_citas.cierre_seguimiento"]'),
 ('pv_tipos_seguimiento','Tipos de seguimiento','Primeras visitas','Calculado por el sistema según la visita.',true,'["primeras_citas.tipo_seguimiento"]'),
 ('pv_estados_visita','Estados de la visita','Primeras visitas','Calculado por el sistema (asistencia y alquiler). Se usa en el filtro de la lista.',true,null),
 ('pv_estados_cita','Estados de la cita','Primeras visitas','Estado guardado de la cita.',true,'["primeras_citas.estado"]'),
 ('pv_tipos_evento_vitrina','Tipos de evento · vitrina','Primeras visitas','Tipo de evento al registrar una visita de vitrina.',true,null),
 ('pv_como_se_entero','Cómo se enteró','Primeras visitas','Origen de la clienta de vitrina.',true,'["primeras_citas.como_se_entero"]'),
 ('pv_resultados_visita_vitrina','Resultados de visita de vitrina','Primeras visitas','Calculado al registrar la visita.',true,'["primeras_citas.resultado_visita"]'),
 ('pv_estados_vitrina','Estados de vitrina','Primeras visitas','Estados que cuentan como visita de vitrina.',true,null),
 ('pv_tipos_vestido','Tipos de vestido · agenda pública','Primeras visitas','Tipo de vestido al agendar desde la página pública.',true,'["primeras_citas.tipo_vestido"]'),
 ('pv_motivos_no_alquilo','Motivos de no alquiler · enlace de la clienta','Primeras visitas','Opciones que la clienta elige desde su enlace o WhatsApp.',true,'["primeras_citas.motivo_no_alquiler"]'),
 ('pv_resultados_comerciales','Resultados comerciales','Primeras visitas','Estado comercial guardado de la cita.',true,null),
 ('pv_resultados_seguimiento','Resultados de seguimiento (anterior)','Primeras visitas','Valores del registro anterior de seguimientos.',true,null),
 ('pv_resultados_cierran','Resultados que cierran el plan','Primeras visitas','Calculado: estos resultados terminan el plan de seguimiento.',true,null),
 ('pv_plantillas_confirmacion','Plantillas de confirmación WhatsApp','Primeras visitas','Plantillas aprobadas por WhatsApp.',true,null)
on conflict (clave) do nothing;

insert into public.listas_contrato(lista,valor,etiqueta,orden,bloqueado)
select l,v,e,o,b from (values
 ('pv_canales','WhatsApp',null,1,false),('pv_canales','Llamada',null,2,false),('pv_canales','Correo',null,3,false),('pv_canales','Presencial',null,4,false),
 ('pv_resultados_asistida','Sin respuesta',null,1,false),('pv_resultados_asistida','Interesada',null,2,false),('pv_resultados_asistida','Regresó',null,3,false),('pv_resultados_asistida','Alquiló',null,4,true),('pv_resultados_asistida','Desistió',null,5,true),('pv_resultados_asistida','No desea contacto',null,6,true),
 ('pv_resultados_vitrina','Sin respuesta',null,1,false),('pv_resultados_vitrina','Interesada',null,2,false),('pv_resultados_vitrina','Regresó',null,3,false),('pv_resultados_vitrina','Alquiló',null,4,true),('pv_resultados_vitrina','Desistió',null,5,true),('pv_resultados_vitrina','No desea contacto',null,6,true),
 ('pv_resultados_no_asistida','Sin respuesta',null,1,false),('pv_resultados_no_asistida','Reagendó',null,2,false),('pv_resultados_no_asistida','Canceló',null,3,false),('pv_resultados_no_asistida','Desistió',null,4,true),('pv_resultados_no_asistida','Alquiló',null,5,true),('pv_resultados_no_asistida','No desea contacto',null,6,true),
 ('pv_motivos_desistio','Precio',null,1,false),('pv_motivos_desistio','Alquiló en otro lugar',null,2,false),('pv_motivos_desistio','Cambió o canceló el evento',null,3,false),('pv_motivos_desistio','No le gustaron los modelos',null,4,false),('pv_motivos_desistio','Otro',null,5,true),
 ('pv_resultados_finalizar','Alquiló',null,1,true),('pv_resultados_finalizar','Desistió',null,2,false),('pv_resultados_finalizar','No desea contacto',null,3,false),('pv_resultados_finalizar','Canceló',null,4,false),('pv_resultados_finalizar','Sin respuesta',null,5,false),
 ('pv_tipos_seguimiento','asistida','Cita asistida (no alquiló)',1,true),('pv_tipos_seguimiento','vitrina','Vitrina (no alquiló)',2,true),('pv_tipos_seguimiento','no_asistida','Cita no asistida',3,true),
 ('pv_estados_visita','por_atender','Por atender',1,true),('pv_estados_visita','sin_registrar','Sin registrar asistencia',2,true),('pv_estados_visita','alquilo','Asistió · Alquiló',3,true),('pv_estados_visita','no_alquilo','Asistió · No alquiló',4,true),('pv_estados_visita','sin_resultado','Asistió · falta registrar si alquiló',5,true),('pv_estados_visita','no_asistio','No asistió',6,true),('pv_estados_visita','cancelada','Cancelada',7,true),
 ('pv_estados_cita','agendada','Agendada',1,true),('pv_estados_cita','confirmada','Confirmada',2,true),('pv_estados_cita','asistio','Asistió',3,true),('pv_estados_cita','seguimiento','En seguimiento',4,true),('pv_estados_cita','no_asistio','No asistió',5,true),('pv_estados_cita','no_cerro','No cerró',6,true),('pv_estados_cita','cancelada','Cancelada',7,true),
 ('pv_tipos_evento_vitrina','XV años',null,1,false),('pv_tipos_evento_vitrina','Grado',null,2,false),('pv_tipos_evento_vitrina','Gala',null,3,false),('pv_tipos_evento_vitrina','Otro',null,4,true),
 ('pv_como_se_entero','Instagram',null,1,false),('pv_como_se_entero','Recomendación',null,2,false),('pv_como_se_entero','Pasaba por la tienda',null,3,false),('pv_como_se_entero','Otro',null,4,true),
 ('pv_resultados_visita_vitrina','Cerrado',null,1,true),('pv_resultados_visita_vitrina','Contrato pendiente',null,2,true),('pv_resultados_visita_vitrina','En seguimiento',null,3,true),('pv_resultados_visita_vitrina','No cerró',null,4,true),
 ('pv_estados_vitrina','asistio',null,1,true),('pv_estados_vitrina','seguimiento',null,2,true),('pv_estados_vitrina','no_cerro',null,3,true),
 ('pv_tipos_vestido','Gala',null,1,true),('pv_tipos_vestido','Quince',null,2,true),('pv_tipos_vestido','Novia',null,3,true),
 ('pv_motivos_no_alquilo','Precio',null,1,true),('pv_motivos_no_alquilo','No encontré vestido',null,2,true),('pv_motivos_no_alquilo','Visitaré otras tiendas',null,3,true),('pv_motivos_no_alquilo','Debo consultarlo',null,4,true),('pv_motivos_no_alquilo','Fecha del evento',null,5,true),('pv_motivos_no_alquilo','Talla / diseño / ajuste',null,6,true),('pv_motivos_no_alquilo','Otro',null,7,true),
 ('pv_resultados_comerciales','EN SEGUIMIENTO',null,1,true),('pv_resultados_comerciales','ALQUILÓ',null,2,true),('pv_resultados_comerciales','AGENDÓ NUEVA CITA',null,3,true),('pv_resultados_comerciales','DESISTIÓ',null,4,true),('pv_resultados_comerciales','CERRADO SIN RESPUESTA',null,5,true),('pv_resultados_comerciales','NO CONTACTAR',null,6,true),('pv_resultados_comerciales','EVENTO FINALIZADO',null,7,true),
 ('pv_resultados_seguimiento','Sin respuesta',null,1,true),('pv_resultados_seguimiento','Interesada',null,2,true),('pv_resultados_seguimiento','Reagendó',null,3,true),('pv_resultados_seguimiento','Alquiló',null,4,true),('pv_resultados_seguimiento','Descartó',null,5,true),('pv_resultados_seguimiento','No desea contacto',null,6,true),
 ('pv_resultados_cierran','Alquiló',null,1,true),('pv_resultados_cierran','Descartó',null,2,true),('pv_resultados_cierran','No desea contacto',null,3,true),
 ('pv_plantillas_confirmacion','presencial','ambar_cita_confirmada_sede',1,true),('pv_plantillas_confirmacion','virtual','ambar_cita_confirmada_virtual',2,true)
) as t(l,v,e,o,b)
on conflict (lista,valor) do nothing;

insert into public.config_parametros(clave,nombre,modulo,descripcion,tipo,valor,minimo,maximo,bloqueado,uso) values
 ('pv_rango_max_dias','Rango máximo de búsqueda (días)','Primeras visitas','Días máximos entre Desde y Hasta en la lista de visitas.','entero','366',1,731,false,'components/FirstVisits.tsx'),
 ('pv_alertas_visibles','Alertas de seguimiento visibles','Primeras visitas','Cuántas alertas muestra el resumen de seguimientos.','entero','8',1,50,false,'components/FollowupSummary.tsx'),
 ('pv_seguimientos_por_plan','Seguimientos por plan','Primeras visitas','Calculado por el sistema al crear el plan.','entero','5',null,null,true,'base de datos'),
 ('pv_nota_min_caracteres','Mínimo de caracteres de la nota','Primeras visitas','Validado por el sistema al registrar o finalizar un seguimiento.','entero','30',null,null,true,'base de datos'),
 ('pv_evento_max_dias','Fecha máxima del evento (días)','Primeras visitas','Validado por el sistema: el evento no puede ser más de estos días después de la visita.','entero','1825',null,null,true,'base de datos')
on conflict (clave) do nothing;

insert into public.config_formularios(clave,nombre,modulo,descripcion,campos,uso) values
 ('pv_registrar_seguimiento','Registrar seguimiento','Primeras visitas','Panel Gestionar · seguimiento del día.',
  '[{"campo":"nota","etiqueta":"Conclusión de lo hablado","tipo":"texto","obligatorio":true,"bloqueado":true},
    {"campo":"canal","etiqueta":"Canal","tipo":"lista","lista":"pv_canales","obligatorio":true,"bloqueado":true},
    {"campo":"resultado","etiqueta":"Resultado","tipo":"lista","lista":"pv_resultados_asistida","obligatorio":true,"bloqueado":true},
    {"campo":"motivo","etiqueta":"Motivo","tipo":"lista","lista":"pv_motivos_desistio","obligatorio":true,"bloqueado":true}]','components/FirstVisitCommercial.tsx'),
 ('pv_finalizar_seguimiento','Finalizar seguimiento','Primeras visitas','Panel Gestionar · cierre del plan.',
  '[{"campo":"resultado","etiqueta":"Resultado","tipo":"lista","lista":"pv_resultados_finalizar","obligatorio":true,"bloqueado":true},
    {"campo":"motivo","etiqueta":"Motivo","tipo":"texto","obligatorio":true,"bloqueado":true}]','components/FirstVisitCommercial.tsx'),
 ('pv_visita_vitrina','Visita de vitrina','Primeras visitas','Registro de una clienta que llega sin cita.',
  '[{"campo":"tipo_evento","etiqueta":"Tipo de evento","tipo":"lista","lista":"pv_tipos_evento_vitrina","obligatorio":true,"bloqueado":true},
    {"campo":"fecha_evento","etiqueta":"Fecha del evento","tipo":"fecha","obligatorio":false,"bloqueado":true},
    {"campo":"como_se_entero","etiqueta":"Cómo se enteró","tipo":"lista","lista":"pv_como_se_entero","obligatorio":false,"bloqueado":true}]','components/FirstVisitWalkIn.tsx')
on conflict (clave) do nothing;
