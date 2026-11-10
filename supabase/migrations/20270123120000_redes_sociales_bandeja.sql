-- Ventas y CRM › bandeja: los mensajes de Messenger e Instagram entran a la misma bandeja que el WhatsApp 304.
-- La conexión (página de Facebook, cuenta de Instagram y token) se guarda en Configuración › Integraciones (id 'redes'),
-- con el token cifrado en Vault: nada queda escrito en el código, para poder conectarla en otra empresa (marca blanca).
-- Un chat de redes guarda en telefono un identificador «fb:<id>» o «ig:<id>» (no es un celular) y su canal.
-- Reversión: alter table public.whatsapp_conversaciones drop column canal, drop column contacto_id;
--   drop function public.guardar_integracion_redes(jsonb,text); drop function public.integracion_redes_servidor();
--   delete from public.integraciones where id='redes';
alter table public.whatsapp_conversaciones add column if not exists canal text not null default 'whatsapp',
 add column if not exists contacto_id text;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='whatsapp_conversaciones_canal_check') then
  alter table public.whatsapp_conversaciones add constraint whatsapp_conversaciones_canal_check check (canal in ('whatsapp','messenger','instagram'));
 end if;
end $$;

create or replace function public.guardar_integracion_redes(p_config jsonb, p_secreto text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.integraciones; sid uuid; cfg jsonb:=coalesce(p_config,'{}'::jsonb);
begin
 if not public.es_admin() then raise exception 'Solo administración puede configurar integraciones.' using errcode='42501'; end if;
 if jsonb_typeof(cfg)<>'object' or length(cfg::text)>2000 then raise exception 'Revisa los datos.'; end if;
 if coalesce(cfg->>'page_id','') !~ '^\d{5,30}$' then raise exception 'Escribe el ID de la página de Facebook (solo números).'; end if;
 if coalesce(cfg->>'instagram_id','')<>'' and cfg->>'instagram_id' !~ '^\d{5,30}$' then raise exception 'El ID de la cuenta de Instagram debe tener solo números (o déjalo vacío).'; end if;
 select * into r from public.integraciones where id='redes' for update;
 sid:=r.secreto_id;
 if nullif(trim(coalesce(p_secreto,'')),'') is not null then
  if length(p_secreto)>4000 then raise exception 'El token es demasiado largo.'; end if;
  if sid is null then sid:=vault.create_secret(p_secreto,'integracion_redes','Token de página de Facebook/Instagram (Configuración › Integraciones)');
  else perform vault.update_secret(sid,p_secreto); end if;
 elsif sid is null then raise exception 'Pega el token de acceso de la página.';
 end if;
 insert into public.integraciones(id,proveedor,activo,config,secreto_id,estado,ultimo_error,actualizado_por,updated_at)
 values('redes','meta',true,cfg,sid,'sin_probar',null,auth.uid(),now())
 on conflict (id) do update set proveedor='meta',activo=true,config=excluded.config,secreto_id=excluded.secreto_id,
  estado='sin_probar',ultimo_error=null,actualizado_por=auth.uid(),updated_at=now();
end $$;
revoke all on function public.guardar_integracion_redes(jsonb,text) from public, anon;
grant execute on function public.guardar_integracion_redes(jsonb,text) to authenticated;

create or replace function public.integracion_redes_servidor() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('activo',i.activo,'estado',i.estado,'config',i.config,'webhook_token',i.webhook_token,
  'secreto',(select s.decrypted_secret from vault.decrypted_secrets s where s.id=i.secreto_id))
 from public.integraciones i where i.id='redes'
$$;
revoke all on function public.integracion_redes_servidor() from public, anon, authenticated;
grant execute on function public.integracion_redes_servidor() to service_role;
