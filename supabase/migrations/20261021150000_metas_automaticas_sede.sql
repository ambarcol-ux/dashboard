-- Metas y ventas: cada sede activa tiene automáticamente una meta mensual de $50.000.000.
-- Solo se crean las que faltan; una meta que el admin ya configuró (u editó) se respeta.
create function private.norm_nombre(p text) returns text language sql immutable set search_path='' as $$
 select lower(translate(btrim(coalesce(p,'')),'áéíóúÁÉÍÓÚüÜ','aeiouAEIOUuU'));
$$;
create function private.asegurar_metas_sede(p_desde date,p_hasta date) returns integer language plpgsql security definer set search_path='' as $$
declare m date; n integer:=0; k integer;
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta>p_desde+interval '24 months' then raise exception 'Rango de meses no válido.'; end if;
 perform pg_advisory_xact_lock(hashtext('metas_sede_automaticas'));
 m:=date_trunc('month',p_desde)::date;
 while m<=p_hasta loop
  insert into public.metas(tipo,identificador_id,nombre_objetivo,monto_meta,mes,anio)
  select 'sede',s.id,s.nombre,50000000,extract(month from m)::int,extract(year from m)::int from public.sedes s
  where coalesce(s.activo,true) and not exists(select 1 from public.metas x where x.tipo='sede' and x.mes=extract(month from m)::int and x.anio=extract(year from m)::int
   and (x.identificador_id=s.id or private.norm_nombre(x.nombre_objetivo)=private.norm_nombre(s.nombre)));
  get diagnostics k=row_count; n:=n+k;
  m:=(m+interval '1 month')::date;
 end loop;
 return n;
end $$;
-- El panel la llama al abrir un mes: crea las metas faltantes de ese mes.
create function public.asegurar_metas_mes(p_mes integer,p_anio integer) returns integer language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 if p_mes not between 1 and 12 or p_anio not between 2024 and 2100 then raise exception 'Mes no válido.'; end if;
 return private.asegurar_metas_sede(make_date(p_anio,p_mes,1),make_date(p_anio,p_mes,1));
end $$;
revoke all on function private.asegurar_metas_sede(date,date),public.asegurar_metas_mes(integer,integer) from public,anon;
grant execute on function public.asegurar_metas_mes(integer,integer) to authenticated;

-- Todo 2026 y el próximo año, y cada día 1 el mes siguiente (por si nadie abre el panel).
select private.asegurar_metas_sede(date '2026-01-01',date '2027-12-01');
select cron.schedule('metas-sede-automaticas','10 5 1 * *',$$select private.asegurar_metas_sede((now() at time zone 'America/Bogota')::date,((now() at time zone 'America/Bogota')::date+interval '12 months')::date)$$);
