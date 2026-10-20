-- Contrato de Alianza Comercial (préstamo de vestidos): perfil completo del aliado y firma digital única.
-- El aliado firma por un enlace privado (sin usuario del ERP); la firma y una copia exacta del texto firmado
-- quedan guardadas y no se pueden volver a firmar ni modificar.
alter table public.referidores
 add column if not exists cedula text,
 add column if not exists direccion text,
 add column if not exists ciudad text,
 add column if not exists tipo_cuenta text;

-- Datos de AMBAR y valores del contrato (una sola fila, la edita administración).
create table public.aliados_contrato_config (
 id smallint primary key default 1 check (id=1),
 representante text, representante_cedula text, representante_ciudad_cedula text, nit text,
 direccion text, ciudad text, correo text, telefono text,
 deposito_por_vestido numeric(14,2), mora_por_dia numeric(14,2), clausula_penal numeric(14,2),
 cuenta_redes text, firma_ambar text,
 actualizado_por uuid references public.profiles(id), actualizado_at timestamptz not null default now()
);
insert into public.aliados_contrato_config(id) values(1) on conflict do nothing;
alter table public.aliados_contrato_config enable row level security;
revoke all on public.aliados_contrato_config from public,anon,authenticated;
grant select,update on public.aliados_contrato_config to authenticated;
create policy aliados_contrato_config_admin_leer on public.aliados_contrato_config for select to authenticated using ((select public.es_admin()));
create policy aliados_contrato_config_admin_editar on public.aliados_contrato_config for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create table public.aliados_contratos_firmados (
 id uuid primary key default gen_random_uuid(),
 referidor_id uuid not null unique references public.referidores(id),
 version text not null,
 texto jsonb not null,
 datos_aliado jsonb not null,
 firma_base64 text not null check (firma_base64 like 'data:image/png;base64,%' and length(firma_base64)<=1500000),
 firmado_at timestamptz not null default now(),
 ip text, user_agent text
);
alter table public.aliados_contratos_firmados enable row level security;
revoke all on public.aliados_contratos_firmados from public,anon,authenticated;
grant select on public.aliados_contratos_firmados to authenticated;
create policy aliados_contratos_firmados_admin on public.aliados_contratos_firmados for select to authenticated using ((select public.es_admin()));
-- Una firma no se modifica.
create function private.contrato_aliado_inmutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'El contrato firmado no se puede modificar.'; end $$;
create trigger aliados_contratos_firmados_inmutable before update on public.aliados_contratos_firmados for each row execute function private.contrato_aliado_inmutable();
