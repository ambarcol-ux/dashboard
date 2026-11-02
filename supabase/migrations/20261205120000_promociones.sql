-- Promociones (Ventas y CRM > Correo): beneficio, vigencia por fechas (se activan y terminan solas), sedes, tipos, categorías, código y condiciones.
-- Elegibles en primera cita y contrato (descuento ligado a la promoción); visibles en el catálogo.
-- Enlaces fijos del catálogo /[sede]/[tipo] en catalogos_publicos.ruta; origen (o=) de la cita agendada en primeras_citas.origen_enlace.
-- Revert: drop function public.asignar_promocion_primera_cita(uuid,uuid), public.analisis_promociones_origen(date,date);
--   alter table public.contratos drop column promocion_id, drop column descuento_promocion;
--   alter table public.primeras_citas drop column promocion_id, drop column origen_enlace;
--   alter table public.catalogos_publicos drop column ruta; drop table public.promociones.
create table if not exists public.promociones(
 id uuid primary key default gen_random_uuid(),
 nombre text not null check (length(trim(nombre)) between 2 and 120),
 beneficio_tipo text not null check (beneficio_tipo in ('porcentaje','valor','incluido')),
 beneficio_valor numeric not null default 0,
 beneficio_detalle text not null default '' check (length(beneficio_detalle)<=300),
 desde date not null,
 hasta date not null,
 sede_ids uuid[],
 clasificacion_ids int[],
 categorias text[],
 codigo text unique check (codigo is null or codigo ~ '^[A-Z0-9-]{3,30}$'),
 condiciones text not null default '' check (length(condiciones)<=2000),
 activo boolean not null default true,
 creado_por uuid default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (hasta>=desde),
 check ((beneficio_tipo='porcentaje' and beneficio_valor>0 and beneficio_valor<=100)
  or (beneficio_tipo='valor' and beneficio_valor>0)
  or (beneficio_tipo='incluido' and beneficio_valor=0 and length(trim(beneficio_detalle))>=2))
);
create index if not exists promociones_vigencia on public.promociones(desde,hasta) where activo;
alter table public.promociones enable row level security;
revoke all on public.promociones from anon;
create policy promociones_leer on public.promociones for select to authenticated using (true);
create policy promociones_crear on public.promociones for insert to authenticated with check (public.es_admin());
create policy promociones_editar on public.promociones for update to authenticated using (public.es_admin()) with check (public.es_admin());

alter table public.primeras_citas add column if not exists promocion_id uuid references public.promociones(id),
 add column if not exists origen_enlace text check (origen_enlace is null or origen_enlace ~ '^[A-Za-z0-9._-]{1,60}$');
create index if not exists primeras_citas_promocion on public.primeras_citas(promocion_id) where promocion_id is not null;
alter table public.contratos add column if not exists promocion_id uuid references public.promociones(id),
 add column if not exists descuento_promocion numeric not null default 0 check (descuento_promocion>=0);
create index if not exists contratos_promocion on public.contratos(promocion_id) where promocion_id is not null;
alter table public.catalogos_publicos add column if not exists ruta text unique check (ruta is null or ruta ~ '^[a-z0-9-]+/[a-z0-9-]+$');

-- Promotion on a first visit: only active ones (today) for the visit's sede; null removes it.
create or replace function public.asignar_promocion_primera_cita(p_id uuid,p_promocion uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; p public.promociones; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible.'; end if;
 if p_promocion is not null then
  select * into p from public.promociones where id=p_promocion;
  if not found or not p.activo or hoy not between p.desde and p.hasta then raise exception 'La promoción no está vigente.'; end if;
  if coalesce(cardinality(p.sede_ids),0)>0 and not c.sede_id=any(p.sede_ids) then raise exception 'La promoción no aplica en esta sede.'; end if;
 end if;
 update public.primeras_citas set promocion_id=p_promocion,updated_at=now() where id=c.id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Promoción',coalesce(p.nombre,'Sin promoción'));
end $$;
revoke all on function public.asignar_promocion_primera_cita(uuid,uuid) from public,anon;
grant execute on function public.asignar_promocion_primera_cita(uuid,uuid) to authenticated;

-- Commercial analysis: visits, contracts, value and discount granted by promotion and by link origin.
create or replace function public.analisis_promociones_origen(p_desde date,p_hasta date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and activo is true and lower(rol) in ('admin','asesora')) then raise exception 'No tienes acceso a primeras visitas.'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un periodo de hasta un año.'; end if;
 return (with base as (
  select c.promocion_id,c.origen_enlace origen,1 cita,0 contrato,0::numeric valor,0::numeric descuento from public.primeras_citas c
   where c.fecha between p_desde and p_hasta and c.estado<>'cancelada' and private.acceso_primera_cita(c.sede_id,c.modalidad)
  union all
  select k.promocion_id,v.origen_enlace,0,1,coalesce(k.valor_total,0),coalesce(k.descuento_promocion,0) from public.contratos k left join public.primeras_citas v on v.id=k.primera_cita_id
   where (k.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador')
    and private.acceso_primera_cita(k.sede_id,'presencial') and (k.promocion_id is not null or v.origen_enlace is not null))
 select jsonb_build_object(
  'promociones',coalesce((select jsonb_agg(jsonb_build_object('nombre',coalesce(p.nombre,'Sin nombre'),'citas',g.citas,'contratos',g.contratos,'valor',g.valor,'descuento',g.descuento) order by g.contratos desc,g.citas desc)
   from (select promocion_id,sum(cita) citas,sum(contrato) contratos,sum(valor) valor,sum(descuento) descuento from base where promocion_id is not null group by promocion_id) g left join public.promociones p on p.id=g.promocion_id),'[]'::jsonb),
  'origenes',coalesce((select jsonb_agg(jsonb_build_object('origen',g.origen,'citas',g.citas,'contratos',g.contratos,'valor',g.valor,'descuento',g.descuento) order by g.contratos desc,g.citas desc)
   from (select origen,sum(cita) citas,sum(contrato) contratos,sum(valor) valor,sum(descuento) descuento from base where origen is not null group by origen) g),'[]'::jsonb)));
end $$;
revoke all on function public.analisis_promociones_origen(date,date) from public,anon;
grant execute on function public.analisis_promociones_origen(date,date) to authenticated;
