-- Signed contract that does not change: when the client signs (/firma/[id]) the ERP saves a fixed copy of what she signed (contract
-- data, the clauses in force, signature and a verification code). The signing page and the PDF show that copy afterwards, so a later
-- change to the clauses never alters a signed contract. Contracts signed before this step get a copy taken today (reconstruida=true:
-- clauses in force on the day of the copy). Readable by whoever can read the contract; written only by the server.
-- Also: the two internal views stop bypassing the per-store rules (security_invoker), deactivating a person in the ERP suspends her
-- login (and reactivating releases it), and the delivery photos folder becomes private (photos are shown through temporary links).
-- Reversible: drop table public.contratos_copia_firmada; alter view … set (security_invoker=false); drop trigger profiles_bloqueo_usuario;
--             update storage.buckets set public=true where id='fotos-entregas'.

create table if not exists public.contratos_copia_firmada(
 contrato_id uuid primary key references public.contratos(id),
 datos jsonb not null,
 plantillas jsonb not null,
 firmado_at timestamptz,
 hash text not null,
 reconstruida boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.contratos_copia_firmada enable row level security;
create policy contratos_copia_firmada_ver on public.contratos_copia_firmada for select to authenticated
 using (exists(select 1 from public.contratos k where k.id=contrato_id));
grant select on public.contratos_copia_firmada to authenticated;

-- Copy for contracts already signed (clauses in force today).
insert into public.contratos_copia_firmada(contrato_id,datos,plantillas,firmado_at,hash,reconstruida)
select k.id, x.datos, p.plantillas, coalesce(k.fecha_firma_cliente::timestamptz,k.fecha_firma::timestamptz),
 encode(sha256(convert_to(x.datos::text||p.plantillas::text,'UTF8')),'hex'), true
from public.contratos k
cross join lateral (select to_jsonb(k)||jsonb_build_object('vestidos',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('vestido',to_jsonb(v))) from public.contrato_items_vestidos i left join public.vestidos v on v.id=i.vestido_id where i.contrato_id=k.id),'[]'::jsonb)) datos) x
cross join (select coalesce(jsonb_agg(to_jsonb(t) order by t.numero_orden),'[]'::jsonb) plantillas from public.plantillas_contratos t) p
where (k.firma_base64 is not null or k.fecha_firma_cliente is not null) and lower(coalesce(k.estado,''))<>'borrador'
on conflict (contrato_id) do nothing;

alter view public.kpi_vestidos_populares set (security_invoker=true);
alter view public.vista_historial_alquileres set (security_invoker=true);

create or replace function private.sincronizar_bloqueo_usuario() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.activo is distinct from old.activo then
  update auth.users set banned_until=case when coalesce(new.activo,true) then null else timestamptz '2999-12-31' end where id=new.id;
 end if;
 return new;
end $$;
create trigger profiles_bloqueo_usuario after update of activo on public.profiles for each row execute function private.sincronizar_bloqueo_usuario();
update auth.users u set banned_until=timestamptz '2999-12-31' from public.profiles p where p.id=u.id and not coalesce(p.activo,true) and u.banned_until is null;

update storage.buckets set public=false where id='fotos-entregas';
