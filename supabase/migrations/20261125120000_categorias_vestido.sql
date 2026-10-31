-- Categorías automáticas del vestido por tipo (clasificación) y precio de alquiler; editables en Configuración (solo administración).
-- Al guardar una categoría se recalculan los vestidos. El registro de clientas del aliado usa esta tabla (XV, Gala y Novia);
-- los registros anteriores conservan su texto.
-- Revert: remove trigger vestidos_categoria, the categorias_vestido table, its triggers and the new functions;
--   restore the aliado_clientas checks (XV/GALA with the fixed categories); re-apply the previous body of private.config_historial.

create table if not exists public.categorias_vestido(id serial primary key,clasificacion_id int not null references public.clasificaciones_vestido(id),
 nombre text not null check (length(btrim(nombre)) between 2 and 40),precio_hasta numeric check (precio_hasta is null or precio_hasta>0),
 orden int not null default 100,activo boolean not null default true,unique(clasificacion_id,nombre));
alter table public.categorias_vestido enable row level security;
revoke all on public.categorias_vestido from anon;
create policy categorias_vestido_leer on public.categorias_vestido for select to authenticated using (true);
create policy categorias_vestido_admin on public.categorias_vestido for all to authenticated using (public.es_admin()) with check (public.es_admin());

insert into public.categorias_vestido(clasificacion_id,nombre,precio_hasta,orden)
select c.id,x.nombre,x.hasta,x.orden from (values
 ('XV Años','Esencial',1500000,1),('XV Años','Clásica',2500000,2),('XV Años','Premium',3500000,3),('XV Años','Exclusiva',null,4),
 ('Gala','Clásica',450000,1),('Gala','Premium',null,2),
 ('Novia','Nupcial Clásica',2000000,1),('Novia','Nupcial Exclusiva',null,2),
 ('Pajecita','Encanto',null,1),('Vestido de cambio','Destello',null,1)) x(tipo,nombre,hasta,orden)
join public.clasificaciones_vestido c on c.nombre=x.tipo
on conflict do nothing;

-- Category of a dress: first active category of its type whose top covers the price (no top = the rest).
create or replace function private.categoria_vestido(p_clasificacion int,p_precio numeric) returns text language sql stable security definer set search_path='' as $$
 select c.nombre from public.categorias_vestido c
 where p_clasificacion is not null and coalesce(p_precio,0)>0 and c.clasificacion_id=p_clasificacion and c.activo and (c.precio_hasta is null or p_precio<=c.precio_hasta)
 order by c.precio_hasta nulls last,c.orden limit 1
$$;
create or replace function private.vestido_categoria() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.categoria:=private.categoria_vestido(new.clasificacion_id,new.precio_sugerido);
 return new;
end $$;
create trigger vestidos_categoria before insert or update of precio_sugerido,clasificacion_id on public.vestidos for each row execute function private.vestido_categoria();

create or replace function private.recalcular_categorias_vestido() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.vestidos v set categoria=private.categoria_vestido(v.clasificacion_id,v.precio_sugerido)
 where v.categoria is distinct from private.categoria_vestido(v.clasificacion_id,v.precio_sugerido);
 return null;
end $$;
create trigger categorias_vestido_recalcular after insert or update or delete on public.categorias_vestido for each statement execute function private.recalcular_categorias_vestido();

-- A category in use (dress or ally client) is deactivated, not removed.
create or replace function private.categoria_vestido_proteger() returns trigger language plpgsql security definer set search_path='' as $$
declare tipo text:=(select nombre from public.clasificaciones_vestido where id=old.clasificacion_id);
begin
 if exists(select 1 from public.vestidos where clasificacion_id=old.clasificacion_id and categoria=old.nombre)
  or exists(select 1 from public.aliado_clientas where categoria=old.nombre and tipo_evento=case tipo when 'XV Años' then 'XV' when 'Gala' then 'GALA' when 'Novia' then 'NOVIA' end) then
  raise exception 'La categoría «%» ya se usó: desactívala en lugar de eliminarla.',old.nombre;
 end if;
 return old;
end $$;
create trigger categorias_vestido_proteger before delete on public.categorias_vestido for each row execute function private.categoria_vestido_proteger();

-- History (same Configuración history).
create or replace function private.config_historial() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; k text;
begin
 k:=case tg_table_name when 'listas_contrato' then (r->>'lista')||' · '||(r->>'valor') when 'config_parametros' then r->>'clave'
  when 'categorias_vestido' then coalesce((select nombre from public.clasificaciones_vestido where id=(r->>'clasificacion_id')::int),'?')||' · '||(r->>'nombre')
  else (r->>'formulario')||' · '||(r->>'campo') end;
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 insert into public.config_historial(tabla,clave,accion,antes,despues) values(tg_table_name,k,lower(tg_op),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger categorias_vestido_historial after insert or update or delete on public.categorias_vestido for each row execute function private.config_historial();

-- Ally client registration: XV, Gala and Novia; the category must be active in this table (earlier rows keep their text).
alter table public.aliado_clientas drop constraint if exists aliado_clientas_check;
alter table public.aliado_clientas drop constraint if exists aliado_clientas_tipo_evento_check;
alter table public.aliado_clientas add constraint aliado_clientas_tipo_evento_check check (tipo_evento in ('XV','GALA','NOVIA'));
create or replace function private.categorias_aliado() returns table(tipo text,nombre text,desde numeric,hasta numeric,orden int) language sql stable security definer set search_path='' as $$
 select t.tipo,c.nombre,coalesce((select max(p.precio_hasta) from public.categorias_vestido p where p.clasificacion_id=c.clasificacion_id and p.activo and p.precio_hasta<coalesce(c.precio_hasta,'infinity'::numeric)),0),c.precio_hasta,c.orden
 from public.categorias_vestido c join public.clasificaciones_vestido v on v.id=c.clasificacion_id
 join (values ('XV Años','XV'),('Gala','GALA'),('Novia','NOVIA')) t(clas,tipo) on t.clas=v.nombre
 where c.activo order by t.tipo,c.precio_hasta nulls last,c.orden
$$;
create or replace function public.categorias_aliado() returns table(tipo text,nombre text,desde numeric,hasta numeric,orden int) language sql stable set search_path='' as $$
 select * from private.categorias_aliado()
$$;
revoke all on function public.categorias_aliado(),private.categorias_aliado() from public,anon;
grant execute on function public.categorias_aliado(),private.categorias_aliado() to authenticated,service_role;
create or replace function private.aliado_clienta_categoria() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' or new.categoria is distinct from old.categoria or new.tipo_evento is distinct from old.tipo_evento)
  and not exists(select 1 from private.categorias_aliado() x where x.tipo=new.tipo_evento and x.nombre=new.categoria) then
  raise exception 'Elige la categoría.';
 end if;
 return new;
end $$;
create trigger aliado_clientas_categoria before insert or update of categoria,tipo_evento on public.aliado_clientas for each row execute function private.aliado_clienta_categoria();

-- Initial calculation.
update public.vestidos v set categoria=private.categoria_vestido(v.clasificacion_id,v.precio_sugerido)
where v.categoria is distinct from private.categoria_vestido(v.clasificacion_id,v.precio_sugerido);
