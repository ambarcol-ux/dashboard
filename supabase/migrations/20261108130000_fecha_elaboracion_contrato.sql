-- Contratos: fecha de elaboración editable (hasta 15 días atrás, nunca futura), con motivo y bitácora.
-- Mueve a esa fecha los abonos del contrato registrados en caja el día anterior de elaboración.
alter table public.contratos add column if not exists fecha_elaboracion date;
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('contratos.editar_fecha_elaboracion','Contratos','Cambiar fecha de elaboración','Mueve también los abonos de ese día en la caja; pide motivo',false,95)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) select r,'contratos.editar_fecha_elaboracion' from unnest(array['admin','asesora_lider']) r on conflict do nothing;

create or replace function private.cambiar_fecha_elaboracion(p_contrato uuid,p_fecha date,p_motivo text,p_confirmar boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratos; u public.profiles; anterior date; creado date; hoy date:=(now() at time zone 'America/Bogota')::date; razon text:=btrim(coalesce(p_motivo,'')); movidos int:=0;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if u.id is null or not (public.es_admin() or private.tiene_permiso('contratos.editar_fecha_elaboracion')) then raise exception 'No tienes permiso para cambiar la fecha de elaboración.' using errcode='42501'; end if;
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if not public.es_admin() and c.sede_id is distinct from coalesce(private.sede_operativa_limitada(),u.sede_id) then raise exception 'El contrato no es de tu sede.' using errcode='42501'; end if;
 if length(razon)<10 then raise exception 'Escribe el motivo del cambio (mínimo 10 caracteres).'; end if;
 creado:=(c.created_at at time zone 'America/Bogota')::date;
 anterior:=coalesce(c.fecha_elaboracion,creado);
 if p_fecha is null or p_fecha>hoy then raise exception 'La fecha de elaboración no puede ser futura.'; end if;
 if p_fecha<creado-15 then raise exception 'Solo se puede mover hasta 15 días antes de la creación (%).',to_char(creado-15,'DD/MM/YYYY'); end if;
 if p_fecha=anterior then return jsonb_build_object('sin_cambios',true); end if;
 if not p_confirmar and exists(select 1 from public.caja_cierres k where k.sede_id=c.sede_id and k.fecha in (anterior,p_fecha) and k.reabierto_at is null) then
  raise exception 'CAJA_CERRADA: la caja del % o del % ya está cerrada; el cambio modifica esos cierres.',to_char(anterior,'DD/MM/YYYY'),to_char(p_fecha,'DD/MM/YYYY');
 end if;
 update public.contratos set fecha_elaboracion=p_fecha where id=c.id;
 with m as (update public.caja_movimientos set fecha=p_fecha where contrato_id=c.id and origen='pago' and fecha=anterior and anulado_at is null returning origen_id)
 update public.pagos p set fecha_pago=p_fecha+((p.fecha_pago at time zone 'America/Bogota')::time) at time zone 'America/Bogota' from m where p.id=m.origen_id;
 get diagnostics movidos=row_count;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Fecha de elaboración cambiada',
  jsonb_build_object('anterior',anterior,'nueva',p_fecha,'abonos_movidos',movidos,'motivo',razon)::text,coalesce(u.nombre,u.email));
 return jsonb_build_object('ok',true,'abonos_movidos',movidos);
end $$;
create or replace function public.cambiar_fecha_elaboracion(p_contrato uuid,p_fecha date,p_motivo text,p_confirmar boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select private.cambiar_fecha_elaboracion(p_contrato,p_fecha,p_motivo,p_confirmar); $$;
revoke all on function private.cambiar_fecha_elaboracion(uuid,date,text,boolean),public.cambiar_fecha_elaboracion(uuid,date,text,boolean) from public,anon;
grant execute on function private.cambiar_fecha_elaboracion(uuid,date,text,boolean),public.cambiar_fecha_elaboracion(uuid,date,text,boolean) to authenticated;
