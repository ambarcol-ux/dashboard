-- Proveedores: rename a service type from the supplier form. The value changes in the Configuración list and everywhere it is used
-- (suppliers, their rates, package components and contract services), so nothing is left with the old name. Administration only.
-- Reversible: drop the function (a rename can be undone by renaming back).
create or replace function public.prov_servicio_renombrar(p_viejo text,p_nuevo text) returns text
language plpgsql security definer set search_path='' as $$
declare v text:=btrim(coalesce(p_viejo,'')); n text:=btrim(regexp_replace(coalesce(p_nuevo,''),'\s+',' ','g'));
begin
 if not public.es_admin() then raise exception 'Solo administración edita los tipos de servicio.' using errcode='42501'; end if;
 if length(n) not between 2 and 60 then raise exception 'Escribe el nuevo nombre (2 a 60 caracteres).'; end if;
 if not exists(select 1 from public.listas_contrato where lista='prov_tipos_servicio' and valor=v) then raise exception 'Servicio no encontrado.'; end if;
 if n=v then return n; end if;
 if exists(select 1 from public.listas_contrato where lista='prov_tipos_servicio' and lower(valor)=lower(n) and valor<>v) then raise exception 'Ya existe un servicio con ese nombre.'; end if;
 update public.listas_contrato set valor=n where lista='prov_tipos_servicio' and valor=v;
 update public.proveedores set tipo_servicio=n where tipo_servicio=v;
 update public.proveedor_tarifas set servicio=n where servicio=v;
 update public.paquete_componentes set servicio=n where servicio=v;
 update public.contrato_servicios set servicio=n where servicio=v;
 return n;
end $$;
revoke all on function public.prov_servicio_renombrar(text,text) from public, anon;
grant execute on function public.prov_servicio_renombrar(text,text) to authenticated;

-- Gastos › «A quién se pagó»: suppliers' estado is «Activo»/«Inactivo» (capitalized).
create or replace function public.gastos_proveedores() returns table(nombre text,tipo_servicio text)
language sql stable security definer set search_path='' as $$
 select p.nombre::text,p.tipo_servicio::text from public.proveedores p
 where (private.es_finanzas() or private.tiene_permiso('panel.gastos')) and lower(coalesce(p.estado,'activo'))='activo'
 order by p.nombre;
$$;
