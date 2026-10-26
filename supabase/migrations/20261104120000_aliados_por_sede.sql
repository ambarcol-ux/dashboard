-- Aliados por sede: cada sede ve solo sus aliados, clientas, medidas, envíos y estadísticas; solo el Propietario ve todas.
create or replace function private.aliados_sede_usuario() returns uuid language sql stable security definer set search_path='' as $$
 select case when private.agenda_es_propietario() then null else coalesce(private.metas_sede_usuario(),'00000000-0000-0000-0000-000000000000'::uuid) end;
$$;
create or replace function private.aliado_visible(p_aliado uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.agenda_es_propietario() or exists(select 1 from public.aliados a where a.id=p_aliado and a.sede_principal=private.metas_sede_usuario());
$$;
revoke all on function private.aliado_visible(uuid) from public,anon;
grant execute on function private.aliado_visible(uuid) to authenticated;

alter policy aliados_gestion_leer on public.aliados using (private.aliados_gestion() and private.aliado_visible(id));
alter policy aliados_cambios_leer on public.aliados_cambios_cuenta using (private.aliados_gestion() and private.aliado_visible(aliado_id));
alter policy contratos_aliado_leer on public.contratos_aliado using (private.aliados_gestion() and private.aliado_visible(aliado_id));
alter policy historial_aliado_leer on public.historial_aliado using (private.aliados_gestion() and private.aliado_visible(aliado_id));
alter policy aliado_clientas_equipo_lee on public.aliado_clientas using (coalesce(private.prov_rol() not in ('','proveedor'),false) and private.aliado_visible(aliado_id));
alter policy equipo_lee on public.contrato_medidas using (coalesce(private.prov_rol() not in ('','proveedor'),false) and exists(select 1 from public.contratos c where c.id=contrato_id and private.aliado_visible(c.aliado_id)));
alter policy equipo_lee on public.medidas_historial using (coalesce(private.prov_rol() not in ('','proveedor'),false) and exists(select 1 from public.contratos c where c.id=contrato_id and private.aliado_visible(c.aliado_id)));
alter policy equipo_lee on public.contrato_envios using (coalesce(private.prov_rol() not in ('','proveedor'),false) and exists(select 1 from public.contratos c where c.id=contrato_id and private.aliado_visible(c.aliado_id)));
alter policy equipo_lee on public.contrato_categoria_historial using (coalesce(private.prov_rol() not in ('','proveedor'),false) and exists(select 1 from public.contratos c where c.id=contrato_id and private.aliado_visible(c.aliado_id)));

create or replace function private.buscar_aliado_contrato(p_q text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=upper(btrim(coalesce(p_q,'')));
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 return (select to_jsonb(x) from (select a.id,a.nombre_completo nombre,a.cedula,a.codigo,a.celular,a.correo,a.direccion,t.nombre tipo from public.aliados a join public.tipos_aliado t on t.id=a.tipo_aliado_id
  where a.estado='activo' and private.aliado_visible(a.id) and (a.id::text=lower(q) or a.codigo=q or a.cedula=regexp_replace(q,'\D','','g')) limit 1) x);
end $$;
create or replace function private.buscar_clienta_aliado(p_aliado uuid,p_q text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=upper(btrim(coalesce(p_q,''))); n bigint:=nullif(regexp_replace(case when q like 'CLI-%' then q else '' end,'\D','','g'),'')::bigint; d text:=regexp_replace(q,'\D','','g');
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 if not private.aliado_visible(p_aliado) then return null; end if;
 return (select to_jsonb(c) from public.aliado_clientas c where c.aliado_id=p_aliado and (c.numero=n or (n is null and d<>'' and (c.clienta_documento=d or c.rep_cedula=d))) order by c.creado_en desc limit 1);
end $$;
create or replace function private.revisar_medidas(p_contrato uuid,p_estado text,p_nota text,p_valores jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.contrato_medidas; k text;
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 if not exists(select 1 from public.contratos c where c.id=p_contrato and private.aliado_visible(c.aliado_id)) then raise exception 'No autorizado para esta sede.' using errcode='42501'; end if;
 select * into m from public.contrato_medidas where contrato_id=p_contrato for update;
 if m.contrato_id is null then raise exception 'El contrato no tiene medidas virtuales.'; end if;
 if p_valores is not null then
  for k in select jsonb_object_keys(p_valores) loop
   if (m.valores->>k) is distinct from (p_valores->>k) then insert into public.medidas_historial(contrato_id,campo,anterior,nuevo,usuario) values(p_contrato,k,m.valores->>k,p_valores->>k,auth.uid()); end if;
  end loop;
  update public.contrato_medidas set valores=valores||p_valores,actualizado_por=auth.uid(),actualizado_en=now() where contrato_id=p_contrato;
 end if;
 if p_estado is not null then
  if p_estado not in ('Revisadas','Corrección solicitada','Aprobadas') then raise exception 'Estado no válido.'; end if;
  if p_estado='Corrección solicitada' and length(btrim(coalesce(p_nota,'')))<3 then raise exception 'Escribe la nota de corrección.'; end if;
  update public.contrato_medidas set estado=p_estado,nota_correccion=case when p_estado='Corrección solicitada' then btrim(p_nota) else nota_correccion end,actualizado_por=auth.uid(),actualizado_en=now() where contrato_id=p_contrato;
 end if;
 return (select to_jsonb(x) from public.contrato_medidas x where contrato_id=p_contrato);
end $$;
create or replace function private.guardar_envio(p_contrato uuid,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratos; e public.contrato_envios; est text:=nullif(p_datos->>'estado','');
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 select * into c from public.contratos where id=p_contrato;
 if c.id is null or not coalesce(c.tiene_aliado,false) or not private.aliado_visible(c.aliado_id) then raise exception 'Solo contratos en modo Aliado tienen envío.'; end if;
 insert into public.contrato_envios(contrato_id) values(p_contrato) on conflict do nothing;
 select * into e from public.contrato_envios where contrato_id=p_contrato for update;
 e.transportadora:=coalesce(nullif(btrim(p_datos->>'transportadora'),''),e.transportadora);
 e.guia_ida:=coalesce(nullif(btrim(p_datos->>'guia_ida'),''),e.guia_ida);
 e.guia_regreso:=coalesce(nullif(btrim(p_datos->>'guia_regreso'),''),e.guia_regreso);
 if p_datos ? 'fotos_salida' then e.fotos_salida:=e.fotos_salida||array(select jsonb_array_elements_text(p_datos->'fotos_salida')); end if;
 if p_datos ? 'fotos_regreso' then e.fotos_regreso:=e.fotos_regreso||array(select jsonb_array_elements_text(p_datos->'fotos_regreso')); end if;
 if est is not null and est<>e.estado then
  if est not in ('Enviado','Entregado','Devuelto','Recibido y revisado') then raise exception 'Estado no válido.'; end if;
  if est='Enviado' then
   if coalesce(c.saldo,0)>0 then raise exception 'El contrato % tiene saldo pendiente: no se puede enviar.',c.numero_contrato; end if;
   if cardinality(e.fotos_salida)=0 then raise exception 'Sube las fotos del vestido al salir antes de marcar Enviado.'; end if;
   if e.transportadora is null or e.guia_ida is null then raise exception 'Escribe la transportadora y la guía de ida.'; end if;
  end if;
  if est='Recibido y revisado' and cardinality(e.fotos_regreso)=0 then raise exception 'Sube las fotos del vestido al regresar antes de marcar Recibido y revisado.'; end if;
  e.historial:=e.historial||jsonb_build_array(jsonb_build_object('anterior',e.estado,'nuevo',est,'usuario',auth.uid(),'fecha',now()));
  e.estado:=est;
 end if;
 update public.contrato_envios set transportadora=e.transportadora,guia_ida=e.guia_ida,guia_regreso=e.guia_regreso,fotos_salida=e.fotos_salida,fotos_regreso=e.fotos_regreso,estado=e.estado,historial=e.historial,actualizado_por=auth.uid(),actualizado_en=now() where contrato_id=p_contrato returning * into e;
 return to_jsonb(e);
end $$;
create or replace function private.estado_clienta_aliado(p_id uuid,p_estado text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 update public.aliado_clientas set estado=p_estado,actualizado_por=auth.uid(),actualizado_en=now() where id=p_id and private.aliado_visible(aliado_id);
 if not found then raise exception 'Clienta no encontrada.'; end if;
end $$;
create or replace function private.aliados_estadisticas(p_desde date,p_hasta date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 return jsonb_build_object(
  'estados',(select coalesce(jsonb_object_agg(estado,n),'{}') from (select estado,count(*) n from public.aliados where private.aliado_visible(id) group by estado) s),
  'aliados',(select coalesce(jsonb_agg(x order by (x->>'clientas')::int desc),'[]') from (select jsonb_build_object('id',a.id,'nombre',a.nombre_completo,'codigo',a.codigo,'estado',a.estado,
    'clientas',(select count(*) from public.aliado_clientas c where c.aliado_id=a.id and (c.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta),
    'por_estado',(select coalesce(jsonb_object_agg(estado,n),'{}') from (select estado,count(*) n from public.aliado_clientas c where c.aliado_id=a.id and (c.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta group by estado) s),
    'contratos',k.n,'facturado',k.total,'descuentos',k.descuentos,'pagos_a_tiempo',k.a_tiempo,'eventos_pasados',k.pasados) x
   from public.aliados a cross join lateral (select count(*) n,coalesce(sum(c.valor_total),0) total,coalesce(sum(c.descuento_aliado),0) descuentos,
    count(*) filter (where c.fecha_evento<current_date and coalesce(c.saldo,0)<=0) a_tiempo,count(*) filter (where c.fecha_evento<current_date) pasados
    from public.contratos c where c.tiene_aliado and c.aliado_id=a.id and lower(coalesce(c.estado,'')) not in ('anulado','cancelado','rechazado','borrador') and (c.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta) k where private.aliado_visible(a.id)) t(x)),
  'consultas',(select coalesce(jsonb_agg(jsonb_build_object('aliado',a.nombre_completo,'vestido',q.vestido,'categoria',q.categoria,'fecha',q.fecha,'disponible',q.disponible,'creado_en',q.creado_en) order by q.creado_en desc),'[]')
   from (select * from public.aliado_consultas where (creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta order by creado_en desc limit 500) q join public.aliados a on a.id=q.aliado_id where private.aliado_visible(a.id)));
end $$;
