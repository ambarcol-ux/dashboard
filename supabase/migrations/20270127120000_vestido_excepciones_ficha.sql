-- Ficha completa para contratos: desde el 11-dic-2026 no se contrata un vestido o accesorio con datos o fotos faltantes,
-- salvo excepción temporal autorizada por administración (con motivo). Las facturas nunca se bloquean.
-- Reversión: drop table public.vestido_excepciones_ficha;
create table if not exists public.vestido_excepciones_ficha(
 id bigint generated always as identity primary key,
 vestido_id uuid not null references public.vestidos(id) on delete cascade,
 motivo text not null check (length(trim(motivo)) between 5 and 300),
 autorizado_por uuid default auth.uid() references public.profiles(id) on delete set null,
 vence timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now()
);
create index if not exists vestido_excepciones_ficha_vestido on public.vestido_excepciones_ficha(vestido_id, vence desc);
alter table public.vestido_excepciones_ficha enable row level security;
create policy vestido_excepciones_ficha_ver on public.vestido_excepciones_ficha for select to authenticated using (true);
create policy vestido_excepciones_ficha_admin on public.vestido_excepciones_ficha for insert to authenticated with check ((select public.es_admin()) and vence<=now()+interval '31 days');
revoke update, delete on public.vestido_excepciones_ficha from anon, authenticated;
