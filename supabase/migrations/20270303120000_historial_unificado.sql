-- Historial unificado. Reuses the generic history that already exists (public.config_historial + private.config_historial):
-- 1) the trigger now works for any table (key = primary key or a readable name; tokens and secrets are removed; a change
--    of only updated_at is not recorded) and is attached to the tables that had no history;
-- 2) private.historial_unificado puts that history together with the existing logs (same columns), without touching them;
-- 3) public.historial_buscar (administration only) is what Configuración › Historial y auditoría reads.
-- Rule from now on: new modules do not create their own log table; they attach private.config_historial.
-- Reversión:
--   drop function public.historial_buscar(text,text,text,text,date,date,int,int); drop view private.historial_unificado;
--   drop trigger <tabla>_historial on public.<tabla> for each table of the list below;
--   re-apply the previous body of private.config_historial (20261125120000_categorias_vestido.sql);
--   drop index public.config_historial_registro, public.config_historial_usuario, public.config_historial_fecha.

create or replace function private.config_historial() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; k text; a jsonb; d jsonb;
 -- Never stored: links and secrets (tokens, keys) and heavy fields (signatures, images in base64).
 oculto constant text:='token|secret|secreto|password|clave_api|api_key|firma_base64|base64';
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
 k:=case tg_table_name
  when 'listas_contrato' then (r->>'lista')||' · '||(r->>'valor')
  when 'config_parametros' then r->>'clave'
  when 'config_formularios' then (r->>'formulario')||' · '||(r->>'campo')
  when 'categorias_vestido' then coalesce((select nombre from public.clasificaciones_vestido where id=(r->>'clasificacion_id')::int),'?')||' · '||(r->>'nombre')
  when 'catalogos_publicos' then coalesce(r->>'titulo','catálogo')
  when 'vestidos' then coalesce(nullif(btrim(r->>'codigo'),''),r->>'id')
  when 'aliados' then coalesce(r->>'codigo',r->>'nombre_completo',r->>'id')
  else coalesce(r->>'id',r->>'codigo',
   (select string_agg(r->>a2.attname,' · ' order by a2.attnum) from pg_index i join pg_attribute a2 on a2.attrelid=i.indrelid and a2.attnum=any(i.indkey) where i.indrelid=tg_relid and i.indisprimary))
 end;
 if tg_op<>'INSERT' then select coalesce(jsonb_object_agg(e.key,e.value),'{}') into a from jsonb_each(to_jsonb(old)) e where e.key !~* oculto; end if;
 if tg_op<>'DELETE' then select coalesce(jsonb_object_agg(e.key,e.value),'{}') into d from jsonb_each(to_jsonb(new)) e where e.key !~* oculto; end if;
 insert into public.config_historial(tabla,clave,accion,antes,despues) values(tg_table_name,coalesce(k,'?'),lower(tg_op),a,d);
 return coalesce(new,old);
end $$;

create index if not exists config_historial_registro on public.config_historial(tabla,clave,created_at desc);
create index if not exists config_historial_usuario on public.config_historial(usuario_id,created_at desc);
create index if not exists config_historial_fecha on public.config_historial(created_at desc);

-- Tables that had no history.
do $b$
declare t text;
begin
 foreach t in array array['vestidos','clasificaciones_vestido','catalogos_publicos','pagos','plantillas_contratos','paquetes_ambar','paquete_componentes','retablo_tipos',
  'aliados','tipos_aliado','aliados_config','aliados_contrato_config','promociones','codigos_descuento','contenido_reglas',
  'proveedores','proveedor_tarifas','proveedor_sedes','cuentas_dinero','sedes','roles','permisos','roles_permisos','usuarios_roles','usuario_sedes','integraciones'] loop
  if not exists(select 1 from pg_trigger where tgrelid=format('public.%I',t)::regclass and tgname=t||'_historial') then
   execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.config_historial()',t||'_historial',t);
  end if;
 end loop;
end $b$;

-- One shape for every log: date, area, table, record, action, detail, user (id or name written by the old logs).
create or replace view private.historial_unificado as
with ch as (
 select h.created_at fecha,h.tabla,h.clave registro,h.accion,h.usuario_id,null::text usuario_txt,
  case h.accion when 'insert' then 'Creado'||coalesce(': '||coalesce(h.despues->>'nombre',h.despues->>'nombre_completo',h.despues->>'titulo',h.despues->>'valor'),'')
   when 'delete' then 'Eliminado'||coalesce(': '||coalesce(h.antes->>'nombre',h.antes->>'nombre_completo',h.antes->>'titulo',h.antes->>'valor'),'')
   else (select string_agg(k||': '||coalesce(left(h.antes->>k,80),'∅')||' → '||coalesce(left(h.despues->>k,80),'∅'),' · ' order by k)
         from jsonb_object_keys(coalesce(h.despues,'{}')) k where (h.antes->k) is distinct from (h.despues->k) and k not in ('updated_at')) end detalle
 from public.config_historial h)
select fecha,
 case when tabla in ('vestidos','clasificaciones_vestido','categorias_vestido','catalogos_publicos') then 'Inventario'
  when tabla in ('pagos','plantillas_contratos','listas_contrato') then 'Contratos'
  when tabla in ('paquetes_ambar','paquete_componentes','retablo_tipos') then 'Operaciones'
  when tabla in ('aliados','tipos_aliado','aliados_config','aliados_contrato_config') then 'Aliados'
  when tabla in ('promociones','codigos_descuento','contenido_reglas') then 'Marketing'
  when tabla in ('proveedores','proveedor_tarifas','proveedor_sedes') then 'Proveedores'
  when tabla in ('cuentas_dinero') then 'Finanzas'
  when tabla in ('sedes','roles','permisos','roles_permisos','usuarios_roles','usuario_sedes') then 'Equipo y permisos'
  else 'Configuración' end area,
 tabla,registro,accion,left(detalle,600) detalle,usuario_id,usuario_txt,'config_historial'::text fuente
from ch
union all select coalesce(b.fecha,b.created_at),'Contratos','contratos',k.numero_contrato::text,b.accion,left(b.detalle,600),null,coalesce(b.usuario,b.usuario_email),'bitacora_contratos'
 from public.bitacora_contratos b left join public.contratos k on k.id=b.contrato_id
union all select b.created_at,'Contratos','contratos',k.numero_contrato::text,'cambio de fecha'||coalesce(' ('||b.tipo_evento||')',''),
  coalesce(b.fecha_anterior::text,'∅')||' → '||coalesce(b.fecha_nueva::text,'∅')||coalesce(' · '||b.motivo,''),b.usuario_id,coalesce(b.nombre_usuario,b.usuario_asesora),'bitacora_cambios'
 from public.bitacora_cambios b left join public.contratos k on k.id=b.contrato_id
union all select b.created_at,'Contratos','contratos',k.numero_contrato::text,coalesce(b.campo,'cambio de vestido'),
  case when b.vestido_anterior_id is not null or b.vestido_nuevo_id is not null then coalesce(va.codigo,'∅')||' → '||coalesce(vn.codigo,'∅') else coalesce(b.valor_anterior::text,'∅')||' → '||coalesce(b.valor_nuevo::text,'∅') end||coalesce(' · '||b.motivo,''),
  b.usuario_id,null,'historial_cambios_contrato'
 from public.historial_cambios_contrato b left join public.contratos k on k.id=b.contrato_id left join public.vestidos va on va.id=b.vestido_anterior_id left join public.vestidos vn on vn.id=b.vestido_nuevo_id
union all select b.created_at,'Contratos','contratos',k.numero_contrato::text,'vestido quitado del contrato',coalesce(b.codigo_vestido_eliminado,'')||coalesce(' · '||b.motivo,'')||coalesce(' · '||b.detalle,''),b.usuario_id,null,'bitacora_eliminaciones_contrato'
 from public.bitacora_eliminaciones_contrato b left join public.contratos k on k.id=b.contrato_id
union all select b.eliminado_at,'Contratos','contratos',b.numero_contrato,'contrato eliminado',coalesce(b.cliente_nombre,'')||coalesce(' · '||b.motivo,''),b.eliminado_por,null,'contratos_eliminados'
 from public.contratos_eliminados b
union all select b.fecha,'Contratos','contratos',k.numero_contrato::text,'categoría',coalesce(b.anterior,'∅')||' → '||coalesce(b.nueva,'∅'),b.usuario,null,'contrato_categoria_historial'
 from public.contrato_categoria_historial b left join public.contratos k on k.id=b.contrato_id
union all select b.fecha,'Contratos','contratos',k.numero_contrato::text,'medida: '||b.campo,coalesce(b.anterior,'∅')||' → '||coalesce(b.nuevo,'∅'),b.usuario,null,'medidas_historial'
 from public.medidas_historial b left join public.contratos k on k.id=b.contrato_id
union all select b.created_at,'Depósitos','contratos',k.numero_contrato::text,'monto del depósito',coalesce(b.monto_anterior::text,'∅')||' → '||coalesce(b.monto_nuevo::text,'∅')||coalesce(' · '||b.motivo,''),b.usuario_id,null,'auditoria_montos_deposito'
 from public.auditoria_montos_deposito b left join public.contratos k on k.id=b.contrato_id
union all select b.fecha,'Depósitos','contratos',k.numero_contrato::text,'edición de depósito ('||b.origen||')',
  (select string_agg(x||': '||coalesce(left(b.antes->>x,60),'∅')||' → '||coalesce(left(b.despues->>x,60),'∅'),' · ') from jsonb_object_keys(coalesce(b.despues,'{}')) x where (b.antes->x) is distinct from (b.despues->x))||coalesce(' · '||b.motivo,''),
  b.usuario_id,null,'depositos_ediciones'
 from public.depositos_ediciones b left join public.contratos k on k.id=b.contrato_id
union all select b.created_at,'Depósitos','contratos',k.numero_contrato::text,'solicitud de devolución: '||b.estado,b.detalle,b.usuario_id,b.usuario_nombre,'historial_solicitudes_depositos'
 from public.historial_solicitudes_depositos b left join public.solicitudes_depositos s on s.id=b.solicitud_id left join public.contratos k on k.id=s.contrato_id
union all select b.created_at,'Finanzas','caja_movimientos',b.movimiento_id::text,'edición de movimiento de caja',b.motivo,b.usuario_id,null,'caja_movimientos_historial'
 from public.caja_movimientos_historial b
union all select b.created_at,'Finanzas','caja_config',sd.nombre,'configuración de caja',b.motivo,b.usuario_id,null,'caja_config_historial'
 from public.caja_config_historial b left join public.sedes sd on sd.id=b.sede_id
union all select coalesce(b.fecha,b.created_at),'Inventario','vestidos',coalesce(v.codigo,b.vestido_id::text),b.accion,concat_ws(' · ',b.motivo,b.detalle),null,b.usuario_email,'bitacora_vestidos'
 from public.bitacora_vestidos b left join public.vestidos v on v.id=b.vestido_id
union all select b.created_at,'Primeras visitas','primeras_citas',coalesce(p.codigo,b.cita_id::text),b.accion,b.detalle,b.usuario_id,null,'primeras_citas_historial'
 from public.primeras_citas_historial b left join public.primeras_citas p on p.id=b.cita_id
union all select b.fecha,'Primeras visitas','agenda',b.registro_id,b.tabla||': '||b.accion,b.motivo,b.usuario_id,null,'agenda_auditoria'
 from public.agenda_auditoria b
union all select b.fecha_hora,'Aliados','aliados',coalesce(a.codigo,a.nombre_completo,b.aliado_id::text),'cambio: '||b.campo,coalesce(left(b.valor_anterior,80),'∅')||' → '||coalesce(left(b.valor_nuevo,80),'∅'),b.usuario,null,'historial_aliado'
 from public.historial_aliado b left join public.aliados a on a.id=b.aliado_id
union all select b.fecha,'Operaciones','retablos',b.retablo_id::text,'estado del retablo',coalesce(b.estado_anterior,'∅')||' → '||coalesce(b.estado_nuevo,'∅')||coalesce(' · '||b.nota,''),b.usuario_id,null,'retablo_historial'
 from public.retablo_historial b
union all select b.created_at,'Operaciones','pedidos_estrene',b.pedido_id::text,coalesce(b.tipo_mensaje,'nota'),b.mensaje,null,b.usuario_nombre,'bitacora_pedidos_estrene'
 from public.bitacora_pedidos_estrene b
union all select b.fecha_hora,'Metas','metas',coalesce(b.nombre_objetivo,'')||' '||b.mes||'/'||b.anio,coalesce(b.accion,'cambio'),coalesce(b.valor_anterior::text,'∅')||' → '||coalesce(b.valor_nuevo::text,'∅'),b.usuario,null,'historial_metas'
 from public.historial_metas b
union all select b.cambiado_at,'Equipo y permisos','accesos_paneles',coalesce(p.nombre,p.email,b.usuario_id::text)||' · '||b.panel,'acceso a panel',coalesce(b.estado_anterior,'∅')||' → '||coalesce(b.estado_nuevo,'∅'),b.cambiado_por,null,'accesos_paneles_bitacora'
 from public.accesos_paneles_bitacora b left join public.profiles p on p.id=b.usuario_id
union all select b.fecha,'Equipo y permisos','equipo',coalesce(p.nombre,p.email,b.usuario_id::text),b.tipo,left(b.detalle::text,600),b.hecho_por,null,'equipo_bitacora'
 from public.equipo_bitacora b left join public.profiles p on p.id=b.usuario_id
union all select b.fecha_hora,'Equipo y permisos','roles',b.objetivo,b.tipo,left(b.detalle::text,600),b.usuario,null,'roles_bitacora'
 from public.roles_bitacora b
union all select b.created_at,'WhatsApp e IA','whatsapp_ia_config','instrucciones de la IA','cambio de instrucciones o conocimientos',null,b.usuario_id,null,'whatsapp_ia_historial'
 from public.whatsapp_ia_historial b;
revoke all on private.historial_unificado from public, anon, authenticated;

-- Configuración › Historial y auditoría (administration only). Filters are optional; newest first.
create or replace function public.historial_buscar(p_area text default null, p_tabla text default null, p_registro text default null, p_texto text default null,
 p_desde date default null, p_hasta date default null, p_limite int default 100, p_offset int default 0)
returns table(fecha timestamptz, area text, tabla text, registro text, accion text, detalle text, usuario text, fuente text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración ve el historial.' using errcode='42501'; end if;
 return query
 select h.fecha,h.area,h.tabla,h.registro,h.accion,h.detalle,coalesce(p.nombre,p.email,h.usuario_txt,case when h.usuario_id is null then 'Sistema' end),h.fuente
 from private.historial_unificado h left join public.profiles p on p.id=h.usuario_id
 where (p_area is null or h.area=p_area) and (p_tabla is null or h.tabla=p_tabla)
  and (p_registro is null or h.registro ilike '%'||p_registro||'%')
  and (p_texto is null or h.detalle ilike '%'||p_texto||'%' or h.accion ilike '%'||p_texto||'%' or coalesce(p.nombre,p.email,h.usuario_txt,'') ilike '%'||p_texto||'%')
  and (p_desde is null or h.fecha>=(p_desde::timestamp at time zone 'America/Bogota'))
  and (p_hasta is null or h.fecha<((p_hasta+1)::timestamp at time zone 'America/Bogota'))
 order by h.fecha desc nulls last
 limit least(greatest(coalesce(p_limite,100),1),500) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.historial_buscar(text,text,text,text,date,date,int,int) from public, anon;
grant execute on function public.historial_buscar(text,text,text,text,date,date,int,int) to authenticated;
