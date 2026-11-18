-- Operaciones › Adaptaciones y confección: arreglos (sastrería) y lavandería de cada vestido, sobre mantenimiento_bitacora (la misma
-- tabla que ya usa la recepción del contrato: 516 registros). Se agrega quién lo hace (proveedor: costurera, sastre o lavandería),
-- qué se hizo, el costo para Ámbar, fechas de envío y regreso, fotos antes y después, y el pago a la costurera desde
-- «Pagos a proveedores» (detalle aparte: pago_proveedor_arreglos). Además el historial completo de un vestido.
-- Reversible: drop de las funciones nuevas, de pago_proveedor_arreglos y de las columnas nuevas; restaurar los cuerpos anteriores de
-- servicios_por_pagar, registrar_pago_proveedor, anular_pago_proveedor y proveedores_resumen; borrar el bucket arreglos_fotos.

alter table public.mantenimiento_bitacora
 add column if not exists proveedor_id uuid references public.proveedores(id),
 add column if not exists trabajo text check (length(trabajo)<=300),
 add column if not exists costo numeric(14,2) check (costo>=0),
 add column if not exists estado_pago text check (estado_pago in ('Pendiente','Pagado')),
 add column if not exists fecha_envio timestamptz,
 add column if not exists fecha_regreso timestamptz,
 add column if not exists fotos_antes text[] not null default '{}',
 add column if not exists fotos_despues text[] not null default '{}',
 add column if not exists registrado_por uuid references public.profiles(id),
 add column if not exists arreglo_id bigint references public.arreglos(id);
create index if not exists mantenimiento_bitacora_proveedor on public.mantenimiento_bitacora(proveedor_id) where proveedor_id is not null;
create index if not exists mantenimiento_bitacora_vestido on public.mantenimiento_bitacora(vestido_id);

create trigger mantenimiento_bitacora_historial after insert or update or delete on public.mantenimiento_bitacora for each row execute function private.config_historial();

create table if not exists public.pago_proveedor_arreglos(
 pago_id uuid not null references public.pagos_proveedor(id),
 mantenimiento_id uuid not null references public.mantenimiento_bitacora(id),
 valor numeric(14,2) not null check (valor>=0),
 primary key(pago_id,mantenimiento_id)
);
alter table public.pago_proveedor_arreglos enable row level security;
create policy pago_proveedor_arreglos_admin on public.pago_proveedor_arreglos for select to authenticated using (public.es_admin());
revoke insert,update,delete on public.pago_proveedor_arreglos from anon, authenticated;

insert into storage.buckets(id,name,public) values('arreglos_fotos','arreglos_fotos',false) on conflict (id) do nothing;
create policy arreglos_fotos_leer on storage.objects for select to authenticated using (bucket_id='arreglos_fotos' and private.prov_es_personal());
create policy arreglos_fotos_subir on storage.objects for insert to authenticated with check (bucket_id='arreglos_fotos' and private.prov_es_personal());

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values ('panel.arreglos','Operaciones','Ver Adaptaciones y confección','Arreglos y lavandería de los vestidos de su sede: enviar a la costurera, recibir con fotos antes y después',false,24)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) values ('asesora','panel.arreglos'),('asesora_lider','panel.arreglos'),('franquiciado','panel.arreglos') on conflict do nothing;

insert into public.listas_contrato(lista,valor,orden,activo)
select 'prov_tipos_servicio','Costura y arreglos',coalesce(max(orden),0)+1,true from public.listas_contrato where lista='prov_tipos_servicio'
on conflict do nothing;

-- Who manages a dress's repairs: staff of the store where the dress is (administration and accounting: all).
create or replace function private.arreglo_ver(p_vestido uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.prov_es_personal() and (private.es_finanzas() or private.caja_ver((select sede_actual_id from public.vestidos where id=p_vestido)));
$$;

-- Create or edit a repair. A new one opens the dress's maintenance (the dress shows «EN MANTENIMIENTO»).
create or replace function public.arreglo_guardar(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=nullif(p->>'id','')::uuid; v_vestido uuid:=nullif(p->>'vestido_id','')::uuid; v_tipo text:=upper(coalesce(nullif(p->>'tipo',''),'SASTRERÍA'));
 v_prov uuid:=nullif(p->>'proveedor_id','')::uuid; v_trabajo text:=nullif(btrim(coalesce(p->>'trabajo','')),''); v_desc text:=nullif(btrim(coalesce(p->>'descripcion','')),'');
 v_costo numeric:=nullif(p->>'costo','')::numeric; v_contrato uuid:=nullif(p->>'contrato_id','')::uuid; v_arreglo bigint:=nullif(p->>'arreglo_id','')::bigint;
 v_fotos text[]:=coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'fotos_antes','[]'::jsonb)) x),'{}'); old public.mantenimiento_bitacora;
begin
 if v_tipo not in ('SASTRERÍA','LAVANDERÍA') then raise exception 'Elige si es arreglo (sastrería) o lavandería.'; end if;
 if v_costo is not null and (v_costo<0 or v_costo<>round(v_costo,2)) then raise exception 'Revisa el costo.'; end if;
 if v_prov is not null and not exists(select 1 from public.proveedores where id=v_prov) then raise exception 'Proveedor no encontrado.'; end if;
 if exists(select 1 from unnest(v_fotos) f where split_part(f,'/',1)<>coalesce(v_vestido::text,'') and v_id is null) then raise exception 'Las fotos no corresponden al vestido.'; end if;
 if v_id is null then
  if v_vestido is null or not exists(select 1 from public.vestidos where id=v_vestido) then raise exception 'Elige el vestido.'; end if;
  if not private.arreglo_ver(v_vestido) then raise exception 'No puedes registrar arreglos de este vestido.' using errcode='42501'; end if;
  if coalesce(v_trabajo,v_desc) is null then raise exception 'Describe el arreglo.'; end if;
  insert into public.mantenimiento_bitacora(vestido_id,contrato_id,tipo,estado,completado,descripcion_danos,trabajo,proveedor_id,costo,fotos_antes,arreglo_id,registrado_por,usuario_id,fecha_entrada,created_at)
  values(v_vestido,v_contrato,v_tipo,'en proceso',false,v_desc,v_trabajo,v_prov,v_costo,v_fotos,v_arreglo,auth.uid(),auth.uid(),now(),now()) returning id into v_id;
 else
  select * into old from public.mantenimiento_bitacora where id=v_id for update;
  if old.id is null or not private.arreglo_ver(old.vestido_id) then raise exception 'Arreglo no encontrado.' using errcode='42501'; end if;
  if old.estado_pago='Pagado' and v_costo is distinct from old.costo then raise exception 'Este arreglo ya se pagó: su costo no se puede cambiar.'; end if;
  if exists(select 1 from unnest(v_fotos) f where split_part(f,'/',1)<>old.vestido_id::text) then raise exception 'Las fotos no corresponden al vestido.'; end if;
  update public.mantenimiento_bitacora set tipo=v_tipo,proveedor_id=v_prov,trabajo=v_trabajo,descripcion_danos=coalesce(v_desc,descripcion_danos),costo=v_costo,
   fotos_antes=case when cardinality(v_fotos)>0 then v_fotos else fotos_antes end,
   estado_pago=case when estado_pago='Pagado' then 'Pagado' when fecha_regreso is not null and v_prov is not null and coalesce(v_costo,0)>0 then 'Pendiente' else null end
  where id=v_id;
  v_vestido:=old.vestido_id;
 end if;
 perform private.refrescar_prenda_operaciones(v_vestido);
 return v_id;
end $$;

-- Sent to the seamstress: needs who does it and, for a repair (sastrería), the «before» photo.
create or replace function public.arreglo_enviar(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.mantenimiento_bitacora;
begin
 select * into m from public.mantenimiento_bitacora where id=p_id for update;
 if m.id is null or not private.arreglo_ver(m.vestido_id) then raise exception 'Arreglo no encontrado.' using errcode='42501'; end if;
 if lower(coalesce(m.estado,'')) in ('finalizado','completado','cancelado') then raise exception 'Este arreglo ya está cerrado.'; end if;
 if m.proveedor_id is null then raise exception 'Elige quién hace el arreglo (costurera, sastre o lavandería).'; end if;
 if m.tipo='SASTRERÍA' and cardinality(m.fotos_antes)=0 then raise exception 'Toma la foto del «antes» antes de enviarlo.'; end if;
 update public.mantenimiento_bitacora set fecha_envio=coalesce(fecha_envio,now()) where id=p_id;
end $$;

-- Back from the seamstress: «after» photo required for a repair (sastrería); the repair closes and, with a cost, stays «Pendiente» of payment to the supplier.
create or replace function public.arreglo_recibir(p_id uuid,p_fotos_despues jsonb,p_costo numeric) returns void
language plpgsql security definer set search_path='' as $$
declare m public.mantenimiento_bitacora; f text[]:=coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_fotos_despues,'[]'::jsonb)) x),'{}');
begin
 select * into m from public.mantenimiento_bitacora where id=p_id for update;
 if m.id is null or not private.arreglo_ver(m.vestido_id) then raise exception 'Arreglo no encontrado.' using errcode='42501'; end if;
 if lower(coalesce(m.estado,'')) in ('finalizado','completado','cancelado') then raise exception 'Este arreglo ya está cerrado.'; end if;
 if m.tipo='SASTRERÍA' and cardinality(f)=0 then raise exception 'Toma la foto del «después» para recibir el vestido.'; end if;
 if exists(select 1 from unnest(f) x where split_part(x,'/',1)<>m.vestido_id::text) then raise exception 'Las fotos no corresponden al vestido.'; end if;
 if p_costo is not null and (p_costo<0 or p_costo<>round(p_costo,2)) then raise exception 'Revisa el costo.'; end if;
 update public.mantenimiento_bitacora set fotos_despues=f,fecha_regreso=now(),fecha_envio=coalesce(fecha_envio,now()),costo=coalesce(p_costo,costo),
  estado='finalizado',completado=true,
  estado_pago=case when proveedor_id is not null and coalesce(p_costo,costo,0)>0 then 'Pendiente' else null end
 where id=p_id;
 perform private.refrescar_prenda_operaciones(m.vestido_id);
end $$;

create or replace function public.arreglo_cancelar(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.mantenimiento_bitacora;
begin
 select * into m from public.mantenimiento_bitacora where id=p_id for update;
 if m.id is null or not private.arreglo_ver(m.vestido_id) then raise exception 'Arreglo no encontrado.' using errcode='42501'; end if;
 if m.estado_pago='Pagado' then raise exception 'Este arreglo ya se pagó: anula primero el pago.'; end if;
 if length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Escribe el motivo (mínimo 5 caracteres).'; end if;
 update public.mantenimiento_bitacora set estado='cancelado',completado=true,estado_pago=null,
  descripcion_danos=left(concat_ws(' · ',descripcion_danos,'Cancelado: '||btrim(p_motivo)),2000) where id=p_id;
 perform private.refrescar_prenda_operaciones(m.vestido_id);
end $$;

insert into public.listas_contrato(lista,valor,orden,activo) values('prov_tipos_servicio','Lavandería',coalesce((select max(orden) from public.listas_contrato where lista='prov_tipos_servicio'),0)+1,true) on conflict do nothing;

-- Board: open repairs and laundry of the user's stores, those finished in the last 30 days, and contract adjustments not sent yet.
create or replace function public.arreglos_tablero(p_sede uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'arreglos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'vestido_id',v.id,'codigo',v.codigo,'vestido',v.nombre,'sede',s.nombre,'sede_id',v.sede_actual_id,
    'tipo',m.tipo,'estado',m.estado,'trabajo',m.trabajo,'descripcion',m.descripcion_danos,'proveedor_id',m.proveedor_id,'proveedor',pv.nombre,'costo',m.costo,'estado_pago',m.estado_pago,
    'fecha_entrada',coalesce(m.fecha_entrada,m.created_at),'fecha_envio',m.fecha_envio,'fecha_regreso',m.fecha_regreso,'dias_estimados',m.dias_estimados,
    'fotos_antes',to_jsonb(m.fotos_antes),'fotos_despues',to_jsonb(m.fotos_despues),'contrato',c.numero_contrato,'cobro_arreglo',m.cobro_arreglo,
    'proximo_evento',(select min(k.fecha_evento) from public.contrato_items_vestidos i join public.contratos k on k.id=i.contrato_id
      where i.vestido_id=v.id and k.fecha_evento>=(now() at time zone 'America/Bogota')::date and lower(coalesce(k.estado,'')) not in ('cancelado','cancelada','anulado','anulada','finalizado','liquidado'))
   ) order by coalesce(m.fecha_envio,m.created_at) desc)
   from public.mantenimiento_bitacora m join public.vestidos v on v.id=m.vestido_id left join public.sedes s on s.id=v.sede_actual_id
   left join public.proveedores pv on pv.id=m.proveedor_id left join public.contratos c on c.id=m.contrato_id
   where private.arreglo_ver(v.id) and (p_sede is null or v.sede_actual_id=p_sede)
    and (lower(coalesce(m.estado,'')) not in ('finalizado','completado','cancelado') and not coalesce(m.completado,false)
     or (lower(coalesce(m.estado,''))<>'cancelado' and coalesce(m.fecha_regreso,m.created_at)>now()-interval '30 days'))),'[]'::jsonb),
  'del_contrato',coalesce((select jsonb_agg(jsonb_build_object('arreglo_id',a.id,'tipo_arreglo',a.tipo_arreglo,'centimetros',a.centimetros,'precio',a.precio,
    'contrato_id',c.id,'contrato',c.numero_contrato,'cliente',c.cliente_nombre,'fecha_evento',c.fecha_evento,'sede',s.nombre,
    'vestidos',(select jsonb_agg(jsonb_build_object('id',v.id,'codigo',v.codigo)) from public.contrato_items_vestidos i join public.vestidos v on v.id=i.vestido_id where i.contrato_id=c.id)) order by c.fecha_evento)
   from public.arreglos a join public.contratos c on c.id=a.contrato_id left join public.sedes s on s.id=c.sede_id
   where not exists(select 1 from public.mantenimiento_bitacora m where m.arreglo_id=a.id)
    and c.fecha_evento>=(now() at time zone 'America/Bogota')::date and lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado','anulada')
    and (private.es_finanzas() or private.caja_ver(c.sede_id)) and (p_sede is null or c.sede_id=p_sede)),'[]'::jsonb),
  -- Who can do the work: active suppliers, seamstresses and laundries first (staff only).
  'proveedores',case when private.prov_es_personal() then coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'nombre',v.nombre,'tipo_servicio',v.tipo_servicio,'celular',v.celular)
    order by (coalesce(v.tipo_servicio,'') in ('Costura y arreglos','Lavandería')) desc,v.nombre) from public.proveedores v where lower(coalesce(v.estado,'activo'))='activo'),'[]'::jsonb) else '[]'::jsonb end);
$$;

-- Full history of a dress: rentals, repairs and laundry, transfers and changes, with a summary.
create or replace function public.vestido_historial(p_vestido uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v public.vestidos;
begin
 select * into v from public.vestidos where id=p_vestido;
 if v.id is null or not private.prov_es_personal() then raise exception 'Vestido no encontrado.' using errcode='42501'; end if;
 return jsonb_build_object(
  'resumen',jsonb_build_object(
   'alquileres',(select count(distinct k.id) from public.contratos k where (k.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=k.id and i.vestido_id=v.id))
     and lower(coalesce(k.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado')),
   'arreglos',(select count(*) from public.mantenimiento_bitacora m where m.vestido_id=v.id and m.tipo='SASTRERÍA' and lower(coalesce(m.estado,''))<>'cancelado'),
   'lavanderias',(select count(*) from public.mantenimiento_bitacora m where m.vestido_id=v.id and m.tipo='LAVANDERÍA' and lower(coalesce(m.estado,''))<>'cancelado'),
   'costo_arreglos',(select coalesce(sum(m.costo),0) from public.mantenimiento_bitacora m where m.vestido_id=v.id and lower(coalesce(m.estado,''))<>'cancelado'),
   'arreglos_6_meses',(select count(*) from public.mantenimiento_bitacora m where m.vestido_id=v.id and m.tipo='SASTRERÍA' and lower(coalesce(m.estado,''))<>'cancelado' and m.created_at>now()-interval '6 months'),
   'traslados',(select count(*) from public.traslados_bitacora t where t.vestido_id=v.id and coalesce(t.estado,'')<>'cancelado'),
   -- Rental income of the dress: each contract's value split among the dresses of that contract.
   'ingresos',(select coalesce(round(sum(k.valor_total/greatest(1,(select count(*) from public.contrato_items_vestidos i2 where i2.contrato_id=k.id)))),0) from public.contratos k
     where (k.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=k.id and i.vestido_id=v.id)) and lower(coalesce(k.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado'))),
  'eventos',coalesce((select jsonb_agg(e order by e->>'fecha' desc) from (
   select jsonb_build_object('tipo','alquiler','fecha',coalesce(k.fecha_evento::text,k.created_at::text),'titulo','Alquiler · '||coalesce(k.numero_contrato,''),
    'detalle',concat_ws(' · ',k.cliente_nombre,s.nombre,'estado '||k.estado),'valor',k.valor_total) e
   from public.contratos k left join public.sedes s on s.id=k.sede_id
   where (k.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=k.id and i.vestido_id=v.id))
   union all
   select jsonb_build_object('tipo',case when m.tipo='LAVANDERÍA' then 'lavanderia' else 'arreglo' end,'fecha',coalesce(m.fecha_envio,m.fecha_entrada,m.created_at)::text,
    'titulo',case when m.tipo='LAVANDERÍA' then 'Lavandería' else 'Arreglo' end||coalesce(' · '||pv.nombre,''),
    'detalle',concat_ws(' · ',m.trabajo,m.descripcion_danos,'estado '||m.estado,case when m.fecha_regreso is not null then 'volvió '||to_char(m.fecha_regreso at time zone 'America/Bogota','DD/MM/YYYY') end,k.numero_contrato),
    'valor',m.costo,'fotos_antes',to_jsonb(m.fotos_antes),'fotos_despues',to_jsonb(m.fotos_despues),'estado_pago',m.estado_pago)
   from public.mantenimiento_bitacora m left join public.proveedores pv on pv.id=m.proveedor_id left join public.contratos k on k.id=m.contrato_id where m.vestido_id=v.id
   union all
   select jsonb_build_object('tipo','traslado','fecha',coalesce(t.fecha_envio,t.created_at)::text,'titulo','Traslado · '||coalesce(t.sede_origen,'')||' → '||coalesce(t.sede_destino,''),
    'detalle',concat_ws(' · ',case t.tipo when 'prestamo' then 'Préstamo' when 'definitivo' then 'Definitivo' when 'devolucion' then 'Devolución' end,t.estado,t.motivo))
   from public.traslados_bitacora t where t.vestido_id=v.id
   union all
   select jsonb_build_object('tipo','cambio','fecha',coalesce(b.fecha,b.created_at)::text,'titulo',b.accion,'detalle',concat_ws(' · ',b.motivo,b.detalle))
   from public.bitacora_vestidos b where b.vestido_id=v.id) x),'[]'::jsonb));
end $$;

-- Payments to suppliers: services of contracts (as before) and repairs of dresses («arreglos»).
create or replace function private.servicios_por_pagar(p_sede uuid, p_proveedor uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $function$
begin
 if not public.es_admin() then raise exception 'Solo administración registra pagos a proveedores.' using errcode='42501'; end if;
 return jsonb_build_object(
  'pendientes',coalesce((select jsonb_agg(x order by x->>'proveedor',x->>'fecha_servicio') from (
   select jsonb_build_object('id',s.id,'clase','servicio','proveedor_id',v.id,'proveedor',v.nombre,'servicio',s.servicio,'descripcion',s.descripcion,'fecha_servicio',s.fecha_servicio,'estado',s.estado,
    'valor_empresa',s.valor_empresa,'adicional_valor',s.adicional_valor,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'sede_id',c.sede_id,'realizado_at',s.realizado_at,'banco',v.banco,'tipo_cuenta',v.tipo_cuenta,'numero_cuenta',v.numero_cuenta) x
   from public.contrato_servicios s join public.proveedores v on v.id=s.proveedor_id join public.contratos c on c.id=s.contrato_id
   where s.estado<>'Cancelado' and s.estado_pago in ('Pendiente','No aplica') and s.valor_empresa>0 and (s.estado='Realizado' or s.estado_pago='Pendiente')
    and (p_sede is null or c.sede_id=p_sede) and (p_proveedor is null or v.id=p_proveedor)
   union all
   select jsonb_build_object('id',m.id,'clase','arreglo','proveedor_id',v.id,'proveedor',v.nombre,'servicio',case when m.tipo='LAVANDERÍA' then 'Lavandería' else 'Arreglo' end||' · vestido '||d.codigo,
    'descripcion',coalesce(m.trabajo,m.descripcion_danos),'fecha_servicio',m.fecha_regreso,'estado','Realizado','valor_empresa',m.costo,'adicional_valor',0,
    'numero_contrato',coalesce(c.numero_contrato,'Vestido '||d.codigo),'cliente',coalesce(c.cliente_nombre,''),'sede_id',d.sede_actual_id,'realizado_at',m.fecha_regreso,
    'banco',v.banco,'tipo_cuenta',v.tipo_cuenta,'numero_cuenta',v.numero_cuenta)
   from public.mantenimiento_bitacora m join public.proveedores v on v.id=m.proveedor_id join public.vestidos d on d.id=m.vestido_id left join public.contratos c on c.id=m.contrato_id
   where m.estado_pago='Pendiente' and coalesce(m.costo,0)>0 and (p_sede is null or d.sede_actual_id=p_sede) and (p_proveedor is null or v.id=p_proveedor)) y),'[]'::jsonb),
  'pagos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'proveedor_id',v.id,'proveedor',v.nombre,'fecha_pago',p.fecha_pago,'valor_total',p.valor_total,'medio_pago',p.medio_pago,'referencia',p.referencia,
    'comprobante_path',p.comprobante_path,'registrado_por',coalesce(u.nombre,u.email),'anulado_at',p.anulado_at,'motivo_anulacion',p.motivo_anulacion,
    'servicios',(select count(*) from public.pago_proveedor_detalle d where d.pago_id=p.id)+(select count(*) from public.pago_proveedor_arreglos a where a.pago_id=p.id)) order by p.fecha_pago desc,p.created_at desc)
   from (select * from public.pagos_proveedor where (p_proveedor is null or proveedor_id=p_proveedor) order by fecha_pago desc,created_at desc limit 100) p
   join public.proveedores v on v.id=p.proveedor_id left join public.profiles u on u.id=p.registrado_por),'[]'::jsonb));
end $function$;

create or replace function private.registrar_pago_proveedor(p_datos jsonb) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare prov uuid:=(p_datos->>'proveedor_id')::uuid; ids uuid[]; arr uuid[]; f date:=(p_datos->>'fecha_pago')::date; med text:=p_datos->>'medio_pago';
 ref text:=nullif(btrim(coalesce(p_datos->>'referencia','')),''); path text:=nullif(btrim(coalesce(p_datos->>'comprobante_path','')),'');
 n int; n2 int; total numeric:=0; total2 numeric:=0; new_id uuid;
begin
 if not public.es_admin() then raise exception 'Solo administración registra pagos a proveedores.' using errcode='42501'; end if;
 select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(coalesce(p_datos->'servicios','[]'::jsonb)) x;
 select array_agg(distinct x::uuid) into arr from jsonb_array_elements_text(coalesce(p_datos->'arreglos','[]'::jsonb)) x;
 if prov is null or coalesce(cardinality(ids),0)+coalesce(cardinality(arr),0)=0 then raise exception 'Elige los servicios que vas a pagar.'; end if;
 if f is null or f>(now() at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha del pago.'; end if;
 if not private.lista_activa('prov_medios_pago',med) then raise exception 'Elige el medio de pago.'; end if;
 if path is not null and (split_part(path,'/',1)<>prov::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_proveedores' and name=path)) then raise exception 'El comprobante no es válido.'; end if;
 if coalesce(cardinality(ids),0)>0 then
  perform 1 from public.contrato_servicios where id=any(ids) for update;
  select count(*),coalesce(sum(valor_empresa),0) into n,total from public.contrato_servicios where id=any(ids) and proveedor_id=prov and estado='Realizado' and estado_pago='Pendiente';
  if n<>cardinality(ids) then raise exception 'Solo se pueden pagar servicios realizados y pendientes de este proveedor. Recarga la lista.'; end if;
 end if;
 if coalesce(cardinality(arr),0)>0 then
  perform 1 from public.mantenimiento_bitacora where id=any(arr) for update;
  select count(*),coalesce(sum(costo),0) into n2,total2 from public.mantenimiento_bitacora where id=any(arr) and proveedor_id=prov and estado_pago='Pendiente' and coalesce(costo,0)>0;
  if n2<>cardinality(arr) then raise exception 'Solo se pueden pagar arreglos recibidos y pendientes de este proveedor. Recarga la lista.'; end if;
 end if;
 if total+total2<=0 then raise exception 'El total a pagar debe ser mayor que cero.'; end if;
 insert into public.pagos_proveedor(proveedor_id,fecha_pago,valor_total,medio_pago,referencia,comprobante_path,registrado_por)
 values(prov,f,total+total2,med,ref,path,auth.uid()) returning id into new_id;
 if coalesce(cardinality(ids),0)>0 then
  insert into public.pago_proveedor_detalle(pago_id,contrato_servicio_id,valor) select new_id,id,valor_empresa from public.contrato_servicios where id=any(ids);
  update public.contrato_servicios set estado_pago='Pagado' where id=any(ids);
 end if;
 if coalesce(cardinality(arr),0)>0 then
  insert into public.pago_proveedor_arreglos(pago_id,mantenimiento_id,valor) select new_id,id,costo from public.mantenimiento_bitacora where id=any(arr);
  update public.mantenimiento_bitacora set estado_pago='Pagado' where id=any(arr);
 end if;
 return new_id;
end $function$;

create or replace function private.anular_pago_proveedor(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path to '' as $function$
declare p public.pagos_proveedor; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not public.es_admin() then raise exception 'Solo administración anula pagos a proveedores.' using errcode='42501'; end if;
 select * into p from public.pagos_proveedor where id=p_id for update;
 if p.id is null then raise exception 'Pago no encontrado.'; end if;
 if p.anulado_at is not null then raise exception 'El pago ya está anulado.'; end if;
 if length(reason)<5 then raise exception 'Escribe el motivo de la anulación.'; end if;
 update public.pagos_proveedor set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=reason where id=p_id;
 update public.contrato_servicios set estado_pago='Pendiente' where id in (select contrato_servicio_id from public.pago_proveedor_detalle where pago_id=p_id) and estado_pago='Pagado';
 update public.mantenimiento_bitacora set estado_pago='Pendiente' where id in (select mantenimiento_id from public.pago_proveedor_arreglos where pago_id=p_id) and estado_pago='Pagado';
end $function$;

create or replace function private.proveedores_resumen(p_mes date) returns jsonb
language plpgsql stable security definer set search_path to '' as $function$
declare desde date:=date_trunc('month',coalesce(p_mes,(now() at time zone 'America/Bogota')::date))::date; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if not public.es_admin() then raise exception 'Solo administración ve el resumen de proveedores.' using errcode='42501'; end if;
 return jsonb_build_object(
  'proveedores',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre,'tipo_servicio',v.tipo_servicio,'celular',v.celular,'correo',v.correo,'estado',v.estado,'tiene_usuario',v.usuario_id is not null,
    'sedes',coalesce((select jsonb_agg(ps.sede_id) from public.proveedor_sedes ps where ps.proveedor_id=v.id and ps.activa),'[]'::jsonb),
    'servicios_mes',(select count(*) from public.contrato_servicios s where s.proveedor_id=v.id and s.estado<>'Cancelado' and (s.fecha_servicio at time zone 'America/Bogota')::date>=desde and (s.fecha_servicio at time zone 'America/Bogota')::date<(desde+interval '1 month')::date)
     +(select count(*) from public.mantenimiento_bitacora m where m.proveedor_id=v.id and lower(coalesce(m.estado,''))<>'cancelado' and (coalesce(m.fecha_envio,m.created_at) at time zone 'America/Bogota')::date>=desde and (coalesce(m.fecha_envio,m.created_at) at time zone 'America/Bogota')::date<(desde+interval '1 month')::date),
    'por_pagar',coalesce((select sum(s.valor_empresa) from public.contrato_servicios s where s.proveedor_id=v.id and s.estado_pago='Pendiente'),0)
     +coalesce((select sum(m.costo) from public.mantenimiento_bitacora m where m.proveedor_id=v.id and m.estado_pago='Pendiente'),0)) order by v.nombre) from public.proveedores v),'[]'::jsonb),
  'alertas',jsonb_build_object(
   'documentos_por_vencer',coalesce((select jsonb_agg(jsonb_build_object('proveedor_id',d.proveedor_id,'proveedor',v.nombre,'titulo',d.titulo,'vence_el',d.vence_el) order by d.vence_el) from public.documentos_proveedor d join public.proveedores v on v.id=d.proveedor_id where d.activo and d.vence_el between hoy and hoy+30),'[]'::jsonb),
   'servicios_sin_cerrar',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'proveedor_id',s.proveedor_id,'proveedor',v.nombre,'servicio',s.servicio,'fecha_servicio',s.fecha_servicio,'estado',s.estado,'numero_contrato',c.numero_contrato) order by s.fecha_servicio) from public.contrato_servicios s join public.proveedores v on v.id=s.proveedor_id join public.contratos c on c.id=s.contrato_id where s.estado in ('Asignado','Confirmado') and s.fecha_servicio<now()),'[]'::jsonb),
   'pagos_atrasados',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'proveedor_id',s.proveedor_id,'proveedor',v.nombre,'servicio',s.servicio,'valor_empresa',s.valor_empresa,'realizado_at',s.realizado_at) order by s.realizado_at) from public.contrato_servicios s join public.proveedores v on v.id=s.proveedor_id where s.estado_pago='Pendiente' and s.realizado_at<now()-interval '15 days'),'[]'::jsonb)));
end $function$;

revoke all on function public.arreglo_guardar(jsonb), public.arreglo_enviar(uuid), public.arreglo_recibir(uuid,jsonb,numeric), public.arreglo_cancelar(uuid,text),
 public.arreglos_tablero(uuid), public.vestido_historial(uuid) from public, anon;
grant execute on function public.arreglo_guardar(jsonb), public.arreglo_enviar(uuid), public.arreglo_recibir(uuid,jsonb,numeric), public.arreglo_cancelar(uuid,text),
 public.arreglos_tablero(uuid), public.vestido_historial(uuid) to authenticated;
