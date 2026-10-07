-- Confirmación de entrega: recibo privado sin registrar dinero otra vez.
alter table public.entregas_bitacora add column if not exists comprobante_deposito_path text;
alter table public.entregas_bitacora add column if not exists metodo_deposito text;
create or replace function private.bloquear_entrega_sin_deposito() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.contratos%rowtype; faltante numeric; nombre text;
begin
 if lower(coalesce(new.tipo_entrega,''))='reversion' then return new; end if;
 select * into c from public.contratos where id=new.contrato_id for update;
 if not found or not private.acceso_deposito(c.id) then raise exception 'No tienes acceso al contrato.' using errcode='42501'; end if;
 if coalesce(c.valor_deposito,0)<=0 then raise exception 'Primero registra el depósito recibido.'; end if;
 if lower(c.estado) in ('cancelado','anulado','rechazado','finalizado') then raise exception 'El contrato no permite nuevas entregas.'; end if;
 if coalesce(c.saldo,0)>0 then raise exception 'El contrato tiene saldo pendiente.'; end if;
 perform private.comprobante_deposito(c.id,new.comprobante_deposito_path);
 if new.metodo_deposito is null or new.metodo_deposito not in ('Efectivo','Transferencia','Tarjeta','Otro') then raise exception 'Indica el método del depósito.'; end if;
 select c.valor_deposito-coalesce(sum(monto),0) into faltante from public.movimientos_depositos where contrato_id=c.id and tipo='ingreso' and comprobante_path is not null;
 if faltante>0 and not exists(select 1 from public.soportes_depositos_anteriores where contrato_id=c.id) then
  insert into public.soportes_depositos_anteriores(contrato_id,monto,metodo,comprobante_path,usuario_id) values(c.id,faltante,new.metodo_deposito,new.comprobante_deposito_path,auth.uid());
 end if;
 select coalesce(p.nombre,p.email) into nombre from public.profiles p where p.id=auth.uid();
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Comprobante de depósito en entrega',jsonb_build_object('entrega_id',new.id,'comprobante',new.comprobante_deposito_path,'metodo',new.metodo_deposito,'importe_adicional',0)::text,nombre);
 return new;
end $$;
create function private.comprobantes_entrega_depositos() returns table(id uuid,contrato_id uuid,comprobante_path text,monto numeric,metodo text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select e.id,e.contrato_id,e.comprobante_deposito_path,0::numeric,e.metodo_deposito,e.created_at from public.entregas_bitacora e where e.comprobante_deposito_path is not null and private.acceso_deposito(e.contrato_id) order by e.id;
$$;
create function public.comprobantes_entrega_depositos() returns table(id uuid,contrato_id uuid,comprobante_path text,monto numeric,metodo text,created_at timestamptz) language sql stable security invoker set search_path='' as $$ select * from private.comprobantes_entrega_depositos(); $$;
revoke all on function private.comprobantes_entrega_depositos(),public.comprobantes_entrega_depositos() from public,anon;
grant execute on function private.comprobantes_entrega_depositos(),public.comprobantes_entrega_depositos() to authenticated;

-- Cambio de responsable con control de concurrencia y motivo obligatorio.
create function private.retomar_devolucion(p_solicitud uuid,p_responsable_esperado uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare u public.profiles%rowtype;s public.solicitudes_depositos%rowtype;cid uuid;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true) and lower(rol) in ('admin','contabilidad');
 if not found then raise exception 'Solo Administración o Contabilidad puede retomar un pago.' using errcode='42501';end if;
 if nullif(btrim(p_motivo),'') is null then raise exception 'Indica el motivo del cambio de responsable.';end if;
 select contrato_id into cid from public.solicitudes_depositos where id=p_solicitud;
 perform 1 from public.contratos where id=cid for update;
 select * into s from public.solicitudes_depositos where id=p_solicitud for update;
 if not found or s.estado<>'en_proceso' or s.comprobante_path is not null or s.pago_at is not null or exists(select 1 from public.movimientos_depositos where id=s.id) then raise exception 'La solicitud cambió, tiene un pago registrado o ya fue devuelta. Actualiza la bandeja.';end if;
 if s.responsable_id=auth.uid() then return;end if;
 if s.responsable_id is distinct from p_responsable_esperado then raise exception 'Otra persona cambió el responsable. Actualiza la bandeja.';end if;
 update public.solicitudes_depositos set responsable_id=u.id,responsable_nombre=coalesce(u.nombre,u.email) where id=s.id;
 insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(s.id,'en_proceso',u.id,coalesce(u.nombre,u.email),'Cambio de responsable: '||coalesce(s.responsable_nombre,'Sin asignar')||' → '||coalesce(u.nombre,u.email)||'. Motivo: '||btrim(p_motivo));
end $$;
create function public.retomar_devolucion(p_solicitud uuid,p_responsable_esperado uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.retomar_devolucion(p_solicitud,p_responsable_esperado,p_motivo); $$;
revoke all on function private.retomar_devolucion(uuid,uuid,text),public.retomar_devolucion(uuid,uuid,text) from public,anon;
grant execute on function private.retomar_devolucion(uuid,uuid,text),public.retomar_devolucion(uuid,uuid,text) to authenticated;

-- Desistimiento conserva pagos y garantías; solo afecta estado y disponibilidad.
create function private.desistir_contrato(p_contrato uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare c public.contratos%rowtype;u public.profiles%rowtype;vid uuid;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true) and lower(rol) in ('admin','asesora');
 if not found then raise exception 'No tienes permiso para desistir contratos.' using errcode='42501';end if;
 if nullif(btrim(p_motivo),'') is null then raise exception 'Indica el motivo del desistimiento.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.' using errcode='42501';end if;
 if lower(c.estado) in ('cancelado','anulado','rechazado','finalizado','entregado','mantenimiento') or coalesce(c.entregado_evento,false) or coalesce(c.entregado_prexv,false) or exists(select 1 from public.entregas_bitacora where contrato_id=c.id and lower(coalesce(tipo_entrega,''))<>'reversion') then raise exception 'El estado actual no permite desistir. Revisa primero las entregas y el retorno.';end if;
 update public.contratos set estado='cancelado' where id=c.id;
 for vid in select distinct vestido_id from public.contrato_items_vestidos where contrato_id=c.id union select c.vestido_id where c.vestido_id is not null loop
  perform 1 from public.vestidos where id=vid for update;
  perform private.refrescar_prenda_operaciones(vid);
 end loop;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Desistimiento del contrato',btrim(p_motivo),coalesce(u.nombre,u.email));
end $$;
create function public.desistir_contrato(p_contrato uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.desistir_contrato(p_contrato,p_motivo); $$;
revoke all on function private.desistir_contrato(uuid,text),public.desistir_contrato(uuid,text) from public,anon;
grant execute on function private.desistir_contrato(uuid,text),public.desistir_contrato(uuid,text) to authenticated;
notify pgrst,'reload schema';
create function private.proteger_comprobante_entrega() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if row(new.comprobante_deposito_path,new.metodo_deposito) is distinct from row(old.comprobante_deposito_path,old.metodo_deposito) then
  raise exception 'El comprobante de la entrega no puede modificarse. Conserva la trazabilidad del soporte.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.proteger_comprobante_entrega() from public,anon,authenticated;
create trigger proteger_comprobante_entrega before update of comprobante_deposito_path,metodo_deposito on public.entregas_bitacora for each row execute function private.proteger_comprobante_entrega();
