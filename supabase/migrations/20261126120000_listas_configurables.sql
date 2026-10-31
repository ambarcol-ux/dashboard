-- More lists editable in Configuración (solo administración) instead of fixed in the code:
-- medios de pago y tipos de documento del contrato, tipo de evento y «cómo se enteró» de la vitrina,
-- tipos de servicio, tipos de documento y medios de pago de proveedores.
-- Revert: remove these list rows; re-apply the previous bodies of private.registrar_vitrina, private.registrar_pago_proveedor and private.valor_lista_usado.
insert into public.listas_contrato(lista,valor,orden) select l,v,i from (values
 ('contrato_medios_pago',array['Efectivo','Transferencia','Tarjeta','Link de Pago']),
 ('tipos_documento',array['CC','CE','TI','Pasaporte','PPT','NIT']),
 ('pv_tipos_evento_vitrina',array['XV años','Grado','Gala','Otro']),
 ('pv_como_se_entero',array['Instagram','Recomendación','Pasaba por la tienda','Otro']),
 ('prov_tipos_servicio',array['Maquillaje y peinado','Fotografía','Video','Caballos','Locación','Hospedaje','Decoración','Lavandería','Mensajería','Transporte','Otro']),
 ('prov_tipos_documento',array['Condiciones','Portafolio','Contrato interno','RUT','Certificación bancaria','Acuerdo de precios','Otro']),
 ('prov_medios_pago',array['Transferencia','Efectivo','Nequi','Daviplata','Otro'])) x(l,a), unnest(a) with ordinality u(v,i)
on conflict do nothing;

do $$ declare d text:=pg_get_functiondef('private.registrar_vitrina(jsonb)'::regprocedure); begin
 d:=replace(d,'if tipo not in (''XV años'',''Grado'',''Gala'',''Otro'') then raise exception ''Elige el tipo de evento.''; end if;','if not private.lista_activa(''pv_tipos_evento_vitrina'',tipo) then raise exception ''Elige el tipo de evento.''; end if;');
 d:=replace(d,'if entero is not null and entero not in (''Instagram'',''Recomendación'',''Pasaba por la tienda'',''Otro'') then raise exception ''Revisa cómo se enteró.''; end if;','if entero is not null and not private.lista_activa(''pv_como_se_entero'',entero) then raise exception ''Revisa cómo se enteró.''; end if;');
 if d not like '%pv_tipos_evento_vitrina%' or d not like '%pv_como_se_entero%' then raise exception 'patch vitrina failed'; end if;
 execute d;
end $$;
do $$ declare d text:=pg_get_functiondef('private.registrar_pago_proveedor(jsonb)'::regprocedure); begin
 d:=replace(d,'if med not in (''Transferencia'',''Efectivo'',''Nequi'',''Daviplata'',''Otro'') then raise exception ''Elige el medio de pago.''; end if;','if not private.lista_activa(''prov_medios_pago'',med) then raise exception ''Elige el medio de pago.''; end if;');
 if d not like '%prov_medios_pago%' then raise exception 'patch pago proveedor failed'; end if;
 execute d;
end $$;

create or replace function private.valor_lista_usado(p_lista text,p_valor text) returns boolean language sql stable security definer set search_path='' as $$
 select case p_lista
  when 'pv_canales' then exists(select 1 from public.primeras_citas_seguimientos where canal=p_valor)
  when 'pv_resultados_seguimiento' then exists(select 1 from public.primeras_citas_seguimientos where resultado=p_valor)
  when 'pv_motivos_cierre' then exists(select 1 from public.primeras_citas where cierre_seguimiento=p_valor or cierre_seguimiento like p_valor||':%')
  when 'pv_motivos_no_asistencia' then exists(select 1 from public.primeras_citas where motivo like p_valor||'%')
  when 'pv_motivos_eliminar' then exists(select 1 from private.primeras_citas_eliminadas where motivo like p_valor||'%')
  when 'pv_tipos_evento_vitrina' then exists(select 1 from public.primeras_citas where origen='vitrina' and tipo_vestido=p_valor)
  when 'pv_como_se_entero' then exists(select 1 from public.primeras_citas where como_se_entero=p_valor)
  when 'banco' then exists(select 1 from public.contratos where banco_deposito=p_valor)
  when 'tipo_cuenta' then exists(select 1 from public.contratos where tipo_cuenta_deposito=p_valor)
  when 'accesorios' then exists(select 1 from public.contratos k, unnest(k.accesorios) a where a=p_valor or a like p_valor||':%')
  when 'contrato_medios_pago' then exists(select 1 from public.contratos where p_valor=any(metodos_pago) or p_valor=any(metodo_pago))
  when 'tipos_documento' then exists(select 1 from public.contratos where tipo_documento_cliente=p_valor or tipo_documento_titular=p_valor)
  when 'prov_tipos_servicio' then exists(select 1 from public.proveedores where tipo_servicio=p_valor)
  when 'prov_tipos_documento' then exists(select 1 from public.documentos_proveedor where tipo=p_valor)
  when 'prov_medios_pago' then exists(select 1 from public.pagos_proveedor where medio_pago=p_valor)
  else false end
$$;
