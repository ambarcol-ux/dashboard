-- 1) TikTok: connection in Configuración › Integraciones (keys and tokens in Vault) and «tiktok» as a network of the pieces.
-- 2) Estudio de contenido › Reglas: the ERP creates pieces by itself (calendar or new dress); they still wait for approval.
-- Reversión:
--   select cron.unschedule('contenido-reglas');
--   alter table public.contenido_piezas drop column regla_id; drop table public.contenido_reglas;
--   alter table public.contenido_piezas drop constraint contenido_piezas_redes_check, add constraint contenido_piezas_redes_check check (redes <@ array['instagram','facebook','whatsapp']::text[] and cardinality(redes)>0);
--   delete from public.integraciones where id='tiktok';
--   alter table public.integraciones drop constraint integraciones_id_check, add constraint integraciones_id_check check (id in ('correo','whatsapp','redes'));
--   alter table public.integraciones drop constraint integraciones_proveedor_check, add constraint integraciones_proveedor_check check (proveedor in ('brevo','mailjet','sendgrid','smtp','meta'));
--   drop function public.guardar_integracion_tiktok(text,text), public.integracion_tiktok_servidor(), public.integracion_tiktok_actualizar(jsonb,text,text,text);

alter table public.integraciones drop constraint integraciones_id_check,
 add constraint integraciones_id_check check (id in ('correo','whatsapp','redes','tiktok'));
alter table public.integraciones drop constraint integraciones_proveedor_check,
 add constraint integraciones_proveedor_check check (proveedor in ('brevo','mailjet','sendgrid','smtp','meta','tiktok'));

-- The admin saves the app keys (client key in config, client secret in Vault). Tokens come later from «Conectar TikTok».
create or replace function public.guardar_integracion_tiktok(p_client_key text, p_client_secret text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.integraciones; sid uuid; sec jsonb;
begin
 if not public.es_admin() then raise exception 'Solo administración puede configurar integraciones.' using errcode='42501'; end if;
 if coalesce(p_client_key,'') !~ '^[A-Za-z0-9]{8,64}$' then raise exception 'Escribe el Client key de la app de TikTok.'; end if;
 select * into r from public.integraciones where id='tiktok' for update;
 sid:=r.secreto_id;
 if nullif(trim(coalesce(p_client_secret,'')),'') is not null then
  if length(p_client_secret)>200 then raise exception 'El Client secret es demasiado largo.'; end if;
  sec:=jsonb_build_object('client_secret',trim(p_client_secret));
  if sid is null then sid:=vault.create_secret(sec::text,'integracion_tiktok','Claves y tokens de TikTok (Configuración › Integraciones)');
  else perform vault.update_secret(sid,sec::text); end if;
 elsif sid is null then raise exception 'Pega el Client secret de la app de TikTok.';
 end if;
 insert into public.integraciones(id,proveedor,activo,config,secreto_id,estado,ultimo_error,actualizado_por,updated_at)
 values('tiktok','tiktok',true,jsonb_build_object('client_key',p_client_key),sid,'sin_probar',null,auth.uid(),now())
 on conflict (id) do update set activo=true,config=jsonb_build_object('client_key',p_client_key),secreto_id=excluded.secreto_id,
  estado='sin_probar',ultimo_error=null,actualizado_por=auth.uid(),updated_at=now();
end $$;
revoke all on function public.guardar_integracion_tiktok(text,text) from public, anon;
grant execute on function public.guardar_integracion_tiktok(text,text) to authenticated;

-- Server only: reads the keys and tokens.
create or replace function public.integracion_tiktok_servidor() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('activo',i.activo,'estado',i.estado,'config',i.config,
  'secreto',(select s.decrypted_secret from vault.decrypted_secrets s where s.id=i.secreto_id))
 from public.integraciones i where i.id='tiktok'
$$;
revoke all on function public.integracion_tiktok_servidor() from public, anon, authenticated;
grant execute on function public.integracion_tiktok_servidor() to service_role;

-- Server only: saves new tokens (connection or renewal), the config (account name, OAuth state) and the status.
create or replace function public.integracion_tiktok_actualizar(p_config jsonb, p_secreto text, p_estado text, p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.integraciones;
begin
 select * into r from public.integraciones where id='tiktok' for update;
 if r.id is null then raise exception 'TikTok no está configurado.'; end if;
 if p_secreto is not null then perform vault.update_secret(r.secreto_id,p_secreto); end if;
 update public.integraciones set config=coalesce(r.config,'{}'::jsonb)||coalesce(p_config,'{}'::jsonb),
  estado=coalesce(p_estado,estado),ultimo_error=p_error,probado_at=case when p_estado is not null then now() else probado_at end,updated_at=now()
 where id='tiktok';
end $$;
revoke all on function public.integracion_tiktok_actualizar(jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.integracion_tiktok_actualizar(jsonb,text,text,text) to service_role;

alter table public.contenido_piezas drop constraint contenido_piezas_redes_check,
 add constraint contenido_piezas_redes_check check (redes <@ array['instagram','facebook','tiktok','whatsapp']::text[] and cardinality(redes)>0);

create table if not exists public.contenido_reglas(
 id uuid primary key default gen_random_uuid(),
 nombre text not null check (length(btrim(nombre)) between 2 and 80),
 activa boolean not null default true,
 disparador text not null default 'calendario' check (disparador in ('calendario','vestido_nuevo')),
 dias int[] not null default '{1,3,5}' check (dias <@ array[0,1,2,3,4,5,6]),
 hora time not null default '10:00',
 cantidad int not null default 1 check (cantidad between 1 and 5),
 formato text not null check (formato in ('historia','publicacion','carrusel','reel')),
 redes text[] not null check (redes <@ array['instagram','facebook','tiktok','whatsapp']::text[] and cardinality(redes)>0),
 sede_id uuid references public.sedes(id),
 orden text not null check (length(btrim(orden)) between 5 and 1000),
 ultimo_revisado timestamptz,
 creado_por uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.contenido_reglas enable row level security;
create policy contenido_reglas_ver on public.contenido_reglas for select to authenticated
 using ((select public.es_admin()) or (select private.tiene_permiso('panel.estudio_contenido')));
revoke insert,update,delete on public.contenido_reglas from anon, authenticated;

alter table public.contenido_piezas add column if not exists regla_id uuid references public.contenido_reglas(id) on delete set null,
 add column if not exists regla_fecha date,
 add column if not exists vestido_id uuid;
create index if not exists contenido_piezas_regla on public.contenido_piezas(regla_id,regla_fecha);

-- 5:00 to 8:40 a. m. (Bogotá) every 20 minutes: creates the day's pieces of the rules (a few per run, so the AI has time).
select cron.schedule('contenido-reglas','*/20 10-13 * * *',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/marketing/reglas',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb, timeout_milliseconds:=60000);
$c$);
