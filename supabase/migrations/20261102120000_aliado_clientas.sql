-- Aliados (paso 4): clientas que registra cada aliado (formulario público por enlace o código del aliado).
create table public.aliado_clientas (
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 aliado_id uuid not null references public.aliados(id),
 tipo_evento text not null check (tipo_evento in ('XV','GALA')),
 categoria text not null check ((tipo_evento='XV' and categoria in ('Esencial','Clásica','Premium','Exclusiva')) or (tipo_evento='GALA' and categoria in ('Clásica','Premium'))),
 clienta_menor boolean not null default true,
 rep_nombre text, rep_cedula text, rep_parentesco text, rep_celular text, rep_correo text,
 clienta_nombre text not null check (length(btrim(clienta_nombre)) between 3 and 140),
 clienta_documento text not null check (clienta_documento ~ '^[0-9]{5,15}$'),
 clienta_celular text, clienta_correo text,
 fecha_evento date not null,
 autoriza_datos_at timestamptz not null,
 uso_imagen boolean not null,
 publicidad boolean not null default false,
 estado text not null default 'Registrada' check (estado in ('Registrada','Cita agendada','Asistió','Contrató','No contrató')),
 creado_en timestamptz not null default now(),
 actualizado_por uuid references public.profiles(id), actualizado_en timestamptz,
 check (not clienta_menor or (rep_nombre is not null and rep_cedula ~ '^[0-9]{5,15}$' and rep_parentesco is not null and rep_celular is not null and rep_correo is not null)),
 check (clienta_menor or (clienta_celular is not null and clienta_correo is not null))
);
create unique index aliado_clientas_documento on public.aliado_clientas(clienta_documento);
create index aliado_clientas_aliado on public.aliado_clientas(aliado_id);
alter table public.aliado_clientas enable row level security;
create policy aliado_clientas_equipo_lee on public.aliado_clientas for select to authenticated using (coalesce(private.prov_rol() not in ('','proveedor'),false));
revoke insert,update,delete,truncate on public.aliado_clientas from anon,authenticated;

create or replace function private.estado_clienta_aliado(p_id uuid,p_estado text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.prov_rol() not in ('','proveedor'),false) then raise exception 'No autorizado.' using errcode='42501'; end if;
 update public.aliado_clientas set estado=p_estado,actualizado_por=auth.uid(),actualizado_en=now() where id=p_id;
 if not found then raise exception 'Clienta no encontrada.'; end if;
end $$;
create or replace function public.estado_clienta_aliado(p_id uuid,p_estado text) returns void language sql security invoker set search_path='' as $$ select private.estado_clienta_aliado(p_id,p_estado); $$;
revoke all on function private.estado_clienta_aliado(uuid,text),public.estado_clienta_aliado(uuid,text) from public,anon;
grant execute on function private.estado_clienta_aliado(uuid,text),public.estado_clienta_aliado(uuid,text) to authenticated;
