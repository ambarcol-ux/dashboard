-- Configuración (solo administrador): listas, parámetros y formularios reutilizables con historial.
-- Listas reuse public.listas_contrato. Carga inicial: docs/config/primeras-visitas.md. Primeras visitas reads them instead of fixed values.
-- Revert: remove config_parametros, config_formularios, config_historial, their triggers and helper functions;
--   restore the lista check ('banco','tipo_cuenta') and the etapa check (1..5); re-apply previous bodies of the patched functions.

-- Lists: any module key; history; values in use cannot be removed (deactivate instead).
alter table public.listas_contrato drop constraint if exists listas_contrato_lista_check;
alter table public.listas_contrato add constraint listas_contrato_lista_check check (lista ~ '^[a-z_]{2,40}$');

create table if not exists public.config_parametros(clave text primary key,modulo text not null,etiqueta text not null,tipo text not null check (tipo in ('entero','booleano')),
 valor jsonb not null,minimo int,maximo int,orden int not null default 100,ayuda text);
create table if not exists public.config_formularios(formulario text not null,campo text not null,modulo text not null,etiqueta text not null,
 estado text not null check (estado in ('bloqueado','obligatorio','opcional','oculto')),orden int not null default 100,primary key(formulario,campo));
create table if not exists public.config_historial(id bigserial primary key,tabla text not null,clave text not null,accion text not null,antes jsonb,despues jsonb,
 usuario_id uuid default auth.uid(),created_at timestamptz not null default now());
alter table public.config_parametros enable row level security;
alter table public.config_formularios enable row level security;
alter table public.config_historial enable row level security;
revoke all on public.config_parametros,public.config_formularios,public.config_historial from anon;
create policy config_parametros_leer on public.config_parametros for select to authenticated using (true);
create policy config_parametros_admin on public.config_parametros for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy config_formularios_leer on public.config_formularios for select to authenticated using (true);
create policy config_formularios_admin on public.config_formularios for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy config_historial_admin on public.config_historial for select to authenticated using (public.es_admin());

create or replace function private.config_historial() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; k text;
begin
 k:=case tg_table_name when 'listas_contrato' then (r->>'lista')||' · '||(r->>'valor') when 'config_parametros' then r->>'clave' else (r->>'formulario')||' · '||(r->>'campo') end;
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 insert into public.config_historial(tabla,clave,accion,antes,despues) values(tg_table_name,k,lower(tg_op),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger listas_contrato_historial after insert or update or delete on public.listas_contrato for each row execute function private.config_historial();
create trigger config_parametros_historial after insert or update or delete on public.config_parametros for each row execute function private.config_historial();
create trigger config_formularios_historial after insert or update or delete on public.config_formularios for each row execute function private.config_historial();

-- A list value already used in records is only deactivated.
create or replace function private.valor_lista_usado(p_lista text,p_valor text) returns boolean language sql stable security definer set search_path='' as $$
 select case p_lista
  when 'pv_canales' then exists(select 1 from public.primeras_citas_seguimientos where canal=p_valor)
  when 'pv_resultados_seguimiento' then exists(select 1 from public.primeras_citas_seguimientos where resultado=p_valor)
  when 'pv_motivos_cierre' then exists(select 1 from public.primeras_citas where cierre_seguimiento=p_valor or cierre_seguimiento like p_valor||':%')
  when 'pv_motivos_no_asistencia' then exists(select 1 from public.primeras_citas where motivo like p_valor||'%')
  when 'pv_motivos_eliminar' then exists(select 1 from private.primeras_citas_eliminadas where motivo like p_valor||'%')
  when 'banco' then exists(select 1 from public.contratos where banco_deposito=p_valor)
  when 'tipo_cuenta' then exists(select 1 from public.contratos where tipo_cuenta_deposito=p_valor)
  else false end
$$;
create or replace function private.listas_proteger_usados() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.valor_lista_usado(old.lista,old.valor) then raise exception '«%» ya se usó: desactívalo en lugar de eliminarlo.',old.valor; end if;
 return old;
end $$;
create trigger listas_contrato_proteger_usados before delete on public.listas_contrato for each row execute function private.listas_proteger_usados();

-- Parameters stay within their range; locked form fields cannot change state (never hidden).
create or replace function private.config_validar() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='config_parametros' then
  if new.tipo='entero' and (jsonb_typeof(new.valor)<>'number' or (new.minimo is not null and new.valor::int<new.minimo) or (new.maximo is not null and new.valor::int>new.maximo)) then
   raise exception '«%» debe estar entre % y %.',new.etiqueta,new.minimo,new.maximo; end if;
  if new.tipo='booleano' and jsonb_typeof(new.valor)<>'boolean' then raise exception '«%» debe ser sí o no.',new.etiqueta; end if;
 elsif tg_op='UPDATE' and (old.estado='bloqueado' or new.estado='bloqueado') and new.estado is distinct from old.estado then
  raise exception 'El campo «%» está bloqueado.',old.etiqueta;
 end if;
 return new;
end $$;
create trigger config_parametros_validar before insert or update on public.config_parametros for each row execute function private.config_validar();
create trigger config_formularios_validar before insert or update on public.config_formularios for each row execute function private.config_validar();

create or replace function private.cfg_int(p_clave text,p_defecto int) returns int language sql stable security definer set search_path='' as $$
 select coalesce((select (valor)::int from public.config_parametros where clave=p_clave and tipo='entero'),p_defecto)
$$;
create or replace function private.cfg_bool(p_clave text,p_defecto boolean) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (valor)::boolean from public.config_parametros where clave=p_clave and tipo='booleano'),p_defecto)
$$;
create or replace function private.lista_activa(p_lista text,p_valor text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listas_contrato where lista=p_lista and valor=p_valor and activo)
$$;
create or replace function private.form_estado(p_formulario text,p_campo text) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select estado from public.config_formularios where formulario=p_formulario and campo=p_campo),'obligatorio')
$$;

-- Initial load (docs/config/primeras-visitas.md).
insert into public.listas_contrato(lista,valor,orden) select l,v,i from (values
 ('pv_canales',array['WhatsApp','Llamada','Presencial en tienda','Instagram','Facebook','Correo']),
 ('pv_resultados_seguimiento',array['Interesada','Lo está pensando','Pidió más estilos','Pidió precios','Agendó nueva visita','No contestó']),
 ('pv_motivos_cierre',array['Alquiló','Alquiló en otro lugar','Precio fuera de presupuesto','No encontró el estilo','Se canceló el evento','Compró vestido','Le prestaron o regalaron vestido','No responde','Datos errados','Otro']),
 ('pv_motivos_no_asistencia',array['Se le olvidó','Cambio de planes','Enfermedad','Problema de transporte','Ya consiguió vestido','Otro']),
 ('pv_motivos_eliminar',array['Cita de prueba','Duplicada','Creada por error'])) x(l,a), unnest(a) with ordinality u(v,i)
on conflict do nothing;
insert into public.config_parametros(clave,modulo,etiqueta,tipo,valor,minimo,maximo,orden,ayuda) values
 ('seg_asistida','primeras_visitas','Seguimientos cita asistida','entero','5',1,10,10,null),
 ('seg_vitrina','primeras_visitas','Seguimientos vitrina','entero','5',1,10,20,null),
 ('seg_no_asistida','primeras_visitas','Seguimientos cita no asistida','entero','5',1,10,30,null),
 ('dias_antes_evento','primeras_visitas','Último seguimiento, días antes del evento','entero','3',0,15,40,null),
 ('solo_habiles','primeras_visitas','Solo días hábiles','booleano','true',null,null,50,'Sin domingos ni festivos de Colombia'),
 ('min_caracteres','primeras_visitas','Mínimo de caracteres (conclusión y «Otro»)','entero','30',10,200,60,null),
 ('recordatorio_1_horas','primeras_visitas','Primer recordatorio, horas antes de la cita','entero','24',1,72,70,null),
 ('recordatorio_2_horas','primeras_visitas','Segundo recordatorio, horas antes de la cita','entero','2',1,24,80,null),
 ('post_cita_minutos','primeras_visitas','Mensaje después de la cita, minutos después del inicio','entero','150',30,1440,90,'Los textos de los mensajes son las plantillas aprobadas de WhatsApp')
on conflict do nothing;
insert into public.config_formularios(formulario,campo,modulo,etiqueta,estado,orden) values
 ('resultado_cita','asistencia','primeras_visitas','Asistencia','bloqueado',10),
 ('resultado_cita','alquilo','primeras_visitas','¿Alquiló?','bloqueado',20),
 ('resultado_cita','fecha_evento','primeras_visitas','Fecha del evento','bloqueado',30),
 ('resultado_cita','nota','primeras_visitas','Nota','opcional',40),
 ('registro_seguimiento','conclusion','primeras_visitas','Conclusión','bloqueado',10),
 ('registro_seguimiento','canal','primeras_visitas','Canal','obligatorio',20),
 ('registro_seguimiento','resultado','primeras_visitas','Resultado','obligatorio',30)
on conflict do nothing;

-- Up to 10 follow-ups per plan.
alter table public.primeras_citas_seguimientos drop constraint if exists primeras_citas_seguimientos_etapa_check;
alter table public.primeras_citas_seguimientos add constraint primeras_citas_seguimientos_etapa_check check (etapa between 1 and 10);

-- Plan by type: number of follow-ups, last one N days before the event, business days or not.
create or replace function private.plan_seguimiento_fechas(p_hoy date,p_evento date,p_tipo text) returns date[] language plpgsql stable security definer set search_path='' as $$
declare n int:=private.cfg_int('seg_'||coalesce(p_tipo,'asistida'),5); antes int:=private.cfg_int('dias_antes_evento',3); habil boolean:=private.cfg_bool('solo_habiles',true);
 dias date[]; total int; out date[]:='{}'; x int; d date;
begin
 if p_evento is null then
  foreach x in array (array[1,3,7,14,30,45,60,75,90,120])[1:n] loop
   d:=p_hoy+x; while habil and not private.dia_habil(d) loop d:=d+1; end loop;
   if not d=any(out) then out:=out||d; end if;
  end loop;
  return out;
 end if;
 dias:=array(select g::date from generate_series(p_hoy+1,p_evento-antes,interval '1 day') g where not habil or private.dia_habil(g::date) order by 1);
 total:=coalesce(array_length(dias,1),0);
 if total<=n then return dias; end if;
 if n=1 then return array[dias[total]]; end if;
 for x in 0..n-1 loop out:=out||dias[1+round(x*(total-1)/(n-1)::numeric)::int]; end loop;
 return out;
end $$;
do $$ declare d text:=pg_get_functiondef('private.replanificar_seguimientos(uuid)'::regprocedure); begin
 d:=replace(d,'fechas:=private.plan_seguimiento_fechas(hoy,c.fecha_evento);','fechas:=private.plan_seguimiento_fechas(hoy,c.fecha_evento,coalesce(c.tipo_seguimiento,''asistida''));');
 d:=replace(d,'generate_series(1,5)','generate_series(1,private.cfg_int(''seg_''||coalesce(c.tipo_seguimiento,''asistida''),5))');
 if d not like '%cfg_int(''seg_''%' or d not like '%c.fecha_evento,coalesce(c.tipo_seguimiento%' then raise exception 'patch replanificar failed'; end if;
 execute d;
end $$;

-- Register a follow-up: minimum characters, channel and result from the lists, per form state.
do $$ declare d text:=pg_get_functiondef('private.gestionar_seguimiento_primera_cita(uuid,text,text,text,text,timestamptz)'::regprocedure); n int; begin
 d:=replace(d,'if length(t)<30 or length(t)>1000 then raise exception ''Escribe la conclusión de lo hablado (mínimo 30 caracteres).''; end if;',
  'if length(t)<private.cfg_int(''min_caracteres'',30) or length(t)>1000 then raise exception ''Escribe la conclusión de lo hablado (mínimo % caracteres).'',private.cfg_int(''min_caracteres'',30); end if;');
 d:=replace(d,'if p_canal is null or p_canal not in (''WhatsApp'',''Llamada'',''Correo'',''Presencial'') then raise exception ''Elige el canal.''; end if;',
  'if private.form_estado(''registro_seguimiento'',''canal'')=''oculto'' then p_canal:=null;
 elsif nullif(p_canal,'''') is null then p_canal:=null; if private.form_estado(''registro_seguimiento'',''canal'')<>''opcional'' then raise exception ''Elige el canal.''; end if;
 elsif not private.lista_activa(''pv_canales'',p_canal) then raise exception ''Elige un canal válido.''; end if;');
 n:=position('if p_resultado is null or not p_resultado=any(' in d);
 if n=0 then raise exception 'patch gestionar failed (resultado)'; end if;
 d:=left(d,n-1)||'if private.form_estado(''registro_seguimiento'',''resultado'')=''oculto'' then p_resultado:=null;
 elsif nullif(p_resultado,'''') is null then p_resultado:=null; if private.form_estado(''registro_seguimiento'',''resultado'')<>''opcional'' then raise exception ''Elige el resultado.''; end if;
 elsif not private.lista_activa(''pv_resultados_seguimiento'',p_resultado) then raise exception ''Elige un resultado válido.''; end if;'
  ||substr(d,position('Elige un resultado válido.''; end if;' in d)+length('Elige un resultado válido.''; end if;'));
 d:=replace(d,'values(c.id,auth.uid(),''Seguimiento ''||f.etapa,p_canal||'' · ''||p_resultado||','values(c.id,auth.uid(),''Seguimiento ''||f.etapa,coalesce(p_canal,''Sin canal'')||'' · ''||coalesce(p_resultado,''Sin resultado'')||');
 d:=replace(d,'''Sin respuesta tras 5 intentos''','''Sin respuesta tras ''||(select count(*) from public.primeras_citas_seguimientos where cita_id=c.id and realizado_at is not null)||'' intentos''');
 if d not like '%min_caracteres%' or d not like '%pv_canales%' or d not like '%pv_resultados_seguimiento%' or d not like '%Sin canal%' then raise exception 'patch gestionar failed'; end if;
 execute d;
end $$;

-- Finish a follow-up with a closing reason from the list; «Otro» needs the minimum characters.
create or replace function public.finalizar_seguimiento_primera_cita(p_cita uuid, p_resultado text, p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; m text:=btrim(coalesce(p_motivo,'')); minimo int:=private.cfg_int('min_caracteres',30);
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_cita for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible.'; end if;
 if coalesce(c.resultado_comercial,'EN SEGUIMIENTO')<>'EN SEGUIMIENTO' then raise exception 'El seguimiento ya está cerrado.'; end if;
 if p_resultado is null or not private.lista_activa('pv_motivos_cierre',p_resultado) then raise exception 'Elige el motivo de cierre.'; end if;
 if p_resultado='Otro' and length(m)<minimo then raise exception 'Escribe el motivo (mínimo % caracteres).',minimo; end if;
 if length(m)>1000 then raise exception 'El motivo es muy largo.'; end if;
 perform private.cerrar_plan(c.id,case when p_resultado='Otro' then 'Otro: '||m else p_resultado end,
  case p_resultado when 'Alquiló' then 'ALQUILÓ' when 'No responde' then 'CERRADO SIN RESPUESTA' else 'DESISTIÓ' end,'No necesario',nullif(m,''));
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Seguimiento finalizado',p_resultado||case when m<>'' then ': '||m else '' end);
end $$;

-- Visit result: note per form state; minimum characters to skip the follow-up.
do $$ declare d text:=pg_get_functiondef('private.registrar_resultado_primera_cita(uuid,boolean,boolean,boolean,text,timestamptz)'::regprocedure); begin
 d:=replace(d,'if omitir and length(nota)<30 then raise exception ''Para no hacer seguimiento escribe el motivo (mínimo 30 caracteres).''; end if;',
  'if omitir and length(nota)<private.cfg_int(''min_caracteres'',30) then raise exception ''Para no hacer seguimiento escribe el motivo (mínimo % caracteres).'',private.cfg_int(''min_caracteres'',30); end if;
 if nota='''' and not omitir and private.form_estado(''resultado_cita'',''nota'')=''obligatorio'' then raise exception ''Escribe la nota.''; end if;');
 if d not like '%min_caracteres%' then raise exception 'patch resultado failed'; end if;
 execute d;
end $$;
do $$ declare d text:=pg_get_functiondef('private.registrar_vitrina(jsonb)'::regprocedure); begin
 d:=replace(d,'if length(nota)<30 then raise exception ''Para no hacer seguimiento escribe el motivo (mínimo 30 caracteres).''; end if;',
  'if length(nota)<private.cfg_int(''min_caracteres'',30) then raise exception ''Para no hacer seguimiento escribe el motivo (mínimo % caracteres).'',private.cfg_int(''min_caracteres'',30); end if;');
 if d not like '%min_caracteres%' then raise exception 'patch vitrina failed'; end if;
 execute d;
end $$;

-- Deleting a visit: reason from the list.
do $$ declare d text:=pg_get_functiondef('private.preparar_eliminacion_primera_cita(uuid,text,timestamptz)'::regprocedure); begin
 d:=replace(d,'if length(reason) not between 5 and 1000 then raise exception ''Escribe el motivo de la eliminación (mínimo 5 caracteres).''; end if;',
  'if not private.lista_activa(''pv_motivos_eliminar'',reason) then raise exception ''Elige el motivo de la eliminación.''; end if;');
 if d not like '%pv_motivos_eliminar%' then raise exception 'patch eliminar failed'; end if;
 execute d;
end $$;

-- Reminders and post-visit message times.
do $$ declare d text:=pg_get_functiondef('private.programar_mensajes_primera_cita()'::regprocedure); begin
 d:=replace(d,'start_at-interval ''24 hours''','start_at-make_interval(hours=>private.cfg_int(''recordatorio_1_horas'',24))');
 d:=replace(d,'start_at-interval ''2 hours''','start_at-make_interval(hours=>private.cfg_int(''recordatorio_2_horas'',2))');
 d:=replace(d,'start_at+interval ''150 minutes''','start_at+make_interval(mins=>private.cfg_int(''post_cita_minutos'',150))');
 if d not like '%recordatorio_1_horas%' or d not like '%recordatorio_2_horas%' or d not like '%post_cita_minutos%' then raise exception 'patch mensajes failed'; end if;
 execute d;
end $$;
