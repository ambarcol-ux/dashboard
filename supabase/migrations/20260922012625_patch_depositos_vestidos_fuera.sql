-- Corte histórico único: 2026-09-14. Nunca elimina contratos ni movimientos.
alter table public.contratos add column if not exists finalizado_at timestamptz;
update public.contratos c set finalizado_at=coalesce((select max(b.created_at) from public.bitacora_contratos b where b.contrato_id=c.id and (lower(b.accion) like '%finaliz%' or lower(b.detalle) like '%finaliz%')),c.created_at)
where lower(c.estado)='finalizado' and c.finalizado_at is null;
update public.solicitudes_depositos s set estado='cancelado',observaciones=concat_ws(' · ',s.observaciones,'Cierre histórico por corte único 2026-09-14')
from public.contratos c where c.id=s.contrato_id and lower(c.estado)='finalizado' and c.finalizado_at<'2026-09-14 00:00:00-05'::timestamptz and s.estado in ('pendiente','en_proceso','pagado');

create table if not exists public.auditoria_montos_deposito (
 id uuid primary key default gen_random_uuid(), contrato_id uuid not null references public.contratos(id),
 monto_anterior numeric(14,2) not null, monto_nuevo numeric(14,2) not null,
 motivo text not null check(length(btrim(motivo))>=5), usuario_id uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.auditoria_montos_deposito enable row level security;
revoke all on public.auditoria_montos_deposito from anon,authenticated;
grant select on public.auditoria_montos_deposito to authenticated;
create policy auditoria_deposito_admin_leer on public.auditoria_montos_deposito for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and lower(p.rol)='admin' and coalesce(p.activo,true)));

create or replace function private.editar_monto_deposito(p_contrato uuid,p_monto numeric,p_motivo text)
returns numeric language plpgsql security definer set search_path='' as $$
declare anterior numeric; begin
 if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and lower(p.rol)='admin' and coalesce(p.activo,true)) then raise exception 'Solo un administrador puede editar el monto.' using errcode='42501'; end if;
 if p_monto is null or p_monto<0 or p_monto>=1000000000000 or p_monto<>round(p_monto,2) then raise exception 'Monto inválido.'; end if;
 if nullif(btrim(p_motivo),'') is null or length(btrim(p_motivo))<5 then raise exception 'El motivo es obligatorio.'; end if;
 select valor_deposito into anterior from public.contratos where id=p_contrato for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 update public.contratos set valor_deposito=p_monto where id=p_contrato;
 insert into public.auditoria_montos_deposito(contrato_id,monto_anterior,monto_nuevo,motivo,usuario_id) values(p_contrato,coalesce(anterior,0),p_monto,btrim(p_motivo),(select auth.uid()));
 return p_monto;
end $$;
revoke all on function private.editar_monto_deposito(uuid,numeric,text) from public,anon;
grant execute on function private.editar_monto_deposito(uuid,numeric,text) to authenticated;
create or replace function public.editar_monto_deposito(p_contrato uuid,p_monto numeric,p_motivo text)
returns numeric language sql security invoker set search_path='' as $$ select private.editar_monto_deposito(p_contrato,p_monto,p_motivo); $$;
revoke all on function public.editar_monto_deposito(uuid,numeric,text) from public,anon;
grant execute on function public.editar_monto_deposito(uuid,numeric,text) to authenticated;

create or replace function public.contrato_tiene_deposito_valido(p_contrato uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.contratos c where c.id=p_contrato and coalesce(c.valor_deposito,0)>0 and private.acceso_deposito(c.id));
$$;
revoke all on function public.contrato_tiene_deposito_valido(uuid) from public,anon;
grant execute on function public.contrato_tiene_deposito_valido(uuid) to authenticated;

create or replace function private.bloquear_entrega_sin_deposito() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(coalesce(new.tipo_entrega,''))<>'reversion' and not exists(select 1 from public.contratos c where c.id=new.contrato_id and coalesce(c.valor_deposito,0)>0) then
  raise exception 'No se puede entregar el vestido. Primero debe registrarse el depósito correspondiente.';
 end if; return new;
end $$;
drop trigger if exists bloquear_entrega_sin_deposito on public.entregas_bitacora;
create trigger bloquear_entrega_sin_deposito before insert on public.entregas_bitacora for each row execute function private.bloquear_entrega_sin_deposito();

create table if not exists public.vestidos_fuera_tienda (
 id uuid primary key default gen_random_uuid(), contrato_id uuid not null references public.contratos(id), vestido_id uuid not null references public.vestidos(id),
 entrega_id uuid not null references public.entregas_bitacora(id), salida_at timestamptz not null,
 regreso_at timestamptz, dias_fuera_cierre integer, created_at timestamptz not null default now()
);
create unique index if not exists vestidos_fuera_unico_activo on public.vestidos_fuera_tienda(contrato_id,vestido_id) where regreso_at is null;
create index if not exists vestidos_fuera_activos_idx on public.vestidos_fuera_tienda(salida_at) where regreso_at is null;
alter table public.vestidos_fuera_tienda enable row level security;
revoke all on public.vestidos_fuera_tienda from anon,authenticated;
grant select on public.vestidos_fuera_tienda to authenticated;
create policy vestidos_fuera_leer on public.vestidos_fuera_tienda for select to authenticated using(private.acceso_deposito(contrato_id));

create or replace function private.registrar_salida_vestidos() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(coalesce(new.tipo_entrega,''))<>'reversion' then
  insert into public.vestidos_fuera_tienda(contrato_id,vestido_id,entrega_id,salida_at)
  select new.contrato_id,i.vestido_id,new.id,coalesce(new.fecha_entrega,new.created_at,now()) from public.contrato_items_vestidos i where i.contrato_id=new.contrato_id
  on conflict(contrato_id,vestido_id) where regreso_at is null do nothing;
 end if; return new;
end $$;
drop trigger if exists registrar_salida_vestidos on public.entregas_bitacora;
create trigger registrar_salida_vestidos after insert on public.entregas_bitacora for each row execute function private.registrar_salida_vestidos();

create or replace function private.cerrar_salida_y_solicitar_devolucion() returns trigger language plpgsql security definer set search_path='' as $$
declare saldo numeric; metodo text; solicitante uuid; solicitante_nombre text; begin
 if lower(new.estado)='mantenimiento' and lower(coalesce(old.estado,''))<>'mantenimiento' then
  update public.vestidos_fuera_tienda set regreso_at=clock_timestamp(),dias_fuera_cierre=greatest(1,(clock_timestamp()::date-salida_at::date)) where contrato_id=new.id and regreso_at is null;
 end if;
 if lower(new.estado)='finalizado' and lower(coalesce(old.estado,''))<>'finalizado' then
  new.finalizado_at:=coalesce(new.finalizado_at,clock_timestamp());
  if new.finalizado_at>='2026-09-14 00:00:00-05'::timestamptz then
   select coalesce(new.valor_deposito,0)-coalesce(sum(d.monto_devuelto+coalesce(d.monto_descuento,0)),0) into saldo from public.devoluciones_depositos d where d.contrato_id=new.id and coalesce(lower(d.estado),'completado') not in ('cancelado','anulado','rechazado');
   if saldo>0 and not exists(select 1 from public.solicitudes_depositos s where s.contrato_id=new.id and s.estado in ('pendiente','en_proceso','pagado')) then
    select coalesce((select m.metodo from public.movimientos_depositos m where m.contrato_id=new.id and m.tipo='ingreso' order by m.created_at desc limit 1),'Transferencia') into metodo;
    if metodo not in ('Efectivo','Transferencia') then metodo:='Transferencia'; end if;
    select p.id,p.nombre into solicitante,solicitante_nombre from public.profiles p where p.id=(select auth.uid());
    if solicitante is not null then
     insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,estado,solicitante_id,solicitante_nombre,recibido_at,banco,tipo_cuenta,cuenta,titular,observaciones)
     values(gen_random_uuid(),new.id,saldo,0,metodo,'pendiente',solicitante,coalesce(solicitante_nombre,'Usuario'),now(),new.banco_deposito,new.tipo_cuenta_deposito,new.numero_cuenta_deposito,new.titular_cuenta_deposito,'Solicitud automática al finalizar contrato');
    end if;
   end if;
  end if;
 end if; return new;
end $$;
drop trigger if exists cerrar_salida_y_solicitar_devolucion on public.contratos;
create trigger cerrar_salida_y_solicitar_devolucion before update of estado on public.contratos for each row execute function private.cerrar_salida_y_solicitar_devolucion();

create or replace function public.vestidos_fuera_activos()
returns table(id uuid,contrato_id uuid,numero_contrato text,numero_factura text,cliente_nombre text,sede text,vestido_codigo text,salida_at timestamptz,dias_fuera integer,semaforo text)
language sql stable security invoker set search_path='' as $$
 select f.id,c.id,c.numero_contrato::text,c.numero_factura::text,c.cliente_nombre::text,c.sede::text,v.codigo::text,f.salida_at,
 greatest(1,((now() at time zone 'America/Bogota')::date-(f.salida_at at time zone 'America/Bogota')::date))::integer,
 case when ((now() at time zone 'America/Bogota')::date-(f.salida_at at time zone 'America/Bogota')::date)>=9 then 'ALERTA' when ((now() at time zone 'America/Bogota')::date-(f.salida_at at time zone 'America/Bogota')::date)>=6 then 'PRÓXIMO A SEGUIMIENTO' else 'NORMAL' end
 from public.vestidos_fuera_tienda f join public.contratos c on c.id=f.contrato_id join public.vestidos v on v.id=f.vestido_id
 where f.regreso_at is null and private.acceso_deposito(c.id) order by f.salida_at;
$$;
revoke all on function public.vestidos_fuera_activos() from public,anon;
grant execute on function public.vestidos_fuera_activos() to authenticated;

-- Bandeja contable estrictamente pendiente, con los campos requeridos por pantalla/XLSX.
create or replace function private.contratos_depositos_pendientes_v2()
returns table(id uuid,numero_contrato text,numero_factura text,cliente_nombre text,cliente_documento text,sede text,valor_deposito numeric,banco_deposito text,tipo_cuenta_deposito text,numero_cuenta_deposito text,titular_cuenta_deposito text)
language sql stable security definer set search_path='' as $$
 select c.id,c.numero_contrato::text,c.numero_factura::text,c.cliente_nombre::text,c.cliente_documento::text,c.sede::text,c.valor_deposito,c.banco_deposito,c.tipo_cuenta_deposito,c.numero_cuenta_deposito,c.titular_cuenta_deposito
 from public.contratos c where auth.uid() is not null and private.es_contabilidad()
 and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true))
 and exists(select 1 from public.solicitudes_depositos s where s.contrato_id=c.id and s.estado in ('pendiente','en_proceso','pagado')) order by c.id;
$$;
revoke all on function private.contratos_depositos_pendientes_v2() from public,anon;
grant execute on function private.contratos_depositos_pendientes_v2() to authenticated;
create or replace function public.contratos_depositos_pendientes_v2()
returns table(id uuid,numero_contrato text,numero_factura text,cliente_nombre text,cliente_documento text,sede text,valor_deposito numeric,banco_deposito text,tipo_cuenta_deposito text,numero_cuenta_deposito text,titular_cuenta_deposito text)
language sql stable security invoker set search_path='' as $$ select * from private.contratos_depositos_pendientes_v2(); $$;
revoke all on function public.contratos_depositos_pendientes_v2() from public,anon;
grant execute on function public.contratos_depositos_pendientes_v2() to authenticated;
