-- Venta de vestidos: cada vestido indica si está disponible para alquiler, para venta o para ambos (por defecto solo alquiler:
-- los vestidos existentes no cambian). La venta es de contado (precio de venta menos descuento con motivo), sin contrato:
-- lleva datos de la factura, entra sola a la caja del día como «Venta de vestido» y queda pendiente para Siigo con el código + V.
-- Revert: drop trigger contrato_items_solo_venta on public.contrato_items_vestidos; drop function private.contrato_items_solo_venta();
--   drop function public.registrar_venta_vestido(jsonb), public.anular_venta_vestido(uuid,text); drop table public.ventas_vestidos;
--   restore caja_movimientos_origen_check (pago, deposito, devolucion); re-apply private.vestidos_validar_datos and
--   private.vestidos_editar_inventario from 20261203120000 / earlier; alter table public.vestidos drop column para_alquiler, drop column para_venta;
--   delete from public.roles_permisos where permiso='ventas.registrar'; delete from public.permisos where codigo='ventas.registrar';
alter table public.vestidos add column if not exists para_alquiler boolean not null default true,
 add column if not exists para_venta boolean not null default false;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='vestidos_disponible_para') then
  alter table public.vestidos add constraint vestidos_disponible_para check (para_alquiler or para_venta);
 end if;
end $$;

-- Price rules by availability: rental price when it is rented, sale price when it is sold.
do $do$ declare d text:=pg_get_functiondef('private.vestidos_validar_datos()'::regprocedure);
 a text:=$a$ if (nuevo or new.precio_sugerido is distinct from old.precio_sugerido) and coalesce(new.precio_sugerido,0)<=0 then raise exception 'El precio de alquiler es obligatorio.'; end if;$a$;
 b text:=$b$ if (nuevo or new.precio_sugerido is distinct from old.precio_sugerido or new.para_alquiler is distinct from old.para_alquiler) and new.para_alquiler and coalesce(new.precio_sugerido,0)<=0 then raise exception 'El precio de alquiler es obligatorio.'; end if;
 if (nuevo or new.precio_venta is distinct from old.precio_venta or new.para_venta is distinct from old.para_venta) and new.para_venta and coalesce(new.precio_venta,0)<=0 then raise exception 'El precio de venta es obligatorio para un vestido en venta.'; end if;$b$;
begin
 if position('para_venta' in d)=0 then
  if position(a in d)=0 then raise exception 'No se encontró la validación de precio en vestidos_validar_datos.'; end if;
  execute replace(d,a,b);
 end if;
end $do$;

-- Changing availability is an inventory edit (same permission and sites as prices).
do $do$ declare d text:=pg_get_functiondef('private.vestidos_editar_inventario()'::regprocedure); begin
 if position('para_venta' in d)=0 then
  d:=replace(d,'new.precio_venta,new.clasificacion_id','new.precio_venta,new.para_alquiler,new.para_venta,new.clasificacion_id');
  d:=replace(d,'old.precio_venta,old.clasificacion_id','old.precio_venta,old.para_alquiler,old.para_venta,old.clasificacion_id');
  if position('new.para_venta' in d)=0 or position('old.para_venta' in d)=0 then raise exception 'No se pudo ajustar vestidos_editar_inventario.'; end if;
  execute d;
 end if;
end $do$;

-- A sale-only dress cannot go into a new rental contract.
create or replace function private.contrato_items_solo_venta() returns trigger language plpgsql security definer set search_path='' as $$
declare c text;
begin
 select codigo into c from public.vestidos where id=new.vestido_id and not para_alquiler;
 if found then raise exception 'El vestido % es solo para venta: no se puede alquilar.',c; end if;
 return new;
end $$;
drop trigger if exists contrato_items_solo_venta on public.contrato_items_vestidos;
create trigger contrato_items_solo_venta before insert or update of vestido_id on public.contrato_items_vestidos for each row execute function private.contrato_items_solo_venta();

alter table public.caja_movimientos drop constraint if exists caja_movimientos_origen_check;
alter table public.caja_movimientos add constraint caja_movimientos_origen_check check (origen = any (array['pago','deposito','devolucion','venta']));

create table if not exists public.ventas_vestidos(
 id uuid primary key default gen_random_uuid(),
 vestido_id uuid not null references public.vestidos(id),
 sede_id uuid not null references public.sedes(id),
 fecha date not null,
 precio_lista numeric not null check (precio_lista>0),
 descuento numeric not null default 0 check (descuento>=0),
 motivo_descuento text check (motivo_descuento is null or length(motivo_descuento)<=500),
 total numeric not null check (total>0),
 medio_pago text not null check (medio_pago in ('Efectivo','Transferencia','Tarjeta','Otro')),
 cuenta_id uuid references public.cuentas_dinero(id),
 cliente_nombre text not null check (length(cliente_nombre) between 3 and 140),
 cliente_documento text not null check (cliente_documento ~ '^[0-9A-Za-z-]{5,20}$'),
 cliente_telefono text check (cliente_telefono is null or length(cliente_telefono)<=20),
 cliente_email text check (cliente_email is null or length(cliente_email)<=160),
 numero_factura text check (numero_factura is null or length(numero_factura)<=40),
 codigo_siigo text not null,
 siigo_estado text not null default 'pendiente' check (siigo_estado in ('pendiente','enviada','error')),
 estado text not null default 'registrada' check (estado in ('registrada','anulada')),
 caja_movimiento_id uuid references public.caja_movimientos(id),
 vendedor_id uuid references public.profiles(id),
 creado_por uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 anulada_at timestamptz, anulada_por uuid references public.profiles(id), motivo_anulacion text
);
create unique index if not exists ventas_vestidos_una_activa on public.ventas_vestidos(vestido_id) where estado='registrada';
alter table public.ventas_vestidos enable row level security;
revoke all on public.ventas_vestidos from anon;
drop policy if exists ventas_vestidos_leer on public.ventas_vestidos;
create policy ventas_vestidos_leer on public.ventas_vestidos for select to authenticated
 using (public.es_admin() or (select private.sedes_limitadas()) is null or sede_id=any((select private.sedes_limitadas())));

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
 values('ventas.registrar','Inventario','Registrar venta de vestidos','Vender un vestido marcado para venta (de contado, con descuento y datos de factura). Entra a la caja del día',false,21)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso,activo)
 select r,'ventas.registrar',true from unnest(array['asesora_lider','franquiciado']) r where exists(select 1 from public.roles where id=r)
on conflict do nothing;

-- Sale: full price minus an optional discount (with reason), invoice data; the income goes into today's cash register.
create or replace function public.registrar_venta_vestido(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v public.vestidos; dto numeric:=coalesce(nullif(p_datos->>'descuento','')::numeric,0); motivo text:=nullif(btrim(coalesce(p_datos->>'motivo_descuento','')),'');
 medio text:=coalesce(nullif(p_datos->>'medio_pago',''),'Efectivo'); nombre text:=btrim(coalesce(p_datos->>'cliente_nombre',''));
 doc text:=upper(regexp_replace(coalesce(p_datos->>'cliente_documento',''),'[\s.]','','g')); nuevo uuid; mov uuid; total numeric;
begin
 if not (public.es_admin() or private.tiene_permiso('ventas.registrar')) then raise exception 'No tienes permiso para registrar ventas.' using errcode='42501'; end if;
 select * into v from public.vestidos where id=nullif(p_datos->>'vestido_id','')::uuid for update;
 if not found then raise exception 'Vestido no encontrado.'; end if;
 if not v.para_venta then raise exception 'El vestido % no está disponible para venta. Márcalo «Venta» en su ficha.',v.codigo; end if;
 if coalesce(v.archivado,false) or lower(coalesce(v.estado,'')) in ('vendido','dañado/baja','de baja','traslado') then raise exception 'El vestido % no se puede vender (estado: %).',v.codigo,v.estado; end if;
 if v.sede_actual_id is null or not (public.es_admin() or private.sedes_limitadas() is null or v.sede_actual_id=any(private.sedes_limitadas())) then raise exception 'Solo puedes vender vestidos que están en tu sede.' using errcode='42501'; end if;
 if coalesce(v.precio_venta,0)<=0 then raise exception 'El vestido % no tiene precio de venta.',v.codigo; end if;
 if exists(select 1 from public.contratos c where lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado','liquidado','historial','borrador')
   and (c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id=v.id))) then
  raise exception 'El vestido % tiene contratos de alquiler activos; termina o cancela esos contratos antes de venderlo.',v.codigo; end if;
 if dto<0 or dto>=v.precio_venta then raise exception 'El descuento debe ser menor que el precio de venta.'; end if;
 if dto>0 and (motivo is null or length(motivo)<5) then raise exception 'Escribe el motivo del descuento.'; end if;
 if length(nombre)<3 or doc !~ '^[0-9A-Z-]{5,20}$' then raise exception 'Escribe el nombre y el documento de quien compra (para la factura).'; end if;
 total:=v.precio_venta-dto;
 insert into public.ventas_vestidos(vestido_id,sede_id,fecha,precio_lista,descuento,motivo_descuento,total,medio_pago,cuenta_id,cliente_nombre,cliente_documento,cliente_telefono,cliente_email,numero_factura,codigo_siigo,vendedor_id,creado_por)
 values(v.id,v.sede_actual_id,private.caja_hoy(),v.precio_venta,dto,case when dto>0 then motivo end,total,medio,case when medio='Efectivo' then null else nullif(p_datos->>'cuenta_id','')::uuid end,
  nombre,doc,nullif(left(btrim(coalesce(p_datos->>'cliente_telefono','')),20),''),nullif(left(btrim(coalesce(p_datos->>'cliente_email','')),160),''),
  nullif(left(btrim(coalesce(p_datos->>'numero_factura','')),40),''),upper(btrim(v.codigo))||'V',auth.uid(),auth.uid())
 returning id into nuevo;
 mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',v.sede_actual_id,'fecha',private.caja_hoy(),'tipo','ingreso','categoria','Venta de vestido','medio',medio,
  'valor',total,'descripcion','Venta '||upper(btrim(v.codigo))||' · '||nombre||case when dto>0 then ' · descuento '||dto::text else '' end,'origen','venta','origen_id',nuevo,'cuenta_id',p_datos->>'cuenta_id'));
 update public.ventas_vestidos set caja_movimiento_id=mov where id=nuevo;
 update public.vestidos set estado='Vendido' where id=v.id;
 insert into public.bitacora_vestidos(id,vestido_id,usuario_email,accion,motivo,detalle,fecha,created_at)
 values(gen_random_uuid(),v.id,(select email from public.profiles where id=auth.uid()),'Venta','Venta de contado',nombre||' · total '||total::text,now(),now());
 return nuevo;
end $$;

-- Cancel a sale (administration): annuls the cash income and the dress goes back to its previous availability.
create or replace function public.anular_venta_vestido(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare s public.ventas_vestidos; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not public.es_admin() then raise exception 'Solo administración anula ventas.' using errcode='42501'; end if;
 select * into s from public.ventas_vestidos where id=p_id for update;
 if not found or s.estado<>'registrada' then raise exception 'Venta no encontrada o ya anulada.'; end if;
 if length(reason)<5 then raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).'; end if;
 if s.caja_movimiento_id is not null then perform private.anular_movimiento_caja(s.caja_movimiento_id,'Venta anulada: '||reason); end if;
 update public.ventas_vestidos set estado='anulada',anulada_at=now(),anulada_por=auth.uid(),motivo_anulacion=reason where id=p_id;
 perform private.refrescar_prenda_operaciones(s.vestido_id);
 insert into public.bitacora_vestidos(id,vestido_id,usuario_email,accion,motivo,detalle,fecha,created_at)
 values(gen_random_uuid(),s.vestido_id,(select email from public.profiles where id=auth.uid()),'Venta anulada',reason,null,now(),now());
end $$;
revoke all on function public.registrar_venta_vestido(jsonb),public.anular_venta_vestido(uuid,text) from public,anon;
grant execute on function public.registrar_venta_vestido(jsonb),public.anular_venta_vestido(uuid,text) to authenticated;
