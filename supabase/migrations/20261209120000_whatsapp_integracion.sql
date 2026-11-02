-- Configuración › Integraciones › WhatsApp (marca blanca): número que envía, cuenta (WABA), idiomas y token en Vault.
-- Mientras la conexión no esté probada («conectada»), el ERP sigue usando las variables META_* de Vercel: nada deja de funcionar.
-- Al cambiar de número, el anterior queda en config.anteriores para seguir recibiendo estados y respuestas de mensajes ya enviados.
-- Sedes: teléfono, WhatsApp, dirección para clientas y mapa, editables (antes escritos en lib/first-visit-sites.ts). Se copian los valores actuales.
-- Revert: drop function public.guardar_integracion_whatsapp(jsonb,text), public.integracion_whatsapp_servidor();
--   delete from public.integraciones where id='whatsapp'; restore integraciones_id_check (id='correo') and integraciones_proveedor_check;
--   alter table public.sedes drop column telefono, drop column whatsapp, drop column direccion_clientes, drop column mapa_url, drop column mapa_etiqueta.
alter table public.integraciones drop constraint if exists integraciones_id_check;
alter table public.integraciones add constraint integraciones_id_check check (id in ('correo','whatsapp'));
alter table public.integraciones drop constraint if exists integraciones_proveedor_check;
alter table public.integraciones add constraint integraciones_proveedor_check check (proveedor in ('brevo','mailjet','sendgrid','smtp','meta'));

create or replace function public.guardar_integracion_whatsapp(p_config jsonb,p_secreto text) returns void language plpgsql security definer set search_path='' as $$
declare r public.integraciones; sid uuid; cfg jsonb:=coalesce(p_config,'{}'::jsonb); antes text; anteriores jsonb;
begin
 if not public.es_admin() then raise exception 'Solo administración puede configurar integraciones.' using errcode='42501'; end if;
 if jsonb_typeof(cfg)<>'object' or length(cfg::text)>4000 then raise exception 'Revisa los datos.'; end if;
 if coalesce(cfg->>'phone_number_id','') !~ '^\d{5,30}$' then raise exception 'Escribe el ID del número (solo números).'; end if;
 if coalesce(cfg->>'waba_id','') !~ '^\d{5,30}$' then raise exception 'Escribe el ID de la cuenta de WhatsApp Business (solo números).'; end if;
 select * into r from public.integraciones where id='whatsapp' for update;
 sid:=r.secreto_id;
 if nullif(trim(coalesce(p_secreto,'')),'') is not null then
  if length(p_secreto)>4000 then raise exception 'El token es demasiado largo.'; end if;
  if sid is null then sid:=vault.create_secret(p_secreto,'integracion_whatsapp','Token de WhatsApp Cloud API (Configuración › Integraciones)');
  else perform vault.update_secret(sid,p_secreto); end if;
 elsif sid is null then raise exception 'Pega el token de acceso.';
 end if;
 -- The previous number keeps receiving delivery statuses and button replies for messages already sent.
 antes:=r.config->>'phone_number_id';
 anteriores:=coalesce(r.config->'anteriores','[]'::jsonb);
 if antes is not null and antes<>cfg->>'phone_number_id' and not anteriores ? antes then anteriores:=(jsonb_build_array(antes)||anteriores); end if;
 anteriores:=coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(anteriores) x where x<>cfg->>'phone_number_id' limit 3) t),'[]'::jsonb);
 cfg:=cfg||jsonb_build_object('anteriores',anteriores);
 insert into public.integraciones(id,proveedor,activo,config,secreto_id,estado,ultimo_error,actualizado_por,updated_at)
 values('whatsapp','meta',true,cfg,sid,'sin_probar',null,auth.uid(),now())
 on conflict (id) do update set proveedor='meta',activo=true,config=excluded.config,secreto_id=excluded.secreto_id,
  estado='sin_probar',ultimo_error=null,actualizado_por=auth.uid(),updated_at=now();
end $$;
revoke all on function public.guardar_integracion_whatsapp(jsonb,text) from public,anon;
grant execute on function public.guardar_integracion_whatsapp(jsonb,text) to authenticated;

create or replace function public.integracion_whatsapp_servidor() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('activo',i.activo,'estado',i.estado,'config',i.config,
  'secreto',(select s.decrypted_secret from vault.decrypted_secrets s where s.id=i.secreto_id))
 from public.integraciones i where i.id='whatsapp'
$$;
revoke all on function public.integracion_whatsapp_servidor() from public,anon,authenticated;
grant execute on function public.integracion_whatsapp_servidor() to service_role;

-- ── Contacto de cada sede para los mensajes a clientas ─────────────────────────────────────────
alter table public.sedes add column if not exists telefono text check (telefono is null or length(telefono)<=40),
 add column if not exists whatsapp text check (whatsapp is null or whatsapp ~ '^\d{10,15}$'),
 add column if not exists direccion_clientes text check (direccion_clientes is null or length(direccion_clientes)<=300),
 add column if not exists mapa_url text check (mapa_url is null or (mapa_url ~ '^https://' and length(mapa_url)<=500)),
 add column if not exists mapa_etiqueta text check (mapa_etiqueta is null or length(mapa_etiqueta)<=80);

update public.sedes set telefono='305 807 3210',whatsapp='573058073210',
 direccion_clientes='Carrera 15 #106-76, segundo piso, Molinos Norte, Bogotá. Cerca de Unicentro.',
 mapa_url='https://maps.app.goo.gl/bfZE7XW9rxfcV8vt7',mapa_etiqueta='Cómo llegar en Google Maps'
 where nombre='Bogotá' and telefono is null;
update public.sedes set telefono='321 347 3757',whatsapp='573213473757',
 direccion_clientes='Carrera 17 #9-70, local 101, barrio Pinares, Pereira, Risaralda.',
 mapa_url='https://www.google.com/maps/search/?api=1&query=Carrera%2017%20%239-70%20Local%20101%20Pinares%20Pereira',mapa_etiqueta='Cómo llegar en Google Maps'
 where nombre='Pereira' and telefono is null;
update public.sedes set telefono='321 489 3891',whatsapp='573214893891',
 direccion_clientes='Calle 15 #42-21, casa 7, Villavicencio, Meta. Una cuadra arriba del Centro Comercial Primavera Urbana.',
 mapa_url='https://share.google/V1tpS2sfzzhFMq8bS',mapa_etiqueta='Cómo llegar en Google'
 where nombre='Villavicencio' and telefono is null;
update public.sedes set telefono='310 211 9906',whatsapp='573102119906',
 direccion_clientes='Carrera 54 #84-95, Riomar, Barranquilla. Cerca del Centro Comercial Viva, frente al colegio Biffi La Salle.',
 mapa_url='https://share.google/emQJr5NJI0YECOWzN',mapa_etiqueta='Cómo llegar en Google'
 where nombre='Barranquilla' and telefono is null;
