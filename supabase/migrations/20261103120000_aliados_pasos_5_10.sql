-- Aliados pasos 5-10: contrato en modo Aliado, consultas de disponibilidad, medidas virtuales, envíos, vigencias y estadísticas.
-- Paso 5: el contrato reutiliza tiene_aliado/aliado_id/aliado_datos (Aliado vs Cliente directo).
alter table public.contratos
 add column if not exists aliado_clienta_id uuid references public.aliado_clientas(id),
 add column if not exists categoria_aliado text,
 add column if not exists descuento_aliado numeric(14,2) not null default 0;
alter table public.aliado_clientas add column if not exists vigente boolean not null default true, add column if not exists contrato_id uuid references public.contratos(id);
alter table public.aliados add column if not exists vigente_hasta date;
update public.aliados a set vigente_hasta=(select (f.fecha_firma at time zone 'America/Bogota')::date+interval '1 year' from public.contratos_aliado f where f.aliado_id=a.id) where vigente_hasta is null;

create table public.contrato_categoria_historial (
 id bigint generated always as identity primary key,
 contrato_id uuid not null references public.contratos(id) on delete cascade,
 anterior text, nueva text, valor_anterior numeric(14,2), valor_nuevo numeric(14,2),
 usuario uuid references public.profiles(id), fecha timestamptz not null default now()
);

create or replace function private.contrato_modo_aliado() returns trigger language plpgsql security definer set search_path='' as $$
declare al public.aliados; cl public.aliado_clientas; t text;
begin
 if not coalesce(new.tiene_aliado,false) then
  new.aliado_id:=null; new.aliado_clienta_id:=null; new.categoria_aliado:=null; new.descuento_aliado:=0; new.aliado_datos:=null; return new;
 end if;
 if new.aliado_id is null then raise exception 'En modo Aliado debes elegir el aliado.'; end if;
 select * into al from public.aliados where id=new.aliado_id;
 if tg_op='INSERT' or new.aliado_id is distinct from old.aliado_id then
  if al.estado<>'activo' then raise exception 'El aliado % no está activo.',al.nombre_completo; end if;
  select nombre into t from public.tipos_aliado where id=al.tipo_aliado_id;
  new.aliado_datos:=jsonb_build_object('nombre',al.nombre_completo,'cedula',al.cedula,'codigo',al.codigo,'celular',al.celular,'correo',al.correo,'direccion',al.direccion,'tipo',t,'copiado_at',now());
 end if;
 if new.aliado_clienta_id is not null then
  select * into cl from public.aliado_clientas where id=new.aliado_clienta_id;
  if cl.aliado_id is distinct from new.aliado_id then raise exception 'La clienta no está vinculada a ese aliado.'; end if;
  if tg_op='INSERT' and not cl.vigente then raise exception 'El vínculo de la clienta con el aliado ya venció: créala como cliente directo.'; end if;
 end if;
 -- Pago mínimo del 50% para crear el contrato.
 if tg_op='INSERT' and lower(coalesce(new.estado,''))<>'borrador' and coalesce(new.anticipo,0)<round(coalesce(new.valor_total,0)*0.5) then
  raise exception 'En modo Aliado el pago mínimo para crear el contrato es el 50%% (%).',round(coalesce(new.valor_total,0)*0.5);
 end if;
 -- No se despacha con saldo pendiente.
 -- saldo es columna generada (valor_total - anticipo): en un trigger BEFORE se calcula a mano.
 if tg_op='UPDATE' and coalesce(new.valor_total,0)-coalesce(new.anticipo,0)>0 and (
   (lower(coalesce(new.estado,''))='entregado' and lower(coalesce(old.estado,''))<>'entregado')
   or (coalesce(new.entregado_evento,false) and not coalesce(old.entregado_evento,false))
   or (coalesce(new.entregado_prexv,false) and not coalesce(old.entregado_prexv,false))) then
  raise exception 'El contrato % tiene saldo pendiente: no se puede despachar.',new.numero_contrato;
 end if;
 if tg_op='UPDATE' and new.categoria_aliado is distinct from old.categoria_aliado then
  insert into public.contrato_categoria_historial(contrato_id,anterior,nueva,valor_anterior,valor_nuevo,usuario) values(new.id,old.categoria_aliado,new.categoria_aliado,old.valor_total,new.valor_total,auth.uid());
 end if;
 return new;
end $$;
create trigger contratos_modo_aliado before insert or update on public.contratos for each row execute function private.contrato_modo_aliado();

create or replace function private.contrato_aliado_clienta() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.aliado_clienta_id is not null and lower(coalesce(new.estado,'')) not in ('borrador','anulado','cancelado','rechazado') then
  update public.aliado_clientas set estado='Contrató',contrato_id=new.id where id=new.aliado_clienta_id and contrato_id is null;
 end if;
 return new;
end $$;
create trigger contratos_aliado_clienta after insert or update of aliado_clienta_id,estado on public.contratos for each row execute function private.contrato_aliado_clienta();

-- Buscar aliado (ID, código o cédula) y clienta (ID, documento o cédula del representante) desde el contrato.
create or replace function private.buscar_aliado_contrato(p_q text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=upper(btrim(coalesce(p_q,'')));
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 return (select to_jsonb(x) from (select a.id,a.nombre_completo nombre,a.cedula,a.codigo,a.celular,a.correo,a.direccion,t.nombre tipo from public.aliados a join public.tipos_aliado t on t.id=a.tipo_aliado_id
  where a.estado='activo' and (a.id::text=lower(q) or a.codigo=q or a.cedula=regexp_replace(q,'\D','','g')) limit 1) x);
end $$;
create or replace function private.buscar_clienta_aliado(p_aliado uuid,p_q text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=upper(btrim(coalesce(p_q,''))); n bigint:=nullif(regexp_replace(case when q like 'CLI-%' then q else '' end,'\D','','g'),'')::bigint; d text:=regexp_replace(q,'\D','','g');
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 return (select to_jsonb(c) from public.aliado_clientas c where c.aliado_id=p_aliado and (c.numero=n or (n is null and d<>'' and (c.clienta_documento=d or c.rep_cedula=d))) order by c.creado_en desc limit 1);
end $$;
create or replace function public.buscar_aliado_contrato(p_q text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.buscar_aliado_contrato(p_q); $$;
create or replace function public.buscar_clienta_aliado(p_aliado uuid,p_q text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.buscar_clienta_aliado(p_aliado,p_q); $$;

-- Paso 6: registro de consultas de disponibilidad (solo el servidor escribe).
create table public.aliado_consultas (
 id bigint generated always as identity primary key,
 aliado_id uuid not null references public.aliados(id),
 vestido text, categoria text, fecha date not null, disponible boolean not null,
 creado_en timestamptz not null default now()
);

-- Paso 7: medidas virtuales. Los campos se configuran (los mismos de la ficha de tienda).
create table public.aliados_config (id smallint primary key default 1 check (id=1), dias_recordatorio_medidas integer not null default 30 check (dias_recordatorio_medidas between 1 and 365));
insert into public.aliados_config(id) values(1) on conflict do nothing;
create table public.medidas_campos (
 id bigint generated always as identity primary key,
 nombre text not null check (length(btrim(nombre)) between 2 and 60),
 instruccion text not null default '', imagen_path text,
 minimo numeric(6,1), maximo numeric(6,1), orden integer not null default 0, activo boolean not null default true
);
create table public.contrato_medidas (
 contrato_id uuid primary key references public.contratos(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 valores jsonb not null default '{}'::jsonb,
 estado text not null default 'Pendiente' check (estado in ('Pendiente','Enviadas','Revisadas','Corrección solicitada','Aprobadas')),
 confirmado_at timestamptz, nota_correccion text, enviado_at timestamptz, recordatorio_at timestamptz,
 actualizado_por uuid references public.profiles(id), actualizado_en timestamptz not null default now()
);
create table public.medidas_historial (
 id bigint generated always as identity primary key,
 contrato_id uuid not null references public.contratos(id) on delete cascade,
 campo text not null, anterior text, nuevo text, usuario uuid references public.profiles(id), fecha timestamptz not null default now()
);
create or replace function private.revisar_medidas(p_contrato uuid,p_estado text,p_nota text,p_valores jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.contrato_medidas; k text;
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
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
create or replace function public.revisar_medidas(p_contrato uuid,p_estado text,p_nota text,p_valores jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.revisar_medidas(p_contrato,p_estado,p_nota,p_valores); $$;

-- Paso 8: envíos de contratos en modo Aliado.
create table public.contrato_envios (
 contrato_id uuid primary key references public.contratos(id) on delete cascade,
 transportadora text, guia_ida text, guia_regreso text,
 estado text not null default 'Pendiente' check (estado in ('Pendiente','Enviado','Entregado','Devuelto','Recibido y revisado')),
 fotos_salida text[] not null default '{}', fotos_regreso text[] not null default '{}',
 historial jsonb not null default '[]'::jsonb,
 actualizado_por uuid references public.profiles(id), actualizado_en timestamptz not null default now()
);
create or replace function private.guardar_envio(p_contrato uuid,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratos; e public.contrato_envios; est text:=nullif(p_datos->>'estado','');
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 select * into c from public.contratos where id=p_contrato;
 if c.id is null or not coalesce(c.tiene_aliado,false) then raise exception 'Solo contratos en modo Aliado tienen envío.'; end if;
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
create or replace function public.guardar_envio(p_contrato uuid,p_datos jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.guardar_envio(p_contrato,p_datos); $$;

-- Paso 10: estadísticas por rango de fechas.
create or replace function private.aliados_estadisticas(p_desde date,p_hasta date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 return jsonb_build_object(
  'estados',(select coalesce(jsonb_object_agg(estado,n),'{}') from (select estado,count(*) n from public.aliados group by estado) s),
  'aliados',(select coalesce(jsonb_agg(x order by (x->>'clientas')::int desc),'[]') from (select jsonb_build_object('id',a.id,'nombre',a.nombre_completo,'codigo',a.codigo,'estado',a.estado,
    'clientas',(select count(*) from public.aliado_clientas c where c.aliado_id=a.id and (c.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta),
    'por_estado',(select coalesce(jsonb_object_agg(estado,n),'{}') from (select estado,count(*) n from public.aliado_clientas c where c.aliado_id=a.id and (c.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta group by estado) s),
    'contratos',k.n,'facturado',k.total,'descuentos',k.descuentos,'pagos_a_tiempo',k.a_tiempo,'eventos_pasados',k.pasados) x
   from public.aliados a cross join lateral (select count(*) n,coalesce(sum(c.valor_total),0) total,coalesce(sum(c.descuento_aliado),0) descuentos,
    count(*) filter (where c.fecha_evento<current_date and coalesce(c.saldo,0)<=0) a_tiempo,count(*) filter (where c.fecha_evento<current_date) pasados
    from public.contratos c where c.tiene_aliado and c.aliado_id=a.id and lower(coalesce(c.estado,'')) not in ('anulado','cancelado','rechazado','borrador') and (c.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta) k) t(x)),
  'consultas',(select coalesce(jsonb_agg(jsonb_build_object('aliado',a.nombre_completo,'vestido',q.vestido,'categoria',q.categoria,'fecha',q.fecha,'disponible',q.disponible,'creado_en',q.creado_en) order by q.creado_en desc),'[]')
   from (select * from public.aliado_consultas where (creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta order by creado_en desc limit 500) q join public.aliados a on a.id=q.aliado_id));
end $$;
create or replace function public.aliados_estadisticas(p_desde date,p_hasta date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.aliados_estadisticas(p_desde,p_hasta); $$;

-- Seguridad: lectura del equipo; escritura por funciones o por el servidor.
alter table public.contrato_categoria_historial enable row level security;
alter table public.aliado_consultas enable row level security;
alter table public.aliados_config enable row level security;
alter table public.medidas_campos enable row level security;
alter table public.contrato_medidas enable row level security;
alter table public.medidas_historial enable row level security;
alter table public.contrato_envios enable row level security;
create policy equipo_lee on public.contrato_categoria_historial for select to authenticated using (coalesce(private.prov_rol() not in ('','proveedor'),false));
create policy equipo_lee on public.contrato_medidas for select to authenticated using (coalesce(private.prov_rol() not in ('','proveedor'),false));
create policy equipo_lee on public.medidas_historial for select to authenticated using (coalesce(private.prov_rol() not in ('','proveedor'),false));
create policy equipo_lee on public.contrato_envios for select to authenticated using (coalesce(private.prov_rol() not in ('','proveedor'),false));
create policy equipo_lee on public.medidas_campos for select to authenticated using (coalesce(private.prov_rol() not in ('','proveedor'),false));
create policy admin_escribe on public.medidas_campos for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy equipo_lee on public.aliados_config for select to authenticated using (coalesce(private.prov_rol() not in ('','proveedor'),false));
create policy admin_escribe on public.aliados_config for update to authenticated using (public.es_admin()) with check (public.es_admin());
revoke insert,update,delete,truncate on public.contrato_categoria_historial,public.aliado_consultas,public.contrato_medidas,public.medidas_historial,public.contrato_envios from anon,authenticated;
revoke all on public.aliado_consultas from authenticated;
-- Fotos de envíos y guías de medidas en el mismo bucket del módulo (equipo).
create policy aliados_documentos_equipo_envios on storage.objects for insert to authenticated with check (bucket_id='aliados_documentos' and (name like 'envios/%' or (name like 'medidas/%' and public.es_admin())) and coalesce(private.prov_rol() not in ('','proveedor'),false));
create policy aliados_documentos_equipo_lee_envios on storage.objects for select to authenticated using (bucket_id='aliados_documentos' and (name like 'envios/%' or name like 'medidas/%') and coalesce(private.prov_rol() not in ('','proveedor'),false));

revoke all on function private.contrato_modo_aliado(),private.contrato_aliado_clienta(),private.buscar_aliado_contrato(text),private.buscar_clienta_aliado(uuid,text),private.revisar_medidas(uuid,text,text,jsonb),private.guardar_envio(uuid,jsonb),private.aliados_estadisticas(date,date) from public,anon;
revoke all on function public.buscar_aliado_contrato(text),public.buscar_clienta_aliado(uuid,text),public.revisar_medidas(uuid,text,text,jsonb),public.guardar_envio(uuid,jsonb),public.aliados_estadisticas(date,date) from public,anon;
grant execute on function private.buscar_aliado_contrato(text),private.buscar_clienta_aliado(uuid,text),private.revisar_medidas(uuid,text,text,jsonb),private.guardar_envio(uuid,jsonb),private.aliados_estadisticas(date,date),
 public.buscar_aliado_contrato(text),public.buscar_clienta_aliado(uuid,text),public.revisar_medidas(uuid,text,text,jsonb),public.guardar_envio(uuid,jsonb),public.aliados_estadisticas(date,date) to authenticated;

-- Paso 9: tarea diaria (7:10 a. m. Bogotá) con el mismo mecanismo de las primeras citas.
select cron.schedule('aliados-tarea-diaria','10 12 * * *',$cron$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/aliados/tarea-diaria',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=55000);
$cron$);
