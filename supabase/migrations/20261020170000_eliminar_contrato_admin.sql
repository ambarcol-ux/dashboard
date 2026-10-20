-- Eliminar contratos (solo administración). Antes era imposible: todo contrato nuevo tiene anticipo (pago
-- obligatorio) y la regla bloqueaba cualquier contrato con dinero; además, el borrado corría con RLS y chocaba
-- con la recursión de políticas de contratos. Ahora el admin elimina con motivo: queda una copia completa en
-- contratos_eliminados, los movimientos de caja ligados se anulan (si el día de caja ya está cerrado hay que
-- reabrirlo primero) y se borran los registros dependientes.
create table public.contratos_eliminados (
 id bigint generated always as identity primary key,
 contrato_id uuid not null,
 numero_contrato text,
 cliente_nombre text,
 datos jsonb not null,
 motivo text not null,
 eliminado_por uuid references public.profiles(id),
 eliminado_at timestamptz not null default now()
);
alter table public.contratos_eliminados enable row level security;
revoke all on public.contratos_eliminados from public,anon,authenticated;
grant select on public.contratos_eliminados to authenticated;
create policy contratos_eliminados_admin on public.contratos_eliminados for select to authenticated using ((select public.es_admin()));

create function private.eliminar_contrato(p_contrato uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare c public.contratos; motivo text:=btrim(coalesce(p_motivo,'')); cerrado record; detalle text; movs uuid[];
begin
 if not public.es_admin() then raise exception 'Solo administración puede eliminar contratos.' using errcode='42501'; end if;
 if length(motivo)<5 then raise exception 'Escribe el motivo de la eliminación (mínimo 5 caracteres).'; end if;
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if exists(select 1 from public.pago_proveedor_detalle d join public.contrato_servicios s on s.id=d.contrato_servicio_id where s.contrato_id=c.id) then
  raise exception 'El contrato tiene pagos a proveedores registrados. Anula esos pagos antes de eliminarlo.';
 end if;
 select coalesce(array_agg(m.id),'{}') into movs from public.caja_movimientos m where m.anulado_at is null and (m.contrato_id=c.id
  or (m.origen='pago' and m.origen_id in (select id from public.pagos where contrato_id=c.id))
  or (m.origen in ('deposito','devolucion') and m.origen_id in (select id from public.movimientos_depositos where contrato_id=c.id)));
 select m.fecha,s.nombre into cerrado from public.caja_movimientos m join public.sedes s on s.id=m.sede_id where m.id=any(movs) and private.caja_dia_cerrado(m.sede_id,m.fecha) order by m.fecha limit 1;
 if found then raise exception 'La caja de % del % ya está cerrada y tiene movimientos de este contrato. Reábrela en Cierres de caja y vuelve a intentar.',cerrado.nombre,to_char(cerrado.fecha,'DD/MM/YYYY'); end if;
 detalle:=left('Contrato '||coalesce(c.numero_contrato,c.id::text)||' eliminado: '||motivo,500);
 update public.caja_movimientos set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=detalle where id=any(movs);
 update public.caja_movimientos set contrato_id=null where contrato_id=c.id;
 insert into public.contratos_eliminados(contrato_id,numero_contrato,cliente_nombre,datos,motivo,eliminado_por)
 values(c.id,c.numero_contrato,c.cliente_nombre,jsonb_build_object('contrato',to_jsonb(c),
  'vestidos',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.contrato_items_vestidos i where i.contrato_id=c.id),
  'pagos',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.pagos p where p.contrato_id=c.id),
  'soportes_pago',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.soportes_pago s join public.pagos p on p.id=s.pago_id where p.contrato_id=c.id),
  'movimientos_depositos',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.movimientos_depositos d where d.contrato_id=c.id),
  'devoluciones_depositos',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.devoluciones_depositos d where d.contrato_id=c.id),
  'solicitudes_depositos',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.solicitudes_depositos d where d.contrato_id=c.id),
  'servicios',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.contrato_servicios d where d.contrato_id=c.id)),motivo,auth.uid());
 delete from public.historial_solicitudes_depositos where solicitud_id in (select id from public.solicitudes_depositos where contrato_id=c.id);
 delete from public.solicitudes_depositos where contrato_id=c.id;
 delete from public.movimientos_depositos where contrato_id=c.id;
 delete from public.devoluciones_depositos where contrato_id=c.id;
 delete from public.soportes_depositos_anteriores where contrato_id=c.id;
 delete from public.auditoria_montos_deposito where contrato_id=c.id;
 delete from public.vestidos_fuera_tienda where contrato_id=c.id;
 delete from public.contrato_servicios where contrato_id=c.id;
 delete from private.inspecciones_operaciones where contrato_id=c.id;
 delete from public.arreglos where contrato_id=c.id;
 delete from public.historial_cambios_contrato where contrato_id=c.id;
 delete from public.mantenimiento_bitacora where contrato_id=c.id;
 delete from public.mantenimiento_vestidos where contrato_id=c.id;
 delete from public.bitacora_contratos where contrato_id=c.id;
 delete from public.contratos where id=c.id;
end $$;
create function public.eliminar_contrato(p_contrato uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.eliminar_contrato(p_contrato,p_motivo); $$;
revoke all on function private.eliminar_contrato(uuid,text),public.eliminar_contrato(uuid,text) from public,anon;
grant execute on function private.eliminar_contrato(uuid,text),public.eliminar_contrato(uuid,text) to authenticated;
