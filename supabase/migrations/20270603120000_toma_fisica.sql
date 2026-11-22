-- Toma física (Inventario › Toma física): a store opens a count, marks each dress it finds by its code and closes it; the ERP lists what
-- is missing (expected in the store and not found) and what was found but belongs elsewhere. Dresses out on a contract, in transfer or
-- in maintenance are listed apart, not as missing. Missing dresses of the last closed count of each store appear in Novedades contables.
-- Visible to whoever sees the store's inventory. Reversible: drop the functions and tables tomas_fisicas / toma_fisica_items.

create table if not exists public.tomas_fisicas(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
 iniciada_por uuid references public.profiles(id), created_at timestamptz not null default now(),
 cerrada_por uuid references public.profiles(id), cerrada_at timestamptz, nota text);
create table if not exists public.toma_fisica_items(
 id uuid primary key default gen_random_uuid(),
 toma_id uuid not null references public.tomas_fisicas(id),
 vestido_id uuid not null references public.vestidos(id),
 situacion text not null check (situacion in ('esperado','afuera','sobrante')),
 encontrado boolean not null default false, encontrado_at timestamptz, encontrado_por uuid references public.profiles(id),
 unique (toma_id,vestido_id));
alter table public.tomas_fisicas enable row level security;
alter table public.toma_fisica_items enable row level security;
create policy tomas_fisicas_ver on public.tomas_fisicas for select to authenticated using (private.es_finanzas() or private.caja_ver(sede_id));
create policy toma_fisica_items_ver on public.toma_fisica_items for select to authenticated using (exists(select 1 from public.tomas_fisicas t where t.id=toma_id));
grant select on public.tomas_fisicas, public.toma_fisica_items to authenticated;
create trigger tomas_fisicas_historial after insert or update on public.tomas_fisicas for each row execute function private.config_historial();

create or replace function private.toma_puede(p_sede uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.es_admin() or private.es_finanzas() or private.caja_operar(p_sede));
$$;

create or replace function private.toma_iniciar(p_sede uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if not private.toma_puede(p_sede) then raise exception 'No puedes hacer la toma física de esta sede.' using errcode='42501'; end if;
 select id into t from public.tomas_fisicas where sede_id=p_sede and estado='abierta';
 if t is not null then return t; end if;
 insert into public.tomas_fisicas(sede_id,iniciada_por) values(p_sede,auth.uid()) returning id into t;
 insert into public.toma_fisica_items(toma_id,vestido_id,situacion)
 select t, v.id, case when lower(coalesce(v.estado,'')) in ('alquilado','en evento','traslado','en mantenimiento') then 'afuera' else 'esperado' end
 from public.vestidos v where v.sede_actual_id=p_sede and not coalesce(v.archivado,false) and lower(coalesce(v.estado,'')) not in ('vendido','dañado/baja');
 return t;
end $$;

-- Mark a dress as found by its code (or id). A dress of another store is added as «sobrante».
create or replace function private.toma_marcar(p_toma uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.tomas_fisicas; v public.vestidos; i public.toma_fisica_items;
begin
 select * into t from public.tomas_fisicas where id=p_toma;
 if t.id is null or not private.toma_puede(t.sede_id) then raise exception 'Toma no encontrada.' using errcode='42501'; end if;
 if t.estado<>'abierta' then raise exception 'Esta toma ya está cerrada.'; end if;
 select * into v from public.vestidos where not coalesce(archivado,false) and (upper(codigo)=upper(btrim(p_codigo)) or id::text=btrim(p_codigo))
  order by (sede_actual_id=t.sede_id) desc limit 1;
 if v.id is null then raise exception 'No existe un vestido con el código %.', btrim(p_codigo); end if;
 select * into i from public.toma_fisica_items where toma_id=t.id and vestido_id=v.id;
 if i.id is null then insert into public.toma_fisica_items(toma_id,vestido_id,situacion,encontrado,encontrado_at,encontrado_por) values(t.id,v.id,'sobrante',true,now(),auth.uid());
 else update public.toma_fisica_items set encontrado=true,encontrado_at=now(),encontrado_por=auth.uid() where id=i.id; end if;
 return jsonb_build_object('codigo',v.codigo,'nombre',v.nombre,'sobrante',i.id is null,'ya_estaba',coalesce(i.encontrado,false));
end $$;

create or replace function private.toma_cerrar(p_toma uuid, p_nota text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.tomas_fisicas;
begin
 select * into t from public.tomas_fisicas where id=p_toma for update;
 if t.id is null or not private.toma_puede(t.sede_id) then raise exception 'Toma no encontrada.' using errcode='42501'; end if;
 if t.estado<>'abierta' then raise exception 'Esta toma ya está cerrada.'; end if;
 update public.tomas_fisicas set estado='cerrada',cerrada_por=auth.uid(),cerrada_at=now(),nota=nullif(btrim(coalesce(p_nota,'')),'') where id=t.id;
end $$;

create or replace function private.toma_detalle(p_sede uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.tomas_fisicas;
begin
 if not (private.toma_puede(p_sede) or private.caja_ver(p_sede)) then raise exception 'No puedes ver la toma física de esta sede.' using errcode='42501'; end if;
 select * into t from public.tomas_fisicas where sede_id=p_sede order by (estado='abierta') desc, created_at desc limit 1;
 if t.id is null then return jsonb_build_object('toma',null,'items','[]'::jsonb); end if;
 return jsonb_build_object('toma',to_jsonb(t),
  'items',coalesce((select jsonb_agg(jsonb_build_object('vestido_id',v.id,'codigo',v.codigo,'nombre',v.nombre,'talla',v.talla,'estado',v.estado,'situacion',i.situacion,'encontrado',i.encontrado,
    'sede_actual',(select nombre from public.sedes where id=v.sede_actual_id)) order by i.encontrado, v.codigo)
   from public.toma_fisica_items i join public.vestidos v on v.id=i.vestido_id where i.toma_id=t.id),'[]'::jsonb));
end $$;

revoke all on function private.toma_puede(uuid), private.toma_iniciar(uuid), private.toma_marcar(uuid,text), private.toma_cerrar(uuid,text), private.toma_detalle(uuid) from public, anon;
grant execute on function private.toma_iniciar(uuid), private.toma_marcar(uuid,text), private.toma_cerrar(uuid,text), private.toma_detalle(uuid) to authenticated;
create or replace function public.toma_iniciar(p_sede uuid) returns uuid language sql set search_path='' as $$ select private.toma_iniciar(p_sede); $$;
create or replace function public.toma_marcar(p_toma uuid, p_codigo text) returns jsonb language sql set search_path='' as $$ select private.toma_marcar(p_toma,p_codigo); $$;
create or replace function public.toma_cerrar(p_toma uuid, p_nota text) returns void language sql set search_path='' as $$ select private.toma_cerrar(p_toma,p_nota); $$;
create or replace function public.toma_detalle(p_sede uuid) returns jsonb language sql stable set search_path='' as $$ select private.toma_detalle(p_sede); $$;
revoke all on function public.toma_iniciar(uuid), public.toma_marcar(uuid,text), public.toma_cerrar(uuid,text), public.toma_detalle(uuid) from public, anon;
grant execute on function public.toma_iniciar(uuid), public.toma_marcar(uuid,text), public.toma_cerrar(uuid,text), public.toma_detalle(uuid) to authenticated;

do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 a:='and coalesce(m.origen,'''') not in (''devolucion'',''gasto'');';
 if position(a in d)=0 then raise exception 'novedades_contables: punto'; end if;
 d:=replace(d,a,left(a,length(a)-1)||$n$
 union all
 select 'toma:'||i.id, 'Vestido faltante en la toma física', s.nombre::text, s.id, v.codigo::text,
  format('%s · no apareció en la toma del %s: búscalo o repórtalo',coalesce(v.nombre,''),to_char(t.cerrada_at at time zone 'America/Bogota','DD/MM/YYYY')),
  '/admin/inventory?tab=toma', 'Sede', false, (t.cerrada_at at time zone 'America/Bogota')::date
 from public.tomas_fisicas t join public.toma_fisica_items i on i.toma_id=t.id join public.vestidos v on v.id=i.vestido_id join public.sedes s on s.id=t.sede_id
 where t.sede_id=any(sedes) and t.estado='cerrada' and i.situacion='esperado' and not i.encontrado
  and t.id=(select t2.id from public.tomas_fisicas t2 where t2.sede_id=t.sede_id and t2.estado='cerrada' order by t2.cerrada_at desc limit 1)
  and v.sede_actual_id=t.sede_id and not coalesce(v.archivado,false);$n$);
 execute d;
end $mig$;
