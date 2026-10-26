-- Depósitos: editar un movimiento del historial (ingreso o devolución) con permiso, motivo y auditoría (antes/después).
create table public.depositos_ediciones (
 id bigint generated always as identity primary key,
 contrato_id uuid not null references public.contratos(id),
 origen text not null, registro_id uuid not null,
 antes jsonb not null, despues jsonb not null, motivo text not null,
 usuario_id uuid references public.profiles(id), fecha timestamptz not null default now()
);
alter table public.depositos_ediciones enable row level security;
create policy depositos_ediciones_leer on public.depositos_ediciones for select to authenticated using (public.es_admin() or private.acceso_deposito(contrato_id));
revoke insert,update,delete,truncate on public.depositos_ediciones from anon,authenticated;

create or replace function private.editar_movimiento_deposito(p_origen text,p_id uuid,p_datos jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.movimientos_depositos; d public.devoluciones_depositos; c public.contratos; usado numeric;
 n numeric:=(p_datos->>'monto')::numeric; desc_ numeric:=coalesce((p_datos->>'descuento')::numeric,0); f date:=(p_datos->>'fecha')::date;
 met text:=nullif(btrim(p_datos->>'metodo'),''); obs text:=nullif(btrim(p_datos->>'observaciones'),''); mot text:=nullif(btrim(p_datos->>'motivo_descuento'),'');
 razon text:=btrim(coalesce(p_datos->>'motivo_cambio','')); cid uuid; antes jsonb;
begin
 if not (public.es_admin() or private.tiene_permiso('depositos.modificar_valor')) then raise exception 'No tienes permiso para editar movimientos de depósito.' using errcode='42501'; end if;
 if length(razon)<5 then raise exception 'Escribe el motivo del cambio (mínimo 5 caracteres).'; end if;
 if n is null or n<0 or desc_<0 or n+desc_<=0 or n<>round(n,2) or desc_<>round(desc_,2) then raise exception 'Revisa los montos.'; end if;
 if f is null or f>(now() at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha (no puede ser futura).'; end if;
 if met is not null and met not in ('Efectivo','Transferencia','Tarjeta','Otro') then raise exception 'Método no válido.'; end if;
 if p_origen='movimiento' then
  select * into m from public.movimientos_depositos where id=p_id for update;
  if m.id is null then raise exception 'Movimiento no encontrado.'; end if;
  cid:=m.contrato_id; antes:=to_jsonb(m);
 elsif p_origen='anterior' then
  select * into d from public.devoluciones_depositos where id=p_id for update;
  if d.id is null then raise exception 'Devolución no encontrada.'; end if;
  cid:=d.contrato_id; antes:=to_jsonb(d);
 else raise exception 'Movimiento no válido.'; end if;
 if not public.es_admin() and not private.acceso_deposito(cid) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 select * into c from public.contratos where id=cid for update;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos where contrato_id=cid and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 if p_origen='movimiento' and m.tipo='ingreso' then
  if desc_<>0 then raise exception 'Un ingreso no lleva descuento.'; end if;
  if coalesce(c.valor_deposito,0)+(n-m.monto)<usado then raise exception 'Con ese valor el depósito quedaría por debajo de lo ya devuelto.'; end if;
  update public.contratos set valor_deposito=coalesce(valor_deposito,0)+(n-m.monto) where id=cid;
  update public.movimientos_depositos set monto=n,fecha=f,metodo=coalesce(met,metodo),observaciones=obs where id=m.id;
 elsif p_origen='movimiento' then
  if desc_>0 and mot is null then raise exception 'Escribe el motivo del descuento.'; end if;
  update public.movimientos_depositos set monto=n,descuento=desc_,fecha=f,metodo=coalesce(met,metodo),motivo=mot,observaciones=obs where id=m.id;
  if m.devolucion_id is not null then
   update public.devoluciones_depositos set monto_devuelto=n,monto_descuento=desc_,fecha_devolucion=f,motivo_descuento=mot,observaciones=obs where id=m.devolucion_id;
  end if;
 else
  if desc_>0 and mot is null then raise exception 'Escribe el motivo del descuento.'; end if;
  update public.devoluciones_depositos set monto_devuelto=n,monto_descuento=desc_,fecha_devolucion=f,motivo_descuento=mot,observaciones=obs where id=d.id;
 end if;
 insert into public.depositos_ediciones(contrato_id,origen,registro_id,antes,despues,motivo,usuario_id) values(cid,p_origen,p_id,antes,p_datos-'motivo_cambio',razon,auth.uid());
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(cid,'Movimiento de depósito editado',jsonb_build_object('registro',p_id,'antes',antes,'despues',p_datos)::text,(select nombre from public.profiles where id=auth.uid()));
end $$;
create or replace function public.editar_movimiento_deposito(p_origen text,p_id uuid,p_datos jsonb) returns void language sql security invoker set search_path='' as $$ select private.editar_movimiento_deposito(p_origen,p_id,p_datos); $$;
revoke all on function private.editar_movimiento_deposito(text,uuid,jsonb),public.editar_movimiento_deposito(text,uuid,jsonb) from public,anon;
grant execute on function private.editar_movimiento_deposito(text,uuid,jsonb),public.editar_movimiento_deposito(text,uuid,jsonb) to authenticated;
