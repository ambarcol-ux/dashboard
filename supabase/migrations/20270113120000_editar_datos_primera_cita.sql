-- Primeras visitas: corregir los datos de contacto de una cita ya hecha (nombre, celular, correo, cédula).
-- Administración, y líderes y franquiciados de la sede (permiso primeras_citas.editar_datos). Pide motivo y deja el antes y el después en el historial.
-- Las reglas son las mismas del formulario público (lib/contact-validation.ts).
-- Reversión: drop function public.editar_datos_primera_cita(uuid,jsonb,text); drop function private.editar_datos_primera_cita(uuid,jsonb,text);
--   delete from public.roles_permisos where permiso='primeras_citas.editar_datos'; delete from public.permisos where codigo='primeras_citas.editar_datos';
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values ('primeras_citas.editar_datos','Primeras visitas','Corregir datos de la clienta','Nombre, celular, correo y cédula de una cita de su sede; pide motivo y queda en el historial',false,204)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso,activo,todas_sedes)
select r,'primeras_citas.editar_datos',true,false from unnest(array['asesora_lider','franquiciado']) r
on conflict do nothing;

create or replace function private.editar_datos_primera_cita(p_id uuid, p_datos jsonb, p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; v_nombre text; v_tel text; v_email text; v_doc text; cambios text[]:='{}';
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found then raise exception 'Cita no disponible.'; end if;
 if not (public.es_admin() or (private.tiene_permiso('primeras_citas.editar_datos') and (private.sedes_limitadas() is null or c.sede_id=any(private.sedes_limitadas())))) then
  raise exception 'No tienes permiso para corregir los datos de esta cita.'; end if;
 if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Escribe el motivo de la corrección (mínimo 5 caracteres).'; end if;
 v_nombre:=regexp_replace(trim(coalesce(p_datos->>'nombre',c.cliente_nombre)),'\s+',' ','g');
 if v_nombre ~ '\d' or v_nombre !~ '^[[:alpha:]][[:alpha:]''’ -]*$' or length(v_nombre)>120
  or (select count(*) from unnest(string_to_array(v_nombre,' ')) x where length(regexp_replace(x,'[''’-]','','g'))>=2)<2
  then raise exception 'Escribe nombre y apellido, solo con letras.'; end if;
 v_tel:=regexp_replace(coalesce(p_datos->>'telefono',c.telefono),'\D','','g');
 if length(v_tel)=12 and v_tel like '57%' then v_tel:=substr(v_tel,3); end if;
 if v_tel !~ '^3\d{9}$' then raise exception 'El celular debe tener 10 números y empezar por 3.'; end if;
 v_email:=lower(trim(coalesce(p_datos->>'email',c.email,'')));
 if v_email<>'' and (length(v_email)>160 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then raise exception 'Revisa el correo.'; end if;
 v_doc:=regexp_replace(coalesce(p_datos->>'documento',c.cliente_documento,''),'[.\s-]','','g');
 if v_doc<>'' and v_doc !~ '^\d{6,10}$' then raise exception 'La cédula debe tener entre 6 y 10 números.'; end if;
 if v_nombre is distinct from c.cliente_nombre then cambios:=cambios||format('Nombre: %s → %s',c.cliente_nombre,v_nombre); end if;
 if v_tel is distinct from c.telefono then cambios:=cambios||format('Celular: %s → %s',c.telefono,v_tel); end if;
 if v_email is distinct from coalesce(c.email,'') then cambios:=cambios||format('Correo: %s → %s',coalesce(c.email,'—'),v_email); end if;
 if v_doc is distinct from coalesce(c.cliente_documento,'') then cambios:=cambios||format('Cédula: %s → %s',coalesce(c.cliente_documento,'—'),v_doc); end if;
 if cardinality(cambios)=0 then raise exception 'No hay cambios para guardar.'; end if;
 update public.primeras_citas set cliente_nombre=v_nombre,telefono=v_tel,email=nullif(v_email,''),cliente_documento=nullif(v_doc,''),updated_at=clock_timestamp() where id=c.id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Corrección de datos',array_to_string(cambios,' · ')||'. Motivo: '||left(trim(p_motivo),500));
end $$;
create or replace function public.editar_datos_primera_cita(p_id uuid, p_datos jsonb, p_motivo text) returns void
language sql set search_path='' as $$ select private.editar_datos_primera_cita(p_id,p_datos,p_motivo); $$;
revoke all on function private.editar_datos_primera_cita(uuid,jsonb,text), public.editar_datos_primera_cita(uuid,jsonb,text) from public, anon;
grant execute on function private.editar_datos_primera_cita(uuid,jsonb,text), public.editar_datos_primera_cita(uuid,jsonb,text) to authenticated;
