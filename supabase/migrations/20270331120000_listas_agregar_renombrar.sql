-- Every configurable dropdown («listas_contrato», Configuración › Listas) can add a value and rename one from the form itself,
-- by administration and accounting. Renaming also updates the records that already use the value, so nothing keeps the old name.
-- New lists: gastos_categorias (expenses) and caja_categorias_ingreso / caja_categorias_egreso (cash register; «Base de caja» stays fixed
-- in the code because the cash count depends on it).
-- Reversible: drop lista_agregar and lista_renombrar and delete the rows of the three new lists.

insert into public.listas_contrato(lista,valor,orden,activo) select 'gastos_categorias',v,i,true from unnest(array['Nómina y prestaciones','Arriendo','Servicios públicos',
 'Internet y telefonía','Publicidad y redes','Transporte y envíos','Compras e insumos','Mantenimiento y arreglos','Honorarios (contador, abogado)','Software y suscripciones',
 'Impuestos','Gastos bancarios','Seguros','Papelería y aseo','Otro gasto']) with ordinality u(v,i) on conflict do nothing;
insert into public.listas_contrato(lista,valor,orden,activo) select 'gastos_categorias',g.nombre,100+row_number() over(order by g.nombre),g.activo
 from public.gastos_categorias g on conflict do nothing;
insert into public.listas_contrato(lista,valor,orden,activo) select 'caja_categorias_ingreso',v,i,true from unnest(array['Pago de contrato','Venta de accesorios','Arreglos','Otro ingreso']) with ordinality u(v,i) on conflict do nothing;
insert into public.listas_contrato(lista,valor,orden,activo) select 'caja_categorias_egreso',v,i,true from unnest(array['Gasto operativo','Transporte','Compras e insumos','Nómina / anticipos','Consignación a banco','Otro egreso']) with ordinality u(v,i) on conflict do nothing;

create or replace function public.lista_agregar(p_lista text,p_valor text) returns text
language plpgsql security definer set search_path='' as $$
declare n text:=btrim(regexp_replace(coalesce(p_valor,''),'\s+',' ','g')); e text;
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad agregan opciones a las listas.' using errcode='42501'; end if;
 if not exists(select 1 from public.listas_contrato where lista=p_lista) then raise exception 'Lista no encontrada.'; end if;
 if length(n) not between 2 and 60 then raise exception 'Escribe el nombre (2 a 60 caracteres).'; end if;
 if lower(n) in ('base de caja','retiro de utilidades') then raise exception 'Ese nombre está reservado por el ERP.'; end if;
 select valor into e from public.listas_contrato where lista=p_lista and lower(valor)=lower(n);
 if e is not null then update public.listas_contrato set activo=true where lista=p_lista and valor=e; return e; end if;
 insert into public.listas_contrato(lista,valor,orden,activo) values(p_lista,n,coalesce((select max(orden) from public.listas_contrato where lista=p_lista),0)+1,true);
 return n;
end $$;

create or replace function public.lista_renombrar(p_lista text,p_viejo text,p_nuevo text) returns text
language plpgsql security definer set search_path='' as $$
declare v text:=btrim(coalesce(p_viejo,'')); n text:=btrim(regexp_replace(coalesce(p_nuevo,''),'\s+',' ','g'));
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad editan las listas.' using errcode='42501'; end if;
 if length(n) not between 2 and 60 then raise exception 'Escribe el nuevo nombre (2 a 60 caracteres).'; end if;
 if lower(n) in ('base de caja','retiro de utilidades') then raise exception 'Ese nombre está reservado por el ERP.'; end if;
 if not exists(select 1 from public.listas_contrato where lista=p_lista and valor=v) then raise exception 'Opción no encontrada en la lista.'; end if;
 if n=v then return n; end if;
 if exists(select 1 from public.listas_contrato where lista=p_lista and lower(valor)=lower(n) and valor<>v) then raise exception 'Ya existe una opción con ese nombre.'; end if;
 update public.listas_contrato set valor=n where lista=p_lista and valor=v;
 -- The records that already use the value take the new name.
 case p_lista
  when 'banco' then
   update public.contratos set banco_deposito=n where banco_deposito=v;
   update public.cuentas_dinero set banco=n where banco=v;
   update public.proveedores set banco=n where banco=v;
   update public.aliados set banco=n where banco=v;
   update public.aliados_cambios_cuenta set banco=n where banco=v;
   update public.solicitudes_depositos set banco=n where banco=v;
   update public.referidores set banco_nombre=n where banco_nombre=v;
  when 'tipo_cuenta' then update public.contratos set tipo_cuenta_deposito=n where tipo_cuenta_deposito=v;
  when 'tipos_documento' then
   update public.contratos set tipo_documento_cliente=n where tipo_documento_cliente=v;
   update public.contratos set tipo_documento_titular=n where tipo_documento_titular=v;
  when 'prov_tipos_servicio' then
   update public.proveedores set tipo_servicio=n where tipo_servicio=v;
   update public.proveedor_tarifas set servicio=n where servicio=v;
   update public.paquete_componentes set servicio=n where servicio=v;
   update public.contrato_servicios set servicio=n where servicio=v;
  when 'prov_tipos_documento' then update public.documentos_proveedor set tipo=n where tipo=v;
  when 'prov_medios_pago' then update public.pagos_proveedor set medio_pago=n where medio_pago=v;
  when 'gastos_categorias' then
   update public.gastos set categoria=n where categoria=v and clase='gasto';
   update public.caja_movimientos set categoria=n where categoria=v and origen='gasto';
  when 'caja_categorias_ingreso' then update public.caja_movimientos set categoria=n where categoria=v and tipo='ingreso' and origen is null;
  when 'caja_categorias_egreso' then update public.caja_movimientos set categoria=n where categoria=v and tipo='egreso' and origen is null;
  when 'pv_canales' then update public.primeras_citas_seguimientos set canal=n where canal=v;
  when 'pv_resultados_seguimiento' then update public.primeras_citas_seguimientos set resultado=n where resultado=v;
  when 'pv_como_se_entero' then update public.primeras_citas set como_se_entero=n where como_se_entero=v;
  when 'pv_tipos_evento_vitrina' then update public.primeras_citas set tipo_vestido=n where origen='vitrina' and tipo_vestido=v;
  else null; -- lists stored inside longer texts (reasons with notes, accessories): the old records keep the old text.
 end case;
 return n;
end $$;

revoke all on function public.lista_agregar(text,text), public.lista_renombrar(text,text,text) from public, anon;
grant execute on function public.lista_agregar(text,text), public.lista_renombrar(text,text,text) to authenticated;
