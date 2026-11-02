-- Configuración › Integraciones: conexión de correo intercambiable (Brevo, Mailjet, SendGrid o SMTP), una activa a la vez.
-- La clave vive en Supabase Vault; la tabla solo guarda datos no secretos. La baja o el spam que informa el proveedor
-- revocan la autorización comercial de esa persona. No toca los correos existentes (Resend: citas y aliados).
-- Revert: drop function public.guardar_integracion_correo(text,jsonb,text), public.integracion_correo_servidor(),
--   public.revocar_comercial_por_correo(text,text); drop table public.correo_eventos, public.integraciones;
--   select vault.delete... (borrar el secreto 'integracion_correo' desde el panel de Vault).
create table if not exists public.integraciones(
 id text primary key check (id in ('correo')),
 proveedor text not null check (proveedor in ('brevo','mailjet','sendgrid','smtp')),
 activo boolean not null default false,
 config jsonb not null default '{}'::jsonb,
 secreto_id uuid,
 webhook_token uuid not null default gen_random_uuid(),
 estado text not null default 'sin_probar' check (estado in ('sin_probar','conectada','error')),
 ultimo_error text,
 probado_at timestamptz,
 sincronizado_at timestamptz,
 sincronizados int,
 actualizado_por uuid default auth.uid() references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.integraciones enable row level security;
revoke all on public.integraciones from anon,authenticated;
grant select on public.integraciones to authenticated;
create policy integraciones_admin on public.integraciones for select to authenticated using (public.es_admin());

create table if not exists public.correo_eventos(
 id bigint generated always as identity primary key,
 proveedor text not null,
 evento text not null,
 email text,
 revoco boolean not null default false,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists correo_eventos_fecha on public.correo_eventos(created_at desc);
alter table public.correo_eventos enable row level security;
revoke all on public.correo_eventos from anon,authenticated;
grant select on public.correo_eventos to authenticated;
create policy correo_eventos_admin on public.correo_eventos for select to authenticated using (public.es_admin());

-- Save provider, non-secret settings and (optionally) a new key into Vault. Admin only.
create or replace function public.guardar_integracion_correo(p_proveedor text,p_config jsonb,p_secreto text) returns void language plpgsql security definer set search_path='' as $$
declare r public.integraciones; sid uuid;
begin
 if not public.es_admin() then raise exception 'Solo administración puede configurar integraciones.' using errcode='42501'; end if;
 if p_proveedor not in ('brevo','mailjet','sendgrid','smtp') then raise exception 'Proveedor no válido.'; end if;
 if jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' or length(coalesce(p_config,'{}'::jsonb)::text)>4000 then raise exception 'Revisa los datos.'; end if;
 select * into r from public.integraciones where id='correo' for update;
 sid:=r.secreto_id;
 if nullif(trim(coalesce(p_secreto,'')),'') is not null then
  if length(p_secreto)>4000 then raise exception 'La clave es demasiado larga.'; end if;
  if sid is null then sid:=vault.create_secret(p_secreto,'integracion_correo','Clave del proveedor de correo (Configuración › Integraciones)');
  else perform vault.update_secret(sid,p_secreto); end if;
 elsif sid is null or r.proveedor is distinct from p_proveedor then
  raise exception 'Escribe la clave del proveedor.';
 end if;
 insert into public.integraciones(id,proveedor,activo,config,secreto_id,estado,ultimo_error,actualizado_por,updated_at)
 values('correo',p_proveedor,true,coalesce(p_config,'{}'::jsonb),sid,'sin_probar',null,auth.uid(),now())
 on conflict (id) do update set proveedor=excluded.proveedor,activo=true,config=excluded.config,secreto_id=excluded.secreto_id,
  estado='sin_probar',ultimo_error=null,actualizado_por=auth.uid(),updated_at=now();
end $$;
revoke all on function public.guardar_integracion_correo(text,jsonb,text) from public,anon;
grant execute on function public.guardar_integracion_correo(text,jsonb,text) to authenticated;

-- Server only: the active connection with its decrypted key.
create or replace function public.integracion_correo_servidor() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('proveedor',i.proveedor,'activo',i.activo,'config',i.config,'webhook_token',i.webhook_token,
  'secreto',(select s.decrypted_secret from vault.decrypted_secrets s where s.id=i.secreto_id))
 from public.integraciones i where i.id='correo'
$$;
revoke all on function public.integracion_correo_servidor() from public,anon,authenticated;
grant execute on function public.integracion_correo_servidor() to service_role;

-- Server only: unsubscribe/spam reported by the provider revokes the commercial authorization of that email.
create or replace function public.revocar_comercial_por_correo(p_email text,p_proveedor text) returns int language plpgsql security definer set search_path='' as $$
declare n int:=0; a record;
begin
 if private.norm_mail(p_email) is null then return 0; end if;
 for a in select id from public.autorizaciones_datos where comercial and private.norm_mail(email)=private.norm_mail(p_email) for update loop
  update public.autorizaciones_datos set comercial=false,comercial_revocada_at=now(),actualizado_en=now() where id=a.id;
  insert into public.autorizaciones_eventos(autorizacion_id,accion,origen) values(a.id,'revocar_comercial','correo:'||left(coalesce(p_proveedor,''),20));
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.revocar_comercial_por_correo(text,text) from public,anon,authenticated;
grant execute on function public.revocar_comercial_por_correo(text,text) to service_role;
